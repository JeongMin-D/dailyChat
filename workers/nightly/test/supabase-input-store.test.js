import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseNightlyInputStore } from "../src/supabase-input-store.js";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("day와 user role을 고정 정렬·pagination으로 조회한다", async () => {
  const requests = [];
  const pages = [
    [
      { id: "1", sent_at: "2026-09-24T01:00:00Z", content: "하나" },
      { id: "2", sent_at: "2026-09-24T02:00:00Z", content: "둘" }
    ],
    [{ id: "3", sent_at: "2026-09-24T03:00:00Z", content: "셋" }]
  ];
  const store = new SupabaseNightlyInputStore({
    url: "https://example.supabase.co/",
    serviceRoleKey: "sb_secret_test",
    timeoutMs: 1000,
    pageSize: 2,
    fetchImpl: async (input, options) => {
      requests.push({ url: new URL(input), options });
      return response(pages[requests.length - 1]);
    }
  });

  const result = await store.listUserMessagesForDay("2026-09-24");

  assert.equal(result.length, 3);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.pathname, "/rest/v1/messages");
  assert.equal(requests[0].url.searchParams.get("day"), "eq.2026-09-24");
  assert.equal(requests[0].url.searchParams.get("role"), "eq.user");
  assert.equal(requests[0].url.searchParams.get("select"), "id,sent_at,content");
  assert.equal(requests[0].url.searchParams.get("order"), "sent_at.asc,id.asc");
  assert.equal(requests[0].url.searchParams.get("limit"), "2");
  assert.equal(requests[0].url.searchParams.get("offset"), "0");
  assert.equal(requests[1].url.searchParams.get("offset"), "2");
  assert.equal(requests[0].options.headers.apikey, "sb_secret_test");
  assert.equal("authorization" in requests[0].options.headers, false);
});

test("legacy service role JWT는 Bearer header를 함께 사용한다", async () => {
  let headers;
  const store = new SupabaseNightlyInputStore({
    url: "https://example.supabase.co",
    serviceRoleKey: "legacy-jwt",
    timeoutMs: 1000,
    fetchImpl: async (_input, options) => {
      headers = options.headers;
      return response([]);
    }
  });

  await store.listUserMessagesForDay("2026-09-24");
  assert.equal(headers.apikey, "legacy-jwt");
  assert.equal(headers.authorization, "Bearer legacy-jwt");
});

test("잘못된 day와 page size, Data API 오류를 거부한다", async () => {
  assert.throws(
    () => new SupabaseNightlyInputStore({
      url: "https://example.supabase.co",
      serviceRoleKey: "key",
      timeoutMs: 1000,
      pageSize: 1001
    }),
    RangeError
  );

  const store = new SupabaseNightlyInputStore({
    url: "https://example.supabase.co",
    serviceRoleKey: "key",
    timeoutMs: 1000,
    fetchImpl: async () => response({ message: "unavailable" }, 503)
  });
  await assert.rejects(() => store.listUserMessagesForDay("not-a-day"), TypeError);
  await assert.rejects(() => store.listUserMessagesForDay("2026-02-30"), RangeError);
  await assert.rejects(
    () => store.listUserMessagesForDay("2026-09-24"),
    /status 503/
  );
});
