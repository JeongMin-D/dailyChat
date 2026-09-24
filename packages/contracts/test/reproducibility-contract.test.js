import assert from "node:assert/strict";
import test from "node:test";
import {
  jobRunReproducibilityContract,
  nightlyDatabaseContract,
  nightlyExtractionSchema
} from "../src/index.js";

test("nightly job 재현 필드는 DB와 공유 계약에서 일치한다", () => {
  assert.equal(jobRunReproducibilityContract.nightlyJobType, "nightly");
  assert.deepEqual(jobRunReproducibilityContract.requiredFields, [
    "day",
    "pipeline_version",
    "input_hash",
    "provider",
    "model",
    "prompt_version",
    "schema_version"
  ]);
  assert.equal(jobRunReproducibilityContract.provider, "groq");
});

test("schema version과 input hash 형식을 고정한다", () => {
  const schemaVersions = nightlyExtractionSchema.properties.schemaVersion.enum;
  assert.deepEqual(jobRunReproducibilityContract.schemaVersions, schemaVersions);
  assert.deepEqual(
    nightlyDatabaseContract.mappings.topLevel.schemaVersion.allowed,
    schemaVersions
  );

  const hashPattern = new RegExp(jobRunReproducibilityContract.inputHash.pattern);
  assert.equal(hashPattern.test("a".repeat(64)), true);
  assert.equal(hashPattern.test("A".repeat(64)), false);
  assert.equal(hashPattern.test("a".repeat(63)), false);
});

test("safety none은 저장하지 않고 제한 등급만 영속화한다", () => {
  const levelMapping = nightlyDatabaseContract.mappings.safety.level;
  assert.deepEqual(levelMapping.allowed, ["none", "concern", "urgent"]);
  assert.deepEqual(levelMapping.persistedWhen, ["concern", "urgent"]);
  assert.ok(nightlyDatabaseContract.applicationRules.includes(
    "Do not persist a safety row when level is none."
  ));
});
