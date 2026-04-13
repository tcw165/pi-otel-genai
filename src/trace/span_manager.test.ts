import { describe, expect, it, vi, beforeEach } from "vitest";
import { SpanManager } from "@this/trace/span_manager.js";
import type { TraceRuntime } from "@this/trace/provider.js";
import { createPayloadPolicy } from "@this/privacy/payload-policy.js";
import { createRedactor } from "@this/privacy/redactor.js";
import type { AgentEndEvent } from "@mariozechner/pi-coding-agent";
import * as observability from "@this/observability/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpan() {
  return {
    setAttributes: vi.fn(),
    end: vi.fn(),
  };
}

function makePayloadPolicy() {
  const redactor = createRedactor({ extraSensitiveKeys: [], pathDenylist: [] });
  return createPayloadPolicy({
    profile: "detailed-with-redaction",
    payloadMaxBytes: 32 * 1024,
    redactor,
  });
}

function makeTraceRuntime(): TraceRuntime {
  return {
    tracer: { startSpan: vi.fn(() => makeSpan()) } as any,
    exporter: "otlp",
    endpoint: "http://localhost:4318",
    forceFlush: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
  };
}

function makeInputEvent(text = "hello") {
  return { type: "input" as const, text, source: "human" as any };
}

function makeAgentEndEvent(outputText = "done"): AgentEndEvent {
  return {
    type: "agent_end" as const,
    messages: [
      {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: outputText }],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "test-model",
        usage: {
          input: 10,
          output: 5,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 0,
      },
    ],
  };
}

function makeToolCallEvent(toolName = "bash", toolCallId = "call-1") {
  return {
    type: "tool_call" as const,
    toolName,
    toolCallId,
    input: { command: "ls" },
  };
}

