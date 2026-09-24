import assert from "node:assert/strict";
import test from "node:test";
import {
  diarySchema,
  eventSchema,
  healthSchema,
  moodSchema,
  nightlyDatabaseContract,
  nightlyExtractionSchema,
  safetySchema
} from "../src/index.js";

const schemaMappings = [
  ["event", eventSchema],
  ["mood", moodSchema],
  ["health", healthSchema],
  ["safety", safetySchema],
  ["diary", diarySchema]
];

function assertFieldCoverage(mappingName, schema) {
  const mappedFields = Object.keys(nightlyDatabaseContract.mappings[mappingName]).sort();
  const schemaFields = Object.keys(schema.properties).sort();
  assert.deepEqual(mappedFields, schemaFields, `${mappingName} mapping must cover every schema field`);
}

function assertConstraint(mapping, schema, propertyNames) {
  for (const propertyName of propertyNames) {
    assert.deepEqual(
      mapping[propertyName].allowed,
      schema.properties[propertyName].enum,
      `${propertyName} enum must match the database contract`
    );
  }
}

test("DB mapping은 야간 추출 계약의 모든 필드를 빠짐없이 분류한다", () => {
  assert.deepEqual(
    Object.keys(nightlyDatabaseContract.mappings.topLevel).sort(),
    Object.keys(nightlyExtractionSchema.properties).sort()
  );

  for (const [mappingName, schema] of schemaMappings) {
    assertFieldCoverage(mappingName, schema);
  }

  assertFieldCoverage("diaryBlock", diarySchema.properties.blocks.items);
});

test("enum과 수치 범위가 JSON Schema와 DB 계약에서 일치한다", () => {
  const mappings = nightlyDatabaseContract.mappings;
  assertConstraint(mappings.event, eventSchema, ["type"]);
  assertConstraint(mappings.mood, moodSchema, ["source"]);
  assertConstraint(mappings.safety, safetySchema, ["level"]);
  assert.deepEqual(
    mappings.safety.reasonCodes.allowedItems,
    safetySchema.properties.reasonCodes.items.enum
  );

  for (const [mapping, schema, field] of [
    [mappings.event, eventSchema, "confidence"],
    [mappings.mood, moodSchema, "score"],
    [mappings.mood, moodSchema, "confidence"],
    [mappings.health, healthSchema, "severity"],
    [mappings.health, healthSchema, "confidence"]
  ]) {
    assert.equal(mapping[field].minimum, schema.properties[field].minimum);
    assert.equal(mapping[field].maximum, schema.properties[field].maximum);
  }
});

test("nullable 계약과 PostgreSQL timestamptz 저장 타입이 일치한다", () => {
  const mappings = nightlyDatabaseContract.mappings;
  assert.equal(mappings.event.occurredAt.nullable, true);
  assert.equal(mappings.event.occurredAt.sqlType, "timestamptz");
  assert.equal(mappings.health.occurredAt.nullable, true);
  assert.equal(mappings.health.occurredAt.sqlType, "timestamptz");
  assert.equal(mappings.health.severity.nullable, true);
  assert.equal(mappings.health.note.nullable, true);
  assert.equal(mappings.diary.summaryMood.nullable, true);
});

test("원문 근거 배열은 JSON/배열 컬럼이 아니라 FK 연결 테이블로 저장한다", () => {
  const relationMappings = [
    nightlyDatabaseContract.mappings.event.sourceMessageIds,
    nightlyDatabaseContract.mappings.mood.sourceMessageIds,
    nightlyDatabaseContract.mappings.health.sourceMessageIds,
    nightlyDatabaseContract.mappings.safety.sourceMessageIds,
    nightlyDatabaseContract.mappings.diaryBlock.sourceMessageIds
  ];

  for (const relation of relationMappings) {
    assert.equal(relation.storage, "relation");
    assert.equal(relation.sourceColumn, "message_id");
    assert.equal(relation.parentDelete, "cascade");
    assert.equal(relation.sourceDelete, "restrict");
    assert.deepEqual(relation.primaryKey, [relation.parentColumn, "message_id"]);
  }
});

test("Data API 접근과 삭제 정책은 명시적이고 서버 역할로 제한한다", () => {
  const { access, tableRules } = nightlyDatabaseContract;
  assert.equal(access.rlsRequired, true);
  assert.deepEqual(access.grants.anon, []);
  assert.deepEqual(access.grants.authenticated, []);
  assert.deepEqual(access.grants.service_role, ["select", "insert", "update", "delete"]);
  assert.equal(tableRules.relations.sourceMessageDelete, "restrict");
  assert.equal(tableRules.relations.derivedParentDelete, "cascade");
});
