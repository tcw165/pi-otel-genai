import type {
  ExtensionAPI,
  ExtensionContext,
  SessionShutdownEvent,
  ToolCallEvent,
  TurnEndEvent,
  TurnStartEvent,
} from "@mariozechner/pi-coding-agent";
import { getConfig } from "@this/config.js";
import { createMetricsCollector } from "@this/metrics/collector.js";
import { createMetricsRuntime } from "@this/metrics/provider.js";
import { createPayloadPolicy } from "@this/privacy/payload-policy.js";
import { createRedactor } from "@this/privacy/redactor.js";
import { createTraceRuntime } from "@this/trace/provider.js";
import { SpanManager } from "@this/trace/span_manager.js";

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
  const config = getConfig();
  const redactor = createRedactor({
    extraSensitiveKeys: config.privacy.extraSensitiveKeys,
    pathDenylist: config.privacy.pathDenylist,
  });
  const payloadPolicy = createPayloadPolicy({
    profile: config.privacy.profile,
    payloadMaxBytes: config.privacy.payloadMaxBytes,
    redactor,
  });
  const traceRuntime = createTraceRuntime(config);
  const metricsRuntime = createMetricsRuntime(config);
  const collector = createMetricsCollector({ meter: metricsRuntime.meter });
  const spanManager = new SpanManager(traceRuntime, payloadPolicy);

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
    collector.recordSessionStart();
  });

  pi.on(
    "session_shutdown",
    async (_event: SessionShutdownEvent, ctx: ExtensionContext) => {
      spanManager.onSessionStop({ session_id: getSessionId(ctx) });
      collector.recordSessionEnd();
      await traceRuntime.shutdown();
      await metricsRuntime.shutdown();
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
    const model = getCurrentModel(ctx);
    spanManager.onAgentStartWithInput({
      session_id: currentSessionId,
      input_event: event,
      model,
      thinking_level: getCurrentThinkingLevel(ctx),
    });
    collector.setProviderModel(model.split("/")[0], model);
    collector.recordPrompt({ promptLength: event.text?.length ?? 0 });
  });

  pi.on("agent_end", async (event, ctx) => {
    await spanManager.onAgentEndWithCompletion({
      session_id: getSessionId(ctx),
      agent_end_event: event,
    });
    for (const msg of event.messages) {
      if (msg.role === "assistant") {
        collector.recordUsage(msg.usage);
      }
    }
  });

  pi.on("turn_start", async (event: TurnStartEvent, ctx: ExtensionContext) => {
    spanManager.onTurnStart({
      session_id: getSessionId(ctx),
      turn_index: event.turnIndex,
    });
    collector.recordTurnStart();
  });

  pi.on("turn_end", async (event: TurnEndEvent, ctx: ExtensionContext) => {
    spanManager.onTurnEnd({
      session_id: getSessionId(ctx),
      turn_index: event.turnIndex,
    });
    collector.recordTurnEnd();
  });

  pi.on("tool_call", async (event: ToolCallEvent, ctx: ExtensionContext) => {
    spanManager.onToolCall({
      session_id: getSessionId(ctx),
      tool_call_event: event,
    });
    collector.recordToolCall({
      toolCallId: event.toolCallId,
      toolName: event.toolName,
    });
  });

  pi.on("tool_result", async (event, ctx) => {
    spanManager.onToolResult({
      session_id: getSessionId(ctx),
      tool_result_event: event,
    });
    collector.recordToolResult({
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      success: !event.isError,
    });
  });

  pi.on("model_select", async (event, _ctx) => {
    collector.setProviderModel(event.model.provider, event.model.id);
  });
}
