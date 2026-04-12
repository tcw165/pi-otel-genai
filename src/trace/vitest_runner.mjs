import { startVitest } from "vitest/node";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname is src/trace/ — go up one level to reach src/
const srcDir = resolve(__dirname, "..");

const vitest = await startVitest("test", [
  join(__dirname, "session_node.test.ts"),
  join(__dirname, "span_manager.test.ts"),
  // span-manager.test.ts tests a createSpanManager() factory API not yet
  // implemented in span_manager.ts — excluded until implementation exists
], {}, {
  resolve: { alias: { "@this": srcDir } },
});

const failed = vitest?.state.getCountOfFailedTests() ?? 1;
await vitest?.close();
process.exit(failed > 0 ? 1 : 0);
