import assert from "node:assert/strict";

import { TelegramClient } from "../apps/bot/src/telegram.js";
import { GroqNightlyExtractor } from "../workers/nightly/src/nightly-extractor.js";
import { NightlyPipelineRunner } from "../workers/nightly/src/nightly-runner.js";
import { SupabaseNightlyInputStore } from "../workers/nightly/src/supabase-input-store.js";
import { SupabaseNotificationOutboxStore } from "../workers/nightly/src/supabase-notification-store.js";
import { SupabaseNightlyOutputStore } from "../workers/nightly/src/supabase-output-store.js";
import { TelegramNotificationDelivery } from "../workers/nightly/src/telegram-notification-delivery.js";

const DAY = "2026-09-24";
const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DIARY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOTIFICATION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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

const calls = [];
let persistedOutput = null;
let telegramTextLength = null;
const timeoutMs = positiveInteger("UPSTREAM_TIMEOUT_MS", 60_000);

const inputStore = new SupabaseNightlyInputStore({
  url: "https://dry-run.invalid",
  serviceRoleKey: "sb_secret_dry_run",
  timeoutMs,
  async fetchImpl() {
    calls.push("input");
    return new Response(JSON.stringify([{
      id: MESSAGE_ID,
      sent_at: "2026-09-24T03:00:00.000Z",
      content: "오늘 계획한 작업을 마쳤고 마음이 차분하다."
    }]), { status: 200 });
  }
});

const outputStore = new SupabaseNightlyOutputStore({
  url: "https://dry-run.invalid",
  serviceRoleKey: "sb_secret_dry_run",
  timeoutMs,
  async fetchImpl(url, init) {
    const rpc = new URL(url).pathname.split("/").at(-1);
    const body = JSON.parse(init.body);
    if (rpc === "prepare_nightly_job") {
      calls.push("prepare");
      return new Response(JSON.stringify({
        action: "created",
        jobRunId: JOB_ID,
        status: "queued",
        diaryId: null,
        diaryVersion: null
      }), { status: 200 });
    }
    if (rpc === "claim_job_run") {
      calls.push("claim");
      return new Response("true", { status: 200 });
    }
    if (rpc === "persist_nightly_extraction_versioned") {
      calls.push("save");
      persistedOutput = body.p_result;
      return new Response(JSON.stringify({
        action: "saved",
        jobRunId: JOB_ID,
        diaryId: DIARY_ID,
        diaryVersion: 1
      }), { status: 200 });
    }
    throw new Error(`Unexpected dry-run output RPC: ${rpc}`);
  }
});

const notificationStore = new SupabaseNotificationOutboxStore({
  url: "https://dry-run.invalid",
  serviceRoleKey: "sb_secret_dry_run",
  timeoutMs,
  async fetchImpl(url) {
    const rpc = new URL(url).pathname.split("/").at(-1);
    assert.ok(persistedOutput, "notification stage requires a persisted output");
    const safetyLevel = persistedOutput.safety.level;
    const notificationType = safetyLevel === "urgent" ? "safety_guidance" : "daily_diary";
    if (rpc === "enqueue_diary_notification") {
      calls.push("enqueue");
      return new Response(JSON.stringify({
        notificationId: NOTIFICATION_ID,
        jobRunId: JOB_ID,
        diaryId: DIARY_ID,
        notificationType,
        safetyLevel,
        status: "pending"
      }), { status: 200 });
    }
    if (rpc === "claim_diary_notification") {
      calls.push("notification_claim");
      return new Response(JSON.stringify({
        notificationId: NOTIFICATION_ID,
        jobRunId: JOB_ID,
        diaryId: DIARY_ID,
        notificationType,
        safetyLevel,
        recipientChatId: "123456789",
        attempt: 1,
        day: DAY,
        version: 1,
        title: notificationType === "daily_diary" ? persistedOutput.diary.title : null,
        blocks: notificationType === "daily_diary"
          ? persistedOutput.diary.blocks.map((block, position) => ({
              position,
              text: block.text
            }))
          : []
      }), { status: 200 });
    }
    if (rpc === "complete_diary_notification") {
      calls.push("complete_notification");
      return new Response("true", { status: 200 });
    }
    throw new Error(`Unexpected dry-run notification RPC: ${rpc}`);
  }
});

const extractor = new GroqNightlyExtractor({
  apiKey: required("GROQ_API_KEY"),
  baseUrl: process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1",
  model: process.env.GROQ_EXTRACTION_MODEL?.trim()
    || process.env.GROQ_CHAT_MODEL?.trim()
    || "openai/gpt-oss-120b",
  timeoutMs,
  retry: {
    maxAttempts: positiveInteger("UPSTREAM_RETRY_MAX_ATTEMPTS", 3),
    baseDelayMs: positiveInteger("UPSTREAM_RETRY_BASE_DELAY_MS", 250),
    maxDelayMs: positiveInteger("UPSTREAM_RETRY_MAX_DELAY_MS", 2_000)
  }
});
const telegramClient = new TelegramClient({
  token: "dry-run-token",
  timeoutMs,
  retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
  async fetchImpl(_url, init) {
    calls.push("telegram_send");
    const body = JSON.parse(init.body);
    telegramTextLength = body.text.length;
    assert.equal(body.chat_id, "123456789");
    assert.ok(telegramTextLength > 0 && telegramTextLength <= 4_096);
    return new Response(JSON.stringify({
      ok: true,
      result: { message_id: 101 }
    }), { status: 200 });
  }
});
const delivery = new TelegramNotificationDelivery({
  store: notificationStore,
  telegramClient
});
const runner = new NightlyPipelineRunner({
  inputStore,
  extractor,
  outputStore,
  notificationStore,
  notificationDelivery: delivery
});

const result = await runner.run({ day: DAY });
assert.equal(result.action, "completed");
assert.deepEqual(calls, [
  "input",
  "prepare",
  "claim",
  "save",
  "enqueue",
  "notification_claim",
  "telegram_send",
  "complete_notification"
]);

console.log(JSON.stringify({
  event: "nightly_pipeline_dry_run_verified",
  externalWrites: false,
  syntheticInput: true,
  day: result.day,
  model: extractor.model,
  extractionAttempts: result.extractionAttempts,
  safetyLevel: persistedOutput.safety.level,
  eventCount: persistedOutput.events.length,
  moodCount: persistedOutput.moods.length,
  healthEntryCount: persistedOutput.healthEntries.length,
  diaryBlockCount: persistedOutput.diary.blocks.length,
  telegramTextLength,
  stages: calls
}));
