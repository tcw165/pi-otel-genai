import { appendFileSync } from "fs";

export const LOG_FILE = "/tmp/pi-debug.log";

export function log(event: string, data?: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: Date.now(), event, ...(data ?? {}) });
  appendFileSync(LOG_FILE, line + "\n");
}
