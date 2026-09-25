import test from "node:test";
import assert from "node:assert/strict";

import { SupabaseDashboardStore } from "../src/supabase-dashboard-store.js";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("선택한 날짜의 일기와 타임라인을 서버에서 조합한다", async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, options });
    const { pathname, searchParams } = new URL(url);
    const table = pathname.split("/").at(-1);
    if (table === "diaries" && searchParams.get("limit") === "60") {
      return response([{ id: "d1", day: "2026-09-24", version: 1, title: "하루", tags: [] }]);
    }
    if (table === "messages" && searchParams.get("select") === "day") return response([{ day: "2026-09-24" }]);
    if (table === "messages") return response([{ id: "m1", role: "user", content: "HMI 해결", sent_at: "2026-09-24T05:00:00Z" }]);
    if (table === "events") return response([{ id: "e1", type: "work", summary: "HMI 해결", occurred_at: null, keywords: [], confidence: 1 }]);
    if (table === "mood_entries" && searchParams.get("day")) return response([{ id: "mo1", score: 4, label: "후련함", source: "inferred", confidence: 1 }]);
    if (table === "mood_entries") return response([{ day: "2026-09-24", score: 4, label: "후련함" }]);
    if (table === "health_entries") return response([]);
    if (table === "diaries") return response([{ id: "d1", day: "2026-09-24", version: 1, title: "하루", summary_mood: "후련함", tags: [] }]);
    if (table === "diary_blocks") return response([{ id: "b1", position: 0, text: "문제를 해결했다." }]);
    throw new Error(`Unexpected table: ${table}`);
  };
  const store = new SupabaseDashboardStore({ url: "https://example.supabase.co", serviceRoleKey: "sb_secret_test", fetchImpl });
  const result = await store.load({ day: "2026-09-24", query: "해결" });
  assert.equal(result.diary.title, "하루");
  assert.equal(result.messages.length, 1);
  assert.equal(result.searchResults.length, 3);
  assert.ok(seen.every(({ options }) => options.headers.apikey === "sb_secret_test"));
  assert.ok(seen.every(({ options }) => options.headers.authorization === undefined));
});

test("잘못된 날짜와 Data API 실패를 안전하게 거부한다", async () => {
  const store = new SupabaseDashboardStore({
    url: "https://example.supabase.co",
    serviceRoleKey: "legacy",
    fetchImpl: async () => response({ message: "secret detail" }, 500)
  });
  await assert.rejects(() => store.load({ day: "not-a-day" }), /YYYY-MM-DD/);
  await assert.rejects(() => store.load({ day: "2026-09-24" }), (error) => {
    assert.equal(error.code, "DASHBOARD_QUERY_FAILED");
    assert.doesNotMatch(error.message, /secret detail/);
    return true;
  });
});
