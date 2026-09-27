import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../../database/migrations/20260927215433_m3_memory_forget.sql",
  import.meta.url
);

test("E06 migration은 기억을 감사 가능한 forgotten 상태로 비활성화한다", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /add column forgotten_at timestamptz/i);
  assert.match(migration, /status in \([^)]*'forgotten'/i);
  assert.match(migration, /create or replace function public\.forget_memory_candidate/i);
  assert.match(migration, /set status = 'forgotten', forgotten_at = now\(\)/i);
  assert.match(migration, /valid_to = greatest\(valid_from, forgotten_day\)/i);
});

test("기억 삭제 RPC는 Telegram 소유자를 검증하고 service role만 허용한다", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /settings\.telegram_user_id = p_telegram_user_id/i);
  assert.match(migration, /settings\.telegram_chat_id = p_telegram_chat_id/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all on function public\.forget_memory_candidate[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.forget_memory_candidate[\s\S]*to service_role/i);
});
