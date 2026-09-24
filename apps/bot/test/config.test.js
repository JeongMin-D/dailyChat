import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.js";

const valid = {
  TELEGRAM_BOT_TOKEN: "token",
  TELEGRAM_WEBHOOK_SECRET: "secret",
  TELEGRAM_ALLOWED_USER_ID: "100",
  TELEGRAM_ALLOWED_CHAT_ID: "200",
  GROQ_API_KEY: "groq",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role"
};

test("필수 서버 설정을 읽고 안전한 기본값을 적용한다", () => {
  const config = loadConfig(valid);
  assert.equal(config.port, 3000);
  assert.equal(config.logLevel, "info");
  assert.equal(config.timeZone, "Asia/Seoul");
  assert.equal(config.dayBoundaryHour, 4);
  assert.equal(config.conversation.historyLimit, 12);
  assert.equal(config.conversation.maxContextChars, 6000);
  assert.equal(config.groq.model, "openai/gpt-oss-120b");
});

test("필수 비밀값이 없으면 시작을 거부한다", () => {
  const env = { ...valid };
  delete env.GROQ_API_KEY;
  assert.throws(() => loadConfig(env), /GROQ_API_KEY/);
});

test("잘못된 경계 시간과 URL을 거부한다", () => {
  assert.throws(() => loadConfig({ ...valid, DAY_BOUNDARY_HOUR: "24" }), /DAY_BOUNDARY_HOUR/);
  assert.throws(
    () => loadConfig({ ...valid, CONVERSATION_HISTORY_LIMIT: "51" }),
    /CONVERSATION_HISTORY_LIMIT/
  );
  assert.throws(() => loadConfig({ ...valid, LOG_LEVEL: "verbose" }), /LOG_LEVEL/);
  assert.throws(() => loadConfig({ ...valid, SUPABASE_URL: "not a url" }), /SUPABASE_URL/);
});
