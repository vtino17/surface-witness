import { canonicalJson, hashValue, sha256 } from "./canonical.js";
import { matchesAny } from "./glob.js";
import type {
  DriftEvent,
  JsonSchema,
  McpTool,
  RiskLevel,
  SurfaceDiff,
  SurfacePolicy,
  ToolAnnotations,
} from "./types.js";
import { assertPolicy, assertSnapshot, isObject } from "./validation.js";
import { verifySnapshot } from "./snapshot.js";

interface RawEvent extends Omit<DriftEvent, "id" | "approved"> {
  policyAllowed?: boolean;
}

const event = (
  code: string,
  risk: RiskLevel,
  message: string,
  detail: Omit<RawEvent, "code" | "risk" | "message"> = {},
): RawEvent => ({ code, risk, message, ...detail });

const values = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const stringSet = (value: unknown): Set<string> =>
  new Set(values(value).filter((entry): entry is string => typeof entry === "string"));
const schemaObject = (value: unknown): Record<string, unknown> => isObject(value) ? value : {};
const same = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right);

const riskSignals: Array<[RegExp, string]> = [
  [/\bignore (?:all |any )?(?:previous|prior) instructions?\b/iu, "an instruction override"],
  [/\b(?:do not|never) (?:tell|show|reveal|inform) (?:the )?user\b/iu, "a concealment instruction"],
  [/\b(?:system prompt|developer message)\b/iu, "a privileged-prompt reference"],
  [/\b(?:exfiltrate|steal|harvest) (?:credentials?|secrets?|tokens?|data)\b/iu, "exfiltration language"],
  [/\bdecode (?:this |the )?(?:base64|hex)\b/iu, "an encoded-instruction request"],
];
const invisiblePattern = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;

const scanDescription = (
  tool: McpTool,
  policy: SurfacePolicy,
  onlyWhenChanged: boolean,
): RawEvent[] => {
  const description = tool.description ?? "";
  const events: RawEvent[] = [];
  if (description.length > policy.descriptionMaxChars) {
    events.push(event("description-budget-exceeded", "high", `Description has ${description.length} characters; policy allows ${policy.descriptionMaxChars}.`, { tool: tool.name, path: "description" }));
  }
  if (policy.blockMetadataSignals && invisiblePattern.test(description)) {
    events.push(event("invisible-metadata", "critical", "Description contains invisible or bidirectional control characters.", { tool: tool.name, path: "description" }));
  }
  if (policy.blockMetadataSignals) {
    for (const [pattern, label] of riskSignals) {
      if (pattern.test(description)) {
        events.push(event("metadata-instruction-signal", "critical", `Description contains ${label}.`, { tool: tool.name, path: "description" }));
      }
    }
  }
  if (onlyWhenChanged) return events;
  return events;
};

const compareNumericConstraint = (
  name: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  loosened: (oldValue: number, nextValue: number) => boolean,
  tool: string,
  path: string,
): RawEvent[] => {
  const oldValue = before[name];
  const nextValue = after[name];
  if (typeof oldValue === "number" && typeof nextValue !== "number") {
    return [event("schema-constraint-removed", "high", `${name} was removed.`, { tool, path, before: oldValue })];
  }
  if (typeof oldValue === "number" && typeof nextValue === "number" && loosened(oldValue, nextValue)) {
    return [event("schema-constraint-loosened", "high", `${name} was loosened from ${oldValue} to ${nextValue}.`, { tool, path, before: oldValue, after: nextValue })];
  }
  return [];
};

