import type {
  ExtensionAPI,
  ExtensionContext,
  SessionShutdownEvent,
  ToolCallEvent,
  TurnEndEvent,
  TurnStartEvent,
} from "@mariozechner/pi-coding-agent";
import { getConfig } from "./config.js";
import { createTraceRuntime } from "./trace/provider.js";
import { createSpanManager } from "./trace/span_manager.js";

function getSessionId(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionId();
}

function getCurrentModel(ctx: ExtensionContext): string {
  const entry = [...ctx.sessionManager.getEntries()]
    .reverse()
    .find((e) => e.type === "model_change");
  return entry?.type === "model_change" ? entry.modelId : "unknown";
}

function getCurrentThinkingLevel(ctx: ExtensionContext): string {
  const entry = [...ctx.sessionManager.getEntries()]
    .reverse()
    .find((e) => e.type === "thinking_level_change");
  return entry?.type === "thinking_level_change"
    ? entry.thinkingLevel
    : "unknown";
}

export default function (pi: ExtensionAPI): void {
  const traceRuntime = createTraceRuntime(getConfig());
  const spanManager = createSpanManager(traceRuntime);

  pi.on("resources_discover", async (_event, ctx) => {
    // log("resources_discover", {
    //   session_id: getSessionId(ctx),
    //   session_file: ctx.sessionManager.getSessionFile(),
    // });
  });

  pi.on("session_start", async (_event, ctx) => {
    const sessionManager = ctx.sessionManager;
    const sessionHeader = sessionManager.getHeader();

    const id = getSessionId(ctx);
    // TODO: Make two passes session parent lookup
    const parentId = sessionHeader?.parentSession;
    spanManager.onSessionStart({
      session_id: id,
      parent_session_id: parentId === "n/a" ? undefined : parentId,
    });
  });

  pi.on(
    "session_shutdown",
    async (_event: SessionShutdownEvent, ctx: ExtensionContext) => {
      spanManager.onSessionStop({ session_id: getSessionId(ctx) });
    },
  );

  // "input"
  //   |
  //   ├─── tool 1
  //   ├─── tool 2
  //   |
  // "agent_end"
  pi.on("input", async (event, ctx) => {
    const currentSessionId = getSessionId(ctx);
    spanManager.onInput({
      session_id: currentSessionId,
      input_event: event,
      model: getCurrentModel(ctx),
      thinking_level: getCurrentThinkingLevel(ctx),
    });
  });

  pi.on("agent_end", async (event, ctx) => {
    spanManager.onCompletion({
      session_id: getSessionId(ctx),
      agent_end_event: event,
    });
  });

  pi.on("turn_start", async (event: TurnStartEvent, ctx: ExtensionContext) => {
    spanManager.onTurnStart({
      session_id: getSessionId(ctx),
      turn_index: event.turnIndex,
    });
  });

  pi.on("turn_end", async (event: TurnEndEvent, ctx: ExtensionContext) => {
    spanManager.onTurnEnd({
      session_id: getSessionId(ctx),
      turn_index: event.turnIndex,
    });
  });

  pi.on("tool_call", async (event: ToolCallEvent, ctx: ExtensionContext) => {
    spanManager.onToolCall({
      session_id: getSessionId(ctx),
      tool_call_event: event,
    });
  });

  pi.on("tool_result", async (event, ctx) => {
    spanManager.onToolResult({
      session_id: getSessionId(ctx),
      tool_result_event: event,
    });
  });

  pi.on("model_select", async (event, ctx) => {});
}
