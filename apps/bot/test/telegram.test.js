import test from "node:test";
import assert from "node:assert/strict";

import { TelegramClient } from "../src/telegram.js";

test("Telegram 429의 retry_after 이후 메시지 전송을 재시도한다", async () => {
  let attempts = 0;
  const delays = [];
  const client = new TelegramClient({
    token: "test-token",
    timeoutMs: 1_000,
    retry: {
      maxAttempts: 2,
      baseDelayMs: 10,
      maxDelayMs: 1_000,
      random: () => 0,
      sleepImpl: async (delayMs) => delays.push(delayMs)
    },
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1
        ? new Response(JSON.stringify({ parameters: { retry_after: 1 } }), {
            status: 429,
            headers: { "content-type": "application/json" }
          })
        : new Response(JSON.stringify({
            ok: true,
            result: { message_id: 321 }
          }), { status: 200 });
    }
  });

  const result = await client.sendText("200", "안녕");

  assert.equal(attempts, 2);
  assert.deepEqual(delays, [1_000]);
  assert.deepEqual(result, { messageId: "321" });
});

test("Telegram 인증 오류는 재시도하지 않는다", async () => {
  let attempts = 0;
  const client = new TelegramClient({
    token: "bad-token",
    timeoutMs: 1_000,
    retry: {
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 10,
      sleepImpl: async () => assert.fail("401 must not be retried")
    },
    fetchImpl: async () => {
      attempts += 1;
      return new Response(null, { status: 401 });
    }
  });

  await assert.rejects(client.sendText("200", "안녕"), /status 401/);
  assert.equal(attempts, 1);
});

test("Telegram 성공 응답에 message_id가 없으면 안정적인 오류로 거부한다", async () => {
  const client = new TelegramClient({
    token: "test-token",
    timeoutMs: 1_000,
    retry: { maxAttempts: 1 },
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
  });

  await assert.rejects(
    client.sendText("200", "안녕"),
    (error) => error.code === "TELEGRAM_INVALID_RESPONSE" && error.status === 200
  );
});
