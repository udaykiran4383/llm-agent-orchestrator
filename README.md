# Mini Agent Orchestrator

A lightweight, **event-driven order-processing agent** built with TypeScript and Express. It accepts a natural-language request, uses an LLM to decompose it into a plan, then executes mock async tools sequentially with built-in guardrails.

> **Example**: `"Cancel my order #9921 and email me the confirmation at user@example.com."`

---

## Architecture

```
                          ┌──────────────────────┐
        POST /orchestrate │    Express Server     │
  User ─────────────────► │                       │
        natural language   │  ┌────────────────┐  │
                          │  │   Orchestrator  │  │
                          │  └──┬──────────┬───┘  │
                          │     │          │      │
                          │  ┌──▼───┐  ┌───▼───┐  │
                          │  │ LLM  │  │ Tools │  │
                          │  │Planner│  │Engine │  │
                          │  └──────┘  └───────┘  │
                          │                       │
                          │  In-Memory State Store │
                          └──────────────────────┘
```

### Request Flow

1. **API Layer** — Validates the input and passes it to the Orchestrator.
2. **Planner (LLM)** — Parses the natural-language request into a **sequence of tool calls** (a linear DAG). Uses OpenAI's `gpt-4o-mini` with `response_format: json_object` for reliable output — or falls back to a **keyword-based mock** when no API key is configured.
3. **Orchestrator** — Iterates through the plan **sequentially**. If any step fails it:
   - **Retries** `cancel_order` once (handles the 20% random failure).
   - **Stops** execution and marks remaining steps as `skipped`.
4. **Tools Engine** — Runs each tool asynchronously with a per-tool timeout safeguard:
   - `cancel_order(order_id)` — simulates cancellation with 20% random failure rate
   - `send_email(email, message)` — simulates sending an email (1-second async sleep)
5. **State Store** — Every completed orchestration is persisted in an in-memory `Map` and can be retrieved via `GET /api/requests/:id`.

---

## Architectural Decisions

### How is state handled?

Orchestration results are stored in an **in-memory `Map<requestId, OrchestrationResult>`**. This was chosen for simplicity — no database setup is required to run the project. The trade-off is that state is lost on restart, but for a demo context this is the right balance of simplicity vs. demonstrability. Each result includes the full plan, execution logs, timing, and final status.

### How are async tasks handled?

All tool functions (`cancel_order`, `send_email`) are **async** with simulated delays (`setTimeout`). The orchestrator awaits each step sequentially because step N+1 depends on step N's success (e.g., don't send a cancellation confirmation if the cancellation failed). Each tool call is wrapped with a **10-second timeout** via `Promise.race` to prevent hung operations.

### How is LLM unreliability handled?

| Technique | Description |
|-----------|-------------|
| **JSON Mode** | OpenAI is called with `response_format: { type: "json_object" }` so the response is always valid JSON — no regex extraction needed |
| **Temperature 0** | Deterministic output reduces plan variance |
| **Mock Fallback** | If no API key is provided, a keyword/regex-based planner produces identical plan structures. This lets reviewers test the full pipeline without an OpenAI account |
| **Graceful Degradation** | If plan generation fails entirely, the orchestrator returns a clean error response instead of crashing |

### How are failures handled?

- **20% `cancel_order` failure rate** is handled with a **single automatic retry** before giving up.
- If any step fails after retry, remaining steps are **explicitly marked as `skipped`** in the execution log (not silently omitted).
- The final status reflects the outcome: `success`, `partial`, or `failed`.

---

## Setup

### Prerequisites

- Node.js ≥ 18

### Install

```bash
npm install
```

### Configure (optional)

```bash
cp .env.example .env
```

To use real OpenAI planning, add your key to `.env`:

```
OPENAI_API_KEY=sk-...
```

> If you leave the key blank, the server runs in **Mock LLM mode** — fully functional, no API key needed.

### Run

```bash
npm run dev
```

Server starts on `http://localhost:3001`.

---

## API Reference

### `GET /api/health`

Returns server status.

```json
{ "status": "healthy", "timestamp": "...", "uptime": 42.3 }
```

### `POST /api/orchestrate`

Accepts a natural-language request and returns the execution result.

**Request:**
```json
{
  "userRequest": "Cancel my order #9921 and email me at user@example.com"
}
```

**Response (success):**
```json
{
  "requestId": "req_1711443000000_abc123",
  "userRequest": "Cancel my order #9921 and email me at user@example.com",
  "plan": {
    "steps": [
      { "toolName": "cancel_order", "args": { "order_id": "9921" } },
      { "toolName": "send_email", "args": { "email": "user@example.com", "message": "..." } }
    ],
    "rationale": "..."
  },
  "execution": [
    { "step": 1, "toolName": "cancel_order", "status": "completed", "durationMs": 512 },
    { "step": 2, "toolName": "send_email", "status": "completed", "durationMs": 1003 }
  ],
  "finalStatus": "success",
  "completedSteps": 2,
  "totalSteps": 2,
  "startedAt": "...",
  "completedAt": "...",
  "durationMs": 1520
}
```

**Response (failure with guardrail):**
```json
{
  "finalStatus": "failed",
  "completedSteps": 0,
  "totalSteps": 2,
  "execution": [
    { "step": 1, "toolName": "cancel_order", "status": "failed", "error": "Order could not be cancelled..." },
    { "step": 2, "toolName": "send_email", "status": "skipped", "error": "Skipped due to prior step failure" }
  ]
}
```

### `GET /api/requests`

Lists recent orchestrations (summary view).

### `GET /api/requests/:id`

Retrieves the full result of a specific orchestration by its `requestId`.

---

## Testing

Start the server, then run the test suite:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm test
```

The test script exercises:
1. Cancel + Email (happy path)
2. Email only
3. Complex natural-language parsing
4. Invalid email guardrail
5. State retrieval (`GET /api/requests`)
6. Request lookup by ID
7. Input validation (empty request)

You can also test with curl:

```bash
curl -s -X POST http://localhost:3001/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"userRequest":"Cancel order #9921 and email me at user@example.com"}' | jq .
```

---

## Project Structure

```
server/
├── index.ts                 # Express app entry point
├── config.ts                # Environment config + mock LLM detection
├── types.ts                 # TypeScript interfaces
├── routes/
│   └── index.ts             # API route handlers
├── services/
│   ├── llm.ts               # OpenAI + mock LLM planner
│   ├── tools.ts             # Mock tools (cancel_order, send_email)
│   └── orchestrator.ts      # Sequential execution engine + state store
└── utils/
    └── logger.ts            # Structured logging
```

---

## Limitations & Future Work

| Current Limitation | Possible Enhancement |
|---|---|
| In-memory state (lost on restart) | Persist to SQLite / Redis |
| Sequential execution only | Parallel execution for independent steps |
| Single retry for cancel_order | Configurable retry with exponential backoff |
| No authentication | API key / JWT auth |
| No streaming | SSE / WebSocket for real-time step progress |
| Two mock tools | Dynamic tool registry |

---

## License

MIT
