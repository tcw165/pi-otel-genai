import { appendFileSync } from "fs";

export const LOG_FILE = "/tmp/pi-debug.log";
export type LogLevel = "V" | "D" | "I" | "W" | "E";

function formatTimestamp(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  const SS = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${mm}-${dd} ${HH}:${MM}:${SS}.${ms}`;
}

function formatData(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([k, v]) => {
      const val =
        v !== null && typeof v === "object" ? JSON.stringify(v) : String(v);
      return `${k}=${val}`;
    })
    .join(" ");
}

/**
 * Writes a logcat-style line to LOG_FILE:
 *   MM-DD HH:MM:SS.mmm  L/tag: method key=val key=val
 *
 * `event` is expected to be "tag.method" (e.g. "span_manager.onSessionStart").
 */
export function log(
  event: string,
  data?: Record<string, unknown>,
  level: LogLevel = "D",
): void {
  const dotIdx = event.indexOf(".");
  const tag = dotIdx >= 0 ? event.slice(0, dotIdx) : event;
  const method = dotIdx >= 0 ? event.slice(dotIdx + 1) : "";
  const ts = formatTimestamp(new Date());
  const dataPart =
    data && Object.keys(data).length > 0 ? " " + formatData(data) : "";
  const line = `${ts}  ${level}/${tag}: ${method}${dataPart}`;
  appendFileSync(LOG_FILE, line + "\n");
}
