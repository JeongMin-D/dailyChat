import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../../database/migrations/20260928143000_dashboard_feedback_memory_management.sql", import.meta.url), "utf8");

test("Dashboard 피드백과 기억 수정은 소유자 확인 RPC와 service role 권한만 사용한다", () => {
  assert.match(sql, /create table public\.diary_feedback/);
  assert.match(sql, /create or replace function public\.save_diary_feedback/);
  assert.match(sql, /create or replace function public\.update_memory_candidate_from_dashboard/);
  assert.match(sql, /telegram_user_id = p_telegram_user_id/);
  assert.match(sql, /security invoker[\s\S]*set search_path = ''/);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/);
});

test("기억 수정은 원문 근거를 복사하고 이전 버전을 superseded 처리한다", () => {
  assert.match(sql, /insert into public\.memory_candidate_message_sources/);
  assert.match(sql, /insert into public\.memory_candidate_event_sources/);
  assert.match(sql, /set status = 'superseded'/);
  assert.match(sql, /decision_source = 'dashboard'/);
});
