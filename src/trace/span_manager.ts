import type {
  InputEvent,
  AgentEndEvent,
  ToolCallEvent,
  ToolResultEvent,
} from "@mariozechner/pi-coding-agent";
import { trace, ROOT_CONTEXT } from "@opentelemetry/api";
import type { TraceRuntime } from "./provider.js";
import { AgentNode, SessionNode, TurnNode } from "./session_node.js";
import { logCall } from "../observability/index.js";

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

export class SpanManager {
  /*
   * Active sessions keyed by session_id, supports parallel sessions.
   */
  private sessions: Map<string, SessionNode> = new Map();

  constructor(private traceRuntime: TraceRuntime) {}

  @logCall()
  onMessageStart(): void {}

  @logCall()
  onMessageEnd(): void {}

  /**
   * Registers a new session and links it to its parent if one exists.
   *
   * @param args - The session start arguments containing the session ID and optional parent session ID.
   * @throws If a parent session ID is provided but the parent node is not found in the session tree.
   */
  @logCall()
  onSessionStart(args: SessionStartArgs): void {
    // const parentSession = args.parent_session_id
    //   ? this.sessions.get(args.parent_session_id)
    //   : undefined;
    // const parentContext = parentSession?.spanContext ?? ROOT_CONTEXT;
    // const sessionSpan = this.traceRuntime.tracer.startSpan(
    //   `pi.session (${args.session_id.slice(-8)})`,
    //   {},
    //   parentContext,
    // );
    // const sessionSpanContext = trace.setSpan(parentContext, sessionSpan);
    // const sessionNode = new SessionNode(
    //   args.session_id,
    //   sessionSpan,
    //   sessionSpanContext,
    //   parentSession,
    // );
    // if (parentSession != undefined) {
    //   parentSession.addChild(sessionNode);
    // }
    // this.sessions.set(args.session_id, sessionNode);
  }

  @logCall()
  onSessionStop(args: SessionStopArgs): void {
    // const sessionNode = this.sessions.get(args.session_id);
    // if (sessionNode === undefined) {
    //   throw new Error(`Session not found: ${args.session_id}`);
    // }
    // // Only flush root sessions; children are flushed by their root
    // if (sessionNode.parent === undefined) {
    //   sessionNode.flush();
    // }
    // this.sessions.delete(args.session_id);
  }

  @logCall()
  onAgentStartWithInput(args: InputArgs): void {
    const sessionId = args.session_id;

    // Create an implicit session node if none was started via onSessionStart
    let sessionNode = this.sessions.get(sessionId);
    if (sessionNode === undefined) {
      const sessionSpan = this.traceRuntime.tracer.startSpan(
        `pi.session (${sessionId.slice(-8)})`,
        {},
        ROOT_CONTEXT,
      );
      const sessionSpanContext = trace.setSpan(ROOT_CONTEXT, sessionSpan);
      sessionNode = new SessionNode(sessionId, sessionSpan, sessionSpanContext);
      this.sessions.set(sessionId, sessionNode);
    }

    const agentSpan = this.traceRuntime.tracer.startSpan(
      `pi.agent (${sessionId.slice(-8)})`,
      {},
      sessionNode.spanContext,
    );
    const agentSpanContext = trace.setSpan(sessionNode.spanContext, agentSpan);

    agentSpan.setAttributes({
      "gen_ai.operation.name": "chat",
      "gen_ai.prompt": args.input_event.text ?? "n/a",
      "gen_ai.request.model": args.model,
      "gen_ai.request.thinking_level": args.thinking_level,
      "gen_ai.system": args.model.split("/")[0],
      // TODO: Add chat history to gen_ai.input.messages
    });

    sessionNode.agent = new AgentNode(agentSpan, agentSpanContext);
  }

  @logCall()
  async onAgentEndWithCompletion(args: OutputArgs): Promise<void> {
    const sessionId = args.session_id;
    const sessionNode = this.sessions.get(sessionId);
    if (sessionNode === undefined) {
      throw new Error(`Cannot find session for the input: ${sessionId}`);
    }

    const agentSpan = sessionNode.agent?.span;
    if (agentSpan === undefined) {
      throw new Error(`The agent span is missing for the session ${sessionId}`);
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

    sessionNode.flush();
    this.sessions.delete(sessionId);
    await this.traceRuntime.forceFlush();
  }

  @logCall()
  onTurnStart(args: TurnStartArgs): void {
    const sessionNode = this.sessions.get(args.session_id);
    if (sessionNode === undefined) {
      throw new Error(`Cannot find session for turn start: ${args.session_id}`);
    }

    const agentNode = sessionNode.agent;
    if (agentNode === undefined) {
      throw new Error(`Cannot find agent for turn start: ${args.session_id}`);
    }

    const turnSpan = this.traceRuntime.tracer.startSpan(
      `turn ${args.turn_index}`,
      {},
      agentNode.spanContext,
    );
    const turnSpanContext = trace.setSpan(agentNode.spanContext, turnSpan);
    const turnNode = new TurnNode(turnSpan, turnSpanContext);
    agentNode.turnNodes.push(turnNode);
  }

  @logCall()
  onTurnEnd(args: TurnEndArgs): void {
    const sessionNode = this.sessions.get(args.session_id);
    if (sessionNode === undefined) {
      throw new Error(`Cannot find session for turn end: ${args.session_id}`);
    }

    const agentNode = sessionNode.agent;
    if (agentNode === undefined) {
      throw new Error(`Cannot find agent for turn end: ${args.session_id}`);
    }
  }

  @logCall()
  onToolCall(args: ToolCallArgs): void {
    const { session_id, tool_call_event: event } = args;
    const sessionNode = this.sessions.get(session_id);
    if (sessionNode === undefined) {
      throw new Error(`Cannot find session for tool call: ${session_id}`);
    }

    const agentNode = sessionNode.agent;
    if (agentNode === undefined) {
      throw new Error(`Cannot find agent for tool call: ${session_id}`);
    }

    const currentTurnNode = agentNode.turnNodes[agentNode.turnNodes.length - 1];
    if (currentTurnNode === undefined) {
      throw new Error(`Cannot find current turn for tool call: ${session_id}`);
    }

    const toolSpan = this.traceRuntime.tracer.startSpan(
      `pi.tool.${event.toolName}`,
      {},
      currentTurnNode.spanContext, // parent context
    );
    toolSpan.setAttributes({
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.tool.name": event.toolName,
      "gen_ai.tool.call.id": event.toolCallId,
      "gen_ai.tool.input": JSON.stringify(event.input),
    });

    currentTurnNode.toolSpans.set(event.toolCallId, toolSpan);
  }

  @logCall()
  onToolResult(args: ToolResultArgs): void {
    const { session_id, tool_result_event: event } = args;
    const sessionNode = this.sessions.get(session_id);
    if (sessionNode === undefined) {
      throw new Error(`Cannot find session for tool result: ${session_id}`);
    }

    const agentNode = sessionNode.agent;
    if (agentNode === undefined) {
      throw new Error(`Cannot find agent for tool result: ${session_id}`);
    }

    const currentTurnNode = agentNode.turnNodes[agentNode.turnNodes.length - 1];
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
  }

  /** @internal Returns a snapshot of the session tree for debugging. */
  debugSessions(): Record<
    string,
    { parent: string | undefined; children: string[] }
  > {
    const result: Record<
      string,
      { parent: string | undefined; children: string[] }
    > = {};
    for (const [id, node] of this.sessions) {
      result[id] = {
        parent: node.parent?.id,
        children: node.children.map((c) => c.id),
      };
    }
    return result;
  }
}
