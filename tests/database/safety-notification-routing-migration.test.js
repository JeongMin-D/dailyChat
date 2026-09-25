import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../database/migrations/0011_safety_notification_routing.sql", import.meta.url),
  "utf8"
);

test("D10 migration은 urgent만 safety guidance로 분기한다", () => {
  assert.match(migration, /notification_type in \('daily_diary', 'safety_guidance'\)/i);
  assert.match(migration, /when safety_level = 'urgent' then 'safety_guidance'/i);
  assert.match(migration, /else 'daily_diary'/i);
  assert.match(migration, /'telegram:' \|\| routed_type \|\| ':' \|\| p_diary_id::text/i);
});

test("urgent claim은 diary title과 block을 payload에서 제거한다", () => {
  assert.match(migration, /n\.notification_type = 'safety_guidance'[\s\S]*urgent_safety\.level = 'urgent'/i);
  assert.match(migration, /when c\.notification_type = 'daily_diary' then d\.title[\s\S]*else null/i);
  assert.match(migration, /when c\.notification_type = 'daily_diary' then coalesce[\s\S]*else '\[\]'::jsonb/i);
  assert.match(migration, /'safetyLevel', coalesce\(s\.level, 'none'\)/i);
});

test("교체한 routing RPC는 invoker와 service-role 전용을 유지한다", () => {
  assert.equal((migration.match(/security invoker/gi) ?? []).length, 2);
  assert.equal((migration.match(/set search_path = ''/gi) ?? []).length, 2);
  assert.equal((migration.match(/from public, anon, authenticated/gi) ?? []).length, 2);
  assert.equal((migration.match(/grant execute on function/gi) ?? []).length, 2);
  assert.doesNotMatch(migration, /security definer/i);
});
