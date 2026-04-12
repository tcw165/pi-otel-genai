# CLAUDE.md

## Project

Pi usage observability extension — Trace + Metrics + Diagnostics.

### Essentials

- Observability scope must include **Trace + Metrics + Diagnostics**.
- The default privacy profile is **detailed-with-redaction**: collect detailed payloads, but sensitive-data masking is mandatory.
- Keep metrics low-cardinality; record rich context primarily in traces.
- Keep operational diagnostics commands (`/otel-status`, `/otel-open-trace`) as baseline functionality.

### Documents

- OTel architecture/event mapping: [docs/otel-architecture.md](docs/otel-architecture.md)
- Privacy/redaction policy: [docs/privacy-redaction.md](docs/privacy-redaction.md)
- Operations/diagnostics guide: [docs/operations.md](docs/operations.md)

## Build & Test

> **Bazel is the one and only build and test tool for this project.**
> Do not use `npm test`, `tsc`, or `vitest` directly — always go through Bazel.

### Common commands

| Task | Command |
|------|---------|
| Build everything | `bazel build //...` |
| Run all tests | `bazel test //...` |
| Run a specific test target | `bazel test //src/trace:trace_test` |
| Build a specific target | `bazel build //src/metrics:metrics` |
| Build distribution → `./dist/` | `just dist` |
| Force rebuild (no cache) | `bazel build //... --noremote_accept_cached` |

### Compiled JavaScript output

`bazel build //...` compiles TypeScript → JavaScript and caches the result.
Output lands in `bazel-out/<config>/bin/` (also symlinked at `bazel-bin/`):

```
bazel-bin/src/config.js
bazel-bin/src/metrics/collector.js
bazel-bin/src/trace/span_manager.js
...
```

To inspect the output for a specific target:

```bash
bazel build //src:config
ls bazel-bin/src/config.js
```

Bazel caches outputs content-addressably — unchanged files are never recompiled.

### Target map

```
//:node_modules            # npm package links (auto-generated)
//src:types                # types.ts
//src:config               # config.ts
//src:index                # index.ts  (extension entry point)
//src/metrics:metrics      # collector.ts + provider.ts
//src/privacy:privacy      # redactor.ts + payload-policy.ts
//src/diagnostics:diagnostics  # open-trace-command.ts + status-command.ts
//src/trace:trace          # provider.ts + session_node.ts + span_manager.ts
//src/observability:observability  # log.ts + log_decorator.ts + index.ts
```

### Test targets

Each module has a co-located `*_test` target. Tests live **next to the source files they test**.

```
//src:config_test
//src/metrics:metrics_test
//src/privacy:privacy_test
//src/diagnostics:diagnostics_test
//src/trace:trace_test
//src/observability:observability_test
```

Run all tests at once:

```bash
bazel test //...
```

### Import style

All internal imports use the `@this/` path prefix, which maps to the `src/` directory root:

```typescript
// ✅ Correct — use @this/ for all internal imports
import { getConfig } from "@this/config.js";
import type { TelemetryConfig } from "@this/types.js";
import { createRedactor } from "@this/privacy/redactor.js";

// ❌ Wrong — do not use relative imports for cross-module references
import { getConfig } from "../config.js";
```

This alias is declared in `tsconfig.json` and `tsconfig.build.json`:
```json
"baseUrl": ".",
"paths": { "@this/*": ["src/*"] }
```

Vitest resolves it automatically via Vite's tsconfig-paths support.
Each `js_test` target includes `//:tsconfig` in its `data` so the alias is available in the Bazel sandbox.

### Adding a new module

1. Create the `.ts` source files in the appropriate `src/<module>/` directory.
2. Create a `BUILD.bazel` in the same directory following the existing pattern:
   - Use `ts_project` for the library target.
   - Use `js_test` + `vitest_runner.mjs` for tests.
3. Add new test files next to their source (e.g., `src/metrics/my_feature.test.ts`).
4. List the new test file in both `vitest_runner.mjs` and the `data` attribute of `js_test`.
5. Declare all cross-package dependencies in the `deps` (library) or `data` (test) attributes.

### Dependencies

External npm packages are declared in `package.json` / `pnpm-lock.yaml` and imported into Bazel via `MODULE.bazel`:

```python
npm.npm_translate_lock(
    name = "npm",
    pnpm_lock = "//:pnpm-lock.yaml",
    ...
)
```

Reference them in `BUILD.bazel` as `//:node_modules/<package-name>`.

### tsconfig

Two tsconfig files are used:

- `tsconfig.json` — used by editors and type-checking tools.
- `tsconfig.build.json` — used by all `ts_project` targets (`declaration = True`).

Both are exported from the root `BUILD.bazel` and copied into the Bazel output tree via `copy_to_bin`.
