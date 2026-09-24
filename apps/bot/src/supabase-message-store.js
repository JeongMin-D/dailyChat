export class SupabaseMessageStore {
  constructor({ url, serviceRoleKey, timeoutMs, fetchImpl = fetch }) {
    this.baseUrl = `${url}/rest/v1`;
    this.headers = {
      apikey: serviceRoleKey,
      "content-type": "application/json"
    };
    // Modern sb_secret_ keys are not JWTs and must not be sent as Bearer tokens.
    // Keep Authorization only for the legacy service_role JWT during migration.
    if (!serviceRoleKey.startsWith("sb_secret_")) {
      this.headers.authorization = `Bearer ${serviceRoleKey}`;
    }
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async request(path, options = {}) {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...this.headers, ...options.headers },
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Supabase request failed with status ${response.status}`);
    }

    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async claimUpdate(updateId) {
    return this.request("/rpc/claim_telegram_update", {
      method: "POST",
      body: JSON.stringify({ p_update_id: updateId })
    });
  }

  async saveUserMessage(message) {
    await this.request("/messages", {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        telegram_update_id: message.updateId,
        telegram_message_id: message.messageId,
        telegram_chat_id: Number(message.chatId),
        role: "user",
        content: message.text,
        sent_at: message.sentAt.toISOString(),
        day: message.day,
        metadata: { telegram_user_id: message.userId }
      })
    });
  }

  async findAssistantReply(updateId) {
    const rows = await this.request(
      `/messages?role=eq.assistant&reply_to_update_id=eq.${updateId}&select=content&limit=1`,
      { method: "GET" }
    );
    return rows?.[0]?.content ?? null;
  }

  async saveAssistantReply({ updateId, chatId, text, sentAt, day }) {
    await this.request("/messages", {
      method: "POST",
      headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        reply_to_update_id: updateId,
        telegram_chat_id: Number(chatId),
        role: "assistant",
        content: text,
        sent_at: sentAt.toISOString(),
        day
      })
    });
  }

  async completeUpdate(updateId) {
    await this.updateStatus(updateId, {
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  async failUpdate(updateId, errorCode, retryable = true) {
    await this.updateStatus(updateId, {
      status: retryable ? "retryable_failed" : "failed",
      last_error_code: errorCode,
      updated_at: new Date().toISOString()
    });
  }

  async updateStatus(updateId, values) {
    await this.request(`/telegram_updates?update_id=eq.${updateId}`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify(values)
    });
  }
}
