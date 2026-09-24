import test from "node:test";
import assert from "node:assert/strict";

import { createJsonLogger } from "../src/json-logger.js";

function sink(entries) {
  return {
    debug(value) { entries.push(value); },
    info(value) { entries.push(value); },
    warn(value) { entries.push(value); },
    error(value) { entries.push(value); }
  };
}

test("한 줄 JSON에 공통 필드를 기록한다", () => {
  const entries = [];
  const logger = createJsonLogger({
    service: "test-service",
    sink: sink(entries),
    now: () => new Date("2026-09-24T00:00:00Z")
  });

  logger.info("request_completed", { requestId: "req-1", status: 200 });

  assert.deepEqual(JSON.parse(entries[0]), {
    timestamp: "2026-09-24T00:00:00.000Z",
    level: "info",
    service: "test-service",
    event: "request_completed",
    requestId: "req-1",
    status: 200
  });
});

test("비밀값과 원문 필드를 재귀적으로 마스킹한다", () => {
  const entries = [];
  const logger = createJsonLogger({ service: "test", sink: sink(entries) });

  logger.error("failed", {
    token: "telegram-token",
    nested: {
      content: "사용자 원문",
      apiKey: "groq-key",
      updateId: 10
    }
  });

  const payload = JSON.parse(entries[0]);
  assert.equal(payload.token, "[REDACTED]");
  assert.equal(payload.nested.content, "[REDACTED]");
  assert.equal(payload.nested.apiKey, "[REDACTED]");
  assert.equal(payload.nested.updateId, 10);
});

test("설정한 로그 레벨보다 낮은 로그를 생략한다", () => {
  const entries = [];
  const logger = createJsonLogger({ service: "test", level: "warn", sink: sink(entries) });

  logger.info("ignored");
  logger.warn("kept");

  assert.equal(entries.length, 1);
  assert.equal(JSON.parse(entries[0]).event, "kept");
});
