import { startVitest } from "vitest/node";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname is src/diagnostics/ — go up one level to reach src/
const srcDir = resolve(__dirname, "..");

const vitest = await startVitest("test", [
  join(__dirname, "open-trace-command.test.ts"),
  join(__dirname, "status-command.test.ts"),
], {}, {
  resolve: { alias: { "@this": srcDir } },
});

const failed = vitest?.state.getCountOfFailedTests() ?? 1;
await vitest?.close();
process.exit(failed > 0 ? 1 : 0);
