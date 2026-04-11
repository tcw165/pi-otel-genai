---
name: build
description: Run Bazel build and tests for this project. Use when verifying the build is healthy or after making code changes.
argument-hint: "[target]"
---

Run the Bazel build and tests for this project.

If $ARGUMENTS is provided, use it as the Bazel target (e.g. `//src/observability:observability_test`).
Otherwise default to `//...` to run everything.

## Steps

1. Run: `bazel test $ARGUMENTS` (or `bazel test //...` if no argument given)
2. Report which targets passed and which failed
3. For any failures, read the test log and summarize the errors

## Context

- Test logs are at: `/private/var/tmp/_bazel_boyw165/*/execroot/_main/bazel-out/darwin_arm64-fastbuild/testlogs/`
- `koffi` is a native addon (transitive dep of `pi-coding-agent`). Its Bazel lifecycle hook was disabled in `MODULE.bazel` — it ships pre-built binaries so compilation from source is not needed.

### Two tsconfig files

There are two tsconfig files with different purposes:

| | `tsconfig.json` | `tsconfig.build.json` |
|---|---|---|
| Used by | Editor (VS Code) + `tsc --noEmit` typecheck | Bazel `ts_project` targets |
| `module` | `NodeNext` | `ESNext` |
| `moduleResolution` | `NodeNext` | `Bundler` |
| `noEmit` | `true` (type-check only, no output files) | `false` (emits `.js` + `.d.ts`) |
| `declaration` | absent | `true` |
| `include` | `src/**/*.ts` | absent (Bazel controls this via `srcs`) |

**Why `Bundler` for Bazel?** `NodeNext` enforces strict `.js` extension imports and expects a Node-style file layout that doesn't match Bazel's sandbox output tree. `Bundler` is more lenient and works correctly there.

**Why `noEmit: false` for Bazel?** Bazel's `ts_project` needs the emitted `.js` and `.d.ts` files to pass as outputs between dependent targets. `noEmit: true` would produce nothing for downstream targets to consume.

**Why `copy_to_bin`?** Bazel compiles files inside the output tree (`bazel-out/…`), not the source tree. Source files are copied there automatically, but `tsconfig.build.json` is not a build output, so `copy_to_bin` explicitly copies it into the output tree so `tsc` can find it.
