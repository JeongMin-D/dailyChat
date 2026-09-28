import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { SupabaseMessageStore } from "../apps/bot/src/supabase-message-store.js";
import { getLocalDay } from "../packages/core/src/time/local-day.js";
import { generateMemoryProjection } from "./generate-memory-projection.js";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function deleteDayAndRefreshMemory({ store, day, confirmation, userId, chatId, projectionDay, path }) {
  if (day !== confirmation) throw new Error("DELETE_CONFIRM_DAY must exactly match DELETE_TARGET_DAY");
  const deleted = await store.deletePersonalDataForDay({ day, confirmation, userId, chatId });
  const projection = await generateMemoryProjection({ store, day: projectionDay, path });
  return { day, deleted, projectionCount: projection.count, projectionHash: projection.hash };
}

async function main() {
  const store = new SupabaseMessageStore({
    url: required("SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 15_000)
  });
  const result = await deleteDayAndRefreshMemory({
    store,
    day: required("DELETE_TARGET_DAY"),
    confirmation: required("DELETE_CONFIRM_DAY"),
    userId: required("TELEGRAM_ALLOWED_USER_ID"),
    chatId: required("TELEGRAM_ALLOWED_CHAT_ID"),
    projectionDay: getLocalDay(new Date(), {
      timeZone: process.env.APP_TIMEZONE?.trim() || "Asia/Seoul",
      boundaryHour: Number(process.env.DAY_BOUNDARY_HOUR || 4)
    }),
    path: "files/MEMORY.md"
  });
  console.log(JSON.stringify({ event: "personal_data_deleted", ...result }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ event: "personal_data_deletion_failed", errorCode: error?.code || "PERSONAL_DATA_DELETION_FAILED" }));
    process.exitCode = 1;
  });
}
