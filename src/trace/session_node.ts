import type { Span } from "@opentelemetry/api";

export class SessionNode {
  constructor(
    readonly id: string,
    public parent: SessionNode | undefined = undefined,
    public children: SessionNode[] = [],
    /** Active agent span */
    public agentSpan: Span | undefined = undefined,
  ) {}

  addChild(child: SessionNode): void {
    this.children.push(child);
  }
}
