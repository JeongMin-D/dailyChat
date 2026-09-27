import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../database/migrations/20260927163138_m3_memory_confirmation_flow.sql", import.meta.url),
  "utf8"
);

test("E03 migration은 자동 확정과 확인 대상을 분리한다", () => {
  assert.match(migration, /category <> 'health'[\s\S]*confidence >= 0\.8/i);
  assert.match(migration, /decision_source in \('automatic', 'telegram'\)/i);
  assert.match(migration, /create table public\.memory_confirmation_outbox/i);
});

test("Telegram 결정은 owner identity와 pending 상태를 원자 검증한다", () => {
  assert.match(migration, /create or replace function public\.decide_memory_candidate/i);
  assert.match(migration, /telegram_user_id = p_telegram_user_id/i);
  assert.match(migration, /telegram_chat_id = p_telegram_chat_id/i);
  assert.match(migration, /if candidate\.status = 'pending'/i);
  assert.match(migration, /for update/i);
});

test("E03 RPC와 outbox는 RLS·invoker·service-role 전용이다", () => {
  assert.match(migration, /alter table public\.memory_confirmation_outbox enable row level security/i);
  assert.equal((migration.match(/security invoker/gi) ?? []).length, 6);
  assert.equal((migration.match(/set search_path = ''/gi) ?? []).length, 6);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /from public, anon, authenticated/i);
});
