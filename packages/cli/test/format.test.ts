import { describe, expect, it } from "vitest";
import { diffSurfaces, samplePolicy, sampleSurfaces } from "@surfacewitness/core";
import { formatDiff, formatSnapshot } from "../src/format.js";

describe("CLI formatting", () => {
  it("summarizes a snapshot", async () => {
    const { baseline } = await sampleSurfaces();
    expect(formatSnapshot(baseline)).toContain("2 tools");
    expect(formatSnapshot(baseline)).toContain("search_docs");
  });

  it("renders a stable decision", async () => {
    const { baseline, stable } = await sampleSurfaces();
    const diff = await diffSurfaces({ baseline, candidate: stable, policy: samplePolicy });
    expect(formatDiff(diff)).toContain("No callable-surface drift");
  });

  it("renders risk codes and targets", async () => {
    const { baseline, risky } = await sampleSurfaces();
    const diff = await diffSurfaces({ baseline, candidate: risky, policy: samplePolicy });
    const output = formatDiff(diff);
    expect(output).toContain("DENIED-TOOL-ADDED");
    expect(output).toContain("shell_exec");
  });
});
