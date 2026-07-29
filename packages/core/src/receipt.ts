import { canonicalJson, hashValue, sha256 } from "./canonical.js";
import { diffSurfaces } from "./diff.js";
import type {
  ReceiptVerification,
  SurfaceDiff,
  SurfaceReceipt,
} from "./types.js";
import { assertPolicy, assertSnapshot } from "./validation.js";

export async function compileSurfaceReceipt(input: {
  baseline: unknown;
  candidate: unknown;
  policy: unknown;
  diff: SurfaceDiff;
  issuedAt?: Date;
}): Promise<SurfaceReceipt> {
  assertSnapshot(input.baseline);
  assertSnapshot(input.candidate);
  assertPolicy(input.policy);
  const expected = await diffSurfaces({
    baseline: input.baseline,
    candidate: input.candidate,
    policy: input.policy,
    assessedAt: new Date(input.diff.assessedAt),
  });
  if (canonicalJson(expected) !== canonicalJson(input.diff)) {
    throw new Error("Diff does not match a fresh evaluation.");
  }
  if (input.diff.status === "blocked") throw new Error("Cannot certify a blocked surface.");
  const base = {
    receiptVersion: "1.0" as const,
    serverId: input.diff.serverId,
    baselineHash: input.diff.baselineHash,
    candidateHash: input.diff.candidateHash,
    policyHash: await hashValue(input.policy),
    diffHash: input.diff.diffHash,
    assessedAt: input.diff.assessedAt,
    issuedAt: (input.issuedAt ?? new Date()).toISOString(),
    approvedEventIds: input.diff.events.filter((item) => item.approved).map((item) => item.id),
  };
  return { ...base, receiptHash: await sha256(canonicalJson(base)) };
}

export async function verifySurfaceReceipt(input: {
  receipt: SurfaceReceipt;
  baseline?: unknown;
  candidate?: unknown;
  policy?: unknown;
}): Promise<ReceiptVerification> {
  const receipt = input.receipt;
  const base: Omit<SurfaceReceipt, "receiptHash"> = {
    receiptVersion: receipt.receiptVersion,
    serverId: receipt.serverId,
    baselineHash: receipt.baselineHash,
    candidateHash: receipt.candidateHash,
    policyHash: receipt.policyHash,
    diffHash: receipt.diffHash,
    assessedAt: receipt.assessedAt,
    issuedAt: receipt.issuedAt,
    approvedEventIds: receipt.approvedEventIds,
  };
  const checks = {
    receiptHash: await sha256(canonicalJson(base)) === receipt.receiptHash,
    baselineHash: true,
    candidateHash: true,
    policyHash: true,
    diffHash: true,
  };
  if (input.baseline !== undefined) {
    assertSnapshot(input.baseline);
    checks.baselineHash = input.baseline.snapshotHash === receipt.baselineHash;
  }
  if (input.candidate !== undefined) {
    assertSnapshot(input.candidate);
    checks.candidateHash = input.candidate.snapshotHash === receipt.candidateHash;
  }
  if (input.policy !== undefined) {
    assertPolicy(input.policy);
    checks.policyHash = await hashValue(input.policy) === receipt.policyHash;
  }
  if (input.baseline !== undefined && input.candidate !== undefined && input.policy !== undefined) {
    const diff = await diffSurfaces({
      baseline: input.baseline,
      candidate: input.candidate,
      policy: input.policy,
      assessedAt: new Date(receipt.assessedAt),
    });
    checks.diffHash = diff.diffHash === receipt.diffHash;
  }
  const errors = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => `${name} check failed`);
  return { valid: errors.length === 0, checks, errors };
}
