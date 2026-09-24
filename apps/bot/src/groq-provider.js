const SYSTEM_PROMPT = `너는 사용자의 가까운 친구이자 일상 기록 파트너다.
편안하고 짧게, 보통 1~3문장으로 답한다. 한 번에 질문은 최대 하나만 한다.
사용자가 요청하지 않은 조언, 감정 단정, 의료 진단이나 처방은 하지 않는다.
사용자가 말하지 않은 사실을 지어내지 않는다.`;

export class GroqProvider {
  constructor({ apiKey, baseUrl, model, timeoutMs, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async generateReply({ text }) {
    const response = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text }
        ],
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
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
