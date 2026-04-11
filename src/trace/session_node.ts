import type { Span } from "@opentelemetry/api";

export class SessionNode {
  constructor(
    readonly id: string,
    public parent: SessionNode | undefined = undefined,
    public children: SessionNode[] = [],

    /**
     * Active agent node.
     * Note: A session could have many agents but can only have ONE acitve agent.
     */
    public agent: AgentNode | undefined = undefined,
  ) {}

  addChild(child: SessionNode): void {
    this.children.push(child);
  }
}

export class AgentNode {
  constructor(
    public agentSpan: Span | undefined,
    /**
     * An agent could have 1-to-many turns
     */
    public turnNodes: TurnNode[] = [],
  ) {}
}

export class TurnNode {
  constructor(
    /** Active tool spans keyed by toolCallId */
    public toolSpans: Map<string, Span> = new Map(),
  ) {}
}
