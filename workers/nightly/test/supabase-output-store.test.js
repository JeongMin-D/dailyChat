import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseNightlyOutputStore } from "../src/supabase-output-store.js";

const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const DIARY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const snapshot = {
  version: "1",
  day: "2026-09-24",
  messages: [{ id: MESSAGE_ID, sentAt: "2026-09-24T03:00:00.000Z", content: "기록" }]
};

function output() {
  return {
    schemaVersion: "1.0.0",
    day: "2026-09-24",
    events: [{
      eventRef: "event-1",
      type: "work",
      summary: "작업을 마쳤다",
      occurredAt: null,
      people: [],
      keywords: ["작업"],
      confidence: 0.9,
      sourceMessageIds: [MESSAGE_ID]
    }],
    moods: [{
      score: 4,
      label: "차분함",
      source: "inferred",
      confidence: 0.8,
      sourceMessageIds: [MESSAGE_ID]
    }],
    healthEntries: [],
    safety: {
      level: "none",
      reasonCodes: [],
      sourceMessageIds: [],
      checkerVersion: "safety-v1"
    },
    diary: {
      title: "차분한 마무리",
      summaryMood: "차분함",
      tags: ["작업"],
      blocks: [{
        text: "오늘 작업을 마쳤다.",
        sourceMessageIds: [MESSAGE_ID],
        sourceEventRefs: ["event-1"]
      }]
    }
  };
}

function responseBody() {
  return {
    jobRunId: JOB_ID,
    diaryId: DIARY_ID,
    diaryVersion: 1,
    eventCount: 1,
    moodCount: 1,
    healthEntryCount: 0,
    diaryBlockCount: 1,
    safetyPersisted: false
  };
}

test("검증된 결과를 단일 RPC 요청으로 전송한다", async () => {
  const calls = [];
  const store = new SupabaseNightlyOutputStore({
    url: "https://project.supabase.co",
    serviceRoleKey: "sb_secret_test",
    timeoutMs: 1_000,
    async fetchImpl(url, init) {
      calls.push({ url, init });
      return new Response(JSON.stringify(responseBody()), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  const result = await store.save({ jobRunId: JOB_ID, output: output(), snapshot });
  assert.deepEqual(result, responseBody());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://project.supabase.co/rest/v1/rpc/persist_nightly_extraction");
  assert.equal(calls[0].init.headers.apikey, "sb_secret_test");
  assert.equal(calls[0].init.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    p_job_run_id: JOB_ID,
    p_result: output(),
    p_diary_version: 1
  });
});

test("legacy service role key는 Bearer header를 함께 사용한다", async () => {
  let headers;
  const store = new SupabaseNightlyOutputStore({
    url: "https://project.supabase.co",
    serviceRoleKey: "legacy.jwt",
    timeoutMs: 1_000,
    async fetchImpl(_url, init) {
      headers = init.headers;
      return new Response(JSON.stringify(responseBody()), { status: 200 });
    }
  });

  await store.save({ jobRunId: JOB_ID, output: output(), snapshot });
  assert.equal(headers.authorization, "Bearer legacy.jwt");
});

test("잘못된 계약은 DB 호출 전에 거부한다", async () => {
  let called = false;
  const invalid = output();
  invalid.day = "2026-09-23";
  const store = new SupabaseNightlyOutputStore({
    url: "https://project.supabase.co",
    serviceRoleKey: "sb_secret_test",
    timeoutMs: 1_000,
    async fetchImpl() {
      called = true;
    }
  });

  await assert.rejects(
    store.save({ jobRunId: JOB_ID, output: invalid, snapshot }),
    (error) => error.code === "INVALID_NIGHTLY_EXTRACTION"
  );
  assert.equal(called, false);
});

test("RPC 오류 본문을 노출하지 않고 안정적인 코드만 반환한다", async () => {
  const store = new SupabaseNightlyOutputStore({
    url: "https://project.supabase.co",
    serviceRoleKey: "sb_secret_test",
    timeoutMs: 1_000,
    async fetchImpl() {
      return new Response(JSON.stringify({ message: "private database detail" }), {
        status: 409
      });
    }
  });

  await assert.rejects(
    store.save({ jobRunId: JOB_ID, output: output(), snapshot }),
    (error) => error.code === "SUPABASE_NIGHTLY_SAVE_FAILED"
      && error.status === 409
      && !error.message.includes("private database detail")
  );
});

test("RPC 성공 응답의 식별자 형식을 검증한다", async () => {
  const store = new SupabaseNightlyOutputStore({
    url: "https://project.supabase.co",
    serviceRoleKey: "sb_secret_test",
    timeoutMs: 1_000,
    async fetchImpl() {
      return new Response(JSON.stringify({ ...responseBody(), diaryId: "invalid" }), {
        status: 200
      });
    }
  });

  await assert.rejects(
    store.save({ jobRunId: JOB_ID, output: output(), snapshot }),
    (error) => error.code === "SUPABASE_NIGHTLY_SAVE_INVALID_RESPONSE"
  );
});

test("RPC 성공 응답이 JSON이 아니면 안정적인 오류로 변환한다", async () => {
  const store = new SupabaseNightlyOutputStore({
    url: "https://project.supabase.co",
    serviceRoleKey: "sb_secret_test",
    timeoutMs: 1_000,
    async fetchImpl() {
      return new Response("not-json", { status: 200 });
    }
  });

  await assert.rejects(
    store.save({ jobRunId: JOB_ID, output: output(), snapshot }),
    (error) => error.code === "SUPABASE_NIGHTLY_SAVE_INVALID_RESPONSE"
  );
});
