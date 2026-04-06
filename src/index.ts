import { appendFileSync } from "fs";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionShutdownEvent,
  ToolCallEvent,
  TurnStartEvent,
} from "@mariozechner/pi-coding-agent";

const LOG_FILE = "/tmp/pi-debug.log";

function log(event: string, data?: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: Date.now(), event, ...(data ?? {}) });
  appendFileSync(LOG_FILE, line + "\n");
}

function sessionId(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionId();
}

export default function (pi: ExtensionAPI): void {
  pi.on("resources_discover", async (_event, ctx) => {
    log("resources_discover", {
      session_id: sessionId(ctx),
      session_file: ctx.sessionManager.getSessionFile(),
    });
  });

  pi.on("session_start", async (_event, ctx) => {
    const sessionManager = ctx.sessionManager;
    const sessionHeader = sessionManager.getHeader();

    const id = sessionId(ctx);

    log("session_start", {
      session_id: id,
      session_file: ctx.sessionManager.getSessionFile(),
      session_version: sessionHeader?.version ?? "n/a",
      parent_session: sessionHeader?.parentSession ?? "n/a",
      entries: ctx.sessionManager.getEntries(),
    });
  });

  pi.on("session_shutdown", async (_event: SessionShutdownEvent, ctx: ExtensionContext) => {
    log("session_shutdown", {
      session_id: sessionId(ctx),
      session_file: ctx.sessionManager.getSessionFile(),
    });
  });

  pi.on("session_compact", async (event, ctx) => {
    log("session_compact", {
      session_id: sessionId(ctx),
      first_kept_entry_id: event.compactionEntry?.firstKeptEntryId,
      tokens_before: event.compactionEntry?.tokensBefore,
    });
  });

  pi.on("session_tree", async (event, ctx) => {
    log("session_tree", {
      session_id: sessionId(ctx),
      old_leaf_id: event.oldLeafId,
      new_leaf_id: event.newLeafId,
      from_extension: event.fromExtension,
    });
  });

  pi.on("input", async (event, ctx) => {
    log("input", {
      session_id: sessionId(ctx),
      source: event.source,
      text: event.text,
      image_count: event.images?.length ?? 0,
      entries: ctx.sessionManager.getEntries(),
    });
  });

  pi.on("agent_start", async (_event, ctx) => {
    log("agent_start", { session_id: sessionId(ctx) });
  });

  pi.on("agent_end", async (event, ctx) => {
    log("agent_end", {
      session_id: sessionId(ctx),
      message_count: event.messages.length,
    });
  });

  pi.on("turn_start", async (event: TurnStartEvent, ctx: ExtensionContext) => {
    log("turn_start", {
      session_id: sessionId(ctx),
      turn_index: event.turnIndex,
      timestamp: event.timestamp,
      entries: ctx.sessionManager.getEntries(),
    });
  });

  pi.on("turn_end", async (event, ctx) => {
    const msg = event.message;
    log("turn_end", {
      session_id: sessionId(ctx),
      turn_index: event.turnIndex,
      message: msg,
      tool_results: event.toolResults.length,
      role: msg?.role,
      entries: ctx.sessionManager.getEntries(),
    });
  });

  pi.on("tool_call", async (event: ToolCallEvent, ctx: ExtensionContext) => {
    log("tool_call", {
      session_id: sessionId(ctx),
      tool_call_id: event.toolCallId,
      tool_name: event.toolName,
      input: event.input,
    });
  });

  pi.on("tool_result", async (event, ctx) => {
    log("tool_result", {
      session_id: sessionId(ctx),
      tool_call_id: event.toolCallId,
      tool_name: event.toolName,
      is_error: event.isError,
    });
  });

  pi.on("model_select", async (event, ctx) => {
    log("model_select", {
      session_id: sessionId(ctx),
      provider: String(event.model.provider),
      model_id: event.model.id,
      source: event.source,
    });
  });
}
