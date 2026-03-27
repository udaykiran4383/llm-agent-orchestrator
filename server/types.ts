// ─── Core types for the Mini Agent Orchestrator ───

export interface ExecutionRequest {
  userRequest: string;
}

export interface ExecutionStep {
  toolName: string;
  args: Record<string, string | number | boolean>;
}

export interface Plan {
  steps: ExecutionStep[];
  rationale: string;
}

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface ExecutionLog {
  timestamp: string;
  step: number;
  toolName: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: ToolResult;
  error?: string;
  durationMs?: number;
}

export interface OrchestrationResult {
  requestId: string;
  userRequest: string;
  plan: Plan;
  execution: ExecutionLog[];
  finalStatus: "success" | "partial" | "failed";
  completedSteps: number;
  totalSteps: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}
