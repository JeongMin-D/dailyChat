import { TelegramClient } from "../../../apps/bot/src/telegram.js";
import { createJsonLogger } from "../../../packages/observability/src/json-logger.js";
import { GroqNightlyExtractor } from "./nightly-extractor.js";
import { NightlyPipelineRunner } from "./nightly-runner.js";
import { SupabaseNightlyInputStore } from "./supabase-input-store.js";
import { SupabaseNotificationOutboxStore } from "./supabase-notification-store.js";
import { SupabaseNightlyOutputStore } from "./supabase-output-store.js";
import { TelegramNotificationDelivery } from "./telegram-notification-delivery.js";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function integer(name, fallback, minimum, maximum) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

const timeoutMs = integer("UPSTREAM_TIMEOUT_MS", 60_000, 1_000, 120_000);
const retry = {
  maxAttempts: integer("UPSTREAM_RETRY_MAX_ATTEMPTS", 3, 1, 5),
  baseDelayMs: integer("UPSTREAM_RETRY_BASE_DELAY_MS", 250, 0, 10_000),
  maxDelayMs: integer("UPSTREAM_RETRY_MAX_DELAY_MS", 2_000, 0, 30_000)
};
if (retry.maxDelayMs < retry.baseDelayMs) {
  throw new RangeError(
    "UPSTREAM_RETRY_MAX_DELAY_MS must be greater than or equal to UPSTREAM_RETRY_BASE_DELAY_MS"
  );
}

const configuredLogLevel = process.env.LOG_LEVEL?.trim() || "info";
if (!["debug", "info", "warn", "error"].includes(configuredLogLevel)) {
  throw new Error("LOG_LEVEL must be one of: debug, info, warn, error");
}
/** @type {"debug" | "info" | "warn" | "error"} */
const logLevel = /** @type {"debug" | "info" | "warn" | "error"} */ (configuredLogLevel);
const logger = createJsonLogger({
  service: "dailychat-nightly",
  level: logLevel
});
const sharedStoreOptions = {
  url: required("SUPABASE_URL"),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  timeoutMs
};
const inputStore = new SupabaseNightlyInputStore(sharedStoreOptions);
const outputStore = new SupabaseNightlyOutputStore(sharedStoreOptions);
const notificationStore = new SupabaseNotificationOutboxStore(sharedStoreOptions);
const extractor = new GroqNightlyExtractor({
  apiKey: required("GROQ_API_KEY"),
  baseUrl: process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1",
  model: process.env.GROQ_EXTRACTION_MODEL?.trim()
    || process.env.GROQ_CHAT_MODEL?.trim()
    || "openai/gpt-oss-120b",
  timeoutMs,
  retry,
  logger
});
const telegramClient = new TelegramClient({
  token: required("TELEGRAM_BOT_TOKEN"),
  timeoutMs,
  retry,
  logger
});
const notificationDelivery = new TelegramNotificationDelivery({
  store: notificationStore,
  telegramClient
});
const runner = new NightlyPipelineRunner({
  inputStore,
  extractor,
  outputStore,
  notificationStore,
  notificationDelivery,
  pipelineVersion: process.env.NIGHTLY_PIPELINE_VERSION?.trim() || "nightly-pipeline-v1",
  timeZone: process.env.APP_TIMEZONE?.trim() || "Asia/Seoul",
  boundaryHour: integer("DAY_BOUNDARY_HOUR", 4, 0, 23),
  logger
});

try {
  const result = await runner.run({
    day: process.env.NIGHTLY_TARGET_DAY?.trim() || undefined
  });
  logger.info("nightly_run_finished", result);
} catch (error) {
  logger.error("nightly_run_failed", {
    errorCode: error?.code || "NIGHTLY_RUN_FAILED",
    status: Number.isInteger(error?.status) ? error.status : undefined,
    providerErrorType: typeof error?.providerErrorType === "string"
      ? error.providerErrorType
      : undefined,
    providerErrorCode: typeof error?.providerErrorCode === "string"
      ? error.providerErrorCode
      : undefined,
    hasFailedGeneration: error?.hasFailedGeneration === true || undefined
  });
  process.exitCode = 1;
}
