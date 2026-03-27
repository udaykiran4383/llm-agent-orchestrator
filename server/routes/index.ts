import { Router, Request, Response } from "express";
import { orchestrate } from "../services/orchestrator";
import { getRequest, getRecentRequests } from "../services/orchestrator";
import { logger } from "../utils/logger";

const router = Router();

const MAX_REQUEST_LENGTH = 1000;

// ─── Health Check ───

router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── Main Orchestration Endpoint ───

router.post("/orchestrate", async (req: Request, res: Response) => {
  try {
    const { userRequest } = req.body;

    // Input validation
    if (!userRequest || typeof userRequest !== "string") {
      return res.status(400).json({
        error: "Invalid request",
        message: "userRequest field is required and must be a string",
      });
    }

    const trimmed = userRequest.trim();
    if (trimmed.length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "userRequest cannot be empty",
      });
    }

    if (trimmed.length > MAX_REQUEST_LENGTH) {
      return res.status(400).json({
        error: "Invalid request",
        message: `userRequest exceeds maximum length of ${MAX_REQUEST_LENGTH} characters`,
      });
    }

    logger.info(`POST /orchestrate — "${trimmed.substring(0, 80)}..."`);

    const result = await orchestrate(trimmed);
    res.json(result);
  } catch (error) {
    logger.error("Error in /orchestrate:", error);
    res.status(500).json({
      error: "Internal server error",
      message:
        error instanceof Error ? error.message : "An unexpected error occurred",
    });
  }
});

// ─── Retrieve Past Orchestration by ID ───

router.get("/requests/:id", (req: Request, res: Response) => {
  const result = getRequest(req.params.id);

  if (!result) {
    return res.status(404).json({
      error: "Not found",
      message: `No orchestration found with ID: ${req.params.id}`,
    });
  }

  res.json(result);
});

// ─── List Recent Orchestrations ───

router.get("/requests", (_req: Request, res: Response) => {
  const results = getRecentRequests(20);
  res.json({
    count: results.length,
    requests: results.map((r) => ({
      requestId: r.requestId,
      userRequest: r.userRequest.substring(0, 100),
      finalStatus: r.finalStatus,
      completedSteps: r.completedSteps,
      totalSteps: r.totalSteps,
      startedAt: r.startedAt,
      durationMs: r.durationMs,
    })),
  });
});

export default router;