function makeToolResultEvent(
  toolCallId = "call-1",
  toolName: "bash" | "read" = "bash",
  isError = false,
) {
  const content = [{ type: "text" as const, text: "file1.ts\nfile2.ts" }];
  if (toolName === "read") {
    return {
      type: "tool_result" as const,
      toolCallId,
      toolName: "read" as const,
      input: {},
      content,
      isError,
      details: undefined,
    };
  }
  return {
    type: "tool_result" as const,
    toolCallId,
    toolName: "bash" as const,
    input: {},
    content,
    isError,
    details: undefined,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SpanManager", () => {
  let runtime: TraceRuntime;
  let manager: SpanManager;

  beforeEach(() => {
    vi.spyOn(observability, "log").mockImplementation(() => {});
    runtime = makeTraceRuntime();
    manager = new SpanManager(runtime, makePayloadPolicy());
  });

  // --- session lifecycle ---------------------------------------------------

  describe("session lifecycle", () => {
    it("onSessionStart and onSessionStop are no-ops", () => {
      expect(() =>
        manager.onSessionStart({ session_id: "s1", parent_session_id: undefined }),
      ).not.toThrow();
      expect(() => manager.onSessionStop({ session_id: "s1" })).not.toThrow();
      expect(manager.debugSessions()).toEqual({});
    });

    it("onAgentStartWithInput creates an implicit session", () => {
      manager.onAgentStartWithInput({
        session_id: "s1",
        input_event: makeInputEvent(),
        model: "m",
        thinking_level: "low",
      });
      expect(manager.debugSessions()).toMatchObject({
        s1: { parent: undefined, children: [] },
      });
    });

    it("onAgentEndWithCompletion removes the session", async () => {
      manager.onAgentStartWithInput({
        session_id: "s1",
        input_event: makeInputEvent(),
        model: "m",
        thinking_level: "low",
      });
      await manager.onAgentEndWithCompletion({
        session_id: "s1",
        agent_end_event: makeAgentEndEvent(),
      });
      expect(manager.debugSessions()).toEqual({});
    });
  });

  // --- input / completion --------------------------------------------------

  describe("onInput / onCompletion", () => {
    const SESSION = "sess-abc";

    it("starts an agent span named after the session", () => {
      manager.onAgentStartWithInput({
        session_id: SESSION,
        input_event: makeInputEvent(),
        model: "anthropic/claude-opus-4-5",
        thinking_level: "low",
      });
      expect(runtime.tracer.startSpan).toHaveBeenCalledWith(
        expect.stringContaining("pi.agent"),
        expect.anything(),
        expect.anything(),
      );
    });

    it("sets gen_ai attributes on the agent span", () => {
      manager.onAgentStartWithInput({
        session_id: SESSION,
        input_event: makeInputEvent("what is 2+2?"),
        model: "anthropic/claude-opus-4-5",
        thinking_level: "high",
      });

      const span = (runtime.tracer.startSpan as ReturnType<typeof vi.fn>).mock.results[1].value; // results[0]=session, results[1]=agent
      expect(span.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          "gen_ai.operation.name": "chat",
          "gen_ai.prompt.text": JSON.stringify("what is 2+2?"),
          "gen_ai.request.model": "anthropic/claude-opus-4-5",
          "gen_ai.request.thinking_level": "high",
        }),
      );
    });

    it("ends the agent span when completion is received", async () => {
      manager.onAgentStartWithInput({
        session_id: SESSION,
        input_event: makeInputEvent(),
        model: "anthropic/claude-opus-4-5",
        thinking_level: "low",
      });
      const span = (runtime.tracer.startSpan as ReturnType<typeof vi.fn>).mock.results[1].value; // results[0]=session, results[1]=agent

      expect(span.end).not.toHaveBeenCalled();

      await manager.onAgentEndWithCompletion({
        session_id: SESSION,
        agent_end_event: makeAgentEndEvent(),
      });

      expect(span.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          "gen_ai.usage.prompt_tokens": 10,
          "gen_ai.usage.completion_tokens": 5,
        }),
      );
      // agent span is ended via flush() inside onAgentEndWithCompletion
      expect(span.end).toHaveBeenCalled();
    });

    it("throws on completion when session is not found", async () => {
      await expect(
        manager.onAgentEndWithCompletion({
          session_id: SESSION,
          agent_end_event: makeAgentEndEvent(),
        }),
      ).rejects.toThrow(`Cannot find session for the input: ${SESSION}`);
    });
  });

  // --- turn lifecycle ------------------------------------------------------

  describe("onTurnStart / onTurnEnd", () => {
    const SESSION = "sess-turn";

    beforeEach(() => {
      manager.onAgentStartWithInput({
        session_id: SESSION,
        input_event: makeInputEvent(),
        model: "m",
        thinking_level: "low",
      });
    });

    it("adds a turn node on turn start without throwing", () => {
      expect(() =>
        manager.onTurnStart({ session_id: SESSION, turn_index: 0 }),
      ).not.toThrow();
    });

    it("handles turn end without throwing", () => {
      manager.onTurnStart({ session_id: SESSION, turn_index: 0 });
      expect(() =>
        manager.onTurnEnd({ session_id: SESSION, turn_index: 0 }),
      ).not.toThrow();
    });

    it("throws on turn start when session is unknown", () => {
      expect(() =>
        manager.onTurnStart({ session_id: "ghost", turn_index: 0 }),
      ).toThrow("Cannot find session for turn start: ghost");
    });
  });

  // --- tool call / result --------------------------------------------------

  describe("onToolCall / onToolResult", () => {
    const SESSION = "sess-tool";

    beforeEach(() => {
      manager.onAgentStartWithInput({
        session_id: SESSION,
        input_event: makeInputEvent(),
        model: "m",
        thinking_level: "low",
      });
      manager.onTurnStart({ session_id: SESSION, turn_index: 0 });
    });

    it("starts a tool span named pi.tool.<toolName>", () => {
      manager.onToolCall({ session_id: SESSION, tool_call_event: makeToolCallEvent() });
      expect(runtime.tracer.startSpan).toHaveBeenCalledWith("pi.tool.bash", {}, expect.anything());
    });

    it("sets gen_ai attributes on the tool span", () => {
      manager.onToolCall({ session_id: SESSION, tool_call_event: makeToolCallEvent() });
      const startSpan = runtime.tracer.startSpan as ReturnType<typeof vi.fn>;
      const toolSpan = startSpan.mock.results[3].value; // [0]=session, [1]=agent, [2]=turn, [3]=tool
      expect(toolSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          "gen_ai.operation.name": "execute_tool",
          "gen_ai.tool.name": "bash",
          "gen_ai.tool.call.id": "call-1",
        }),
      );
    });

    it("ends the tool span with output on tool result", async () => {
      manager.onToolCall({ session_id: SESSION, tool_call_event: makeToolCallEvent() });
      const startSpan = runtime.tracer.startSpan as ReturnType<typeof vi.fn>;
      const toolSpan = startSpan.mock.results[3].value; // [0]=session, [1]=agent, [2]=turn, [3]=tool

      manager.onToolResult({ session_id: SESSION, tool_result_event: makeToolResultEvent() });

      expect(toolSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          "gen_ai.tool.output.text": JSON.stringify("file1.ts\nfile2.ts"),
          "gen_ai.tool.is_error": false,
        }),
      );
      // tool spans end in flush() inside onAgentEndWithCompletion
      expect(toolSpan.end).not.toHaveBeenCalled();
      await manager.onAgentEndWithCompletion({
        session_id: SESSION,
        agent_end_event: makeAgentEndEvent(),
      });
      expect(toolSpan.end).toHaveBeenCalled();
    });

    it("marks is_error true when tool result is an error", () => {
      manager.onToolCall({ session_id: SESSION, tool_call_event: makeToolCallEvent() });
      const startSpan = runtime.tracer.startSpan as ReturnType<typeof vi.fn>;
      const toolSpan = startSpan.mock.results[3].value; // [0]=session, [1]=agent, [2]=turn, [3]=tool

      manager.onToolResult({
        session_id: SESSION,
        tool_result_event: makeToolResultEvent("call-1", "bash", true),
      });

      expect(toolSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({ "gen_ai.tool.is_error": true }),
      );
    });

    it("handles multiple concurrent tool calls in one turn", async () => {
      manager.onToolCall({
        session_id: SESSION,
        tool_call_event: makeToolCallEvent("bash", "call-1"),
      });
      manager.onToolCall({
        session_id: SESSION,
        tool_call_event: makeToolCallEvent("read", "call-2"),
      });

      const startSpan = runtime.tracer.startSpan as ReturnType<typeof vi.fn>;
      const span1 = startSpan.mock.results[3].value; // [0]=session, [1]=agent, [2]=turn, [3]=tool1, [4]=tool2
      const span2 = startSpan.mock.results[4].value;

      manager.onToolResult({
        session_id: SESSION,
        tool_result_event: makeToolResultEvent("call-2", "read"),
      });
      manager.onToolResult({
        session_id: SESSION,
        tool_result_event: makeToolResultEvent("call-1", "bash"),
      });

      // tool spans end in flush() inside onAgentEndWithCompletion
      expect(span1.end).not.toHaveBeenCalled();
      expect(span2.end).not.toHaveBeenCalled();
      await manager.onAgentEndWithCompletion({
        session_id: SESSION,
        agent_end_event: makeAgentEndEvent(),
      });
      expect(span1.end).toHaveBeenCalled();
      expect(span2.end).toHaveBeenCalled();
    });

    it("throws on tool call when no turn exists", async () => {
      await manager.onAgentEndWithCompletion({
        session_id: SESSION,
        agent_end_event: makeAgentEndEvent(),
      });
      manager.onAgentStartWithInput({
        session_id: SESSION,
        input_event: makeInputEvent(),
        model: "m",
        thinking_level: "low",
      });
      // No onTurnStart after the new input

      expect(() =>
        manager.onToolCall({ session_id: SESSION, tool_call_event: makeToolCallEvent() }),
      ).toThrow(`Cannot find current turn for tool call: ${SESSION}`);
    });

    it("throws on tool result when tool span is not found", () => {
      expect(() =>
        manager.onToolResult({
          session_id: SESSION,
          tool_result_event: makeToolResultEvent("no-such-call"),
        }),
      ).toThrow("Tool span not found for toolCallId: no-such-call");
    });
  });
});
