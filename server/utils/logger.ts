import { config } from "../config";

type LogLevel = "debug" | "info" | "warn" | "error";

const logLevels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = logLevels[(config.LOG_LEVEL as LogLevel) || "info"] || 1;

function formatTimestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug: (message: string, data?: unknown) => {
    if (logLevels["debug"] >= currentLevel) {
      console.log(`[${formatTimestamp()}] [DEBUG] ${message}`, data ?? "");
    }
  },
  info: (message: string, data?: unknown) => {
    if (logLevels["info"] >= currentLevel) {
      console.log(`[${formatTimestamp()}] [INFO]  ${message}`, data ?? "");
    }
  },
  warn: (message: string, data?: unknown) => {
    if (logLevels["warn"] >= currentLevel) {
      console.warn(`[${formatTimestamp()}] [WARN]  ${message}`, data ?? "");
    }
  },
  error: (message: string, data?: unknown) => {
    if (logLevels["error"] >= currentLevel) {
      console.error(`[${formatTimestamp()}] [ERROR] ${message}`, data ?? "");
    }
  },
};
