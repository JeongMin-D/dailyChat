import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../database/migrations/0004_core_domain_sources.sql",
  import.meta.url
);

const domainTables = [
  "events",
  "mood_entries",
  "health_entries",
  "diaries",
  "diary_blocks"
];

const sourceTables = [
  "event_message_sources",
  "mood_message_sources",
  "health_message_sources",
  "diary_block_message_sources",
  "diary_block_event_sources"
];

const allTables = [...domainTables, ...sourceTables];

async function migrationSql() {
  return (await readFile(migrationUrl, "utf8")).toLowerCase();
}

test("C03 migration은 core domain과 유형별 근거 테이블을 생성한다", async () => {
  const sql = await migrationSql();

  for (const table of allTables) {
    assert.match(sql, new RegExp(`create table ${table} \\(`));
  }
});

test("모든 C03 테이블에 RLS와 server-only 권한을 명시한다", async () => {
  const sql = await migrationSql();

  for (const table of allTables) {
    assert.match(sql, new RegExp(`alter table ${table} enable row level security;`));
  }

  assert.match(sql, /from anon, authenticated, service_role;/);
  assert.match(sql, /to service_role;/);
});

test("원문 근거는 복합 PK와 restrict FK로 보호한다", async () => {
  const sql = await migrationSql();
  const messageRelations = [
    ["event_message_sources", "event_id"],
    ["mood_message_sources", "mood_entry_id"],
    ["health_message_sources", "health_entry_id"],
    ["diary_block_message_sources", "diary_block_id"]
  ];

  for (const [table, parentColumn] of messageRelations) {
    const tableStart = sql.indexOf(`create table ${table}`);
    const tableEnd = sql.indexOf(";", tableStart);
    const definition = sql.slice(tableStart, tableEnd);
    assert.match(definition, /message_id uuid not null references messages\(id\) on delete restrict/);
    assert.match(definition, new RegExp(`primary key \\(${parentColumn}, message_id\\)`));
  }
});

test("부모 삭제는 근거 연결만 cascade하고 job run과 event 삭제는 보호한다", async () => {
  const sql = await migrationSql();

  assert.match(sql, /job_run_id uuid not null references job_runs\(id\) on delete restrict/);
  assert.match(sql, /event_id uuid not null references events\(id\) on delete cascade/);
  assert.match(sql, /diary_id uuid not null references diaries\(id\) on delete cascade/);
  assert.match(sql, /event_id uuid not null references events\(id\) on delete restrict/);
});

test("DB 계약의 enum, 범위, nullable 제약을 migration에 고정한다", async () => {
  const sql = await migrationSql();

  assert.match(sql, /type in \('work', 'social', 'health', 'family', 'hobby', 'other'\)/);
  assert.match(sql, /source in \('inferred', 'checkin'\)/);
  assert.match(sql, /score smallint not null check \(score between 1 and 5\)/);
  assert.match(sql, /severity smallint check \(severity between 1 and 3\)/);
  assert.match(sql, /confidence numeric\(5,4\) not null check \(confidence between 0 and 1\)/);
  assert.doesNotMatch(sql, /occurred_at timestamptz not null/);
});
