import test from "node:test";
import assert from "node:assert/strict";

import { createConversationService } from "../src/conversation-service.js";
import { GroqProvider } from "../src/groq-provider.js";
import { createHttpServer } from "../src/http-server.js";
import { SupabaseMessageStore } from "../src/supabase-message-store.js";
import { TelegramClient } from "../src/telegram.js";

const config = {
  timeZone: "Asia/Seoul",
  dayBoundaryHour: 4,
  conversation: { historyLimit: 12, maxContextChars: 6_000 },
  telegram: {
    webhookSecret: "test-secret",
    allowedUserId: "100",
    allowedChatId: "200"
  }
};

function update() {
  return {
    update_id: 101,
    message: {
      message_id: 201,
      date: 1_795_000_000,
      chat: { id: 200 },
      from: { id: 100 },
      text: "오늘 DB 장애 복구를 확인했어"
    }
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function stageOf(url, method, body) {
  if (url.pathname.endsWith("/rpc/claim_telegram_update")) return "claim";
  if (url.pathname.endsWith("/messages") && method === "POST") {
    return body.role === "user" ? "save-user" : "save-assistant";
  }
  if (url.pathname.endsWith("/telegram_updates") && method === "PATCH") {
    return body.status === "completed" ? "complete" : "fail-update";
  }
  return null;
}

function createDataApi({ failOnceAt }) {
  const state = {
    failureInjected: false,
    messages: [],
    requests: [],
    updates: new Map()
  };

  return {
    state,
    async fetch(input, init = {}) {
      const url = new URL(input);
      const method = init.method || "GET";
      const body = init.body ? JSON.parse(init.body) : null;
      const stage = stageOf(url, method, body);
      state.requests.push({ method, path: url.pathname, stage });

      if (stage === failOnceAt && !state.failureInjected) {
        state.failureInjected = true;
        return json({
          code: "PGRST001",
          details: null,
          hint: null,
          message: "database temporarily unavailable"
        }, 503);
      }

      if (stage === "claim") {
        const updateId = body.p_update_id;
        const current = state.updates.get(updateId);
        if (!current) {
          state.updates.set(updateId, {
            update_id: updateId,
            status: "processing",
            attempts: 1,
            last_error_code: null
          });
          return json(true);
        }
        if (current.status === "retryable_failed") {
          Object.assign(current, {
            status: "processing",
            attempts: current.attempts + 1,
            last_error_code: null
          });
          return json(true);
        }
        return json(false);
      }

      if (url.pathname.endsWith("/messages") && method === "POST") {
        const key = body.role === "user"
          ? `user:${body.telegram_update_id}`
          : `assistant:${body.reply_to_update_id}`;
        if (!state.messages.some((message) => message.key === key)) {
          state.messages.push({ key, ...body });
        }
        return new Response(null, { status: 201 });
      }

      if (url.pathname.endsWith("/messages") && method === "GET") {
        const replyId = url.searchParams.get("reply_to_update_id")?.replace("eq.", "");
        if (replyId) {
          const reply = state.messages.find(
            (message) => message.role === "assistant"
              && String(message.reply_to_update_id) === replyId
          );
          return json(reply ? [{ content: reply.content }] : []);
        }
        return json([]);
      }

      if (url.pathname.endsWith("/telegram_updates") && method === "PATCH") {
        const updateId = Number(url.searchParams.get("update_id")?.replace("eq.", ""));
        Object.assign(state.updates.get(updateId), body);
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected fake Data API request: ${method} ${url}`);
    }
  };
}

async function withRuntime(failOnceAt, run) {
  const dataApi = createDataApi({ failOnceAt });
  const groqCalls = [];
  const telegramCalls = [];
  const logs = [];
  const logger = {
    info(event, fields) { logs.push({ level: "info", event, fields }); },
    warn(event, fields) { logs.push({ level: "warn", event, fields }); },
    error(event, fields) { logs.push({ level: "error", event, fields }); }
  };
  const retry = { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 };
  const store = new SupabaseMessageStore({
    url: "https://example.supabase.co",
    serviceRoleKey: "sb_secret_test",
    timeoutMs: 1_000,
    fetchImpl: dataApi.fetch
  });
  const llm = new GroqProvider({
    apiKey: "test-key",
    baseUrl: "https://api.groq.test/v1",
    model: "test-model",
    timeoutMs: 1_000,
    retry,
    logger,
    fetchImpl: async (_url, init) => {
      groqCalls.push(JSON.parse(init.body));
      return json({ choices: [{ message: { content: "복구를 확인했구나. 수고했어." } }] });
    }
  });
  const telegram = new TelegramClient({
    token: "test-token",
    timeoutMs: 1_000,
    retry,
    logger,
    fetchImpl: async (_url, init) => {
      telegramCalls.push(JSON.parse(init.body));
      return json({ ok: true, result: { message_id: 301 } });
    }
  });
  const conversation = createConversationService({
    config,
    store,
    llm,
    telegram,
    systemPrompt: "테스트 SOUL",
    logger
  });
  const server = createHttpServer({ conversation, bodyLimitBytes: 1_024, logger });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    await run({
      baseUrl: `http://127.0.0.1:${port}`,
      groqCalls,
      logs,
      state: dataApi.state,
      telegramCalls
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function sendWebhook(baseUrl, requestId) {
  const response = await fetch(`${baseUrl}/telegram/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      "x-telegram-bot-api-secret-token": "test-secret"
    },
    body: JSON.stringify(update())
  });
  return { response, body: await response.json() };
}

test("DB claim 실패는 외부 호출 없이 500으로 끝나고 다음 전달에서 복구한다", async () => {
  await withRuntime("claim", async ({ baseUrl, groqCalls, logs, state, telegramCalls }) => {
    const first = await sendWebhook(baseUrl, "db-claim-1");
    assert.equal(first.response.status, 500);
    assert.equal(first.body.error.code, "REQUEST_FAILED");
    assert.equal(state.updates.size, 0);
    assert.equal(groqCalls.length, 0);
    assert.equal(telegramCalls.length, 0);
    assert.equal(
      logs.some(({ event, fields }) => event === "http_request_failed"
        && fields.requestId === "db-claim-1"),
      true
    );

    const second = await sendWebhook(baseUrl, "db-claim-2");
    assert.equal(second.response.status, 200);
    assert.equal(state.updates.get(101).status, "completed");
    assert.equal(state.updates.get(101).attempts, 1);
    assert.equal(groqCalls.length, 1);
    assert.equal(telegramCalls.length, 1);
  });
});

test("user 메시지 저장 실패는 LLM 전에 중단되고 재전달에서 한 번만 저장·전송된다", async () => {
  await withRuntime("save-user", async ({ baseUrl, groqCalls, state, telegramCalls }) => {
    const first = await sendWebhook(baseUrl, "db-user-1");
    assert.equal(first.response.status, 500);
    assert.equal(first.body.error.code, "CONVERSATION_FAILED");
    assert.equal(state.updates.get(101).status, "retryable_failed");
    assert.equal(state.messages.length, 0);
    assert.equal(groqCalls.length, 0);
    assert.equal(telegramCalls.length, 0);

    const second = await sendWebhook(baseUrl, "db-user-2");
    assert.equal(second.response.status, 200);
    assert.equal(state.updates.get(101).status, "completed");
    assert.equal(state.updates.get(101).attempts, 2);
    assert.deepEqual(state.messages.map(({ role }) => role), ["user", "assistant"]);
    assert.equal(groqCalls.length, 1);
    assert.equal(telegramCalls.length, 1);
  });
});

test("assistant 저장 실패 시 Telegram을 보내지 않고 재전달에서 응답을 다시 생성한다", async () => {
  await withRuntime("save-assistant", async ({ baseUrl, groqCalls, state, telegramCalls }) => {
    const first = await sendWebhook(baseUrl, "db-assistant-1");
    assert.equal(first.response.status, 500);
    assert.equal(state.updates.get(101).status, "retryable_failed");
    assert.deepEqual(state.messages.map(({ role }) => role), ["user"]);
    assert.equal(groqCalls.length, 1);
    assert.equal(telegramCalls.length, 0);

    const second = await sendWebhook(baseUrl, "db-assistant-2");
    assert.equal(second.response.status, 200);
    assert.deepEqual(state.messages.map(({ role }) => role), ["user", "assistant"]);
    assert.equal(groqCalls.length, 2);
    assert.equal(telegramCalls.length, 1);
  });
});

test("완료 상태 기록 실패 시 저장 응답은 재사용되지만 Telegram 중복 가능성이 남는다", async () => {
  await withRuntime("complete", async ({ baseUrl, groqCalls, state, telegramCalls }) => {
    const first = await sendWebhook(baseUrl, "db-complete-1");
    assert.equal(first.response.status, 500);
    assert.equal(state.updates.get(101).status, "retryable_failed");
    assert.deepEqual(state.messages.map(({ role }) => role), ["user", "assistant"]);
    assert.equal(groqCalls.length, 1);
    assert.equal(telegramCalls.length, 1);

    const second = await sendWebhook(baseUrl, "db-complete-2");
    assert.equal(second.response.status, 200);
    assert.equal(state.updates.get(101).status, "completed");
    assert.equal(state.updates.get(101).attempts, 2);
    assert.equal(groqCalls.length, 1);
    assert.equal(telegramCalls.length, 2);
  });
});
