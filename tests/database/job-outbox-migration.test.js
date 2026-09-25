import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  jobRunStatuses,
  notificationOutboxContract,
  notificationStatuses
} from "../../packages/contracts/src/index.js";

const migrationUrl = new URL(
  "../../database/migrations/0005_job_runs_notification_outbox.sql",
  import.meta.url
);

async function migrationSql() {
  return (await readFile(migrationUrl, "utf8")).toLowerCase();
}

function sqlEnum(values) {
  return values.map((value) => `'${value}'`).join(", ");
}

test("C04 migration은 job run 재시도 예약과 원자적 claim을 추가한다", async () => {
  const sql = await migrationSql();

  assert.match(sql, /alter table job_runs/);
  assert.match(sql, /available_at timestamptz not null default now\(\)/);
  assert.match(sql, /updated_at timestamptz not null default now\(\)/);
  assert.match(sql, /create or replace function claim_job_run\(p_job_run_id uuid\)/);
  assert.match(sql, /attempt = attempt \+ 1/);
  assert.match(sql, /updated_at < now\(\) - interval '5 minutes'/);
});

test("notification outbox 상태와 참조·멱등 제약을 생성한다", async () => {
  const sql = await migrationSql();

  assert.match(sql, /create table notification_outbox \(/);
  assert.match(sql, /job_run_id uuid not null references job_runs\(id\) on delete restrict/);
  assert.match(sql, /diary_id uuid not null references diaries\(id\) on delete restrict/);
  assert.match(sql, new RegExp(`status in \\(${sqlEnum(notificationStatuses)}\\)`));
  assert.match(sql, /idempotency_key text not null unique/);
  assert.match(sql, /unique \(diary_id, channel, notification_type\)/);
});

test("DB enum은 공유 job contract와 일치한다", async () => {
  const sql = await migrationSql();
  const foundation = (
    await readFile(new URL("../../database/migrations/0001_foundation.sql", import.meta.url), "utf8")
  ).toLowerCase();
  const safetyRouting = (
    await readFile(
      new URL("../../database/migrations/0011_safety_notification_routing.sql", import.meta.url),
      "utf8"
    )
  ).toLowerCase();

  assert.match(foundation, new RegExp(`status in \\(${sqlEnum(jobRunStatuses)}\\)`));
  assert.match(sql, new RegExp(`status in \\(${sqlEnum(notificationStatuses)}\\)`));
  assert.match(sql, new RegExp(`channel in \\(${sqlEnum(notificationOutboxContract.channels)}\\)`));
  assert.match(
    safetyRouting,
    new RegExp(`notification_type in \\(${sqlEnum(notificationOutboxContract.types)}\\)`)
  );
});

test("outbox와 claim 함수는 server-only 접근으로 제한한다", async () => {
  const sql = await migrationSql();

  assert.match(sql, /alter table notification_outbox enable row level security/);
  assert.match(sql, /revoke all on table notification_outbox\s+from anon, authenticated, service_role/);
  assert.match(sql, /grant select, insert, update, delete on table notification_outbox\s+to service_role/);
  assert.match(sql, /revoke all on function claim_job_run\(uuid\) from public, anon, authenticated/);
  assert.match(sql, /revoke all on function claim_notification\(uuid\) from public, anon, authenticated/);
});

test("outbox migration은 사용자 본문 payload 컬럼을 만들지 않는다", async () => {
  const sql = await migrationSql();
  const start = sql.indexOf("create table notification_outbox");
  const end = sql.indexOf(";", start);
  const tableDefinition = sql.slice(start, end);

  assert.doesNotMatch(tableDefinition, /\b(content|payload|message_text|diary_text)\b/);
});
