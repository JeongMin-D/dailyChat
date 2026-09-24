import { timingSafeEqual } from "node:crypto";

export function isValidWebhookSecret(received, expected) {
  if (typeof received !== "string" || typeof expected !== "string") return false;
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length
    && timingSafeEqual(receivedBytes, expectedBytes);
}

export function parseTextUpdate(update) {
  const message = update?.message;
  if (
    !Number.isSafeInteger(update?.update_id)
    || !Number.isSafeInteger(message?.message_id)
    || !Number.isSafeInteger(message?.date)
    || !Number.isSafeInteger(message?.chat?.id)
    || !Number.isSafeInteger(message?.from?.id)
    || typeof message?.text !== "string"
    || message.text.trim().length === 0
  ) {
    return null;
  }

  return {
    updateId: update.update_id,
    messageId: message.message_id,
    chatId: String(message.chat.id),
    userId: String(message.from.id),
    sentAt: new Date(message.date * 1000),
    text: message.text.trim()
  };
}

export class TelegramClient {
  constructor({ token, timeoutMs, fetchImpl = fetch }) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async sendText(chatId, text) {
    const response = await this.fetch(`${this.baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Telegram send failed with status ${response.status}`);
    }
  }
}
