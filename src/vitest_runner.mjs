import { startVitest } from "vitest/node";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const vitest = await startVitest("test", [
  join(__dirname, "config.test.ts"),
]);

const failed = vitest?.state.getCountOfFailedTests() ?? 1;
await vitest?.close();
process.exit(failed > 0 ? 1 : 0);
