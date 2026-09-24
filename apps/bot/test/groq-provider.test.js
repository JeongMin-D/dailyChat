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
