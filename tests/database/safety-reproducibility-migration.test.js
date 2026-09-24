import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  jobRunReproducibilityContract,
  nightlyDatabaseContract
} from "../../packages/contracts/src/index.js";

const migrationUrl = new URL(
  "../../database/migrations/0006_safety_reproducibility.sql",
  import.meta.url
);

async function migrationSql() {
  return (await readFile(migrationUrl, "utf8")).toLowerCase();
}

test("C05 migration은 nightly job 재현 필드를 추가하고 필수화한다", async () => {
  const sql = await migrationSql();

  for (const column of ["provider", "model", "prompt_version", "schema_version"]) {
    assert.match(sql, new RegExp(`add column ${column} text`));
    assert.match(sql, new RegExp(`${column} is not null`));
  }

  assert.match(sql, /job_type <> 'nightly'/);
  assert.match(sql, /day is not null/);
  assert.match(sql, /input_hash is not null/);
  assert.ok(sql.includes(
    `input_hash ~ '${jobRunReproducibilityContract.inputHash.pattern}'`
  ));
});

test("safety는 concern과 urgent의 제한 metadata만 저장한다", async () => {
  const sql = await migrationSql();
  const persistedLevels = nightlyDatabaseContract.mappings.safety.level.persistedWhen;
  const reasonCodes = nightlyDatabaseContract.mappings.safety.reasonCodes.allowedItems;

  assert.match(sql, /create table safety_assessments \(/);
  assert.match(sql, new RegExp(`level in \\('${persistedLevels.join("', '")}'\\)`));
  assert.doesNotMatch(sql, /level in \([^)]*'none'/);
  for (const reasonCode of reasonCodes) {
    assert.match(sql, new RegExp(`'${reasonCode}'`));
  }
  assert.match(sql, /checker_version text not null/);
  assert.match(sql, /assessed_at timestamptz not null default now\(\)/);
  assert.match(sql, /unique \(job_run_id\)/);
});

test("safety source는 복합 PK와 restrict 원문 FK를 사용한다", async () => {
  const sql = await migrationSql();

  assert.match(sql, /create table safety_message_sources \(/);
  assert.match(sql, /references safety_assessments\(id\) on delete cascade/);
  assert.match(sql, /message_id uuid not null references messages\(id\) on delete restrict/);
  assert.match(sql, /primary key \(safety_assessment_id, message_id\)/);
});

test("safety table은 RLS와 server-only 권한을 명시한다", async () => {
  const sql = await migrationSql();

  assert.match(sql, /alter table safety_assessments enable row level security/);
  assert.match(sql, /alter table safety_message_sources enable row level security/);
  assert.match(
    sql,
    /revoke all on table safety_assessments, safety_message_sources\s+from anon, authenticated, service_role/
  );
  assert.match(
    sql,
    /on table safety_assessments, safety_message_sources\s+to service_role/
  );
});

test("safety table은 자유 형식 민감정보 컬럼을 만들지 않는다", async () => {
  const sql = await migrationSql();
  const start = sql.indexOf("create table safety_assessments");
  const end = sql.indexOf(";", start);
  const definition = sql.slice(start, end);

  assert.doesNotMatch(
    definition,
    /\b(content|quote|diagnosis|reasoning|explanation|diary_text|health_text)\b/
  );
});
