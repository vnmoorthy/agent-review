// Tiny leveled logger used across the codebase. Avoids `console.log` so we
// can keep stdout reserved for tool output (JSON mode, etc).
//
// Levels: silent < error < warn < info < debug

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

const LEVEL_ORDER: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export interface Logger {
  level: LogLevel;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  child: (prefix: string) => Logger;
}

function shouldLog(current: LogLevel, target: LogLevel): boolean {
  return LEVEL_ORDER[current] >= LEVEL_ORDER[target];
}

export function createLogger(level: LogLevel = "warn", prefix = ""): Logger {
  const fmt = (msg: unknown[]): unknown[] =>
    prefix ? [`[${prefix}]`, ...msg] : msg;

  return {
    level,
    error: (...args) => {
      if (shouldLog(level, "error")) console.error(...fmt(args));
    },
    warn: (...args) => {
      if (shouldLog(level, "warn")) console.error(...fmt(args));
    },
    info: (...args) => {
      if (shouldLog(level, "info")) console.error(...fmt(args));
    },
    debug: (...args) => {
      if (shouldLog(level, "debug")) console.error(...fmt(args));
    },
    child: (childPrefix) =>
      createLogger(level, prefix ? `${prefix}:${childPrefix}` : childPrefix),
  };
}

let global: Logger = createLogger("warn");
export function setGlobalLogger(l: Logger): void {
  global = l;
}
export function logger(): Logger {
  return global;
}
