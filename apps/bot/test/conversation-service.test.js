import test from "node:test";
import assert from "node:assert/strict";

import { createConversationService } from "../src/conversation-service.js";

const config = {
  timeZone: "Asia/Seoul",
  dayBoundaryHour: 4,
  telegram: {
    webhookSecret: "test-secret",
    allowedUserId: "100",
    allowedChatId: "200"
  }
};

function update(overrides = {}) {
  return {
    update_id: 10,
    message: {
      message_id: 20,
      date: 1_795_000_000,
      chat: { id: 200 },
      from: { id: 100 },
      text: "오늘 HMI 문제를 해결했어",
      ...overrides
    }
  };
}

function setup({ claimed = true, existingReply = null, llmError, sendError } = {}) {
  const calls = [];
  const store = {
    async claimUpdate(id) { calls.push(["claim", id]); return claimed; },
    async saveUserMessage(message) { calls.push(["save-user", message]); },
    async findAssistantReply(id) { calls.push(["find-reply", id]); return existingReply; },
    async saveAssistantReply(message) { calls.push(["save-assistant", message]); },
    async completeUpdate(id) { calls.push(["complete", id]); },
    async failUpdate(id, code) { calls.push(["fail", id, code]); }
  };
  const llm = {
    async generateReply(input) {
      calls.push(["llm", input]);
      if (llmError) throw llmError;
      return "해결해서 다행이다. 오래 걸렸겠다.";
    }
  };
  const telegram = {
    async sendText(chatId, text) {
      calls.push(["send", chatId, text]);
      if (sendError) throw sendError;
    }
  };
  const logger = { error() {} };
  return {
    calls,
    service: createConversationService({ config, store, llm, telegram, logger })
  };
}

test("잘못된 webhook secret은 어떤 작업도 시작하지 않는다", async () => {
  const { service, calls } = setup();
  const result = await service.handle({ secret: "wrong", update: update() });
  assert.deepEqual(result, { status: 401, result: "unauthorized" });
  assert.deepEqual(calls, []);
});

test("허용되지 않은 사용자는 조용히 무시한다", async () => {
  const { service, calls } = setup();
  const result = await service.handle({
    secret: "test-secret",
    update: update({ from: { id: 999 } })
  });
  assert.deepEqual(result, { status: 200, result: "ignored" });
  assert.deepEqual(calls, []);
});

test("사용자 원문을 LLM 호출 전에 저장하고 응답을 전송한다", async () => {
  const { service, calls } = setup();
  const result = await service.handle({ secret: "test-secret", update: update() });

  assert.deepEqual(result, { status: 200, result: "completed" });
  assert.deepEqual(calls.map(([name]) => name), [
    "claim",
    "save-user",
    "find-reply",
    "llm",
    "save-assistant",
    "send",
    "complete"
  ]);
  assert.match(calls[1][1].day, /^\d{4}-\d{2}-\d{2}$/);
});

test("이미 처리 중이거나 완료된 update는 중복 처리하지 않는다", async () => {
  const { service, calls } = setup({ claimed: false });
  const result = await service.handle({ secret: "test-secret", update: update() });
  assert.deepEqual(result, { status: 200, result: "duplicate" });
  assert.deepEqual(calls.map(([name]) => name), ["claim"]);
});

test("LLM 실패를 재시도 가능 상태로 기록한다", async () => {
  const { service, calls } = setup({ llmError: new Error("provider down") });
  const result = await service.handle({ secret: "test-secret", update: update() });
  assert.deepEqual(result, { status: 500, result: "retryable_failure" });
  assert.equal(calls.at(-1)[0], "fail");
});

test("전송 재시도에서는 저장된 assistant 응답을 재사용한다", async () => {
  const { service, calls } = setup({ existingReply: "이미 생성된 답변" });
  const result = await service.handle({ secret: "test-secret", update: update() });
  assert.deepEqual(result, { status: 200, result: "completed" });
  assert.equal(calls.some(([name]) => name === "llm"), false);
  assert.deepEqual(calls.find(([name]) => name === "send").slice(1), ["200", "이미 생성된 답변"]);
});

test("Telegram 전송 실패도 재시도 가능 상태로 남긴다", async () => {
  const { service, calls } = setup({ sendError: new Error("telegram down") });
  const result = await service.handle({ secret: "test-secret", update: update() });
  assert.deepEqual(result, { status: 500, result: "retryable_failure" });
  assert.equal(calls.at(-1)[0], "fail");
});
