import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNightlyExtraction,
  nightlyExtractionSchema,
  validateDiary,
  validateEvent,
  validateHealth,
  validateMood,
  validateNightlyExtraction,
  validateSafety
} from "../src/index.js";

const MESSAGE_1 = "11111111-1111-4111-8111-111111111111";
const MESSAGE_2 = "22222222-2222-4222-8222-222222222222";

function validResult() {
  return {
    schemaVersion: "1.0.0",
    day: "2026-09-24",
    events: [{
      eventRef: "event-1",
      type: "work",
      summary: "프로젝트의 데이터 계약을 정리했다.",
      occurredAt: "2026-09-24T12:30:00+09:00",
      people: [],
      keywords: ["데이터 계약"],
      confidence: 0.95,
      sourceMessageIds: [MESSAGE_1, MESSAGE_2]
    }],
    moods: [{
      score: 4,
      label: "차분함",
      source: "inferred",
      confidence: 0.8,
      sourceMessageIds: [MESSAGE_2]
    }],
    healthEntries: [{
      symptom: "피로",
      severity: null,
      note: null,
      occurredAt: null,
      confidence: 0.7,
      sourceMessageIds: [MESSAGE_1]
    }],
    safety: {
      level: "none",
      reasonCodes: [],
      sourceMessageIds: [],
      checkerVersion: "safety-v1"
    },
    diary: {
      title: "기준을 세운 날",
      summaryMood: "차분함",
      tags: ["개발"],
      blocks: [{
        text: "오늘은 프로젝트의 데이터 계약을 차분히 정리했다.",
        sourceMessageIds: [MESSAGE_1, MESSAGE_2],
        sourceEventRefs: ["event-1"]
      }]
    }
  };
}

function assertGroqStrictObjects(schema, path = "#") {
  if (!schema || typeof schema !== "object") {
    return;
  }

  if (schema.type === "object") {
    assert.equal(schema.additionalProperties, false, `${path} must reject additional properties`);
    assert.deepEqual(
      [...schema.required].sort(),
      Object.keys(schema.properties).sort(),
      `${path} must require every property`
    );
  }

  for (const [key, value] of Object.entries(schema)) {
    if (key !== "properties" || schema.type !== "object") {
      assertGroqStrictObjects(value, `${path}/${key}`);
      continue;
    }
    for (const [propertyName, propertySchema] of Object.entries(value)) {
      assertGroqStrictObjects(propertySchema, `${path}/properties/${propertyName}`);
    }
  }
}

test("Groq strict mode에 맞게 모든 object 필드를 required로 고정한다", () => {
  assertGroqStrictObjects(nightlyExtractionSchema);
});

test("event, mood, health, diary, safety 개별 계약을 검증한다", () => {
  const value = validResult();
  assert.equal(validateEvent(value.events[0]).valid, true);
  assert.equal(validateMood(value.moods[0]).valid, true);
  assert.equal(validateHealth(value.healthEntries[0]).valid, true);
  assert.equal(validateDiary(value.diary).valid, true);
  assert.equal(validateSafety(value.safety).valid, true);
});

test("완전한 야간 추출 결과와 입력 snapshot 근거를 승인한다", () => {
  const value = validResult();
  const result = validateNightlyExtraction(value, {
    allowedMessageIds: [MESSAGE_1, MESSAGE_2]
  });

  assert.deepEqual(result, { valid: true, errors: [] });
  assert.equal(assertNightlyExtraction(value), value);
});

test("정의되지 않은 필드와 잘못된 enum, 범위, UUID를 거부한다", () => {
  const extra = validResult();
  extra.events[0].invented = true;
  assert.equal(validateNightlyExtraction(extra).valid, false);

  const invalid = validResult();
  invalid.events[0].type = "travel";
  invalid.moods[0].score = 6;
  invalid.healthEntries[0].sourceMessageIds = ["not-a-uuid"];
  const result = validateNightlyExtraction(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 3);
});

test("모든 일기 block에 직접 원문 근거를 요구한다", () => {
  const value = validResult();
  value.diary.blocks[0].sourceMessageIds = [];

  const result = validateNightlyExtraction(value);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "minItems"));
});

test("같은 결과에 없는 event 참조를 거부한다", () => {
  const value = validResult();
  value.diary.blocks[0].sourceEventRefs = ["event-2"];

  const result = validateNightlyExtraction(value);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.params.eventRef === "event-2"));
});

test("중복 eventRef를 거부한다", () => {
  const value = validResult();
  value.events.push({ ...value.events[0] });

  const result = validateNightlyExtraction(value);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.message === "eventRef must be unique"));
});

test("Groq 미지원 uniqueItems 대신 의미 검증으로 중복 배열 값을 거부한다", () => {
  const value = validResult();
  value.events[0].keywords = ["계약", "계약"];
  value.diary.blocks[0].sourceMessageIds = [MESSAGE_1, MESSAGE_1];

  const result = validateNightlyExtraction(value);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.params.duplicate === "계약"));
  assert.ok(result.errors.some((error) => error.params.duplicate === MESSAGE_1));
});

test("안전 등급과 제한된 근거 메타데이터의 일관성을 검사한다", () => {
  const noneWithCheckedSource = validResult();
  noneWithCheckedSource.safety.sourceMessageIds = [MESSAGE_1];
  assert.equal(validateNightlyExtraction(noneWithCheckedSource).valid, true);

  const noneWithReason = validResult();
  noneWithReason.safety.reasonCodes = ["acute_distress"];
  noneWithReason.safety.sourceMessageIds = [MESSAGE_1];
  assert.equal(validateNightlyExtraction(noneWithReason).valid, false);

  const urgentWithoutEvidence = validResult();
  urgentWithoutEvidence.safety.level = "urgent";
  assert.equal(validateNightlyExtraction(urgentWithoutEvidence).valid, false);
});

test("입력 snapshot 밖의 source message ID를 거부한다", () => {
  const result = validateNightlyExtraction(validResult(), {
    allowedMessageIds: [MESSAGE_1]
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.params.sourceMessageId === MESSAGE_2));
});

test("출력 day가 명시된 snapshot day와 다르면 거부한다", () => {
  const result = validateNightlyExtraction(validResult(), {
    allowedMessageIds: [MESSAGE_1, MESSAGE_2],
    expectedDay: "2026-09-25"
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.instancePath === "/day"));
});

test("assert API는 안정적인 오류 코드와 검증 상세를 제공한다", () => {
  const value = validResult();
  value.schemaVersion = "2.0.0";

  assert.throws(
    () => assertNightlyExtraction(value),
    (error) => error.code === "INVALID_NIGHTLY_EXTRACTION"
      && Array.isArray(error.validationErrors)
      && error.validationErrors.length > 0
  );
});