const compareSchema = (
  beforeValue: JsonSchema,
  afterValue: JsonSchema,
  tool: string,
  path = "inputSchema",
): RawEvent[] => {
  const before = schemaObject(beforeValue);
  const after = schemaObject(afterValue);
  const events: RawEvent[] = [];
  if (!same(before.type, after.type)) {
    events.push(event("schema-type-changed", "high", "Schema type changed.", { tool, path: `${path}/type`, before: before.type, after: after.type }));
  }
  const oldRequired = stringSet(before.required);
  const nextRequired = stringSet(after.required);
  for (const name of oldRequired) {
    if (!nextRequired.has(name)) events.push(event("required-input-relaxed", "high", `Required input "${name}" became optional.`, { tool, path: `${path}/required`, before: true, after: false }));
  }
  for (const name of nextRequired) {
    if (!oldRequired.has(name)) events.push(event("required-input-added", "medium", `Input "${name}" became required.`, { tool, path: `${path}/required`, before: false, after: true }));
  }
  const oldEnum = values(before.enum);
  const nextEnum = values(after.enum);
  if (oldEnum.length > 0 && nextEnum.length > 0 && !same(oldEnum, nextEnum)) {
    const added = nextEnum.filter((entry) => !oldEnum.some((old) => same(old, entry)));
    events.push(event(added.length > 0 ? "enum-expanded" : "enum-narrowed", added.length > 0 ? "high" : "low", added.length > 0 ? `Enum accepts ${added.length} new value(s).` : "Enum accepted values were narrowed.", { tool, path: `${path}/enum`, before: oldEnum, after: nextEnum }));
  }
  if (typeof before.pattern === "string" && before.pattern !== after.pattern) {
    events.push(event("schema-pattern-relaxed", "high", "A validation pattern was removed or changed.", { tool, path: `${path}/pattern`, before: before.pattern, after: after.pattern }));
  }
  if (before.additionalProperties === false && after.additionalProperties !== false) {
    events.push(event("additional-properties-enabled", "critical", "Schema now accepts undeclared properties.", { tool, path: `${path}/additionalProperties`, before: false, after: after.additionalProperties }));
  }
  events.push(...compareNumericConstraint("minimum", before, after, (old, next) => next < old, tool, `${path}/minimum`));
  events.push(...compareNumericConstraint("maximum", before, after, (old, next) => next > old, tool, `${path}/maximum`));
  events.push(...compareNumericConstraint("minLength", before, after, (old, next) => next < old, tool, `${path}/minLength`));
  events.push(...compareNumericConstraint("maxLength", before, after, (old, next) => next > old, tool, `${path}/maxLength`));

  const oldProperties = schemaObject(before.properties);
  const nextProperties = schemaObject(after.properties);
  const names = new Set([...Object.keys(oldProperties), ...Object.keys(nextProperties)]);
  for (const name of [...names].sort()) {
    const oldProperty = oldProperties[name];
    const nextProperty = nextProperties[name];
    if (oldProperty === undefined) {
      events.push(event("input-property-added", "medium", `Input property "${name}" was added.`, { tool, path: `${path}/properties/${name}`, after: nextProperty }));
    } else if (nextProperty === undefined) {
      events.push(event("input-property-removed", "medium", `Input property "${name}" was removed.`, { tool, path: `${path}/properties/${name}`, before: oldProperty }));
    } else if (isObject(oldProperty) && isObject(nextProperty)) {
      events.push(...compareSchema(oldProperty, nextProperty, tool, `${path}/properties/${name}`));
    }
  }
  if (!same(before, after) && events.length === 0) {
    events.push(event("unclassified-schema-change", "medium", "Input schema changed outside the classified constraints.", { tool, path, before, after }));
  }
  return events;
};

const annotations = (tool: McpTool): Required<Pick<ToolAnnotations, "readOnlyHint" | "destructiveHint" | "idempotentHint" | "openWorldHint">> => ({
  readOnlyHint: tool.annotations?.readOnlyHint ?? false,
  destructiveHint: tool.annotations?.destructiveHint ?? true,
  idempotentHint: tool.annotations?.idempotentHint ?? false,
  openWorldHint: tool.annotations?.openWorldHint ?? true,
});

