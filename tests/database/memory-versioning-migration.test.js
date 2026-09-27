import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../../database/migrations/20260927213724_m3_memory_versioning.sql",
    import.meta.url
  ),
  "utf8"
);

test("E05 migration은 논리 키·버전·교체 연결을 추가한다", () => {
  assert.match(migration, /add column memory_key text/i);
  assert.match(migration, /add column version integer/i);
  assert.match(migration, /supersedes_memory_candidate_id uuid/i);
  assert.match(migration, /status in \('pending', 'confirmed', 'rejected', 'superseded'\)/i);
  assert.match(migration, /memory_candidates_one_confirmed_key_idx/i);
});

test("DB trigger는 같은 키를 직렬화하고 중복과 갱신을 분리한다", () => {
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /lower\(trim\(current_candidate\.fact\)\)/i);
  assert.match(migration, /new\.status := 'rejected'/i);
  assert.match(migration, /new\.supersedes_memory_candidate_id := current_candidate\.id/i);
  assert.match(migration, /new\.status := 'pending'/i);
});

test("교체 확인은 이전 확정 기억을 원자적으로 superseded 처리한다", () => {
  assert.match(migration, /candidate\.supersedes_memory_candidate_id is not null/i);
  assert.match(migration, /previous_candidate\.status <> 'confirmed'/i);
  assert.match(migration, /set status = 'superseded', superseded_at = now\(\)/i);
  assert.match(migration, /set status = target_status, decided_at = now\(\)/i);
});

test("E05 함수는 invoker와 service-role 전용 경계를 유지한다", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /from public, anon, authenticated/i);
  assert.match(migration, /to service_role/i);
  assert.doesNotMatch(migration, /security definer/i);
});
