import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../../database/migrations/20260927160533_m3_memory_candidates.sql",
    import.meta.url
  ),
  "utf8"
);

test("E01 migration은 기억 후보와 원문·event 근거 관계를 만든다", () => {
  assert.match(migration, /create table public\.memory_candidates/i);
  assert.match(migration, /create table public\.memory_candidate_message_sources/i);
  assert.match(migration, /create table public\.memory_candidate_event_sources/i);
  assert.match(migration, /references public\.messages\(id\) on delete restrict/i);
  assert.match(migration, /references public\.events\(id\) on delete restrict/i);
});

test("기억 후보의 분류·확신도·상태·유효기간을 제한한다", () => {
  assert.match(migration, /length\(fact\) between 1 and 500/i);
  assert.match(migration, /confidence between 0 and 1/i);
  assert.match(migration, /status in \('pending', 'confirmed', 'rejected'\)/i);
  assert.match(migration, /valid_to is null or valid_to >= valid_from/i);
  assert.match(migration, /unique \(job_run_id, category, fact\)/i);
});

test("기억 후보 테이블은 RLS와 service-role 전용 권한을 사용한다", () => {
  assert.equal((migration.match(/enable row level security/gi) ?? []).length, 3);
  assert.match(migration, /from anon, authenticated, service_role/i);
  assert.match(migration, /to service_role/i);
  assert.doesNotMatch(migration, /grant .* to (?:anon|authenticated)/i);
  assert.doesNotMatch(migration, /security definer/i);
});
