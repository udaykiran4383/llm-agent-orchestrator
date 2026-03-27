import { logger } from "../utils/logger";
import { generatePlan } from "./llm";
import { executeTool } from "./tools";
import { ExecutionLog, OrchestrationResult, Plan } from "../types";

// ─── In-memory request store ───
// Stores completed orchestration results for retrieval via GET /api/requests/:id

const requestStore = new Map<string, OrchestrationResult>();

export function getRequest(requestId: string): OrchestrationResult | undefined {
  return requestStore.get(requestId);
}

export function getRecentRequests(limit = 20): OrchestrationResult[] {
  const all = Array.from(requestStore.values());
  // Sort newest first
  return all
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
}

// ─── Constants ───

const MAX_RETRIES_CANCEL = 1; // Retry cancel_order once before giving up

// ─── Orchestrator ───

export async function orchestrate(
  userRequest: string
): Promise<OrchestrationResult> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const startedAt = new Date().toISOString();

  logger.info(`[${requestId}] Starting orchestration`);
  logger.debug(`[${requestId}] User request: "${userRequest}"`);

  const execution: ExecutionLog[] = [];
  let plan: Plan;

  try {
    // ── Phase 1: Generate execution plan from LLM ──
    logger.info(`[${requestId}] Phase 1 → Generating plan...`);
    plan = await generatePlan(userRequest);
    logger.info(`[${requestId}] Plan has ${plan.steps.length} step(s)`);

    if (plan.steps.length === 0) {
      const result = buildResult(
        requestId, userRequest, plan, execution, 0, 0, startedAt
      );
      requestStore.set(requestId, result);
      return result;
    }

    // ── Phase 2: Execute each step sequentially ──
    logger.info(`[${requestId}] Phase 2 → Executing plan...`);
    let completedSteps = 0;
    let stopped = false;

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      // If a prior step failed, mark remaining steps as skipped
      if (stopped) {
        execution.push({
          timestamp: new Date().toISOString(),
          step: i + 1,
          toolName: step.toolName,
          status: "skipped",
          error: "Skipped due to prior step failure",
        });
        continue;
      }

      const log: ExecutionLog = {
        timestamp: new Date().toISOString(),
        step: i + 1,
        toolName: step.toolName,
        status: "running",
      };
      execution.push(log);

      const stepStart = Date.now();

      try {
        logger.info(
          `[${requestId}] Executing step ${i + 1}/${plan.steps.length}: ${step.toolName}`
        );

        let result = await executeTool(step.toolName, step.args);

        // ── Retry logic for cancel_order ──
        // If cancel_order fails, retry once before giving up.
        // This handles transient failures (the 20% random failure rate).
        if (
          !result.success &&
          step.toolName.toLowerCase() === "cancel_order" &&
          MAX_RETRIES_CANCEL > 0
        ) {
          logger.warn(
            `[${requestId}] Step ${i + 1} (cancel_order) failed — retrying (1/${MAX_RETRIES_CANCEL})...`
          );
          result = await executeTool(step.toolName, step.args);
        }

        log.result = result;
        log.durationMs = Date.now() - stepStart;

        if (result.success) {
          log.status = "completed";
          completedSteps++;
          logger.info(`[${requestId}] Step ${i + 1} completed in ${log.durationMs}ms`);
        } else {
          log.status = "failed";
          log.error = result.error;
          stopped = true;
          logger.warn(
            `[${requestId}] Step ${i + 1} failed: ${result.error}. ` +
              `Remaining ${plan.steps.length - i - 1} step(s) will be skipped.`
          );
        }
      } catch (error) {
        log.status = "failed";
        log.durationMs = Date.now() - stepStart;
        log.error =
          error instanceof Error ? error.message : "Unknown error occurred";
        stopped = true;
        logger.error(`[${requestId}] Step ${i + 1} threw:`, error);
      }
    }

    const result = buildResult(
      requestId, userRequest, plan, execution,
      completedSteps, plan.steps.length, startedAt
    );

    requestStore.set(requestId, result);

    logger.info(
      `[${requestId}] Orchestration complete → ${result.finalStatus} ` +
        `(${completedSteps}/${plan.steps.length} steps, ${result.durationMs}ms)`
    );

    return result;
  } catch (error) {
    // Plan generation or catastrophic failure
    logger.error(`[${requestId}] Orchestration failed:`, error);

    const result = buildResult(
      requestId, userRequest,
      { steps: [], rationale: "Failed to generate plan" },
      execution, 0, 0, startedAt
    );
    result.finalStatus = "failed";
    requestStore.set(requestId, result);
    return result;
  }
}

// ─── Helpers ───

function buildResult(
  requestId: string,
  userRequest: string,
  plan: Plan,
  execution: ExecutionLog[],
  completedSteps: number,
  totalSteps: number,
  startedAt: string
): OrchestrationResult {
  const completedAt = new Date().toISOString();
  const durationMs =
    new Date(completedAt).getTime() - new Date(startedAt).getTime();

  const finalStatus =
    completedSteps === totalSteps && totalSteps > 0
      ? "success"
      : completedSteps > 0
        ? "partial"
        : "failed";

  return {
    requestId,
    userRequest,
    plan,
    execution,
    finalStatus,
    completedSteps,
    totalSteps,
    startedAt,
    completedAt,
    durationMs,
  };
}
