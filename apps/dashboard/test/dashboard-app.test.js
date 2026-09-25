import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { DashboardApp } from "../src/dashboard-app.js";

const data = {
  selectedDay: "2026-09-24",
  availableDays: ["2026-09-24"],
  diaryIndex: [{ id: "d1", day: "2026-09-24", version: 1, title: "테스트 일기", tags: [] }],
  messages: [{ role: "user", content: "오늘 기록", sent_at: "2026-09-24T05:00:00Z" }],
  events: [],
  moods: [],
  health: [],
  diary: { id: "d1", version: 1, title: "테스트 일기", summary_mood: null, tags: [], created_at: "2026-09-24T19:00:00Z" },
  blocks: [{ position: 0, text: "근거 있는 일기" }],
  recentMoods: [],
  query: "",
  searchResults: []
};

async function withApp(app, run) {
  const server = createServer((request, response) => app.handle(request, response, "request-1"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("인증되지 않은 대시보드 요청을 차단한다", async () => {
  const app = new DashboardApp({ username: "owner", password: "password-123456", store: { load: async () => data } });
  await withApp(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/dashboard`);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate"), /MindCompanion Dashboard/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});

test("인증된 사용자에게 실제 기록 화면을 렌더링한다", async () => {
  let received;
  const app = new DashboardApp({
    username: "owner",
    password: "password-123456",
    store: { async load(input) { received = input; return { ...data, query: input.query }; } }
  });
  await withApp(app, async (baseUrl) => {
    const authorization = `Basic ${Buffer.from("owner:password-123456").toString("base64")}`;
    const response = await fetch(`${baseUrl}/dashboard?day=2026-09-24&q=기록`, { headers: { authorization } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    const html = await response.text();
    assert.match(html, /MindCompanion/);
    assert.match(html, /근거 있는 일기/);
    assert.doesNotMatch(html, /service.role|SUPABASE_SERVICE_ROLE_KEY/i);
  });
  assert.deepEqual(received, { day: "2026-09-24", query: "기록" });
});

test("설정되지 않은 대시보드는 공개하지 않는다", async () => {
  const app = new DashboardApp({ username: "", password: "", store: null });
  await withApp(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/dashboard`);
    assert.equal(response.status, 503);
  });
});
