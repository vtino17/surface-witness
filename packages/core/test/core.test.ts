import { describe, expect, it } from "vitest";
import {
  baselineTools,
  captureSnapshot,
  compileSurfaceReceipt,
  diffSurfaces,
  matchesGlob,
  riskyTools,
  samplePolicy,
  sampleSurfaces,
  verifySnapshot,
  verifySurfaceReceipt,
} from "../src/index.js";

const at = new Date("2026-07-29T08:00:00.000Z");

describe("glob matching", () => {
  it("matches bounded wildcard patterns", () => {
    expect(matchesGlob("safe_health_check", "safe_*")).toBe(true);
    expect(matchesGlob("admin/shell", "*shell*")).toBe(false);
  });

  it("matches recursive path patterns", () => {
    expect(matchesGlob("admin/tools/delete", "**/delete")).toBe(true);
  });
});

describe("surface snapshots", () => {
  it("captures a plain tool array deterministically", async () => {
    const options = { serverId: "x", capturedAt: at };
    const one = await captureSnapshot(baselineTools.tools, options);
    const two = await captureSnapshot([...baselineTools.tools].reverse(), options);
    expect(one.snapshotHash).toBe(two.snapshotHash);
  });

  it("accepts JSON-RPC tools/list payloads", async () => {
    const snapshot = await captureSnapshot(riskyTools, { serverId: "x", capturedAt: at });
    expect(snapshot.tools).toHaveLength(3);
  });

  it("rejects duplicate tool names", async () => {
    const tool = baselineTools.tools[0];
    if (!tool) throw new Error("Missing sample tool.");
    await expect(captureSnapshot([tool, tool], { serverId: "x" })).rejects.toThrow("Duplicate");
  });

  it("verifies snapshot integrity", async () => {
    const snapshot = await captureSnapshot(baselineTools, { serverId: "x", capturedAt: at });
    expect(await verifySnapshot(snapshot)).toBe(true);
    expect(await verifySnapshot({ ...snapshot, serverVersion: "tampered" })).toBe(false);
  });

  it("rejects non-finite schema constraints at the snapshot boundary", async () => {
    const { baseline, stable } = await sampleSurfaces();
    const candidate = structuredClone(stable);
    candidate.tools[0]!.inputSchema.maximum = Number.NaN;
    await expect(diffSurfaces({ baseline, candidate, policy: samplePolicy }))
      .rejects.toThrow("JSON-compatible finite values");
  });

  it("rejects invalid snapshot timestamps deterministically", async () => {
    const { baseline, stable } = await sampleSurfaces();
    await expect(diffSurfaces({
      baseline: { ...baseline, capturedAt: "not-a-date" },
      candidate: stable,
      policy: samplePolicy,
    })).rejects.toThrow("capturedAt");
  });
});

describe("capability drift", () => {
  it("keeps an identical surface stable", async () => {
    const { baseline, stable } = await sampleSurfaces();
    const result = await diffSurfaces({ baseline, candidate: stable, policy: samplePolicy, assessedAt: at });
    expect(result.status).toBe("stable");
    expect(result.score).toBe(100);
    expect(result.events).toHaveLength(0);
  });

  it("blocks the adversarial surface", async () => {
    const { baseline, risky } = await sampleSurfaces();
    const result = await diffSurfaces({ baseline, candidate: risky, policy: samplePolicy, assessedAt: at });
    expect(result.status).toBe("blocked");
    expect(result.summary.added).toBe(1);
    expect(result.summary.changed).toBe(2);
  });

  it.each([
    "denied-tool-added",
    "metadata-instruction-signal",
    "tool-became-writable",
    "tool-became-destructive",
    "tool-became-open-world",
    "enum-expanded",
    "schema-constraint-loosened",
    "additional-properties-enabled",
    "required-input-relaxed",
    "output-schema-removed",
    "new-tool-missing-annotations",
  ])("detects %s", async (code) => {
    const { baseline, risky } = await sampleSurfaces();
    const result = await diffSurfaces({ baseline, candidate: risky, policy: samplePolicy, assessedAt: at });
    expect(result.events.some((entry) => entry.code === code)).toBe(true);
  });

  it("allows an explicitly bounded new tool while preserving secondary controls", async () => {
    const { baseline } = await sampleSurfaces();
    const health = {
      name: "health_ping",
      description: "Return server health.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } }, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    };
    const candidate = await captureSnapshot([...baselineTools.tools, health], {
      serverId: "support-mcp",
      serverVersion: "1.5.0",
      protocolVersion: "2025-11-25",
      capturedAt: at,
    });
    const result = await diffSurfaces({ baseline, candidate, policy: samplePolicy, assessedAt: at });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.approved).toBe(true);
    expect(result.status).toBe("stable");
  });

  it("accepts a reviewed event fingerprint", async () => {
    const { baseline, risky } = await sampleSurfaces();
    const initial = await diffSurfaces({ baseline, candidate: risky, policy: samplePolicy, assessedAt: at });
    const policy = { ...samplePolicy, approvals: initial.events.map((entry) => entry.id) };
    const reviewed = await diffSurfaces({ baseline, candidate: risky, policy, assessedAt: at });
    expect(reviewed.status).toBe("stable");
    expect(reviewed.summary.unapprovedEvents).toBe(0);
  });

  it("rejects mismatched server identities", async () => {
    const { baseline, stable } = await sampleSurfaces();
    await expect(diffSurfaces({
      baseline,
      candidate: { ...stable, serverId: "other" },
      policy: samplePolicy,
    })).rejects.toThrow("same serverId");
  });
});

describe("surface receipts", () => {
  it("compiles and verifies a stable receipt", async () => {
    const { baseline, stable } = await sampleSurfaces();
    const diff = await diffSurfaces({ baseline, candidate: stable, policy: samplePolicy, assessedAt: at });
    const receipt = await compileSurfaceReceipt({ baseline, candidate: stable, policy: samplePolicy, diff, issuedAt: at });
    const result = await verifySurfaceReceipt({ receipt, baseline, candidate: stable, policy: samplePolicy });
    expect(result.valid).toBe(true);
    expect(Object.values(result.checks).every(Boolean)).toBe(true);
  });

  it("refuses to certify a blocked surface", async () => {
    const { baseline, risky } = await sampleSurfaces();
    const diff = await diffSurfaces({ baseline, candidate: risky, policy: samplePolicy, assessedAt: at });
    await expect(compileSurfaceReceipt({ baseline, candidate: risky, policy: samplePolicy, diff })).rejects.toThrow("blocked");
  });

  it("detects receipt tampering", async () => {
    const { baseline, stable } = await sampleSurfaces();
    const diff = await diffSurfaces({ baseline, candidate: stable, policy: samplePolicy, assessedAt: at });
    const receipt = await compileSurfaceReceipt({ baseline, candidate: stable, policy: samplePolicy, diff, issuedAt: at });
    const result = await verifySurfaceReceipt({ receipt: { ...receipt, serverId: "forged" } });
    expect(result.valid).toBe(false);
    expect(result.checks.receiptHash).toBe(false);
  });
});
