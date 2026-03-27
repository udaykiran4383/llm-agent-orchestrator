import express from "express";
import cors from "cors";
import { config } from "./config";
import { logger } from "./utils/logger";
import routes from "./routes";

const app = express();

// ─── Middleware ───

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));

// Request logging
app.use((req, _res, next) => {
  logger.debug(`→ ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───

app.use("/api", routes);

// ─── 404 Handler ───

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Error Handler ───

app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
);

// ─── Start ───

app.listen(config.PORT, () => {
  logger.info(`✦ Mini Agent Orchestrator running on http://localhost:${config.PORT}`);
  logger.info(`  Mode: ${config.USE_MOCK_LLM ? "MOCK LLM" : `Gemini (${config.GEMINI_MODEL})`}`);
  logger.info(`  Endpoints:`);
  logger.info(`    GET  /api/health          — Health check`);
  logger.info(`    POST /api/orchestrate     — Execute an agent plan`);
  logger.info(`    GET  /api/requests        — List recent orchestrations`);
  logger.info(`    GET  /api/requests/:id    — Retrieve a specific result`);
});

export default app;
