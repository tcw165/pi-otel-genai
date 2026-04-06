# Agent Lifecycle Notes

## `/reload` Slash Command

When `/reload` is entered, the session is shut down and restarted with the **same session ID**:

```
session_start
resources_discover
      |
      | (user enters /reload)
      v
session_shutdown
session_start       <-- same session_id, new timestamp
resources_discover
```

- The session ID is preserved across the reload.
- Any hooks for `session_start` will fire again on reload.
- State not persisted to disk (in-memory context) will be lost.

## Message Input & Agent Turn

When a user sends a message, the following events occur:

```
input                  <-- user message received (source: interactive)
agent_start
  └── turn_start       <-- turn_index: 0
      |
      | (agent processes, may loop with tool calls)
      |
  └── turn_end         <-- role: assistant
agent_end              <-- message_count: total messages in exchange
```

- `input` captures metadata (text length, image count) but not content.
- A single user message maps to one `agent_start`/`agent_end` pair.
- Multiple turns (`turn_start`/`turn_end`) can occur within one agent run (e.g. tool calls).

## Chain Pipeline (`/chain A -> B`)

When a chain is run, each step spawns its own **independent child session** (new session ID) nested under the parent session directory. Steps run sequentially.

```
[parent session: db16ac35]  <-- interactive session (the user's shell)
│
│  user runs: /chain context-builder "put 123" -> reviewer "share context"
│
├── chain_run_id: 700065f8
│
├── run-0  [child session: 29811d1a]  <-- context-builder agent
│     session_start / resources_discover
│     input  ("put 123")
│     agent_start
│       turn_start (0)
│         tool_call  bash: write "123" to context.md
│         tool_result
│       turn_end (0)
│       turn_start (1)
│       turn_end (1)  <-- final response, stopReason: stop
│     agent_end
│     session_shutdown
│
└── run-1  [child session: c0e6aaa8]  <-- reviewer agent (starts after run-0 ends)
      session_start / resources_discover
      input  ("share context w/ the user")
      agent_start
        turn_start (0) .. turn_end (0)   \
        turn_start (1) .. turn_end (1)    |  multiple turns with tool calls
        ...                               |
        turn_start (5) .. turn_end (5)   /  <-- stopReason: stop
      agent_end
      session_shutdown
```

Key observations:
- Each chain step gets a **new session ID** — not the parent's.
- Session files are nested: `<parent_session_id>/<chain_run_id>/run-N/<child_session>.jsonl`
- Steps run **sequentially**: run-0 shuts down before run-1 starts.
- Context between steps is passed via **shared files** on disk (e.g. `context.md` in the chain run temp dir).

## Session Entries (`getEntries()`)

Entries are the in-memory conversation tree. They form a **linked list** via `parentId` and accumulate over time within a session.

**Entry types observed:**

| type | when written | key fields |
|---|---|---|
| `model_change` | session init | `provider`, `modelId` |
| `thinking_level_change` | session init | `thinkingLevel` |
| `message` | after each turn | `message.role`, `message.content` |

**How entries grow across events:**

```
session_start   entries: [model_change, thinking_level_change]
                                                              ^--- written at init, before any input

input           entries: [model_change, thinking_level_change]
                                                              ^--- same, user message not yet an entry

turn_start      entries: [model_change, thinking_level_change]
                                                              ^--- same

turn_end        entries: [model_change, thinking_level_change, message(user), message(assistant)]
                                                                              ^--- appended after turn
```

**Entry tree shape:**
```
model_change (parentId: null)
  └── thinking_level_change
        └── message [role: user]
              └── message [role: assistant]
```

- The leaf entry's `id` is always the latest state of the conversation.
- `getEntries()` returns a flat list; `getTree()` returns the branching structure.
