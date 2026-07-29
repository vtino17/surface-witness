#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  baselineTools,
  captureSnapshot,
  compileSurfaceReceipt,
  diffSurfaces,
  riskyTools,
  samplePolicy,
  sampleSurfaces,
  verifySurfaceReceipt,
} from "@surfacewitness/core";
import type {
  SurfacePolicy,
  SurfaceReceipt,
  ToolSurfaceSnapshot,
} from "@surfacewitness/core";
import { formatDiff, formatSnapshot } from "./format.js";

const help = `SurfaceWitness — capability-drift firewall for MCP tools

Usage:
  surface-witness snapshot <tools.json> --server <id> --output <snapshot.json> [--server-version <version>] [--protocol <version>] [--at <ISO date>]
  surface-witness inspect <snapshot.json> [--json]
  surface-witness diff <baseline.json> <candidate.json> --policy <policy.json> [--at <ISO date>] [--json]
  surface-witness explain <baseline.json> <candidate.json> --policy <policy.json> --event <id> [--at <ISO date>]
  surface-witness receipt <baseline.json> <candidate.json> --policy <policy.json> --output <receipt.json> [--at <ISO date>]
  surface-witness verify <receipt.json> [--baseline <json>] [--candidate <json>] [--policy <json>]
  surface-witness demo [stable|risky] [--json]
  surface-witness init [directory]

Exit codes: 0 stable/valid, 2 blocked, 3 review required, 5 invalid input.`;

const option = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const text = async (path: string): Promise<string> => readFile(resolve(path), "utf8");
const json = async (path: string): Promise<unknown> => JSON.parse(await text(path)) as unknown;
const outputJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};
const dateOption = (args: string[]): Date => {
  const raw = option(args, "--at");
  if (!raw) return new Date();
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid --at date: ${raw}`);
  return date;
};
const writeJson = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const diffInputs = async (baselinePath: string, candidatePath: string, args: string[]) => {
  const policyPath = option(args, "--policy");
  if (!policyPath) throw new Error("Command requires --policy <policy.json>.");
  const baseline = await json(baselinePath);
  const candidate = await json(candidatePath);
  const policy = await json(policyPath);
  const diff = await diffSurfaces({ baseline, candidate, policy, assessedAt: dateOption(args) });
  return { baseline, candidate, policy, diff };
};
const statusCode = (status: "stable" | "review" | "blocked"): number =>
  status === "stable" ? 0 : status === "blocked" ? 2 : 3;

async function run(args: string[]): Promise<number> {
  const [command, first, second] = args;
  if (!command || ["help", "--help", "-h"].includes(command)) {
    console.log(help);
    return 0;
  }
  if (command === "snapshot") {
    if (!first || first.startsWith("--")) throw new Error("snapshot requires a tools payload.");
    const serverId = option(args, "--server");
    const target = option(args, "--output");
    if (!serverId || !target) throw new Error("snapshot requires --server <id> and --output <snapshot.json>.");
    const serverVersion = option(args, "--server-version");
    const protocolVersion = option(args, "--protocol");
    const snapshot = await captureSnapshot(await json(first), {
      serverId,
      ...(serverVersion ? { serverVersion } : {}),
      ...(protocolVersion ? { protocolVersion } : {}),
      capturedAt: dateOption(args),
    });
    await writeJson(target, snapshot);
    console.log(`Surface snapshot: ${resolve(target)}`);
    return 0;
  }
  if (command === "inspect") {
    if (!first || first.startsWith("--")) throw new Error("inspect requires a snapshot.");
    const snapshot = await json(first) as ToolSurfaceSnapshot;
    if (args.includes("--json")) outputJson(snapshot);
    else console.log(formatSnapshot(snapshot));
    return 0;
  }
  if (["diff", "explain", "receipt"].includes(command)) {
    if (!first || !second || second.startsWith("--")) throw new Error(`${command} requires baseline and candidate snapshots.`);
    const input = await diffInputs(first, second, args);
    if (command === "diff") {
      if (args.includes("--json")) outputJson(input.diff);
      else console.log(formatDiff(input.diff));
    }
    if (command === "explain") {
      const eventId = option(args, "--event");
      if (!eventId) throw new Error("explain requires --event <id>.");
      const found = input.diff.events.find((entry) => entry.id === eventId);
      if (!found) throw new Error(`Unknown event: ${eventId}`);
      outputJson(found);
    }
    if (command === "receipt") {
      const target = option(args, "--output");
      if (!target) throw new Error("receipt requires --output <receipt.json>.");
      const receipt = await compileSurfaceReceipt({ ...input, issuedAt: dateOption(args) });
      await writeJson(target, receipt);
      console.log(`Surface receipt: ${resolve(target)}`);
    }
    return statusCode(input.diff.status);
  }
  if (command === "verify") {
    if (!first || first.startsWith("--")) throw new Error("verify requires a receipt.");
    const receipt = await json(first) as SurfaceReceipt;
    const baselinePath = option(args, "--baseline");
    const candidatePath = option(args, "--candidate");
    const policyPath = option(args, "--policy");
    const result = await verifySurfaceReceipt({
      receipt,
      ...(baselinePath ? { baseline: await json(baselinePath) } : {}),
      ...(candidatePath ? { candidate: await json(candidatePath) } : {}),
      ...(policyPath ? { policy: await json(policyPath) } : {}),
    });
    outputJson(result);
    return result.valid ? 0 : 2;
  }
  if (command === "demo") {
    const surfaces = await sampleSurfaces();
    const candidate = first === "stable" ? surfaces.stable : surfaces.risky;
    const diff = await diffSurfaces({ baseline: surfaces.baseline, candidate, policy: samplePolicy, assessedAt: dateOption(args) });
    if (args.includes("--json")) outputJson(diff);
    else console.log(formatDiff(diff));
    return statusCode(diff.status);
  }
  if (command === "init") {
    const directory = resolve(first ?? ".surface-witness");
    await mkdir(directory, { recursive: true });
    await writeJson(resolve(directory, "baseline-tools.json"), baselineTools);
    await writeJson(resolve(directory, "candidate-tools.json"), riskyTools);
    await writeJson(resolve(directory, "policy.json"), samplePolicy satisfies SurfacePolicy);
    console.log(`Created starter files in ${directory}`);
    return 0;
  }
  throw new Error(`Unknown command: ${command}\n\n${help}`);
}

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`SurfaceWitness error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 5;
  });
