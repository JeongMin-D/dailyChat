function required(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function integer(env, name, fallback, { min, max }) {
  const raw = env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function url(env, name, fallback) {
  const raw = fallback === undefined ? required(env, name) : env[name]?.trim() || fallback;
  try {
    return new URL(raw).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

export function loadConfig(env = process.env) {
  return Object.freeze({
    port: integer(env, "PORT", 3000, { min: 1, max: 65535 }),
    bodyLimitBytes: integer(env, "HTTP_BODY_LIMIT_BYTES", 1_048_576, {
      min: 1_024,
      max: 10_485_760
    }),
    upstreamTimeoutMs: integer(env, "UPSTREAM_TIMEOUT_MS", 15_000, {
      min: 1_000,
      max: 120_000
    }),
    timeZone: env.APP_TIMEZONE?.trim() || "Asia/Seoul",
    dayBoundaryHour: integer(env, "DAY_BOUNDARY_HOUR", 4, { min: 0, max: 23 }),
    telegram: {
      token: required(env, "TELEGRAM_BOT_TOKEN"),
      webhookSecret: required(env, "TELEGRAM_WEBHOOK_SECRET"),
      allowedUserId: required(env, "TELEGRAM_ALLOWED_USER_ID"),
      allowedChatId: required(env, "TELEGRAM_ALLOWED_CHAT_ID")
    },
    groq: {
      apiKey: required(env, "GROQ_API_KEY"),
      baseUrl: url(env, "GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
      model: env.GROQ_CHAT_MODEL?.trim() || "openai/gpt-oss-120b"
    },
    supabase: {
      url: url(env, "SUPABASE_URL"),
      serviceRoleKey: required(env, "SUPABASE_SERVICE_ROLE_KEY")
    }
  });
}
