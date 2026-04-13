import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEndEvent } from "@mariozechner/pi-coding-agent";
import * as observability from "./observability/index.js";

// ---------------------------------------------------------------------------
// Mock hoisting – must use vi.hoisted() so the references are available inside
// vi.mock() factory functions, which are hoisted to the top of the file.
// ---------------------------------------------------------------------------

const mockStartSpan = vi.hoisted(() => vi.fn());
const mockForceFlush = vi.hoisted(() => vi.fn(async () => {}));
const mockShutdown = vi.hoisted(() => vi.fn(async () => {}));

// Replace getConfig so the extension never touches real env vars.
vi.mock("./config.js", () => ({
  getConfig: vi.fn(() => ({
    enabled: true,
    serviceName: "test-service",
    serviceVersion: "0.0.0-test",
    traceUiBaseUrl: "http://localhost:16686/trace",
    privacy: {
      profile: "detailed-with-redaction",
      payloadMaxBytes: 1024,
      extraSensitiveKeys: [],
      pathDenylist: [],
    },
    traces: { exporter: "none", endpoint: "", headers: {} },
    metrics: { exporters: ["none"], endpoint: "", headers: {}, exportIntervalMs: 60_000 },
  })),
}));

// Replace createTraceRuntime so no real OTLP / SDK plumbing runs.
vi.mock("./trace/provider.js", () => ({
  createTraceRuntime: vi.fn(() => ({
    tracer: { startSpan: mockStartSpan },
    exporter: "none",
    endpoint: "",
    forceFlush: mockForceFlush,
    shutdown: mockShutdown,
  })),
}));

// Replace privacy factories with pass-through stubs so index.ts can construct
// SpanManager without the compiled privacy module being present in the sandbox.
vi.mock("@this/privacy/redactor.js", () => ({
  createRedactor: vi.fn(() => ({})),
}));
vi.mock("@this/privacy/payload-policy.js", () => ({
  createPayloadPolicy: vi.fn(() => ({
    sanitize: (value: unknown) => ({
      mode: "detailed-with-redaction",
      omitted: false,
      text: JSON.stringify(value),
      bytes: 0,
      originalBytes: 0,
      truncated: false,
    }),
    toAttributes: (prefix: string, sanitized: { text?: string }) => ({
      [`${prefix}.text`]: sanitized.text ?? "",
    }),
  })),
}));

import registerExtension from "./index.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type AnyHandler = (event: unknown, ctx: unknown) => Promise<void>;

/** Minimal stand-in for the pi ExtensionAPI. */
class FakeExtensionAPI {
  private readonly handlers = new Map<string, AnyHandler[]>();

  on(eventName: string, handler: AnyHandler): void {
    if (!this.handlers.has(eventName)) this.handlers.set(eventName, []);
    this.handlers.get(eventName)!.push(handler);
  }

  async emit(eventName: string, event: unknown, ctx: unknown): Promise<void> {
    for (const handler of this.handlers.get(eventName) ?? []) {
      await handler(event, ctx);
    }
  }
}

/**
 * Minimal stand-in for ExtensionContext.
 *
 * Includes a model_change entry so getCurrentModel() returns a non-"unknown"
 * value, which is what a real session would expose.
 */
function makeContext(sessionId: string) {
  return {
    sessionManager: {
      getSessionId: () => sessionId,
      getEntries: () => [
        { type: "model_change", modelId: "anthropic/claude-opus-4-5" },
        { type: "thinking_level_change", thinkingLevel: "low" },
      ],
      getHeader: () => ({ parentSession: "n/a" }),
    },
  };
}

/**
 * Builds the agent_end event that the SpanManager expects.
 *
 * In a real session the LLM would produce this. Here it is hand-crafted to
 * simulate the mocked LLM response for the parallel-bash-commands scenario.
 */
