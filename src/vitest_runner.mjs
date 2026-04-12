import { startVitest } from "vitest/node";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname is src/ — @this maps to src/
const srcDir = __dirname;

const vitest = await startVitest("test", [
  join(__dirname, "config.test.ts"),
], {}, {
  resolve: { alias: { "@this": srcDir } },
});

const failed = vitest?.state.getCountOfFailedTests() ?? 1;
await vitest?.close();
process.exit(failed > 0 ? 1 : 0);
