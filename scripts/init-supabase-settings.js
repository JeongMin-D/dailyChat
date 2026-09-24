import { readFile } from "node:fs/promises";

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  return values;
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function telegramId(env, name) {
  const raw = required(env, name);
  const value = Number(raw);
  if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer`);
  }
  return value;
}

const env = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
const url = new URL(required(env, "SUPABASE_URL"));
const secretKey = required(env, "SUPABASE_SERVICE_ROLE_KEY");
const ownerEmail = required(env, "SUPABASE_OWNER_EMAIL");
const telegramUserId = telegramId(env, "TELEGRAM_ALLOWED_USER_ID");
const telegramChatId = telegramId(env, "TELEGRAM_ALLOWED_CHAT_ID");

const headers = {
  apikey: secretKey,
  "content-type": "application/json",
  prefer: "resolution=merge-duplicates,return=representation"
};
if (!secretKey.startsWith("sb_secret_")) {
  headers.authorization = `Bearer ${secretKey}`;
}

const endpoint = new URL("/rest/v1/settings?on_conflict=id", url);
const response = await fetch(endpoint, {
  method: "POST",
  headers,
  body: JSON.stringify({
    id: 1,
    owner_email: ownerEmail,
    telegram_user_id: telegramUserId,
    telegram_chat_id: telegramChatId,
    timezone: env.APP_TIMEZONE?.trim() || "Asia/Seoul",
    day_boundary_hour: Number(env.DAY_BOUNDARY_HOUR || 4),
    diary_final_time: env.DIARY_FINAL_TIME?.trim() || "04:05"
  }),
  signal: AbortSignal.timeout(15_000)
});

if (!response.ok) {
  const error = await response.text();
  throw new Error(`Supabase settings initialization failed (${response.status}): ${error}`);
}

const rows = await response.json();
const row = rows[0];
if (!row || row.id !== 1) throw new Error("Supabase did not return the settings row");

console.log(JSON.stringify({
  event: "supabase_settings_initialized",
  id: row.id,
  timezone: row.timezone,
  dayBoundaryHour: row.day_boundary_hour,
  diaryFinalTime: row.diary_final_time,
  ownerConfigured: row.owner_email === ownerEmail,
  telegramUserConfigured: Number(row.telegram_user_id) === telegramUserId,
  telegramChatConfigured: Number(row.telegram_chat_id) === telegramChatId
}));
