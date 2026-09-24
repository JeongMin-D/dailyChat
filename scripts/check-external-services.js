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
    ) value = value.slice(1, -1);
    values[name] = value;
  }
  return values;
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function expectJson(response, service) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || payload?.description || `HTTP ${response.status}`;
    throw new Error(`${service} check failed: ${message}`);
  }
  return payload;
}

const env = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
const timeout = Number(env.UPSTREAM_TIMEOUT_MS || 15_000);

const telegramToken = required(env, "TELEGRAM_BOT_TOKEN");
const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramToken}/getMe`, {
  signal: AbortSignal.timeout(timeout)
});
const telegram = await expectJson(telegramResponse, "Telegram");

const groqBaseUrl = required(env, "GROQ_BASE_URL").replace(/\/$/, "");
const groqModel = required(env, "GROQ_CHAT_MODEL");
const groqResponse = await fetch(`${groqBaseUrl}/models`, {
  headers: { authorization: `Bearer ${required(env, "GROQ_API_KEY")}` },
  signal: AbortSignal.timeout(timeout)
});
const groq = await expectJson(groqResponse, "Groq");

const supabaseUrl = required(env, "SUPABASE_URL").replace(/\/$/, "");
const supabaseKey = required(env, "SUPABASE_SERVICE_ROLE_KEY");
const supabaseHeaders = { apikey: supabaseKey };
if (!supabaseKey.startsWith("sb_secret_")) {
  supabaseHeaders.authorization = `Bearer ${supabaseKey}`;
}
const supabaseResponse = await fetch(
  `${supabaseUrl}/rest/v1/settings?id=eq.1&select=id,timezone,day_boundary_hour,diary_final_time`,
  { headers: supabaseHeaders, signal: AbortSignal.timeout(timeout) }
);
const supabase = await expectJson(supabaseResponse, "Supabase");

console.log(JSON.stringify({
  event: "external_connections_verified",
  telegram: {
    connected: telegram.ok === true,
    botUsernameConfigured: Boolean(telegram.result?.username)
  },
  groq: {
    connected: Array.isArray(groq.data),
    configuredModel: groqModel,
    configuredModelAvailable: groq.data?.some((model) => model.id === groqModel) === true
  },
  supabase: {
    connected: Array.isArray(supabase) && supabase.length === 1,
    settingsConfigured: supabase[0]?.id === 1,
    timezone: supabase[0]?.timezone,
    dayBoundaryHour: supabase[0]?.day_boundary_hour,
    diaryFinalTime: supabase[0]?.diary_final_time
  }
}));
