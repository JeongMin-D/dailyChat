import { loadConfig } from "./config.js";
import { createConversationService } from "./conversation-service.js";
import { GroqProvider } from "./groq-provider.js";
import { createHttpServer } from "./http-server.js";
import { loadSoulPrompt } from "./prompt-context.js";
import { SupabaseMessageStore } from "./supabase-message-store.js";
import { TelegramClient } from "./telegram.js";
import { createJsonLogger } from "../../../packages/observability/src/json-logger.js";

const config = loadConfig();
const systemPrompt = await loadSoulPrompt();
const logger = createJsonLogger({ service: "dailychat-bot", level: config.logLevel });
const store = new SupabaseMessageStore({
  ...config.supabase,
  timeoutMs: config.upstreamTimeoutMs
});
const llm = new GroqProvider({
  ...config.groq,
  timeoutMs: config.upstreamTimeoutMs
});
const telegram = new TelegramClient({
  token: config.telegram.token,
  timeoutMs: config.upstreamTimeoutMs
});
const conversation = createConversationService({
  config,
  store,
  llm,
  telegram,
  systemPrompt,
  logger
});
const server = createHttpServer({
  conversation,
  bodyLimitBytes: config.bodyLimitBytes,
  logger
});

server.listen(config.port, "0.0.0.0", () => {
  logger.info("bot_started", { host: "0.0.0.0", port: config.port });
});
