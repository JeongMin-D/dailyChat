import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../database/migrations/0009_nightly_replay_versioning.sql", import.meta.url),
  "utf8"
);

test("D07 prepare RPC는 고유 job identity를 재사용하고 성공 결과를 no-op 처리한다", () => {
  assert.match(migration, /create or replace function public\.prepare_nightly_job/i);
  assert.match(migration, /on conflict \(job_type, day, pipeline_version, input_hash\) do nothing/i);
  assert.match(migration, /job_row\.status = 'succeeded'/i);
  assert.match(migration, /result_action := 'noop'/i);
  assert.match(migration, /nightly job metadata mismatch; change pipeline version/i);
});

test("D08 저장 RPC는 날짜별 transaction lock 뒤 max version을 증가시킨다", () => {
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock/i);
  assert.match(migration, /coalesce\(max\(version\), 0\) \+ 1/i);
  assert.match(migration, /public\.persist_nightly_extraction\(/i);
  assert.match(migration, /'action', 'saved'/i);
});

test("재실행 RPC 두 개는 invoker와 service-role 전용 실행을 유지한다", () => {
  assert.equal((migration.match(/security invoker/gi) ?? []).length, 2);
  assert.equal((migration.match(/set search_path = ''/gi) ?? []).length, 2);
  assert.match(migration, /grant execute on function public\.prepare_nightly_job[\s\S]*to service_role/i);
  assert.match(migration, /grant execute on function public\.persist_nightly_extraction_versioned\(uuid, jsonb\)[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /security definer/i);
});
