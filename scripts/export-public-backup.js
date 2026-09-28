import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const BACKUP_TABLES = [
  "settings", "telegram_updates", "messages", "job_runs", "events",
  "mood_entries", "health_entries", "diaries", "diary_blocks",
  "safety_assessments", "memory_candidates", "event_message_sources",
  "mood_message_sources", "health_message_sources", "diary_block_event_sources",
  "diary_block_message_sources", "safety_message_sources",
  "memory_candidate_event_sources", "memory_candidate_message_sources",
  "notification_outbox", "memory_confirmation_outbox", "diary_feedback"
];

export async function exportPublicBackup({ url, serviceRoleKey, fetchImpl = fetch, createdAt = new Date().toISOString() }) {
  if (!url || !serviceRoleKey) throw new TypeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const headers = { apikey: serviceRoleKey };
  if (!serviceRoleKey.startsWith("sb_secret_")) headers.authorization = `Bearer ${serviceRoleKey}`;
  const tables = {};
  for (const table of BACKUP_TABLES) {
    const rows = [];
    for (let from = 0; ; from += 1_000) {
      const params = new URLSearchParams({ select: "*", limit: "1000", offset: String(from) });
      const response = await fetchImpl(`${url.replace(/\/$/, "")}/rest/v1/${table}?${params}`, { headers });
      if (!response.ok) throw new Error(`Backup export failed for ${table} with status ${response.status}`);
      const page = await response.json();
      if (!Array.isArray(page)) throw new TypeError(`Backup export for ${table} must return an array`);
      rows.push(...page);
      if (page.length < 1_000) break;
    }
    tables[table] = rows;
  }
  return { format: "dailychat-public-v1", createdAt, tables };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const output = process.env.BACKUP_OUTPUT || "dailychat-public.json";
  const backup = await exportPublicBackup({
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  });
  await writeFile(output, JSON.stringify(backup), { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify({ event: "backup_exported", tables: BACKUP_TABLES.length, output }));
}
