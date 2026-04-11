import { describe, expect, it, vi } from "vitest";
import { AgentNode, SessionNode, TurnNode } from "./session_node.js";
import type { Context } from "@opentelemetry/api";

function makeSpan() {
  return { end: vi.fn() } as any;
}

const CTX = {} as Context;

describe("SessionNode.addChild", () => {
  it("appends the child to children", () => {
    const root = new SessionNode("root", undefined, CTX);
    const child = new SessionNode("child", undefined, CTX, root);
    root.addChild(child);
    expect(root.children).toContain(child);
  });
});

describe("SessionNode.flush", () => {
  it("throws when called on a non-root node", () => {
    const root = new SessionNode("root", undefined, CTX);
    const child = new SessionNode("child", undefined, CTX, root);
    expect(() => child.flush()).toThrow(
      "This node has parent and you should flush the root node, not this one!",
    );
  });

  it("ends the session span", () => {
    const span = makeSpan();
    new SessionNode("root", span, CTX).flush();
    expect(span.end).toHaveBeenCalled();
  });

  it("ends session span before flushing agent (batch export ordering)", () => {
    const callOrder: string[] = [];
    const sessionSpan = { end: vi.fn(() => callOrder.push("session")) } as any;
    const agentSpan = { end: vi.fn(() => callOrder.push("agent")) } as any;

    const node = new SessionNode("root", sessionSpan, CTX);
    node.agent = new AgentNode(agentSpan, CTX);
    node.flush();

    expect(callOrder).toEqual(["session", "agent"]);
  });

  it("flushes the agent node", () => {
    const agentSpan = makeSpan();
    const node = new SessionNode("root", undefined, CTX);
    node.agent = new AgentNode(agentSpan, CTX);
    node.flush();
    expect(agentSpan.end).toHaveBeenCalled();
  });

  it("flushes child sessions recursively", () => {
    const childSpan = makeSpan();
    const root = new SessionNode("root", undefined, CTX);
    const child = new SessionNode("child", childSpan, CTX, root);
    root.addChild(child);
    root.flush();
    expect(childSpan.end).toHaveBeenCalled();
  });
});

describe("AgentNode.flush", () => {
  it("ends the agent span", () => {
    const span = makeSpan();
    new AgentNode(span, CTX).flush();
    expect(span.end).toHaveBeenCalled();
  });

  it("flushes all turn nodes", () => {
    const turn1Span = makeSpan();
    const turn2Span = makeSpan();
    new AgentNode(undefined, CTX, [
      new TurnNode(turn1Span, CTX),
      new TurnNode(turn2Span, CTX),
    ]).flush();
    expect(turn1Span.end).toHaveBeenCalled();
    expect(turn2Span.end).toHaveBeenCalled();
  });
});

describe("TurnNode.flush", () => {
  it("ends the turn span", () => {
    const span = makeSpan();
    new TurnNode(span, CTX).flush();
    expect(span.end).toHaveBeenCalled();
  });

  it("ends all tool spans", () => {
    const tool1 = makeSpan();
    const tool2 = makeSpan();
    new TurnNode(undefined, CTX, new Map([
      ["call-1", tool1],
      ["call-2", tool2],
    ])).flush();
    expect(tool1.end).toHaveBeenCalled();
    expect(tool2.end).toHaveBeenCalled();
  });
});
