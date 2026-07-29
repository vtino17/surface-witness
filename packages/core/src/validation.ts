import type { SurfacePolicy, ToolSurfaceSnapshot } from "./types.js";

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

export function assertSnapshot(value: unknown): asserts value is ToolSurfaceSnapshot {
  if (!object(value) || value.snapshotVersion !== "1.0") throw new Error("Unsupported snapshot.");
  for (const field of ["serverId", "serverVersion", "protocolVersion", "capturedAt", "snapshotHash"]) {
    if (typeof value[field] !== "string") throw new Error(`Snapshot field "${field}" must be a string.`);
  }
  if (!Array.isArray(value.tools)) throw new Error("Snapshot tools must be an array.");
  const names = new Set<string>();
  for (const candidate of value.tools) {
    if (!object(candidate) || typeof candidate.name !== "string" || !object(candidate.inputSchema)) {
      throw new Error("Every tool requires a name and inputSchema object.");
    }
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
