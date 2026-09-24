import { loadConfig } from "./config.js";
import { createConversationService } from "./conversation-service.js";
import { GroqProvider } from "./groq-provider.js";
import { createHttpServer } from "./http-server.js";
import { loadSoulPrompt } from "./prompt-context.js";
import { SupabaseMessageStore } from "./supabase-message-store.js";
import { TelegramClient } from "./telegram.js";

const config = loadConfig();
const systemPrompt = await loadSoulPrompt();
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
const conversation = createConversationService({ config, store, llm, telegram, systemPrompt });
const server = createHttpServer({
  conversation,
  bodyLimitBytes: config.bodyLimitBytes
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "bot_started", host: "0.0.0.0", port: config.port }));
});
