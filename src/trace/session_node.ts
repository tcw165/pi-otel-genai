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

  /**
   * Flush recusively of the span
   */
  flush(): void {
    if (parent != undefined) {
      throw new Error(
        "This node has parent and you should flush the root node, not this one!",
      );
    }

    // Process agnet first
    if (this.agent != undefined) {
      this.agent.flush();
    }

    // Process sub-sessions
    for (const sub of this.children) {
      sub.flush();
    }
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

  flush(): void {
    const span = this.agentSpan;
    if (span != undefined) {
      span.end();
    }

    for (const turn of this.turnNodes) {
      turn.flush();
    }
  }
}

export class TurnNode {
  constructor(
    /** Active tool spans keyed by toolCallId */
    public toolSpans: Map<string, Span> = new Map(),
  ) {}

  flush(): void {
    for (const span of this.toolSpans.values()) {
      span.end();
    }
  }
}
