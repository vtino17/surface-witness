import type { SurfacePolicy, ToolSurfaceSnapshot } from "./types.js";

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const date = (value: unknown): value is string =>
  text(value) && Number.isFinite(Date.parse(value));
const jsonValue = (value: unknown, ancestors = new Set<object>()): boolean => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => jsonValue(entry, ancestors))
    : Object.values(value).every((entry) => jsonValue(entry, ancestors));
  ancestors.delete(value);
  return valid;
};

export function assertSnapshot(value: unknown): asserts value is ToolSurfaceSnapshot {
  if (!object(value) || value.snapshotVersion !== "1.0") throw new Error("Unsupported snapshot.");
  for (const field of ["serverId", "serverVersion", "protocolVersion", "snapshotHash"]) {
    if (!text(value[field])) throw new Error(`Snapshot field "${field}" must be a non-empty string.`);
  }
  if (!date(value.capturedAt)) throw new Error('Snapshot field "capturedAt" must be a valid date.');
  if (!Array.isArray(value.tools)) throw new Error("Snapshot tools must be an array.");
  const names = new Set<string>();
  for (const candidate of value.tools) {
    if (!object(candidate) || !text(candidate.name) || !object(candidate.inputSchema)) {
      throw new Error("Every tool requires a name and inputSchema object.");
    }
    if (!jsonValue(candidate)) throw new Error(`Tool "${candidate.name}" must contain JSON-compatible finite values.`);
    if (names.has(candidate.name)) throw new Error(`Duplicate tool name: ${candidate.name}`);
    names.add(candidate.name);
  }
}

export function assertPolicy(value: unknown): asserts value is SurfacePolicy {
  if (!object(value) || value.policyVersion !== "1.0") throw new Error("Unsupported policy.");
  if (typeof value.serverId !== "string") throw new Error("Policy serverId must be a string.");
  for (const field of ["maxTools", "descriptionMaxChars"]) {
    if (!Number.isSafeInteger(value[field]) || Number(value[field]) < 0) {
      throw new Error(`Policy field "${field}" must be a non-negative integer.`);
    }
  }
  for (const field of ["allowedNewTools", "deniedToolPatterns", "approvals"]) {
    if (!strings(value[field])) throw new Error(`Policy field "${field}" must be a string array.`);
  }
  for (const field of [
    "blockMetadataSignals",
    "requireAnnotationsForNewTools",
    "requireOutputSchemaForNewTools",
    "blockUnapprovedHighRisk",
    "blockToolRemoval",
  ]) {
    if (typeof value[field] !== "boolean") throw new Error(`Policy field "${field}" must be boolean.`);
  }
}

export const isObject = object;
