import assert from "node:assert/strict";
import test from "node:test";

import { GroqNightlyExtractor } from "../src/nightly-extractor.js";

const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const UNKNOWN_ID = "22222222-2222-4222-8222-222222222222";

function snapshot(messages = [{
  id: MESSAGE_ID,
  sentAt: "2026-09-24T03:00:00.000Z",
  content: "오늘 계약을 마무리해서 마음이 편해졌다"
}]) {
  return { version: "1", day: "2026-09-24", messages };
}

function validOutput(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    day: "2026-09-24",
    events: [{
      eventRef: "event-1",
      type: "work",
      summary: "계약을 마무리했다",
      occurredAt: null,
      people: [],
      keywords: ["계약"],
      confidence: 0.95,
      sourceMessageIds: [MESSAGE_ID]
    }],
    moods: [{
      score: 4,
      label: "편안함",
      source: "inferred",
      confidence: 0.9,
      sourceMessageIds: [MESSAGE_ID]
    }],
    healthEntries: [],
    safety: {
      level: "none",
      reasonCodes: [],
      sourceMessageIds: [],
      checkerVersion: "safety-v1"
    },
    diary: {
      title: "마무리한 하루",
      summaryMood: "편안함",
      tags: ["계약"],
      blocks: [{
        text: "오늘 계약을 마무리해 마음이 편해졌다.",
        sourceMessageIds: [MESSAGE_ID],
        sourceEventRefs: ["event-1"]
      }]
    },
    ...overrides
  };
}

function groqResponse(output, usage = null) {
  return {
    choices: [{ message: { content: JSON.stringify(output) } }],
    ...(usage ? { usage } : {})
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function extractor(fetchImpl, logger = null) {
  return new GroqNightlyExtractor({
    apiKey: "test-key",
    baseUrl: "https://api.groq.test/v1",
    model: "openai/gpt-oss-120b",
    timeoutMs: 1_000,
    retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
    fetchImpl,
    logger
  });
}

test("strict JSON Schema 요청과 검증된 결과 메타데이터를 반환한다", async () => {
  const calls = [];
  const result = await extractor(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(groqResponse(validOutput(), {
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300,
      sensitive_field: "ignored"
    }));
  }).extract({ snapshot: snapshot() });

  assert.equal(result.status, "completed");
  assert.equal(result.attempts, 1);
  assert.equal(result.model, "openai/gpt-oss-120b");
  assert.equal(result.promptVersion, "nightly-v1");
  assert.equal(result.schemaVersion, "1.0.0");
  assert.deepEqual(result.usage, {
    prompt_tokens: 100,
    completion_tokens: 200,
    total_tokens: 300
  });

  const request = JSON.parse(calls[0].init.body);
  assert.equal(request.response_format.type, "json_schema");
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(request.stream, undefined);
  assert.equal(request.tools, undefined);
});

test("빈 snapshot은 Groq 호출 없이 건너뛴다", async () => {
  let called = false;
  const result = await extractor(async () => {
    called = true;
    throw new Error("must not call");
  }).extract({ snapshot: snapshot([]) });

  assert.equal(called, false);
  assert.deepEqual(result, {
    status: "skipped",
    reason: "no_user_messages",
    attempts: 0,
    output: null
  });
});

test("근거 또는 day 오류를 노출하지 않고 한 번 교정한다", async () => {
  const calls = [];
  const logs = [];
  const invalid = validOutput({ day: "2026-09-23" });
  invalid.diary.blocks[0].sourceMessageIds = [UNKNOWN_ID];

  const result = await extractor(async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return jsonResponse(groqResponse(calls.length === 1 ? invalid : validOutput()));
  }, {
    warn(event, fields) {
      logs.push({ event, fields });
    }
  }).extract({ snapshot: snapshot() });

  assert.equal(result.attempts, 2);
  assert.equal(calls.length, 2);
  const correction = calls[1].messages.at(-1).content;
  assert.match(correction, /\/day/);
  assert.doesNotMatch(correction, new RegExp(UNKNOWN_ID));
  assert.doesNotMatch(JSON.stringify(logs), /마음이 편해졌다/);
  assert.doesNotMatch(JSON.stringify(logs), new RegExp(UNKNOWN_ID));
});

test("잘못된 JSON도 한 번 교정한 뒤 성공할 수 있다", async () => {
  let count = 0;
  const result = await extractor(async () => {
    count += 1;
    if (count === 1) return jsonResponse({ choices: [{ message: { content: "not json" } }] });
    return jsonResponse(groqResponse(validOutput()));
  }).extract({ snapshot: snapshot() });

  assert.equal(result.attempts, 2);
  assert.equal(count, 2);
});

test("두 번의 의미 검증 실패는 안정적인 오류 코드로 종료한다", async () => {
  const invalid = validOutput({ day: "2026-09-23" });
  await assert.rejects(
    extractor(async () => jsonResponse(groqResponse(invalid))).extract({ snapshot: snapshot() }),
    (error) => error.code === "INVALID_NIGHTLY_EXTRACTION"
      && Array.isArray(error.validationErrors)
      && error.validationErrors.length > 0
  );
});

test("refusal은 교정 없이 즉시 종료한다", async () => {
  let count = 0;
  await assert.rejects(
    extractor(async () => {
      count += 1;
      return jsonResponse({ choices: [{ message: { refusal: "cannot comply" } }] });
    }).extract({ snapshot: snapshot() }),
    (error) => error.code === "GROQ_EXTRACTION_REFUSED"
  );
  assert.equal(count, 1);
});

test("HTTP 실패는 본문 없이 status와 안정적인 오류 코드만 제공한다", async () => {
  await assert.rejects(
    extractor(async () => jsonResponse({
      secret: "do not expose",
      error: {
        type: "invalid_request_error",
        code: "json_validate_failed",
        failed_generation: { secret: "do not expose" }
      }
    }, 401))
      .extract({ snapshot: snapshot() }),
    (error) => error.code === "GROQ_EXTRACTION_REQUEST_FAILED"
      && error.status === 401
      && error.providerErrorType === "invalid_request_error"
      && error.providerErrorCode === "json_validate_failed"
      && error.hasFailedGeneration === true
      && !error.message.includes("do not expose")
  );
});
