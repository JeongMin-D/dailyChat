import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { BACKUP_TABLES } from "./export-public-backup.js";

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function renderRestoreSql(backup) {
  if (backup?.format !== "dailychat-public-v1" || typeof backup.tables !== "object") {
    throw new TypeError("Unsupported DailyChat backup format");
  }
  const statements = ["begin;", "set local session_replication_role = replica;"];
  for (const table of BACKUP_TABLES) {
    const rows = backup.tables[table];
    if (!Array.isArray(rows)) throw new TypeError(`Backup table ${table} must be an array`);
    if (rows.length) statements.push(`insert into public.${table} select * from json_populate_recordset(null::public.${table}, ${sqlLiteral(JSON.stringify(rows))}::json);`);
  }
  statements.push("commit;");
  return `${statements.join("\n")}\n`;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const input = process.env.BACKUP_INPUT || "dailychat-public.json";
  const output = process.env.RESTORE_OUTPUT || "dailychat-restore.sql";
  const backup = JSON.parse(await readFile(input, "utf8"));
  await writeFile(output, renderRestoreSql(backup), { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify({ event: "restore_sql_rendered", tables: BACKUP_TABLES.length, output }));
}