const compareAnnotations = (before: McpTool, after: McpTool): RawEvent[] => {
  const old = annotations(before);
  const next = annotations(after);
  const events: RawEvent[] = [];
  if (old.readOnlyHint && !next.readOnlyHint) events.push(event("tool-became-writable", "critical", "Tool changed from read-only to writable.", { tool: after.name, path: "annotations/readOnlyHint", before: true, after: false }));
  if (!old.destructiveHint && next.destructiveHint) events.push(event("tool-became-destructive", "critical", "Tool became potentially destructive.", { tool: after.name, path: "annotations/destructiveHint", before: false, after: true }));
  if (!old.openWorldHint && next.openWorldHint) events.push(event("tool-became-open-world", "high", "Tool can now interact with open-world entities.", { tool: after.name, path: "annotations/openWorldHint", before: false, after: true }));
  if (old.idempotentHint && !next.idempotentHint) events.push(event("tool-lost-idempotence", "medium", "Tool is no longer declared idempotent.", { tool: after.name, path: "annotations/idempotentHint", before: true, after: false }));
  return events;
};

const newToolRisks = (tool: McpTool, policy: SurfacePolicy): RawEvent[] => {
  const allowed = matchesAny(tool.name, policy.allowedNewTools);
  const risk = annotations(tool);
  const events: RawEvent[] = [
    event("tool-added", "high", "A new callable capability was added.", { tool: tool.name, policyAllowed: allowed }),
  ];
  if (matchesAny(tool.name, policy.deniedToolPatterns)) {
    events.push(event("denied-tool-added", "critical", "New tool name matches a denied capability pattern.", { tool: tool.name }));
  }
  if (policy.requireAnnotationsForNewTools && tool.annotations === undefined) {
    events.push(event("new-tool-missing-annotations", "high", "New tool has no risk annotations; pessimistic defaults apply.", { tool: tool.name, path: "annotations" }));
  }
  if (policy.requireOutputSchemaForNewTools && tool.outputSchema === undefined) {
    events.push(event("new-tool-missing-output-schema", "high", "New tool has no output schema.", { tool: tool.name, path: "outputSchema" }));
  }
  if (!risk.readOnlyHint) events.push(event("new-tool-writable", "high", "New tool may modify its environment.", { tool: tool.name, path: "annotations/readOnlyHint" }));
  if (risk.destructiveHint) events.push(event("new-tool-destructive", "critical", "New tool may perform destructive updates.", { tool: tool.name, path: "annotations/destructiveHint" }));
  if (risk.openWorldHint) events.push(event("new-tool-open-world", "high", "New tool may interact with external entities.", { tool: tool.name, path: "annotations/openWorldHint" }));
  events.push(...scanDescription(tool, policy, false));
  return events;
};

const riskCost: Record<RiskLevel, number> = { low: 3, medium: 10, high: 22, critical: 35 };

