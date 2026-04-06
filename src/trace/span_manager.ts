export interface SessionStartArgs {
  sessionId: string;
  parentSessionId: string | undefined;
}

interface SessionNode {
  id: string;
  parent: SessionNode | undefined;
  children: SessionNode[];
}

export function createSpanManager() {
  let sessionId: string | undefined;
  let sessions: Map<string, SessionNode>;

  return {
    /**
     * Registers a new session and links it to its parent if one exists.
     *
     * @param args - The session start arguments containing the session ID and optional parent session ID.
     * @throws If a parent session ID is provided but the parent node is not found in the session tree.
     */
    onSessionStart(args: SessionStartArgs): void {
      // When the session is the new root session
      if (args.parentSessionId === undefined) {
        sessionId = args.sessionId;
        sessions = new Map<string, SessionNode>();
        sessions.set(sessionId, { id: sessionId, parent: undefined, children: [] });
        return;
      }

      // When the session is a child session of current root session
      const parentNode = sessions.get(args.parentSessionId);
      if (parentNode === undefined) {
        throw new Error(`Parent session not found: ${args.parentSessionId}`);
      }

      sessionId = args.sessionId;
      const currentSession: SessionNode = {
        id: sessionId,
        parent: parentNode,
        children: [],
      };
      parentNode.children.push(currentSession);
      sessions.set(sessionId, currentSession);
    },

    shutdown(): void {
      sessionId = undefined;
    },

    /** @internal Returns a snapshot of the session tree for debugging. */
    debugSessions(): Record<string, { parent: string | undefined; children: string[] }> {
      const result: Record<string, { parent: string | undefined; children: string[] }> = {};
      for (const [id, node] of sessions ?? []) {
        result[id] = {
          parent: node.parent?.id,
          children: node.children.map((c) => c.id),
        };
      }
      return result;
    },
  };
}

export type SpanManager = ReturnType<typeof createSpanManager>;
