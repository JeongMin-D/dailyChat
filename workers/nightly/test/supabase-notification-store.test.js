import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseNotificationOutboxStore } from "../src/supabase-notification-store.js";

const NOTIFICATION_ID = "99999999-9999-4999-8999-999999999999";
const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DIARY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function createStore(result, calls = []) {
  return new SupabaseNotificationOutboxStore({
    url: "https://project.supabase.co",
    serviceRoleKey: "sb_secret_test",
    timeoutMs: 1_000,
    async fetchImpl(url, init) {
      calls.push({ url, init });
      return new Response(JSON.stringify(result), { status: 200 });
    }
  });
}

test("성공 일기 알림을 참조 식별자로 등록한다", async () => {
  const calls = [];
  const expected = {
    notificationId: NOTIFICATION_ID,
    jobRunId: JOB_ID,
    diaryId: DIARY_ID,
    status: "pending"
  };
  const result = await createStore(expected, calls).enqueue({
    jobRunId: JOB_ID,
    diaryId: DIARY_ID
  });

  assert.deepEqual(result, expected);
  assert.equal(calls[0].url, "https://project.supabase.co/rest/v1/rpc/enqueue_diary_notification");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    p_job_run_id: JOB_ID,
    p_diary_id: DIARY_ID
  });
});

test("claim은 bigint chat ID를 문자열로 유지하고 순서가 있는 block을 검증한다", async () => {
  const payload = {
    notificationId: NOTIFICATION_ID,
    jobRunId: JOB_ID,
    diaryId: DIARY_ID,
    recipientChatId: "9007199254740992",
    attempt: 1,
    day: "2026-09-24",
    version: 1,
    title: "오늘의 기록",
    blocks: [{ position: 0, text: "첫 문단" }]
  };

  assert.deepEqual(await createStore(payload).claim(NOTIFICATION_ID), payload);
  assert.equal(await createStore(null).claim(NOTIFICATION_ID), null);
});

test("전송 성공과 실패 상태 RPC에는 안정적인 metadata만 보낸다", async () => {
  const sentCalls = [];
  await createStore(true, sentCalls).markSent({
    notificationId: NOTIFICATION_ID,
    providerMessageId: "321"
  });
  assert.match(sentCalls[0].url, /complete_diary_notification$/);
  assert.deepEqual(JSON.parse(sentCalls[0].init.body), {
    p_notification_id: NOTIFICATION_ID,
    p_provider_message_id: "321"
  });

  const failedCalls = [];
  await createStore(true, failedCalls).markFailed({
    notificationId: NOTIFICATION_ID,
    errorCode: "TELEGRAM_RATE_LIMITED",
    retryable: true,
    retryAfterSeconds: 60
  });
  assert.match(failedCalls[0].url, /fail_diary_notification$/);
  assert.deepEqual(JSON.parse(failedCalls[0].init.body), {
    p_notification_id: NOTIFICATION_ID,
    p_error_code: "TELEGRAM_RATE_LIMITED",
    p_retryable: true,
    p_retry_after_seconds: 60
  });
});

test("잘못된 응답과 상태 충돌을 안정적인 코드로 거부한다", async () => {
  await assert.rejects(
    createStore({ notificationId: "invalid" }).enqueue({ jobRunId: JOB_ID, diaryId: DIARY_ID }),
    (error) => error.code === "SUPABASE_NOTIFICATION_INVALID_RESPONSE"
  );
  await assert.rejects(
    createStore(false).markSent({
      notificationId: NOTIFICATION_ID,
      providerMessageId: "321"
    }),
    (error) => error.code === "SUPABASE_NOTIFICATION_STATE_CONFLICT"
  );
});
