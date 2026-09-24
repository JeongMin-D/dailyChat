import test from "node:test";
import assert from "node:assert/strict";

import { fetchWithRetry } from "../src/upstream-retry.js";

function options(overrides = {}) {
  return {
    timeoutMs: 1_000,
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 1_000,
    random: () => 0,
    ...overrides
  };
}

test("429 Retry-After와 5xx에 bounded exponential backoff를 적용한다", async () => {
  const responses = [
    new Response(null, { status: 429, headers: { "retry-after": "1" } }),
    new Response(null, { status: 503 }),
    new Response("ok", { status: 200 })
  ];
  const delays = [];
  const retries = [];

  const response = await fetchWithRetry("https://example.test", {}, options({
    fetchImpl: async () => responses.shift(),
    sleepImpl: async (delayMs) => delays.push(delayMs),
    onRetry: (details) => retries.push(details)
  }));

  assert.equal(await response.text(), "ok");
  assert.deepEqual(delays, [1_000, 100]);
  assert.deepEqual(retries.map(({ attempt, status }) => ({ attempt, status })), [
    { attempt: 1, status: 429 },
    { attempt: 2, status: 503 }
  ]);
});

test("Telegram JSON retry_after를 최대 지연 안에서 반영한다", async () => {
  const delays = [];
  const responses = [
    new Response(JSON.stringify({ parameters: { retry_after: 5 } }), {
      status: 429,
      headers: { "content-type": "application/json" }
    }),
    new Response(null, { status: 200 })
  ];

  await fetchWithRetry("https://example.test", {}, options({
    maxDelayMs: 750,
    fetchImpl: async () => responses.shift(),
    sleepImpl: async (delayMs) => delays.push(delayMs)
  }));

  assert.deepEqual(delays, [750]);
});

test("네트워크 오류는 재시도하고 비재시도 4xx는 즉시 반환한다", async () => {
  let attempts = 0;
  const delays = [];
  const recovered = await fetchWithRetry("https://example.test", {}, options({
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("network unavailable");
      return new Response(null, { status: 200 });
    },
    sleepImpl: async (delayMs) => delays.push(delayMs)
  }));

  assert.equal(recovered.status, 200);
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [50]);

  attempts = 0;
  const rejected = await fetchWithRetry("https://example.test", {}, options({
    fetchImpl: async () => {
      attempts += 1;
      return new Response(null, { status: 401 });
    },
    sleepImpl: async () => assert.fail("401 must not be retried")
  }));
  assert.equal(rejected.status, 401);
  assert.equal(attempts, 1);
});

test("최대 시도 횟수 이후 마지막 네트워크 오류를 전달한다", async () => {
  let attempts = 0;
  await assert.rejects(
    fetchWithRetry("https://example.test", {}, options({
      maxAttempts: 2,
      fetchImpl: async () => {
        attempts += 1;
        throw new TypeError("still offline");
      },
      sleepImpl: async () => {}
    })),
    /still offline/
  );
  assert.equal(attempts, 2);
});

test("timeout 오류를 네트워크 오류와 동일하게 재시도한다", async () => {
  let attempts = 0;
  const retries = [];
  const response = await fetchWithRetry("https://example.test", {}, options({
    maxAttempts: 2,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new DOMException("timed out", "TimeoutError");
      return new Response(null, { status: 200 });
    },
    sleepImpl: async () => {},
    onRetry: (details) => retries.push(details)
  }));

  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
  assert.equal(retries[0].errorName, "TimeoutError");
});
