import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../../database/migrations/20260927161547_m3_memory_candidate_persistence.sql",
    import.meta.url
  ),
  "utf8"
);

test("E02 migration은 기억 후보와 원문 근거를 nightly 결과와 원자 저장한다", () => {
  assert.match(migration, /create or replace function public\.persist_nightly_extraction_versioned/i);
  assert.match(migration, /public\.persist_nightly_extraction\(/i);
  assert.match(migration, /insert into public\.memory_candidates/i);
  assert.match(migration, /insert into public\.memory_candidate_message_sources/i);
  assert.match(migration, /memoryCandidateCount/i);
});

test("DB 경계에서도 후보 배열·직접 근거·처리일 소속을 다시 검증한다", () => {
  assert.match(migration, /jsonb_typeof\(p_result -> 'memoryCandidates'\) <> 'array'/i);
  assert.match(migration, /jsonb_array_length\(candidate -> 'sourceMessageIds'\) < 1/i);
  assert.match(migration, /messages\.role = 'user'/i);
  assert.match(migration, /messages\.day = run_row\.day/i);
  assert.match(migration, /candidate ->> 'validFrom' <> run_row\.day::text/i);
});

test("교체 RPC는 invoker와 service-role 전용 실행을 유지한다", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /from public, anon, authenticated/i);
  assert.match(migration, /to service_role/i);
  assert.doesNotMatch(migration, /security definer/i);
});
