import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDiaryNotification,
  TelegramNotificationDelivery
} from "../src/telegram-notification-delivery.js";

const NOTIFICATION_ID = "99999999-9999-4999-8999-999999999999";

function payload(attempt = 1) {
  return {
    notificationId: NOTIFICATION_ID,
    recipientChatId: "200",
    attempt,
    day: "2026-09-24",
    version: 2,
    title: "차분한 하루",
    blocks: [
      { position: 0, text: "첫 문단" },
      { position: 1, text: "둘째 문단" }
    ]
  };
}

test("claim한 일기를 일반 텍스트로 보내고 provider message ID를 기록한다", async () => {
  const calls = [];
  const store = {
    claim: async () => payload(),
    markSent: async (value) => calls.push(["sent", value]),
    markFailed: async (value) => calls.push(["failed", value])
  };
  const telegramClient = {
    async sendText(chatId, text) {
      calls.push(["send", { chatId, text }]);
      return { messageId: "321" };
    }
  };

  const result = await new TelegramNotificationDelivery({ store, telegramClient })
    .deliver(NOTIFICATION_ID);

  assert.equal(result.action, "sent");
  assert.deepEqual(calls, [
    ["send", {
      chatId: "200",
      text: "📖 2026-09-24 일기\n차분한 하루\n\n첫 문단\n\n둘째 문단\n\n(v2)"
    }],
    ["sent", { notificationId: NOTIFICATION_ID, providerMessageId: "321" }]
  ]);
});

test("claim 실패는 Telegram을 호출하지 않는다", async () => {
  const store = { claim: async () => null };
  const telegramClient = { sendText: async () => assert.fail("must not send") };
  const result = await new TelegramNotificationDelivery({ store, telegramClient })
    .deliver(NOTIFICATION_ID);
  assert.equal(result.action, "not_claimed");
});

test("429 retry_after와 지수 backoff 중 긴 값을 재시도로 예약한다", async () => {
  let failure;
  const store = {
    claim: async () => payload(2),
    markSent: async () => {},
    markFailed: async (value) => { failure = value; }
  };
  const error = Object.assign(new Error("rate limited"), {
    status: 429,
    retryAfterSeconds: 180
  });
  const telegramClient = { sendText: async () => { throw error; } };

  const result = await new TelegramNotificationDelivery({
    store,
    telegramClient,
    baseDelaySeconds: 60,
    maxDelaySeconds: 3_600
  }).deliver(NOTIFICATION_ID);

  assert.equal(result.action, "retry_scheduled");
  assert.equal(result.retryAfterSeconds, 180);
  assert.deepEqual(failure, {
    notificationId: NOTIFICATION_ID,
    errorCode: "TELEGRAM_RATE_LIMITED",
    retryable: true,
    retryAfterSeconds: 180
  });
});

test("비재시도 4xx와 최대 attempt 도달 오류는 failed로 끝낸다", async () => {
  for (const [attempt, status, expectedCode] of [
    [1, 401, "TELEGRAM_AUTH_FAILED"],
    [5, 503, "TELEGRAM_SERVER_ERROR"]
  ]) {
    let failure;
    const store = {
      claim: async () => payload(attempt),
      markFailed: async (value) => { failure = value; }
    };
    const telegramClient = {
      sendText: async () => { throw Object.assign(new Error("send failed"), { status }); }
    };
    const result = await new TelegramNotificationDelivery({ store, telegramClient })
      .deliver(NOTIFICATION_ID);
    assert.equal(result.action, "failed");
    assert.equal(result.errorCode, expectedCode);
    assert.equal(failure.retryable, false);
    assert.equal(failure.retryAfterSeconds, 0);
  }
});

test("Telegram 성공 뒤 DB 완료 기록 오류는 실패 상태로 덮어쓰지 않는다", async () => {
  let markFailedCalled = false;
  const store = {
    claim: async () => payload(),
    markSent: async () => { throw new Error("db unavailable"); },
    markFailed: async () => { markFailedCalled = true; }
  };
  const telegramClient = { sendText: async () => ({ messageId: "321" }) };

  await assert.rejects(
    new TelegramNotificationDelivery({ store, telegramClient }).deliver(NOTIFICATION_ID),
    /db unavailable/
  );
  assert.equal(markFailedCalled, false);
});

test("긴 일기는 Telegram 4096자 제한 안에서 surrogate pair를 보존해 줄인다", () => {
  const text = formatDiaryNotification({
    ...payload(),
    blocks: [{ position: 0, text: `내용${"😀".repeat(3_000)}` }]
  });
  assert.ok(text.length <= 4_096);
  assert.match(text, /…\(일부 생략\)$/);
  assert.doesNotMatch(text, /[\uD800-\uDBFF]$/);
});
