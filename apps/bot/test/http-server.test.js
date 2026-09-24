import test from "node:test";
import assert from "node:assert/strict";

import { createHttpServer } from "../src/http-server.js";

async function withServer(conversation, run) {
  const server = createHttpServer({
    conversation,
    bodyLimitBytes: 1024,
    logger: { error() {} }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("health endpoint를 제공한다", async () => {
  await withServer({ handle() {} }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });
});

test("Telegram secret header와 JSON body를 service에 전달한다", async () => {
  let received;
  await withServer({
    async handle(input) {
      received = input;
      return { status: 200, result: "completed" };
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/telegram/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "secret"
      },
      body: JSON.stringify({ update_id: 1 })
    });
    assert.equal(response.status, 200);
  });
  assert.equal(received.secret, "secret");
  assert.deepEqual(received.update, { update_id: 1 });
});

test("잘못된 JSON은 400으로 거부한다", async () => {
  await withServer({ handle() {} }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/telegram/webhook`, {
      method: "POST",
      body: "{invalid"
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_json" });
  });
});
