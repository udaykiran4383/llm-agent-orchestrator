#!/usr/bin/env tsx
/**
 * Test script for the Mini Agent Orchestrator
 * Usage: npm test   (requires server running on :3001)
 */

import axios from "axios";

const BASE_URL = "http://localhost:3001/api";

interface TestCase {
  name: string;
  request: string;
  description: string;
}

const testCases: TestCase[] = [
  {
    name: "Cancel + Email (Happy Path)",
    request:
      "Cancel my order #9921 and email me the confirmation at user@example.com",
    description:
      "Tests the full pipeline: plan generation → cancel_order → send_email",
  },
  {
    name: "Email Only",
    request:
      'Send an email to john.doe@example.com with subject "Welcome" and message "Thanks for signing up!"',
    description: "Tests single-tool execution (send_email only)",
  },
  {
    name: "Complex Natural Language",
    request:
      "I need to cancel order #ABC999. The customer is upset — please send a professional apology email to support@mystore.com explaining the situation.",
    description: "Tests LLM's ability to parse complex natural language",
  },
  {
    name: "Invalid Email Guardrail",
    request:
      "Cancel order #55555 and email to not-a-valid-email about the cancellation",
    description: "Tests email validation guardrail",
  },
];

async function runTests() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║    Mini Agent Orchestrator — Test Suite          ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log(`Target: ${BASE_URL}\n`);

  // Health check
  try {
    const { data } = await axios.get(`${BASE_URL}/health`);
    console.log(`✓ Server healthy (uptime: ${data.uptime?.toFixed(1)}s)\n`);
  } catch {
    console.error("✗ Server not responding. Start it with: npm run dev\n");
    process.exit(1);
  }

  let savedRequestId = "";

  // Run tests
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`${"─".repeat(60)}`);
    console.log(`Test ${i + 1}: ${tc.name}`);
    console.log(`${tc.description}`);
    console.log(`Request: "${tc.request}"\n`);

    try {
      const { data } = await axios.post(`${BASE_URL}/orchestrate`, {
        userRequest: tc.request,
      });

      if (i === 0) savedRequestId = data.requestId;

      console.log(`  ID:       ${data.requestId}`);
      console.log(`  Status:   ${data.finalStatus}`);
      console.log(`  Steps:    ${data.completedSteps}/${data.totalSteps}`);
      console.log(`  Duration: ${data.durationMs}ms`);
      console.log(`  Plan:     ${data.plan.rationale}\n`);

      for (const log of data.execution) {
        const icon =
          log.status === "completed"
            ? "✓"
            : log.status === "failed"
              ? "✗"
              : log.status === "skipped"
                ? "⊘"
                : "⏳";
        console.log(
          `  ${icon} Step ${log.step}: ${log.toolName} → ${log.status}` +
            (log.durationMs ? ` (${log.durationMs}ms)` : "")
        );
        if (log.error) console.log(`    Error: ${log.error}`);
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        console.error(`  ✗ HTTP ${error.response?.status}: ${error.response?.data?.message}`);
      } else {
        console.error(`  ✗ Unexpected error:`, error);
      }
    }

    console.log();
    if (i < testCases.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Test state retrieval endpoints
  console.log(`${"─".repeat(60)}`);
  console.log("Test 5: State Retrieval (GET /api/requests)\n");

  try {
    const { data } = await axios.get(`${BASE_URL}/requests`);
    console.log(`  ✓ Found ${data.count} stored request(s)\n`);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error(`  ✗ ${error.message}`);
    }
  }

  if (savedRequestId) {
    console.log(`Test 6: Retrieve by ID (GET /api/requests/${savedRequestId})\n`);
    try {
      const { data } = await axios.get(`${BASE_URL}/requests/${savedRequestId}`);
      console.log(`  ✓ Retrieved: ${data.finalStatus} (${data.completedSteps}/${data.totalSteps} steps)\n`);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        console.error(`  ✗ ${error.message}`);
      }
    }
  }

  // Validation test
  console.log(`${"─".repeat(60)}`);
  console.log("Test 7: Input Validation (empty request)\n");
  try {
    await axios.post(`${BASE_URL}/orchestrate`, { userRequest: "" });
    console.log("  ✗ Should have returned 400");
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 400) {
      console.log(`  ✓ Correctly rejected: ${error.response.data.message}`);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("Test Suite Complete\n");
}

runTests().catch(console.error);
