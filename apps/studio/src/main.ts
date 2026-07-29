import {
  diffSurfaces,
  samplePolicy,
  sampleSurfaces,
} from "@surfacewitness/core";
import type {
  RiskLevel,
  SurfaceDiff,
  ToolSurfaceSnapshot,
} from "@surfacewitness/core";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing application root.");

const surfaces = await sampleSurfaces();
let scenario: "stable" | "risky" = "risky";
let selectedRisk: RiskLevel | "all" = "all";

const escapeHtml = (value: unknown): string =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const annotation = (value: boolean | undefined, positive: string, negative: string): string =>
  value === true ? positive : negative;

const renderTools = (snapshot: ToolSurfaceSnapshot): string =>
  snapshot.tools.map((tool) => `
    <article class="tool-card">
      <div class="tool-card__top">
        <span class="tool-glyph">${escapeHtml(tool.name.slice(0, 2).toUpperCase())}</span>
        <div>
          <h3>${escapeHtml(tool.name)}</h3>
          <p>${escapeHtml(tool.description ?? "No description supplied")}</p>
        </div>
      </div>
      <div class="chips">
        <span>${annotation(tool.annotations?.readOnlyHint, "read-only", "writable")}</span>
        <span>${tool.annotations?.destructiveHint === false ? "non-destructive" : "destructive?"}</span>
        <span>${tool.annotations?.openWorldHint === false ? "closed-world" : "open-world"}</span>
      </div>
    </article>
  `).join("");

const renderEvents = (diff: SurfaceDiff): string => {
  const events = diff.events.filter((event) => selectedRisk === "all" || event.risk === selectedRisk);
  if (events.length === 0) {
    return `<div class="empty"><span>✓</span><h3>No drift in this view</h3><p>The candidate exposes the same callable contract as the baseline.</p></div>`;
  }
  return events.map((event) => `
    <article class="event event--${event.risk}">
      <div class="event__risk">${escapeHtml(event.risk)}</div>
      <div class="event__body">
        <div class="event__heading">
          <code>${escapeHtml(event.code)}</code>
          <span class="event__id">#${event.id}</span>
        </div>
        <h3>${escapeHtml(event.message)}</h3>
        <p>${event.tool ? `<strong>${escapeHtml(event.tool)}</strong>` : "surface"}${event.path ? ` / ${escapeHtml(event.path)}` : ""}</p>
      </div>
      <div class="event__state">${event.approved ? "approved" : "unapproved"}</div>
    </article>
  `).join("");
};

const download = (name: string, value: unknown): void => {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
};

const render = async (): Promise<void> => {
  const candidate = scenario === "stable" ? surfaces.stable : surfaces.risky;
  const diff = await diffSurfaces({
    baseline: surfaces.baseline,
    candidate,
    policy: samplePolicy,
    assessedAt: new Date("2026-07-29T08:00:00.000Z"),
  });
  const risks: Array<RiskLevel | "all"> = ["all", "critical", "high", "medium", "low"];
  root.innerHTML = `
    <header class="nav">
      <a class="brand" href="#">
        <span class="brand__mark">SW</span>
        <span>SurfaceWitness</span>
      </a>
      <div class="nav__meta"><span class="live-dot"></span> offline analysis</div>
      <a class="nav__link" href="https://github.com/vtino17/surface-witness">View source ↗</a>
    </header>

    <main>
      <section class="hero">
        <div class="eyebrow">MCP CAPABILITY-DRIFT FIREWALL</div>
        <h1>Know when a tool<br><em>changes its reach.</em></h1>
        <p>Diff callable surfaces before an updated MCP server enters an agent session. No server connection. No model judgment. Reproducible evidence.</p>
        <div class="scenario" role="group" aria-label="Demo scenario">
          <button data-scenario="stable" class="${scenario === "stable" ? "active" : ""}">Stable update</button>
          <button data-scenario="risky" class="${scenario === "risky" ? "active" : ""}">Risk expansion</button>
        </div>
      </section>

      <section class="verdict verdict--${diff.status}">
        <div>
          <span class="verdict__label">CURRENT VERDICT</span>
          <h2>${diff.status}</h2>
          <p>${diff.status === "blocked" ? "The candidate expands high-risk capabilities without approval." : "The candidate remains inside its reviewed callable surface."}</p>
        </div>
        <div class="score">
          <strong>${diff.score}</strong>
          <span>/ 100</span>
        </div>
        <div class="metric"><strong>${diff.summary.baselineTools} → ${diff.summary.candidateTools}</strong><span>tools</span></div>
        <div class="metric"><strong>${diff.summary.unapprovedEvents}</strong><span>unapproved</span></div>
        <button id="download-report" class="download">Download report ↓</button>
      </section>

      <section class="section">
        <div class="section__head">
          <div><span class="index">01</span><h2>Candidate surface</h2></div>
          <code>${escapeHtml(candidate.snapshotHash.slice(0, 16))}</code>
        </div>
        <div class="tools">${renderTools(candidate)}</div>
      </section>

      <section class="section">
        <div class="section__head">
          <div><span class="index">02</span><h2>Drift ledger</h2></div>
          <div class="filters">
            ${risks.map((risk) => `<button data-risk="${risk}" class="${selectedRisk === risk ? "active" : ""}">${risk}</button>`).join("")}
          </div>
        </div>
        <div class="events">${renderEvents(diff)}</div>
      </section>

      <section class="boundary">
        <div>
          <span class="index">03</span>
          <h2>What is enforced</h2>
        </div>
        <div class="boundary__grid">
          <p><span>01</span> Tool additions and removals</p>
          <p><span>02</span> Writable, destructive, open-world drift</p>
          <p><span>03</span> JSON Schema constraint relaxation</p>
          <p><span>04</span> Tool-description poisoning signals</p>
          <p><span>05</span> Output and execution contract changes</p>
          <p><span>06</span> Fingerprint-bound approvals</p>
        </div>
      </section>
    </main>

    <footer>
      <span>SurfaceWitness / v0.1.0</span>
      <span>Deterministic · local-first · MCP-aware</span>
    </footer>
  `;

  root.querySelectorAll<HTMLButtonElement>("[data-scenario]").forEach((button) => {
    button.addEventListener("click", () => {
      scenario = button.dataset.scenario as "stable" | "risky";
      selectedRisk = "all";
      void render();
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-risk]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedRisk = button.dataset.risk as RiskLevel | "all";
      void render();
    });
  });
  root.querySelector<HTMLButtonElement>("#download-report")?.addEventListener("click", () => {
    download(`surface-witness-${scenario}.json`, diff);
  });
};

await render();
