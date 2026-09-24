import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const foundationUrl = new URL(
  "../../database/migrations/0001_foundation.sql",
  import.meta.url
);
const migrationUrl = new URL(
  "../../database/migrations/0007_message_day_integrity.sql",
  import.meta.url
);

async function readSql(url) {
  return (await readFile(url, "utf8")).toLowerCase();
}

test("foundation은 timestamptz 원본 시각과 date local day를 분리한다", async () => {
  const sql = await readSql(foundationUrl);

  assert.match(sql, /sent_at timestamptz not null/);
  assert.match(sql, /day date not null/);
  assert.match(sql, /create index messages_day_sent_at_idx on messages \(day, sent_at\)/);
});

test("DB local_day는 시간대의 벽시계에서 경계 시간을 차감한다", async () => {
  const sql = await readSql(foundationUrl);

  assert.match(sql, /ts at time zone tz/);
  assert.match(sql, /make_interval\(hours => boundary_hour\)/);
  assert.match(sql, /returns date/);
  assert.match(sql, /stable/);
  assert.match(sql, /set search_path = ''/);
});

test("C06 trigger는 settings 기준과 다른 message day를 거부한다", async () => {
  const sql = await readSql(migrationUrl);

  assert.match(sql, /create or replace function enforce_message_local_day\(\)/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /public\.local_day\(new\.sent_at, settings\.timezone, settings\.day_boundary_hour\)/);
  assert.match(sql, /if new\.day <> expected_day then/);
  assert.match(sql, /errcode = '23514'/);
  assert.match(sql, /before insert or update of sent_at, day on messages/);
});

test("C06 trigger 함수는 Data API에서 직접 실행할 수 없다", async () => {
  const sql = await readSql(migrationUrl);

  assert.match(
    sql,
    /revoke all on function enforce_message_local_day\(\)\s+from public, anon, authenticated, service_role/
  );
  assert.doesNotMatch(sql, /grant execute on function enforce_message_local_day/);
});
