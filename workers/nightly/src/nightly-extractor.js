import {
  nightlyExtractionSchema,
  validateNightlyExtraction
} from "../../../packages/contracts/src/index.js";
import { fetchWithRetry } from "../../../packages/core/src/http/fetch-with-retry.js";
import { createNightlyInputSnapshot } from "./nightly-input.js";
import {
  buildCorrectionMessage,
  buildNightlyExtractionMessages,
  NIGHTLY_PROMPT_VERSION
} from "./nightly-prompt.js";

function codedError(code, message, fields = {}) {
  return Object.assign(new Error(message), { code, ...fields });
}

function parseOutput(payload) {
  const message = payload?.choices?.[0]?.message;
  if (message?.refusal) {
    throw codedError("GROQ_EXTRACTION_REFUSED", "Groq refused the nightly extraction");
  }

  const content = message?.content?.trim();
  if (!content) {
    throw codedError("GROQ_EXTRACTION_EMPTY", "Groq returned an empty nightly extraction");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw codedError("GROQ_EXTRACTION_INVALID_JSON", "Groq returned invalid JSON");
  }
}

function safeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const result = {};
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
    if (Number.isFinite(usage[key])) result[key] = usage[key];
  }
  return Object.keys(result).length > 0 ? result : null;
}

export class GroqNightlyExtractor {
  constructor({
    apiKey,
    baseUrl = "https://api.groq.com/openai/v1",
    model = "openai/gpt-oss-120b",
    timeoutMs = 60_000,
    retry = { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 5_000 },
    fetchImpl = fetch,
    logger = null,
    promptVersion = NIGHTLY_PROMPT_VERSION
  }) {
    if (!apiKey) throw new TypeError("apiKey is required");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.retry = retry;
    this.fetch = fetchImpl;
    this.logger = logger;
    this.promptVersion = promptVersion;
  }

  async request(messages) {
    const response = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "nightly_extraction",
            strict: true,
            schema: nightlyExtractionSchema
          }
        }
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
      throw codedError(
        "GROQ_EXTRACTION_REQUEST_FAILED",
        `Groq nightly extraction failed with status ${response.status}`,
        { status: response.status }
      );
    }
    return response.json();
  }

  async extract({ snapshot, diaryTone = "warm", memorySummary = "", recentTitles = [] }) {
    if (snapshot?.version !== "1") {
      throw codedError("INVALID_INPUT_SNAPSHOT", "Unsupported nightly input snapshot version");
    }

    const canonical = createNightlyInputSnapshot({
      day: snapshot.day,
      messages: snapshot.messages
    }).snapshot;
    if (canonical.messages.length === 0) {
      return {
        status: "skipped",
        reason: "no_user_messages",
        attempts: 0,
        output: null
      };
    }

    const allowedMessageIds = canonical.messages.map(({ id }) => id);
    const messages = buildNightlyExtractionMessages({
      snapshot: canonical,
      diaryTone,
      memorySummary,
      recentTitles
    });

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const payload = await this.request(messages);
      let output;
      try {
        output = parseOutput(payload);
      } catch (error) {
        if (error.code === "GROQ_EXTRACTION_REFUSED" || attempt === 2) throw error;
        this.logger?.warn("nightly_extraction_correction_requested", {
          attempt,
          reason: error.code
        });
        messages.push(buildCorrectionMessage([{
          instancePath: "",
          keyword: "json",
          message: error.message
        }]));
        continue;
      }

      const validation = validateNightlyExtraction(output, {
        allowedMessageIds,
        expectedDay: canonical.day
      });
      if (validation.valid) {
        return {
          status: "completed",
          attempts: attempt,
          output,
          provider: "groq",
          model: this.model,
          promptVersion: this.promptVersion,
          schemaVersion: output.schemaVersion,
          usage: safeUsage(payload.usage)
        };
      }

      if (attempt === 2) {
        throw codedError(
          "INVALID_NIGHTLY_EXTRACTION",
          "Groq nightly extraction failed local validation",
          { validationErrors: validation.errors }
        );
      }

      this.logger?.warn("nightly_extraction_correction_requested", {
        attempt,
        reason: "INVALID_NIGHTLY_EXTRACTION",
        errorCount: validation.errors.length
      });
      messages.push(buildCorrectionMessage(validation.errors));
    }

    throw codedError("INVALID_NIGHTLY_EXTRACTION", "Nightly extraction ended unexpectedly");
  }
}
