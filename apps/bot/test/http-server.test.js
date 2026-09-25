import test from "node:test";
import assert from "node:assert/strict";

import { createHttpServer } from "../src/http-server.js";

async function withServer(conversation, run, logger = { info() {}, error() {} }) {
  const server = createHttpServer({
    conversation,
    bodyLimitBytes: 1024,
    logger
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
    assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
    assert.deepEqual(await response.json(), { status: "ok" });
  });
});

test("GET 대시보드 요청을 dashboard app에 위임한다", async () => {
  let receivedRequestId;
  const server = createHttpServer({
    conversation: { handle() {} },
    bodyLimitBytes: 1024,
    dashboard: {
      async handle(_request, response, requestId) {
        receivedRequestId = requestId;
        response.writeHead(200, { "content-type": "text/html", "x-request-id": requestId });
        response.end("<h1>Dashboard</h1>");
        return 200;
      }
    },
    logger: { info() {}, error() {} }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/dashboard`, {
      headers: { "x-request-id": "dashboard-1" }
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Dashboard/);
    assert.equal(receivedRequestId, "dashboard-1");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
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
        "x-request-id": "telegram-request-1",
        "x-telegram-bot-api-secret-token": "secret"
      },
      body: JSON.stringify({ update_id: 1 })
    });
    assert.equal(response.status, 200);
  });
  assert.equal(received.secret, "secret");
  assert.equal(received.requestId, "telegram-request-1");
  assert.deepEqual(received.update, { update_id: 1 });
});

test("잘못된 JSON은 400으로 거부한다", async () => {
  await withServer({ handle() {} }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/telegram/webhook`, {
      method: "POST",
      headers: { "x-request-id": "invalid-json-1" },
      body: "{invalid"
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON",
        requestId: "invalid-json-1"
      }
    });
  });
});

test("오류 응답은 공통 형식과 request ID를 사용한다", async () => {
  await withServer({ handle() {} }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/missing`, {
      headers: { "x-request-id": "not-found-1" }
    });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-request-id"), "not-found-1");
    assert.deepEqual(await response.json(), {
      error: {
        code: "NOT_FOUND",
        message: "Resource not found",
        requestId: "not-found-1"
      }
    });
  });
});

test("대화 서비스 오류도 공통 HTTP 오류 형식으로 변환한다", async () => {
  await withServer({
    async handle() { return { status: 401, result: "unauthorized" }; }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/telegram/webhook`, {
      method: "POST",
      headers: { "x-request-id": "unauthorized-1" },
      body: JSON.stringify({ update_id: 1 })
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: {
        code: "UNAUTHORIZED",
        message: "Request is not authorized",
        requestId: "unauthorized-1"
      }
    });
  });
});

test("잘못된 request ID는 서버가 생성한 값으로 교체한다", async () => {
  await withServer({ handle() {} }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { "x-request-id": "invalid request id" }
    });
    assert.notEqual(response.headers.get("x-request-id"), "invalid request id");
    assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
  });
});

test("완료 로그에 request ID와 상태를 남긴다", async () => {
  const entries = [];
  const logger = {
    info(event, fields) { entries.push({ event, fields }); },
    error() {}
  };
  await withServer({ handle() {} }, async (baseUrl) => {
    await fetch(`${baseUrl}/health`, { headers: { "x-request-id": "health-log-1" } });
  }, logger);

  assert.equal(entries[0].event, "http_request_completed");
  assert.equal(entries[0].fields.requestId, "health-log-1");
  assert.equal(entries[0].fields.status, 200);
});
