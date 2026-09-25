const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function ensureArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must return an array`);
  return value;
}

function uniqueDays(rows) {
  return [...new Set(rows.map(({ day }) => day).filter((day) => DAY_PATTERN.test(day)))];
}

export class SupabaseDashboardStore {
  constructor({ url, serviceRoleKey, timeoutMs = 15_000, fetchImpl = fetch }) {
    if (!url || !serviceRoleKey) throw new TypeError("url and serviceRoleKey are required");
    this.baseUrl = `${url.replace(/\/$/, "")}/rest/v1`;
    this.headers = { apikey: serviceRoleKey };
    if (!serviceRoleKey.startsWith("sb_secret_")) {
      this.headers.authorization = `Bearer ${serviceRoleKey}`;
    }
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async rows(table, params) {
    const response = await this.fetch(`${this.baseUrl}/${table}?${params}`, {
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) {
      throw Object.assign(new Error(`Dashboard query failed with status ${response.status}`), {
        code: "DASHBOARD_QUERY_FAILED",
        status: response.status
      });
    }
    return ensureArray(await response.json(), table);
  }

  /** @param {{day?: string, query?: string}} [options] */
  async load({ day, query = "" } = {}) {
    if (day && !DAY_PATTERN.test(day)) throw new TypeError("day must use YYYY-MM-DD format");
    const diaryIndexParams = new URLSearchParams({
      select: "id,day,version,title,summary_mood,tags,created_at",
      order: "day.desc,version.desc",
      limit: "60"
    });
    const messageDayParams = new URLSearchParams({
      select: "day",
      role: "eq.user",
      order: "day.desc",
      limit: "1"
    });
    const [diaryIndex, latestMessages] = await Promise.all([
      this.rows("diaries", diaryIndexParams),
      this.rows("messages", messageDayParams)
    ]);
    const availableDays = uniqueDays([...diaryIndex, ...latestMessages]);
    const selectedDay = day || availableDays[0] || new Date().toISOString().slice(0, 10);

    const dayFilter = `eq.${selectedDay}`;
    const requests = [
      ["messages", { select: "id,role,content,sent_at", day: dayFilter, order: "sent_at.asc", limit: "500" }],
      ["events", { select: "id,type,summary,occurred_at,keywords,confidence", day: dayFilter, order: "occurred_at.asc.nullslast,created_at.asc", limit: "200" }],
      ["mood_entries", { select: "id,score,label,source,confidence,created_at", day: dayFilter, order: "created_at.asc", limit: "100" }],
      ["health_entries", { select: "id,symptom,severity,note,occurred_at,confidence,created_at", day: dayFilter, order: "occurred_at.asc.nullslast,created_at.asc", limit: "100" }],
      ["diaries", { select: "id,day,version,title,summary_mood,tags,created_at", day: dayFilter, order: "version.desc", limit: "1" }]
    ].map(([table, values]) => this.rows(table, new URLSearchParams(values)));
    const [messages, events, moods, health, diaries] = await Promise.all(requests);
    const diary = diaries[0] || null;
    const blocks = diary
      ? await this.rows("diary_blocks", new URLSearchParams({
        select: "id,position,text",
        diary_id: `eq.${diary.id}`,
        order: "position.asc"
      }))
      : [];

    const trendParams = new URLSearchParams({
      select: "day,score,label",
      order: "day.desc,created_at.desc",
      limit: "14"
    });
    const recentMoods = await this.rows("mood_entries", trendParams);
    const normalizedQuery = query.trim().slice(0, 100).toLocaleLowerCase("ko-KR");
    const searchable = [
      ...messages.map((item) => ({ kind: item.role === "user" ? "내 메시지" : "챗봇", text: item.content, at: item.sent_at })),
      ...events.map((item) => ({ kind: "이벤트", text: item.summary, at: item.occurred_at })),
      ...blocks.map((item) => ({ kind: "일기", text: item.text, at: diary?.created_at }))
    ];
    const searchResults = normalizedQuery
      ? searchable.filter(({ text }) => text.toLocaleLowerCase("ko-KR").includes(normalizedQuery)).slice(0, 50)
      : [];

    return {
      selectedDay,
      availableDays: uniqueDays([...diaryIndex, { day: selectedDay }]),
      diaryIndex,
      messages,
      events,
      moods,
      health,
      diary,
      blocks,
      recentMoods,
      query: query.trim().slice(0, 100),
      searchResults
    };
  }
}
