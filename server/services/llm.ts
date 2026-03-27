import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { config } from "../config";
import { logger } from "../utils/logger";
import { Plan } from "../types";

// Gemini client — only initialized if we have a real key
let genAI: GoogleGenerativeAI | null = null;
if (!config.USE_MOCK_LLM) {
  genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
}

const SYSTEM_PROMPT = `You are an intelligent agent orchestrator. Analyze user requests and generate a plan using available tools.

Available tools:
1. cancel_order — Cancels a customer order.
   Args: { "order_id": "<string>" }
2. send_email — Sends an email to a recipient.
   Args: { "email": "<string>", "message": "<string>" }

Respond with a JSON object in this exact format:
{
  "steps": [
    { "toolName": "tool_name", "args": { ... } }
  ],
  "rationale": "brief explanation of the plan"
}

Rules:
- Only use the tools listed above.
- Extract real values from the user request (order IDs, email addresses, etc.).
- If the request doesn't require any tools, return an empty steps array.
- Consider dependencies: cancel_order should come before send_email when the email depends on the cancellation result.
- Always include a rationale.`;

// Real LLM plan generation via Gemini
async function generateRealPlan(userRequest: string): Promise<Plan> {
  if (!genAI) throw new Error("Gemini client not initialized");

  const model = genAI.getGenerativeModel({
    model: config.GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json"
    }
  });

  const result = await model.generateContent(userRequest);
  const content = result.response.text();

  if (!content) throw new Error("No response content from Gemini");
  console.log("GEMINI RAW:", content);

  const plan = JSON.parse(content) as Plan;
  if (!plan.steps || !Array.isArray(plan.steps)) {
    throw new Error("Invalid plan structure: missing steps array");
  }

  return plan;
}

// Mock LLM — uses keyword/regex matching for deterministic plans without an API key
function generateMockPlan(userRequest: string): Plan {
  const lower = userRequest.toLowerCase();
  const steps: Plan["steps"] = [];

  // Extract order ID (e.g. #1234, #ABC-123)
  const orderMatch = userRequest.match(/#([A-Za-z0-9\-]+)/);
  const orderId = orderMatch ? orderMatch[1] : null;

  // Extract email address
  const emailMatch = userRequest.match(
    /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/
  );
  const email = emailMatch ? emailMatch[0] : null;

  const wantsCancel =
    lower.includes("cancel") || lower.includes("refund") || lower.includes("void");
  const wantsEmail =
    lower.includes("email") || lower.includes("mail") || lower.includes("send") ||
    lower.includes("notify") || lower.includes("confirmation");

  if (wantsCancel && orderId) {
    steps.push({ toolName: "cancel_order", args: { order_id: orderId } });
  }

  if (wantsEmail && email) {
    const message = wantsCancel
      ? `Your order #${orderId || "N/A"} has been successfully cancelled. A refund will be processed to your original payment method within 5-7 business days.`
      : `This is a notification regarding your request. Please contact us if you have any questions.`;

    steps.push({ toolName: "send_email", args: { email, message } });
  }

  if (steps.length === 0) {
    return {
      steps: [],
      rationale:
        "Could not identify actionable tools from the request. " +
        "Please mention an order ID (e.g. #12345) and/or an email address.",
    };
  }

  const parts = steps.map((s) => s.toolName).join(", then ");
  return { steps, rationale: `Parsed request and identified steps: ${parts}.` };
}

// Public API — automatically selects real or mock mode based on config
export async function generatePlan(userRequest: string): Promise<Plan> {
  const mode = config.USE_MOCK_LLM ? "mock" : "Gemini";
  logger.info(`Generating plan (${mode} mode)...`);

  try {
    const plan = config.USE_MOCK_LLM
      ? generateMockPlan(userRequest)
      : await generateRealPlan(userRequest);

    logger.info("Plan generated", { steps: plan.steps.length, rationale: plan.rationale });
    return plan;
  } catch (error) {
    logger.error("Failed to generate plan:", error);
    throw error;
  }
}
