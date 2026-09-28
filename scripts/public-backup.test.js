import test from "node:test";
import assert from "node:assert/strict";

import { BACKUP_TABLES, exportPublicBackup } from "./export-public-backup.js";
import { renderRestoreSql } from "./render-public-backup-sql.js";

test("public 백업은 모든 대상 테이블을 pagination하고 비밀 헤더를 데이터에 남기지 않는다", async () => {
  const calls = [];
  const backup = await exportPublicBackup({
    url: "https://example.supabase.co", serviceRoleKey: "sb_secret_test",
    createdAt: "2026-09-28T00:00:00.000Z",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify([]));
    }
  });
  assert.equal(calls.length, BACKUP_TABLES.length);
  assert.ok(calls.every(({ options }) => options.headers.apikey === "sb_secret_test"));
  assert.equal(JSON.stringify(backup).includes("sb_secret_test"), false);
});

test("복구 SQL은 작은따옴표를 이스케이프하고 허용된 테이블만 transaction으로 복원한다", () => {
  const tables = Object.fromEntries(BACKUP_TABLES.map((table) => [table, []]));
  tables.settings = [{ id: 1, owner_email: "owner'o@example.com" }];
  const sql = renderRestoreSql({ format: "dailychat-public-v1", tables });
  assert.match(sql, /^begin;/);
  assert.match(sql, /set local session_replication_role = replica/);
  assert.match(sql, /owner''o@example\.com/);
  assert.match(sql, /commit;\n$/);
});
