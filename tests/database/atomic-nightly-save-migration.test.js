import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../database/migrations/0008_atomic_nightly_save.sql", import.meta.url),
  "utf8"
);

test("D05-D06 migration은 단일 RPC에서 모든 파생 테이블과 근거를 저장한다", () => {
  for (const table of [
    "events",
    "mood_entries",
    "health_entries",
    "diaries",
    "diary_blocks",
    "event_message_sources",
    "mood_message_sources",
    "health_message_sources",
    "diary_block_message_sources",
    "diary_block_event_sources",
    "safety_assessments",
    "safety_message_sources"
  ]) {
    assert.match(migration, new RegExp(`(?:insert into|from) public\\.${table}\\b`));
  }
  assert.match(migration, /for update/i);
  assert.match(migration, /set status = 'succeeded'/i);
});

test("RPC는 job day와 user 원문 소속을 DB에서 다시 검증한다", () => {
  assert.match(migration, /run_row\.day::text <> p_result ->> 'day'/i);
  assert.match(migration, /messages\.role = 'user'/i);
  assert.match(migration, /messages\.day = run_row\.day/i);
  assert.match(migration, /diary block references an unknown event/i);
});

test("RPC는 invoker 권한과 service-role 전용 실행을 사용한다", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(
    migration,
    /revoke all on function public\.persist_nightly_extraction\(uuid, jsonb, integer\)\s+from public, anon, authenticated/i
  );
  assert.match(
    migration,
    /grant execute on function public\.persist_nightly_extraction\(uuid, jsonb, integer\)\s+to service_role/i
  );
  assert.doesNotMatch(migration, /security definer/i);
});
