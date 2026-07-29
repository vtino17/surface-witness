export type JsonSchema = Record<string, unknown>;

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  [key: string]: unknown;
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: ToolAnnotations;
  execution?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ToolSurfaceSnapshot {
  snapshotVersion: "1.0";
  serverId: string;
  serverVersion: string;
  protocolVersion: string;
  capturedAt: string;
  tools: McpTool[];
  snapshotHash: string;
}

export interface SurfacePolicy {
  policyVersion: "1.0";
  serverId: string;
  maxTools: number;
  allowedNewTools: string[];
  deniedToolPatterns: string[];
  descriptionMaxChars: number;
  blockMetadataSignals: boolean;
  requireAnnotationsForNewTools: boolean;
  requireOutputSchemaForNewTools: boolean;
  blockUnapprovedHighRisk: boolean;
  blockToolRemoval: boolean;
  approvals: string[];
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface DriftEvent {
  id: string;
  code: string;
  risk: RiskLevel;
  tool?: string;
  path?: string;
  message: string;
  before?: unknown;
  after?: unknown;
  approved: boolean;
}

export interface SurfaceDiff {
  serverId: string;
  baselineHash: string;
  candidateHash: string;
  status: "stable" | "review" | "blocked";
  score: number;
  assessedAt: string;
  summary: {
    baselineTools: number;
    candidateTools: number;
    added: number;
    removed: number;
    changed: number;
    approvedEvents: number;
    unapprovedEvents: number;
  };
  events: DriftEvent[];
  diffHash: string;
}

export interface SurfaceReceipt {
  receiptVersion: "1.0";
  serverId: string;
  baselineHash: string;
  candidateHash: string;
  policyHash: string;
  diffHash: string;
  assessedAt: string;
  issuedAt: string;
  approvedEventIds: string[];
  receiptHash: string;
}

export interface ReceiptVerification {
  valid: boolean;
  checks: Record<
    "receiptHash" | "baselineHash" | "candidateHash" | "policyHash" | "diffHash",
    boolean
  >;
  errors: string[];
}
