import { fetchWithRetry } from "./upstream-retry.js";

export class GroqProvider {
  constructor({ apiKey, baseUrl, model, timeoutMs, retry, fetchImpl = fetch, logger = null }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.retry = retry;
    this.fetch = fetchImpl;
    this.logger = logger;
  }

  async generateReply({ messages }) {
    const response = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7
      })
    }, {
      timeoutMs: this.timeoutMs,
      ...this.retry,
      fetchImpl: this.fetch,
      onRetry: (details) => this.logger?.warn("upstream_retry_scheduled", {
        upstream: "groq",
        ...details
      })
    });

    if (!response.ok) {
      throw new Error(`Groq request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Groq returned an empty response");
    return content;
  }
}
