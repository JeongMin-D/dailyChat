import test from "node:test";
import assert from "node:assert/strict";

import { SupabaseMessageStore } from "../src/supabase-message-store.js";

function response(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

test("modern Supabase secret key는 apikey 헤더에만 전송한다", async () => {
  let request;
  const store = new SupabaseMessageStore({
    url: "https://example.supabase.co",
    serviceRoleKey: "sb_secret_test",
    timeoutMs: 1000,
    fetchImpl: async (_url, options) => {
      request = options;
      return response(true);
    }
  });

  await store.claimUpdate(1);
  assert.equal(request.headers.apikey, "sb_secret_test");
  assert.equal("authorization" in request.headers, false);
});

test("legacy service_role JWT는 apikey와 Bearer에 함께 전송한다", async () => {
  let request;
  const store = new SupabaseMessageStore({
    url: "https://example.supabase.co",
    serviceRoleKey: "legacy-jwt",
    timeoutMs: 1000,
    fetchImpl: async (_url, options) => {
      request = options;
      return response(true);
    }
  });

  await store.claimUpdate(1);
  assert.equal(request.headers.apikey, "legacy-jwt");
  assert.equal(request.headers.authorization, "Bearer legacy-jwt");
});

test("최근 대화를 조회하고 시간 순서로 반환한다", async () => {
  let requestUrl;
  const store = new SupabaseMessageStore({
    url: "https://example.supabase.co",
    serviceRoleKey: "sb_secret_test",
    timeoutMs: 1000,
    fetchImpl: async (url) => {
      requestUrl = new URL(url);
      return response([
        {
          role: "assistant",
          content: "두 번째 답변",
          sent_at: "2026-09-24T01:03:00Z",
          reply_to_update_id: 2
        },
        {
          role: "assistant",
          content: "첫 번째 답변",
          sent_at: "2026-09-24T01:02:00Z",
          reply_to_update_id: 1
        },
        {
          role: "user",
          content: "두 번째 질문",
          sent_at: "2026-09-24T01:01:00Z",
          telegram_update_id: 2
        },
        {
          role: "user",
          content: "첫 번째 질문",
          sent_at: "2026-09-24T01:00:00Z",
          telegram_update_id: 1
        }
      ]);
    }
  });

  const messages = await store.listRecentMessages({
    chatId: "200",
    before: new Date("2026-09-24T02:00:00Z"),
    limit: 12
  });

  assert.equal(requestUrl.searchParams.get("telegram_chat_id"), "eq.200");
  assert.equal(requestUrl.searchParams.get("role"), "in.(user,assistant)");
  assert.equal(requestUrl.searchParams.get("sent_at"), "lt.2026-09-24T02:00:00.000Z");
  assert.equal(requestUrl.searchParams.get("limit"), "12");
  assert.deepEqual(messages.map(({ content }) => content), [
    "첫 번째 질문",
    "첫 번째 답변",
    "두 번째 질문",
    "두 번째 답변"
  ]);
});

test("기억 결정 RPC에 후보와 검증된 Telegram identity를 전달한다", async () => {
  let request;
  const store = new SupabaseMessageStore({
    url: "https://example.supabase.co",
    serviceRoleKey: "sb_secret_test",
    timeoutMs: 1000,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({ action: "updated", status: "confirmed" });
    }
  });
  await store.decideMemoryCandidate({
    memoryCandidateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    decision: "confirm",
    userId: "100",
    chatId: "200"
  });
  assert.match(request.url, /rpc\/decide_memory_candidate$/);
  assert.deepEqual(JSON.parse(request.options.body), {
    p_memory_candidate_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    p_decision: "confirm",
    p_telegram_user_id: 100,
    p_telegram_chat_id: 200
  });
});
