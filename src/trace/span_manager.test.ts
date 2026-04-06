import { describe, expect, it } from "vitest";
import { createSpanManager } from "./span_manager.js";
import type { TraceRuntime } from "./provider.js";
import { trace } from "@opentelemetry/api";

const mockTraceRuntime: TraceRuntime = {
  tracer: trace.getTracer("test"),
  exporter: "none",
  endpoint: "",
  shutdown: async () => {},
};

describe("SpanManager session tree", () => {
  it("creates a root session when no parent is given", () => {
    const manager = createSpanManager(mockTraceRuntime);
    expect(() =>
      manager.onSessionStart({ session_id: "root-1", parent_session_id: undefined })
    ).not.toThrow();
  });

  it("links a child session to its parent", () => {
    const manager = createSpanManager(mockTraceRuntime);
    manager.onSessionStart({ session_id: "root-1", parent_session_id: undefined });
    expect(() =>
      manager.onSessionStart({ session_id: "child-1", parent_session_id: "root-1" })
    ).not.toThrow();
  });

  it("supports multiple levels of nesting", () => {
    const manager = createSpanManager(mockTraceRuntime);
    manager.onSessionStart({ session_id: "root-1", parent_session_id: undefined });
    manager.onSessionStart({ session_id: "child-1", parent_session_id: "root-1" });
    expect(() =>
      manager.onSessionStart({ session_id: "grandchild-1", parent_session_id: "child-1" })
    ).not.toThrow();
  });

  it("throws when parent session is not found", () => {
    const manager = createSpanManager(mockTraceRuntime);
    manager.onSessionStart({ session_id: "root-1", parent_session_id: undefined });
    expect(() =>
      manager.onSessionStart({ session_id: "child-1", parent_session_id: "unknown-parent" })
    ).toThrow("Parent session not found: unknown-parent");
  });

  it("resets on stop and accepts a new root session", () => {
    const manager = createSpanManager(mockTraceRuntime);
    manager.onSessionStart({ session_id: "root-1", parent_session_id: undefined });
    manager.onSessionStop({ session_id: "root-1" });
    expect(() =>
      manager.onSessionStart({
        session_id: "root-2",
        parent_session_id: undefined,
      }),
    ).not.toThrow();
  });
});
