import { GroqNightlyExtractor } from "../workers/nightly/src/nightly-extractor.js";
import {
  prepareNightlyInput,
  selectNightlyTargetDay
} from "../workers/nightly/src/nightly-input.js";
import { SupabaseNightlyInputStore } from "../workers/nightly/src/supabase-input-store.js";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInteger(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function integerInRange(name, fallback, minimum, maximum) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

const timeoutMs = positiveInteger("UPSTREAM_TIMEOUT_MS", 60_000);
const useLiveData = process.argv.includes("--live-data");
const day = process.env.NIGHTLY_TARGET_DAY?.trim() || selectNightlyTargetDay(new Date(), {
  timeZone: process.env.APP_TIMEZONE?.trim() || "Asia/Seoul",
  boundaryHour: integerInRange("DAY_BOUNDARY_HOUR", 4, 0, 23)
});
const input = useLiveData
  ? await prepareNightlyInput({
      day,
      store: new SupabaseNightlyInputStore({
        url: required("SUPABASE_URL"),
        serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
        timeoutMs
      })
    })
  : await prepareNightlyInput({
      day,
      store: {
        async listUserMessagesForDay() {
          return [{
            id: "00000000-0000-4000-8000-000000000001",
            sent_at: `${day}T03:00:00.000Z`,
            content: "오늘 구조화 출력 검증을 마쳤고 마음이 차분하다."
          }];
        }
      }
    });
const { snapshot, inputHash } = input;
const extractor = new GroqNightlyExtractor({
  apiKey: required("GROQ_API_KEY"),
  baseUrl: required("GROQ_BASE_URL"),
  model: process.env.GROQ_EXTRACTION_MODEL?.trim() || required("GROQ_CHAT_MODEL"),
  timeoutMs,
  retry: {
    maxAttempts: positiveInteger("UPSTREAM_RETRY_MAX_ATTEMPTS", 3),
    baseDelayMs: positiveInteger("UPSTREAM_RETRY_BASE_DELAY_MS", 250),
    maxDelayMs: positiveInteger("UPSTREAM_RETRY_MAX_DELAY_MS", 2_000)
  }
});
const result = await extractor.extract({ snapshot });
const output = result.output;

console.log(JSON.stringify({
  event: "nightly_extraction_verified",
  inputMode: useLiveData ? "live_data" : "synthetic",
  day,
  inputCount: snapshot.messages.length,
  inputHashPrefix: inputHash.slice(0, 12),
  status: result.status,
  reason: result.reason,
  attempts: result.attempts,
  model: result.model,
  promptVersion: result.promptVersion,
  schemaVersion: result.schemaVersion,
  eventCount: output?.events.length ?? 0,
  moodCount: output?.moods.length ?? 0,
  healthEntryCount: output?.healthEntries.length ?? 0,
  diaryBlockCount: output?.diary.blocks.length ?? 0,
  safetyLevel: output?.safety.level ?? null,
  usage: result.usage
}));
