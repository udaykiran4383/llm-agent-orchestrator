import dotenv from "dotenv";

dotenv.config();

const hasOpenAIKey =
  !!process.env.OPENAI_API_KEY &&
  process.env.OPENAI_API_KEY !== "your_openai_api_key_here";

export const config = {
  PORT: parseInt(process.env.PORT || "3001", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL: "gpt-4o-mini",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  USE_MOCK_LLM: !hasOpenAIKey,
};

if (config.USE_MOCK_LLM) {
  console.warn(
    "[WARN] No OPENAI_API_KEY found — running in MOCK LLM mode. " +
      "Set OPENAI_API_KEY in .env to use real OpenAI planning."
  );
}