export async function diffSurfaces(input: {
  baseline: unknown;
  candidate: unknown;
  policy: unknown;
  assessedAt?: Date;
}): Promise<SurfaceDiff> {
  assertSnapshot(input.baseline);
  assertSnapshot(input.candidate);
  assertPolicy(input.policy);
  const baseline = input.baseline;
  const candidate = input.candidate;
  const policy = input.policy;
  if (baseline.serverId !== candidate.serverId || baseline.serverId !== policy.serverId) {
    throw new Error("Baseline, candidate, and policy must target the same serverId.");
  }
  if (!(await verifySnapshot(baseline)) || !(await verifySnapshot(candidate))) {
    throw new Error("Snapshot hash verification failed.");
  }
  const before = new Map(baseline.tools.map((tool) => [tool.name, tool]));
  const after = new Map(candidate.tools.map((tool) => [tool.name, tool]));
  const raw: RawEvent[] = [];
  if (candidate.tools.length > policy.maxTools) {
    raw.push(event("tool-budget-exceeded", "critical", `${candidate.tools.length} tools exceed the policy limit of ${policy.maxTools}.`));
  }
  if (baseline.protocolVersion !== candidate.protocolVersion) {
    raw.push(event("protocol-version-changed", "low", `Protocol version changed from ${baseline.protocolVersion} to ${candidate.protocolVersion}.`, { before: baseline.protocolVersion, after: candidate.protocolVersion }));
  }
  for (const [name, tool] of before) {
    const next = after.get(name);
    if (!next) {
      raw.push(event("tool-removed", policy.blockToolRemoval ? "high" : "medium", "A previously available tool was removed.", { tool: name }));
      continue;
    }
    if (tool.description !== next.description) {
      raw.push(event("tool-description-changed", "high", "Tool description changed; review it as executable-facing metadata.", { tool: name, path: "description", before: tool.description, after: next.description }));
      raw.push(...scanDescription(next, policy, true));
    }
    raw.push(...compareAnnotations(tool, next));
    raw.push(...compareSchema(tool.inputSchema, next.inputSchema, name));
    if (tool.outputSchema !== undefined && next.outputSchema === undefined) {
      raw.push(event("output-schema-removed", "high", "Tool output is no longer structurally declared.", { tool: name, path: "outputSchema" }));
    } else if (!same(tool.outputSchema, next.outputSchema)) {
      raw.push(event("output-schema-changed", "medium", "Tool output schema changed.", { tool: name, path: "outputSchema", before: tool.outputSchema, after: next.outputSchema }));
    }
    if (!same(tool.execution, next.execution)) {
      raw.push(event("execution-contract-changed", "high", "Tool execution metadata changed.", { tool: name, path: "execution", before: tool.execution, after: next.execution }));
    }
    const classifiedPaths = new Set(["description", "annotations", "inputSchema", "outputSchema", "execution"]);
    const oldOther = Object.fromEntries(Object.entries(tool).filter(([key]) => !classifiedPaths.has(key)));
    const nextOther = Object.fromEntries(Object.entries(next).filter(([key]) => !classifiedPaths.has(key)));
    if (!same(oldOther, nextOther)) {
      raw.push(event("tool-metadata-changed", "medium", "Additional tool metadata changed.", { tool: name, before: oldOther, after: nextOther }));
    }
  }
  for (const [name, tool] of after) {
    if (!before.has(name)) raw.push(...newToolRisks(tool, policy));
  }

  const events: DriftEvent[] = [];
  for (const item of raw) {
    const { policyAllowed = false, ...base } = item;
    const id = (await sha256(canonicalJson(base))).slice(0, 16);
    events.push({ ...base, id, approved: policyAllowed || policy.approvals.includes(id) });
  }
  events.sort((left, right) => {
    const riskOrder: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return riskOrder[left.risk] - riskOrder[right.risk] || (left.tool ?? "").localeCompare(right.tool ?? "") || left.code.localeCompare(right.code);
  });
  const unapproved = events.filter((item) => !item.approved);
  const blocking = unapproved.some((item) => ["critical", "high"].includes(item.risk)) && policy.blockUnapprovedHighRisk;
  const reviewing = unapproved.length > 0;
  const changedTools = new Set(events.map((item) => item.tool).filter((name): name is string => name !== undefined));
  const added = candidate.tools.filter((tool) => !before.has(tool.name)).length;
  const removed = baseline.tools.filter((tool) => !after.has(tool.name)).length;
  const score = Math.max(0, 100 - unapproved.reduce((sum, item) => sum + riskCost[item.risk], 0));
  const base = {
    serverId: baseline.serverId,
    baselineHash: baseline.snapshotHash,
    candidateHash: candidate.snapshotHash,
    status: blocking ? "blocked" as const : reviewing ? "review" as const : "stable" as const,
    score,
    assessedAt: (input.assessedAt ?? new Date()).toISOString(),
    summary: {
      baselineTools: baseline.tools.length,
      candidateTools: candidate.tools.length,
      added,
      removed,
      changed: changedTools.size - added - removed,
      approvedEvents: events.length - unapproved.length,
      unapprovedEvents: unapproved.length,
    },
    events,
  };
  return { ...base, diffHash: await hashValue(base) };
}
