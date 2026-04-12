import type { Context, Span } from "@opentelemetry/api";

export class SessionNode {
  constructor(
    readonly id: string,
    public span: Span | undefined,
    public spanContext: Context,

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
  /**
   * Flush recusively of the span
   */
  /**
   * Flush recusively of the span
   */
  flush(): void {
    if (this.parent != undefined) {
      throw new Error(
        "This node has parent and you should flush the root node, not this one!",
      );
    }
    this._flushInternal();
  }

  private _flushInternal(): void {
    // End session span first so it's at the front of the export batch.
    // BatchSpanProcessor holds all spans until forceFlush — the session span
    // must appear before its children so backends (e.g. Braintrust) can
    // resolve the parent before they see the agent/turn/tool spans.
    this.span?.end();

    this.agent?.flush();

    for (const sub of this.children) {
      sub._flushInternal();
    }
  }
}

export class AgentNode {
  constructor(
    public span: Span | undefined,
    /**
     * The OTel context with the agent span set, used as the parent context
     * when creating child spans (e.g. tool spans).
     */
    public spanContext: Context,
    /**
     * An agent could have 1-to-many turns
     */
    public turnNodes: TurnNode[] = [],
  ) {}

  flush(): void {
    const span = this.span;
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
    public span: Span | undefined,
    public spanContext: Context,
    /** Active tool spans keyed by toolCallId */
    public toolSpans: Map<string, Span> = new Map(),
  ) {}

  flush(): void {
    // Process turn span
    if (this.span != undefined) {
      this.span.end();
    }

    // Process tool spans
    for (const span of this.toolSpans.values()) {
      span.end();
    }
  }
}
