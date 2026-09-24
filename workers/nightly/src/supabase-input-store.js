const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class SupabaseNightlyInputStore {
  constructor({ url, serviceRoleKey, timeoutMs, pageSize = 1000, fetchImpl = fetch }) {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
      throw new RangeError("pageSize must be an integer from 1 to 1000");
    }
    this.baseUrl = `${url.replace(/\/$/, "")}/rest/v1`;
    this.headers = { apikey: serviceRoleKey };
    if (!serviceRoleKey.startsWith("sb_secret_")) {
      this.headers.authorization = `Bearer ${serviceRoleKey}`;
    }
    this.timeoutMs = timeoutMs;
    this.pageSize = pageSize;
    this.fetch = fetchImpl;
  }

  async listUserMessagesForDay(day) {
    if (typeof day !== "string" || !DAY_PATTERN.test(day)) {
      throw new TypeError("day must use YYYY-MM-DD format");
    }
    if (new Date(`${day}T00:00:00.000Z`).toISOString().slice(0, 10) !== day) {
      throw new RangeError("day must be a valid calendar date");
    }

    const messages = [];
    for (let offset = 0; ; offset += this.pageSize) {
      const params = new URLSearchParams({
        day: `eq.${day}`,
        role: "eq.user",
        select: "id,sent_at,content",
        order: "sent_at.asc,id.asc",
        limit: String(this.pageSize),
        offset: String(offset)
      });
      const response = await this.fetch(`${this.baseUrl}/messages?${params}`, {
        method: "GET",
        headers: this.headers,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!response.ok) {
        throw new Error(`Supabase input query failed with status ${response.status}`);
      }
      const page = await response.json();
      if (!Array.isArray(page)) throw new TypeError("Supabase input query must return an array");
      messages.push(...page);
      if (page.length < this.pageSize) return messages;
    }
  }
}
