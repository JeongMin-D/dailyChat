import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../database/migrations/20260928033726_personal_data_deletion.sql",
  import.meta.url
);

test("완전 삭제 RPC는 소유자·날짜 확인 후 의존 데이터를 원문보다 먼저 지운다", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /p_confirm_day is distinct from p_day::text/i);
  assert.match(sql, /telegram_user_id = p_telegram_user_id/i);
  assert.match(sql, /telegram_chat_id = p_telegram_chat_id/i);
  assert.match(sql, /p_day >= current_day/i);
  assert.match(sql, /status = 'running'/i);
  assert.match(sql, /status = 'sending'/i);
  assert.match(sql, /cross-day source dependency requires manual review/i);

  const memoryAt = sql.indexOf("delete from public.memory_candidates");
  const diaryAt = sql.indexOf("delete from public.diaries");
  const eventAt = sql.indexOf("delete from public.events");
  const messageAt = sql.indexOf("delete from public.messages");
  const jobAt = sql.indexOf("delete from public.job_runs");
  assert.ok(memoryAt < eventAt);
  assert.ok(diaryAt < eventAt);
  assert.ok(eventAt < messageAt);
  assert.ok(messageAt < jobAt);
});

test("완전 삭제 RPC는 한 트랜잭션의 invoker 함수이며 service role만 실행한다", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /security invoker\s+set search_path = ''/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /revoke all on function[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/i);
  assert.doesNotMatch(sql, /security definer/i);
});
