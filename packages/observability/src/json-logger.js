const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });
const SENSITIVE_KEY = /(token|secret|authorization|api.?key|service.?role|content|text)/i;
const MAX_STRING_LENGTH = 1_000;

/**
 * @typedef {object} JsonLogger
 * @property {(event: string, fields?: Record<string, unknown>) => void} debug
 * @property {(event: string, fields?: Record<string, unknown>) => void} info
 * @property {(event: string, fields?: Record<string, unknown>) => void} warn
 * @property {(event: string, fields?: Record<string, unknown>) => void} error
 */

function sanitize(value, key = "", depth = 0) {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (value instanceof Error) return { name: value.name };
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…`
      : value;
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= 5) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key, depth + 1));

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([itemKey, item]) => [itemKey, sanitize(item, itemKey, depth + 1)])
  );
}

/**
 * @param {{
 *   service: string,
 *   level?: "debug" | "info" | "warn" | "error",
 *   sink?: Pick<Console, "debug" | "info" | "warn" | "error" | "log">,
 *   now?: () => Date
 * }} options
 * @returns {JsonLogger}
 */
export function createJsonLogger({
  service,
  level = "info",
  sink = console,
  now = () => new Date()
}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function write(logLevel, event, fields = {}) {
    if (LEVELS[logLevel] < threshold) return;
    const payload = {
      timestamp: now().toISOString(),
      level: logLevel,
      service,
      event,
      ...sanitize(fields)
    };
    const output = JSON.stringify(payload);
    const target = typeof sink[logLevel] === "function" ? sink[logLevel] : sink.log;
    target.call(sink, output);
  }

  return Object.freeze({
    debug: (event, fields = {}) => write("debug", event, fields),
    info: (event, fields = {}) => write("info", event, fields),
    warn: (event, fields = {}) => write("warn", event, fields),
    error: (event, fields = {}) => write("error", event, fields)
  });
}
