import type {
  ExtensionAPI,
  ExtensionContext,
  SessionShutdownEvent,
  ToolCallEvent,
  TurnStartEvent,
} from "@mariozechner/pi-coding-agent";
import { getConfig } from "./config.js";
import { log } from "./log.js";
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

    // log("session_start", {
    //   session_id: id,
    //   session_file: ctx.sessionManager.getSessionFile(),
    //   session_version: sessionHeader?.version ?? "n/a",
    //   parent_session: sessionHeader?.parentSession ?? "n/a",
    // });
  });

  pi.on(
    "session_shutdown",
    async (_event: SessionShutdownEvent, ctx: ExtensionContext) => {
      spanManager.onSessionStop({ session_id: getSessionId(ctx) });
      // log("session_shutdown", {
      //   session_id: getSessionId(ctx),
      //   session_file: ctx.sessionManager.getSessionFile(),
      // });
    },
  );

  // pi.on("session_compact", async (event, ctx) => {
  //   log("session_compact", {
  //     session_id: getSessionId(ctx),
  //     first_kept_entry_id: event.compactionEntry?.firstKeptEntryId,
  //     tokens_before: event.compactionEntry?.tokensBefore,
  //   });
  // });

  // pi.on("session_tree", async (event, ctx) => {
  //   log("session_tree", {
  //     session_id: getSessionId(ctx),
  //     old_leaf_id: event.oldLeafId,
  //     new_leaf_id: event.newLeafId,
  //     from_extension: event.fromExtension,
  //   });
  // });

  pi.on("input", async (event, ctx) => {
    const currentSessionId = getSessionId(ctx);
    spanManager.onInput({
      session_id: currentSessionId,
      input_event: event,
      model: getCurrentModel(ctx),
      thinking_level: getCurrentThinkingLevel(ctx),
    });

    // log("input", {
    //   session_id: currentSessionId,
    //   source: event.source,
    //   text: event.text,
    //   image_count: event.images?.length ?? 0,
    // });
  });

  // pi.on("context", async (event, ctx) => {
  //   log("context", {
  //     session_id: sessionId(ctx),
  //     message_count: event.messages.length,
  //     messages: event.messages,
  //   });
  // });

  // pi.on("agent_start", async (_event, ctx) => {
  //   log("agent_start", { session_id: getSessionId(ctx) });
  // });

  pi.on("agent_end", async (event, ctx) => {
    spanManager.onCompletion({
      agent_end_event: event,
      session_id: getSessionId(ctx),
    });

    // log("agent_end", {
    //   session_id: getSessionId(ctx),
    //   message_count: event.messages.length,
    // });
  });

  pi.on("turn_start", async (event: TurnStartEvent, ctx: ExtensionContext) => {
    // log("turn_start", {
    //   session_id: getSessionId(ctx),
    //   turn_index: event.turnIndex,
    //   timestamp: event.timestamp,
    // });
  });

  pi.on("turn_end", async (event, ctx) => {
    // log("turn_end", {
    //   session_id: getSessionId(ctx),
    //   turn_index: event.turnIndex,
    //   tool_results: event.toolResults.length,
    //   role: event.message?.role,
    // });
  });

  pi.on("tool_call", async (event: ToolCallEvent, ctx: ExtensionContext) => {
    // log("tool_call", {
    //   session_id: getSessionId(ctx),
    //   tool_call_id: event.toolCallId,
    //   tool_name: event.toolName,
    //   input: event.input,
    // });
  });

  pi.on("tool_result", async (event, ctx) => {
    // log("tool_result", {
    //   session_id: getSessionId(ctx),
    //   tool_call_id: event.toolCallId,
    //   tool_name: event.toolName,
    //   is_error: event.isError,
    // });
  });

  pi.on("model_select", async (event, ctx) => {
    // log("model_select", {
    //   session_id: getSessionId(ctx),
    //   provider: String(event.model.provider),
    //   model_id: event.model.id,
    //   source: event.source,
    // });
  });
}
