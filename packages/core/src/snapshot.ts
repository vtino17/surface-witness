import { canonicalJson, sha256 } from "./canonical.js";
import type { McpTool, ToolSurfaceSnapshot } from "./types.js";
import { isObject } from "./validation.js";

const toolsFrom = (input: unknown): unknown[] => {
  if (Array.isArray(input)) return input;
  if (isObject(input) && Array.isArray(input.tools)) return input.tools;
  if (isObject(input) && isObject(input.result) && Array.isArray(input.result.tools)) {
    return input.result.tools;
  }
  throw new Error("Expected a tool array, { tools }, or JSON-RPC { result: { tools } } payload.");
};

const toolFrom = (value: unknown): McpTool => {
  if (!isObject(value) || typeof value.name !== "string" || !isObject(value.inputSchema)) {
    throw new Error("Every MCP tool requires a string name and object inputSchema.");
  }
  return value as McpTool;
};

export async function captureSnapshot(input: unknown, options: {
  serverId: string;
  serverVersion?: string;
  protocolVersion?: string;
  capturedAt?: Date;
}): Promise<ToolSurfaceSnapshot> {
  if (!options.serverId.trim()) throw new Error("serverId cannot be empty.");
  const tools = toolsFrom(input).map(toolFrom).sort((left, right) => left.name.localeCompare(right.name));
  const names = new Set<string>();
  for (const tool of tools) {
    if (names.has(tool.name)) throw new Error(`Duplicate tool name: ${tool.name}`);
    names.add(tool.name);
  }
  const base = {
    snapshotVersion: "1.0" as const,
    serverId: options.serverId,
    serverVersion: options.serverVersion ?? "unknown",
    protocolVersion: options.protocolVersion ?? "unknown",
    capturedAt: (options.capturedAt ?? new Date()).toISOString(),
    tools: JSON.parse(canonicalJson(tools)) as McpTool[],
  };
  return { ...base, snapshotHash: await sha256(canonicalJson(base)) };
}

export async function verifySnapshot(snapshot: ToolSurfaceSnapshot): Promise<boolean> {
  const base = {
    snapshotVersion: snapshot.snapshotVersion,
    serverId: snapshot.serverId,
    serverVersion: snapshot.serverVersion,
    protocolVersion: snapshot.protocolVersion,
    capturedAt: snapshot.capturedAt,
    tools: snapshot.tools,
  };
  return await sha256(canonicalJson(base)) === snapshot.snapshotHash;
}
