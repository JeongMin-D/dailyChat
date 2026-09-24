import test from "node:test";
import assert from "node:assert/strict";

import { GroqProvider } from "../src/groq-provider.js";

test("구성된 대화 메시지를 Groq에 그대로 전달한다", async () => {
  let request;
  const provider = new GroqProvider({
    apiKey: "test-key",
    baseUrl: "https://api.groq.test/v1",
    model: "test-model",
    timeoutMs: 1000,
    fetchImpl: async (_url, options) => {
      request = options;
      return new Response(JSON.stringify({
        choices: [{ message: { content: " 반가워 " } }]
      }), { status: 200 });
    }
  });
  const messages = [
    { role: "system", content: "SOUL" },
    { role: "user", content: "안녕" }
  ];

  const reply = await provider.generateReply({ messages });

  assert.equal(reply, "반가워");
  assert.deepEqual(JSON.parse(request.body).messages, messages);
});

test("Groq의 일시적 5xx를 재시도하고 경고 로그를 남긴다", async () => {
  let attempts = 0;
  const logs = [];
  const provider = new GroqProvider({
    apiKey: "test-key",
    baseUrl: "https://api.groq.test/v1",
    model: "test-model",
    timeoutMs: 1_000,
    retry: {
      maxAttempts: 2,
      baseDelayMs: 10,
      maxDelayMs: 10,
      random: () => 0,
      sleepImpl: async () => {}
    },
    logger: { warn: (event, fields) => logs.push({ event, fields }) },
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1
        ? new Response(null, { status: 503 })
        : new Response(JSON.stringify({
            choices: [{ message: { content: "복구됨" } }]
          }), { status: 200 });
    }
  });

  assert.equal(await provider.generateReply({ messages: [] }), "복구됨");
  assert.equal(attempts, 2);
  assert.equal(logs[0].event, "upstream_retry_scheduled");
  assert.equal(logs[0].fields.upstream, "groq");
  assert.equal(logs[0].fields.status, 503);
});
