// Tiny logger so debug-mode logging is consistent and easy to strip/route
// later (e.g. to an on-screen debug overlay) without touching call sites.

type Level = "debug" | "info" | "warn" | "error";

let debugEnabled = false;

export function setDebugLogging(enabled: boolean): void {
  debugEnabled = enabled;
}

function log(level: Level, ...args: unknown[]): void {
  if (level === "debug" && !debugEnabled) return;
  const prefix = `[ghost-booth:${level}]`;
  // eslint-disable-next-line no-console
  console[level === "debug" ? "log" : level](prefix, ...args);
}

export const logger = {
  debug: (...args: unknown[]) => log("debug", ...args),
  info: (...args: unknown[]) => log("info", ...args),
  warn: (...args: unknown[]) => log("warn", ...args),
  error: (...args: unknown[]) => log("error", ...args),
};
