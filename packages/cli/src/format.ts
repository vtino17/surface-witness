import type { SurfaceDiff, ToolSurfaceSnapshot } from "@surfacewitness/core";

const icon = (risk: string): string =>
  ({ critical: "◆", high: "▲", medium: "●", low: "·" })[risk] ?? "·";

export const formatSnapshot = (snapshot: ToolSurfaceSnapshot): string => {
  const lines = [
    `SurfaceWitness · ${snapshot.serverId}@${snapshot.serverVersion}`,
    `${snapshot.tools.length} tools · MCP ${snapshot.protocolVersion}`,
    `Snapshot ${snapshot.snapshotHash.slice(0, 16)}`,
    "",
    ...snapshot.tools.map((tool) => {
      const hints = tool.annotations;
      const flags = [
        hints?.readOnlyHint === true ? "read-only" : "writable",
        hints?.destructiveHint === false ? "non-destructive" : "potentially destructive",
        hints?.openWorldHint === false ? "closed-world" : "open-world",
      ];
      return `- ${tool.name} · ${flags.join(" · ")}`;
    }),
  ];
  return lines.join("\n");
};

export const formatDiff = (diff: SurfaceDiff): string => {
  const lines = [
    `SurfaceWitness · ${diff.serverId}`,
    `Status: ${diff.status.toUpperCase()} · score ${diff.score}/100`,
    `${diff.summary.baselineTools} → ${diff.summary.candidateTools} tools · ${diff.summary.unapprovedEvents} unapproved events`,
  ];
  if (diff.events.length > 0) {
    lines.push("", "Capability drift");
    for (const event of diff.events) {
      const target = [event.tool, event.path].filter(Boolean).join(" · ");
      lines.push(`  ${icon(event.risk)} ${event.risk.toUpperCase()} ${event.code.toUpperCase()}${event.approved ? " [approved]" : ""}${target ? ` [${target}]` : ""}: ${event.message}`);
    }
  } else {
    lines.push("", "✓ No callable-surface drift detected.");
  }
  return lines.join("\n");
};
