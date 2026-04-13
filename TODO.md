[v] <p0> Observability: Inject session ID to Span{pi.agent}
[v] <p0> Observability: Don't create Span for pi.session
[v] <p1> Onboard Bazel:
    - TS module == Bazel module
    - Tests are within the Bazel module
[v] <p2> Observability: tie Span{pi.agent} to Span{pi.session}

## Production gaps

[v] <p0> index.ts: wire MetricsRuntime + MetricsCollector — createMetricsRuntime/createMetricsCollector are never instantiated; no metrics record or export
[v] <p0> span_manager.ts: apply PayloadPolicy/Redactor to span attributes — gen_ai.prompt, gen_ai.completion, gen_ai.tool.input, gen_ai.tool.output are set raw; privacy policy is unenforced
[v] <p0> index.ts: register /otel-status and /otel-open-trace commands — formatOtelStatus and openTraceUrl are implemented but never registered as slash commands
[v] <p1> span_manager.ts onTurnEnd: call turn.flush() — method only null-checks; turn spans stay open until agent ends, making turn span durations incorrect in traces
[ ] <p1> span_manager.ts onSessionStart/Stop: uncomment session span logic — session-span creation and parent/child linking are commented out; onSessionStop is a no-op
[ ] <p1> index.ts model_select handler: track model changes in span attributes — empty handler means mid-session model switches are invisible in traces
[ ] <p2> session_node.ts: remove triple-duplicate comment (lines 27–31)
[ ] <p2> config.ts:165: read serviceVersion from package.json instead of hardcoding "0.1.3"
[ ] <p2> span_manager.ts: wire or remove empty onMessageStart/onMessageEnd stubs
[ ] <p3> README.md: remove npm run typecheck (script does not exist) or add it to package.json — NOTE: no root README.md exists yet
[ ] <p3> README.md: fix npm install → pnpm install in Development section — NOTE: no root README.md exists yet
[ ] <p3> README.md: align package name (@oh-my-goose/pi-otel-genai) with install instructions — NOTE: no root README.md exists yet
