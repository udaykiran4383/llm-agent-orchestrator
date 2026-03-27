import dotenv from "dotenv";

dotenv.config();

const hasGeminiKey =
  !!process.env.GEMINI_API_KEY &&
  process.env.GEMINI_API_KEY !== "your_gemini_api_key_here";

export const config = {
  PORT: parseInt(process.env.PORT || "3001", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: "gemini-2.5-flash",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  USE_MOCK_LLM: !hasGeminiKey,
};

if (config.USE_MOCK_LLM) {
  console.warn(
    "[WARN] No GEMINI_API_KEY found — running in MOCK LLM mode. " +
      "Set GEMINI_API_KEY in .env to use real Gemini planning."
  );
}