function makeMockLlmResponse(): AgentEndEvent {
  return {
    type: "agent_end" as const,
    messages: [
      {
        role: "assistant" as const,
        content: [
          {
            type: "text" as const,
            text: 'I\'ve dispatched 5 parallel `sleep 2 && echo "hi"` commands. All completed successfully, each printing "hi" after a 2-second delay.',
          },
        ],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "claude-opus-4-5",
        usage: {
          input: 150,
          output: 45,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 195,
          cost: {
            input: 0.00075,
            output: 0.000675,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0.001425,
          },
        },
        stopReason: "end_turn",
        timestamp: 0,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("index.ts – pi-coding-agent lifecycle", () => {
  const SESSION_ID = "session-abc123";
  const TOOL_COMMAND = 'sleep 2 && echo "hi"';
  const TOOL_CALL_IDS = ["call-1", "call-2", "call-3", "call-4", "call-5"];

  let pi: FakeExtensionAPI;

  beforeEach(() => {
    // Prevent file-system writes from the @logCall() decorator used in SpanManager.
    vi.spyOn(observability, "log").mockImplementation(() => {});

    // Give each test a fresh set of span spies.
    mockStartSpan.mockReset();
    mockStartSpan.mockImplementation((_name: string) => ({
      setAttributes: vi.fn(),
      end: vi.fn(),
    }));
    mockForceFlush.mockClear();
    mockShutdown.mockClear();

    pi = new FakeExtensionAPI();

    // Wire up all event handlers – equivalent to the extension being loaded.
    registerExtension(pi as any);
  });

  // -------------------------------------------------------------------------
  // Helper: run the full lifecycle for the 5-parallel-tool-calls scenario.
  // Factored out so individual tests can call it without repetition.
  // -------------------------------------------------------------------------

  async function runFullLifecycle(ctx: ReturnType<typeof makeContext>): Promise<void> {
    // 1. Session start
    await pi.emit("session_start", { type: "session_start" }, ctx);

    // 2. User types the query
    await pi.emit(
      "input",
      {
        type: "input",
        text: `make 5 tool calls of this command in parallel: ${TOOL_COMMAND}`,
        source: "interactive",
      },
      ctx,
    );

    // 3. Turn start – the LLM begins its first reasoning iteration
    await pi.emit(
      "turn_start",
      { type: "turn_start", turnIndex: 0, timestamp: Date.now() },
      ctx,
    );

    // 4. The LLM emits 5 parallel tool calls in one turn
    for (const callId of TOOL_CALL_IDS) {
      await pi.emit(
        "tool_call",
        {
          type: "tool_call",
          toolName: "bash",
          toolCallId: callId,
          input: { command: TOOL_COMMAND },
        },
        ctx,
      );
    }

    // 5. Results arrive out-of-order (reversed) to simulate parallel execution
    for (const callId of [...TOOL_CALL_IDS].reverse()) {
      await pi.emit(
        "tool_result",
        {
          type: "tool_result",
          toolName: "bash",
          toolCallId: callId,
          input: { command: TOOL_COMMAND },
          content: [{ type: "text", text: "hi" }],
          isError: false,
          details: undefined,
        },
        ctx,
      );
    }

    // 6. Turn ends after all tool results are collected
    await pi.emit(
      "turn_end",
      {
        type: "turn_end",
        turnIndex: 0,
        message: { role: "assistant", content: [] },
        toolResults: [],
      },
      ctx,
    );

    // 7. Agent end – the mocked LLM response (no real network call is made)
    await pi.emit("agent_end", makeMockLlmResponse(), ctx);

    // 8. Session shutdown
    await pi.emit("session_shutdown", { type: "session_shutdown" }, ctx);
  }

  // -------------------------------------------------------------------------

  it("creates the correct number and type of spans", async () => {
    const ctx = makeContext(SESSION_ID);
    await runFullLifecycle(ctx);

    // Expected spans: 1 session + 1 agent + 1 turn + 5 tool = 8
    expect(mockStartSpan).toHaveBeenCalledTimes(8);

    const names = mockStartSpan.mock.calls.map((c) => c[0] as string);

    expect(names.filter((n) => n.includes("pi.session"))).toHaveLength(1);
    expect(names.filter((n) => n.includes("pi.agent"))).toHaveLength(1);
    expect(names.filter((n) => n === "turn 0")).toHaveLength(1);
    expect(names.filter((n) => n === "pi.tool.bash")).toHaveLength(5);
  });

  it("ends all spans via flush() after agent_end", async () => {
    const ctx = makeContext(SESSION_ID);
    await runFullLifecycle(ctx);

    const allSpans = mockStartSpan.mock.results.map(
      (r) => r.value as { end: ReturnType<typeof vi.fn> },
    );

    expect(allSpans.every((s) => s.end.mock.calls.length > 0)).toBe(true);
  });

  it("attaches gen_ai attributes to each of the 5 tool spans", async () => {
    const ctx = makeContext(SESSION_ID);

    await pi.emit("session_start", { type: "session_start" }, ctx);
    await pi.emit(
      "input",
      {
        type: "input",
        text: `make 5 tool calls of this command in parallel: ${TOOL_COMMAND}`,
        source: "interactive",
      },
      ctx,
    );
    await pi.emit(
      "turn_start",
      { type: "turn_start", turnIndex: 0, timestamp: Date.now() },
      ctx,
    );

    for (const callId of TOOL_CALL_IDS) {
      await pi.emit(
        "tool_call",
        {
          type: "tool_call",
          toolName: "bash",
          toolCallId: callId,
          input: { command: TOOL_COMMAND },
        },
        ctx,
      );
    }

    // Tool spans are at indices 3–7:
    //   [0] = session span
    //   [1] = agent span
    //   [2] = turn span
    //   [3..7] = tool spans (one per tool_call)
    const toolSpans = mockStartSpan.mock.results
      .slice(3)
      .map((r) => r.value as { setAttributes: ReturnType<typeof vi.fn> });

    expect(toolSpans).toHaveLength(5);

    for (let i = 0; i < TOOL_CALL_IDS.length; i++) {
      expect(toolSpans[i].setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          "gen_ai.operation.name": "execute_tool",
          "gen_ai.tool.name": "bash",
          "gen_ai.tool.call.id": TOOL_CALL_IDS[i],
          "gen_ai.tool.input.text": JSON.stringify({ command: TOOL_COMMAND }),
        }),
      );
    }
  });

  it("records tool output on each tool span after tool_result", async () => {
    const ctx = makeContext(SESSION_ID);

    await pi.emit("session_start", { type: "session_start" }, ctx);
    await pi.emit(
      "input",
      {
        type: "input",
        text: `make 5 tool calls of this command in parallel: ${TOOL_COMMAND}`,
        source: "interactive",
      },
      ctx,
    );
    await pi.emit(
      "turn_start",
      { type: "turn_start", turnIndex: 0, timestamp: Date.now() },
      ctx,
    );

    for (const callId of TOOL_CALL_IDS) {
      await pi.emit(
        "tool_call",
        {
          type: "tool_call",
          toolName: "bash",
          toolCallId: callId,
          input: { command: TOOL_COMMAND },
        },
        ctx,
      );
    }

    // Results arrive reversed to simulate parallel, out-of-order completion.
    for (const callId of [...TOOL_CALL_IDS].reverse()) {
      await pi.emit(
        "tool_result",
        {
          type: "tool_result",
          toolName: "bash",
          toolCallId: callId,
          input: { command: TOOL_COMMAND },
          content: [{ type: "text", text: "hi" }],
          isError: false,
          details: undefined,
        },
        ctx,
      );
    }

    const toolSpans = mockStartSpan.mock.results
      .slice(3)
      .map((r) => r.value as { setAttributes: ReturnType<typeof vi.fn> });

    for (const toolSpan of toolSpans) {
      expect(toolSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          "gen_ai.tool.output.text": JSON.stringify("hi"),
          "gen_ai.tool.is_error": false,
        }),
      );
    }
  });

  it("sets gen_ai attributes on the agent span from the mocked LLM response", async () => {
    const ctx = makeContext(SESSION_ID);

    await pi.emit("session_start", { type: "session_start" }, ctx);
    await pi.emit(
      "input",
      {
        type: "input",
        text: `make 5 tool calls of this command in parallel: ${TOOL_COMMAND}`,
        source: "interactive",
      },
      ctx,
    );
    await pi.emit(
      "turn_start",
      { type: "turn_start", turnIndex: 0, timestamp: Date.now() },
      ctx,
    );
    for (const callId of TOOL_CALL_IDS) {
      await pi.emit(
        "tool_call",
        { type: "tool_call", toolName: "bash", toolCallId: callId, input: { command: TOOL_COMMAND } },
        ctx,
      );
    }
    for (const callId of TOOL_CALL_IDS) {
      await pi.emit(
        "tool_result",
        {
          type: "tool_result",
          toolName: "bash",
          toolCallId: callId,
          input: { command: TOOL_COMMAND },
          content: [{ type: "text", text: "hi" }],
          isError: false,
          details: undefined,
        },
        ctx,
      );
    }
    await pi.emit(
      "turn_end",
      { type: "turn_end", turnIndex: 0, message: { role: "assistant", content: [] }, toolResults: [] },
      ctx,
    );

    await pi.emit("agent_end", makeMockLlmResponse(), ctx);

    // Agent span is the second span created: index 1
    // [0] = session span, [1] = agent span
    const agentSpan = mockStartSpan.mock.results[1].value as {
      setAttributes: ReturnType<typeof vi.fn>;
    };

    // Attributes set during onAgentStartWithInput
    expect(agentSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "gen_ai.operation.name": "chat",
        "gen_ai.request.model": "anthropic/claude-opus-4-5",
        "gen_ai.request.thinking_level": "low",
      }),
    );

    // Attributes set during onAgentEndWithCompletion (from mocked LLM response)
    expect(agentSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "gen_ai.usage.prompt_tokens": 150,
        "gen_ai.usage.completion_tokens": 45,
      }),
    );
  });

  it("calls shutdown on the trace runtime when session_shutdown fires", async () => {
    const ctx = makeContext(SESSION_ID);
    await runFullLifecycle(ctx);

    expect(mockShutdown).toHaveBeenCalledTimes(1);
  });
});
