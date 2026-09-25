import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../database/migrations/0010_telegram_diary_outbox_delivery.sql", import.meta.url),
  "utf8"
);

test("D09 migration은 reference-only 등록과 원자적 payload claim을 제공한다", () => {
  assert.match(migration, /create or replace function public\.enqueue_diary_notification/i);
  assert.match(migration, /on conflict \(diary_id, channel, notification_type\) do nothing/i);
  assert.match(migration, /'telegram:daily_diary:' \|\| p_diary_id::text/i);
  assert.match(migration, /create or replace function public\.claim_diary_notification/i);
  assert.match(migration, /update public\.notification_outbox[\s\S]*returning \*/i);
  assert.match(migration, /from public\.diary_blocks b/i);
  assert.doesNotMatch(migration, /alter table public\.notification_outbox[\s\S]*add column.*(?:payload|text)/i);
});

test("성공과 실패 RPC는 sending 상태만 전이하고 재시도 지연을 제한한다", () => {
  assert.match(migration, /create or replace function public\.complete_diary_notification/i);
  assert.match(migration, /set status = 'sent'[\s\S]*where id = p_notification_id[\s\S]*status = 'sending'/i);
  assert.match(migration, /create or replace function public\.fail_diary_notification/i);
  assert.match(migration, /'retryable_failed' else 'failed'/i);
  assert.match(migration, /p_retry_after_seconds not between 0 and 86400/i);
});

test("D09 RPC는 invoker, 빈 search path, service-role 전용이다", () => {
  assert.equal((migration.match(/security invoker/gi) ?? []).length, 4);
  assert.equal((migration.match(/set search_path = ''/gi) ?? []).length, 4);
  assert.equal((migration.match(/grant execute on function/gi) ?? []).length, 4);
  assert.equal((migration.match(/from public, anon, authenticated/gi) ?? []).length, 4);
  assert.doesNotMatch(migration, /security definer/i);
});
