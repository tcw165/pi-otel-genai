import type {
  InputEvent,
  AgentEndEvent,
  ToolCallEvent,
  ToolResultEvent,
} from "@mariozechner/pi-coding-agent";
import type { TraceRuntime } from "./provider.js";
import { AgentNode, SessionNode, TurnNode } from "./session_node.js";
import { log } from "../observability/index.js";

// Args for session events
export interface SessionStartArgs {
  session_id: string;
  parent_session_id: string | undefined;
}
export interface SessionStopArgs {
  session_id: string;
}

// Args for input / output events
export interface InputArgs {
  input_event: InputEvent;
  session_id: string;
  model: string;
  thinking_level: string;
}
export interface OutputArgs {
  agent_end_event: AgentEndEvent;
  session_id: string;
}
export interface ToolCallArgs {
  tool_call_event: ToolCallEvent;
  session_id: string;
}
export interface ToolResultArgs {
  tool_result_event: ToolResultEvent;
  session_id: string;
}
export interface TurnStartArgs {
  session_id: string;
  turn_index: number;
}
export interface TurnEndArgs {
  session_id: string;
  turn_index: number;
}

export function createSpanManager(traceRuntime: TraceRuntime) {
  /*
   * Root session ID.
   */
  let sessionId: string | undefined;
  /*
   * Quick lookup map for sesssions including root and all the children sessions.
   */
  let sessions: Map<string, SessionNode>;

  return {
    /**
     * Registers a new session and links it to its parent if one exists.
     *
     * @param args - The session start arguments containing the session ID and optional parent session ID.
     * @throws If a parent session ID is provided but the parent node is not found in the session tree.
     */
    onSessionStart(args: SessionStartArgs): void {
      // When the session is the new root session
      if (args.parent_session_id === undefined) {
        sessionId = args.session_id;
        sessions = new Map<string, SessionNode>();
        sessions.set(sessionId, new SessionNode(sessionId));
        log("span_manager.session_start", { session_id: sessionId });
        return;
      }

      // When the session is a child session of current root session
      const parentSession = sessions.get(args.parent_session_id);
      if (parentSession === undefined) {
        throw new Error(`Parent session not found: ${args.parent_session_id}`);
      }

      sessionId = args.session_id;
      const currentSession = new SessionNode(sessionId, parentSession);
      parentSession.addChild(currentSession);
      sessions.set(sessionId, currentSession);
      log("span_manager.session_start", {
        session_id: sessionId,
        parent_session_id: args.parent_session_id,
      });

      // TODO: Maybe create child session span?
    },

    onSessionStop(args: SessionStopArgs): void {
      if (args.session_id != sessionId) {
        // TODO: Close span?
      }

      log("span_manager.session_stop", { session_id: args.session_id });

      // Clean since this is root session
      sessionId = undefined;
      sessions.clear();
    },

    onInput(args: InputArgs): void {
      const sessionId = args.session_id;
      const sessionNode = sessions.get(sessionId);
      if (sessionNode === undefined) {
        throw new Error("Cannot find session for the input");
      }

      const agentSpan = traceRuntime.tracer.startSpan(
        `pi.agent (${sessionId?.slice(-8)})`,
      );

      agentSpan.setAttributes({
        "gen_ai.operation.name": "chat",
        "gen_ai.prompt": args.input_event.text ?? "n/a",
        "gen_ai.request.model": args.model,
        "gen_ai.request.thinking_level": args.thinking_level,
        "gen_ai.system": args.model.split("/")[0],
        // TODO: Add chat history to gen_ai.input.messages
      });

      sessionNode.agent = new AgentNode(agentSpan);

      log("span_manager.input", {
        session_id: sessionId,
        model: args.model,
        thinking_level: args.thinking_level,
      });
    },

    onCompletion(args: OutputArgs): void {
      const sessionId = args.session_id;
      const sessionNode = sessions.get(sessionId);
      if (sessionNode === undefined) {
        throw new Error("Cannot find session for the input");
      }

      const agentSpan = sessionNode.agent?.agentSpan;
      if (agentSpan === undefined) {
        throw new Error(
          `The agent span is missing for the session ${sessionId}`,
        );
      }

      const assistantMessages = args.agent_end_event.messages.filter(
        (m) => m.role === "assistant",
      );
      const completionText = assistantMessages
        .flatMap((m) =>
          m.content.filter((c) => c.type === "text").map((c) => c.text),
        )
        .join("\n\n");
      const outputMessages = assistantMessages.map((m) => ({
        role: "assistant",
        content: m.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(""),
      }));
      const totalUsage = assistantMessages.reduce(
        (acc, m) => ({
          input: acc.input + m.usage.input,
          output: acc.output + m.usage.output,
          cacheRead: acc.cacheRead + m.usage.cacheRead,
          cacheWrite: acc.cacheWrite + m.usage.cacheWrite,
        }),
        { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      );

      agentSpan.setAttributes({
        "gen_ai.completion": completionText,
        "gen_ai.output.messages": JSON.stringify(outputMessages),
        "gen_ai.usage.prompt_tokens": totalUsage.input,
        "gen_ai.usage.completion_tokens": totalUsage.output,
        "gen_ai.usage.cache_read_input_tokens": totalUsage.cacheRead,
        "gen_ai.usage.cache_creation_input_tokens": totalUsage.cacheWrite,
      });
      agentSpan.end(); // Submit span

      // Discard the agent node after use
      sessionNode.agent = undefined;

      log("span_manager.completion", {
        session_id: sessionId,
        assistant_message_count: assistantMessages.length,
        usage: totalUsage,
      });
    },

    onTurnStart(args: TurnStartArgs): void {
      const sessionNode = sessions.get(args.session_id);
      if (sessionNode === undefined) {
        throw new Error(
          `Cannot find session for turn start: ${args.session_id}`,
        );
      }

      const agentNode = sessionNode.agent;
      if (agentNode === undefined) {
        throw new Error(`Cannot find agent for turn start: ${args.session_id}`);
      }

      agentNode.turnNodes.push(new TurnNode());
      log("span_manager.turn_start", {
        session_id: args.session_id,
        turn_index: args.turn_index,
      });
    },

    onTurnEnd(args: TurnEndArgs): void {
      const sessionNode = sessions.get(args.session_id);
      if (sessionNode === undefined) {
        throw new Error(`Cannot find session for turn end: ${args.session_id}`);
      }

      log("span_manager.turn_end", {
        session_id: args.session_id,
        turn_index: args.turn_index,
      });
    },

    onToolCall(args: ToolCallArgs): void {
      const { session_id, tool_call_event: event } = args;
      const sessionNode = sessions.get(session_id);
      if (sessionNode === undefined) {
        throw new Error(`Cannot find session for tool call: ${session_id}`);
      }

      const agentNode = sessionNode.agent;
      if (agentNode === undefined) {
        throw new Error(`Cannot find agent for tool call: ${session_id}`);
      }

      const currentTurnNode =
        agentNode.turnNodes[agentNode.turnNodes.length - 1];
      if (currentTurnNode === undefined) {
        throw new Error(
          `Cannot find current turn for tool call: ${session_id}`,
        );
      }

      const toolSpan = traceRuntime.tracer.startSpan(
        `pi.tool.${event.toolName}`,
      );
      toolSpan.setAttributes({
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": event.toolName,
        "gen_ai.tool.call.id": event.toolCallId,
        "gen_ai.tool.input": JSON.stringify(event.input),
      });

      currentTurnNode.toolSpans.set(event.toolCallId, toolSpan);
      log("span_manager.tool_call", {
        session_id,
        tool_call_id: event.toolCallId,
        tool_name: event.toolName,
      });
    },

    onToolResult(args: ToolResultArgs): void {
      const { session_id, tool_result_event: event } = args;
      const sessionNode = sessions.get(session_id);
      if (sessionNode === undefined) {
        throw new Error(`Cannot find session for tool result: ${session_id}`);
      }

      const agentNode = sessionNode.agent;
      if (agentNode === undefined) {
        throw new Error(`Cannot find agent for tool result: ${session_id}`);
      }

      const currentTurnNode =
        agentNode.turnNodes[agentNode.turnNodes.length - 1];
      if (currentTurnNode === undefined) {
        throw new Error(
          `Cannot find current turn for tool result: ${session_id}`,
        );
      }

      const toolSpan = currentTurnNode.toolSpans.get(event.toolCallId);
      if (toolSpan === undefined) {
        throw new Error(
          `Tool span not found for toolCallId: ${event.toolCallId}`,
        );
      }

      const output = event.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");

      toolSpan.setAttributes({
        "gen_ai.tool.output": output,
        "gen_ai.tool.is_error": event.isError,
      });
      toolSpan.end();

      currentTurnNode.toolSpans.delete(event.toolCallId);
      log("span_manager.tool_result", {
        session_id,
        tool_call_id: event.toolCallId,
        tool_name: event.toolName,
        is_error: event.isError,
      });
    },

    /** @internal Returns a snapshot of the session tree for debugging. */
    debugSessions(): Record<
      string,
      { parent: string | undefined; children: string[] }
    > {
      const result: Record<
        string,
        { parent: string | undefined; children: string[] }
      > = {};
      for (const [id, node] of sessions ?? []) {
        result[id] = {
          parent: node.parent?.id,
          children: node.children.map((c) => c.id),
        };
      }
      return result;
    },
  };
}

export type SpanManager = ReturnType<typeof createSpanManager>;
