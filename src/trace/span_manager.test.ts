import { describe, expect, it } from "vitest";
import { createSpanManager } from "./span_manager.js";

describe("SpanManager session tree", () => {
  it("creates a root session when no parent is given", () => {
    const manager = createSpanManager();
    expect(() =>
      manager.onSessionStart({ sessionId: "root-1", parentSessionId: undefined })
    ).not.toThrow();
  });

  it("links a child session to its parent", () => {
    const manager = createSpanManager();
    manager.onSessionStart({ sessionId: "root-1", parentSessionId: undefined });
    expect(() =>
      manager.onSessionStart({ sessionId: "child-1", parentSessionId: "root-1" })
    ).not.toThrow();
  });

  it("supports multiple levels of nesting", () => {
    const manager = createSpanManager();
    manager.onSessionStart({ sessionId: "root-1", parentSessionId: undefined });
    manager.onSessionStart({ sessionId: "child-1", parentSessionId: "root-1" });
    expect(() =>
      manager.onSessionStart({ sessionId: "grandchild-1", parentSessionId: "child-1" })
    ).not.toThrow();
  });

  it("throws when parent session is not found", () => {
    const manager = createSpanManager();
    manager.onSessionStart({ sessionId: "root-1", parentSessionId: undefined });
    expect(() =>
      manager.onSessionStart({ sessionId: "child-1", parentSessionId: "unknown-parent" })
    ).toThrow("Parent session not found: unknown-parent");
  });

  it("resets on shutdown and accepts a new root session", () => {
    const manager = createSpanManager();
    manager.onSessionStart({ sessionId: "root-1", parentSessionId: undefined });
    manager.shutdown();
    expect(() =>
      manager.onSessionStart({ sessionId: "root-2", parentSessionId: undefined })
    ).not.toThrow();
  });
});
