import { validateNightlyExtraction } from "../../../packages/contracts/src/index.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const PREPARE_ACTIONS = new Set([
  "created",
  "noop",
  "resume",
  "in_progress",
  "terminal_failed"
]);

function codedError(code, message, fields = {}) {
  return Object.assign(new Error(message), { code, ...fields });
}

export class SupabaseNightlyOutputStore {
  constructor({ url, serviceRoleKey, timeoutMs, fetchImpl = fetch }) {
    if (!url || !serviceRoleKey) throw new TypeError("url and serviceRoleKey are required");
    this.baseUrl = `${url.replace(/\/$/, "")}/rest/v1`;
    this.headers = {
      apikey: serviceRoleKey,
      "content-type": "application/json"
    };
    if (!serviceRoleKey.startsWith("sb_secret_")) {
      this.headers.authorization = `Bearer ${serviceRoleKey}`;
    }
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async requestRpc(name, body, errorCode) {
    const response = await this.fetch(`${this.baseUrl}/rpc/${name}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) {
      throw codedError(
        errorCode,
        `Supabase ${name} failed with status ${response.status}`,
        { status: response.status }
      );
    }

    try {
      return await response.json();
    } catch {
      throw codedError(
        "SUPABASE_NIGHTLY_INVALID_RESPONSE",
        `Supabase ${name} returned an invalid response`
      );
    }
  }

  async prepareRun({
    day,
    pipelineVersion,
    inputHash,
    provider,
    model,
    promptVersion,
    schemaVersion
  }) {
    if (!DAY_PATTERN.test(day)) throw new TypeError("day must use YYYY-MM-DD format");
    if (new Date(`${day}T00:00:00.000Z`).toISOString().slice(0, 10) !== day) {
      throw new RangeError("day must be a valid calendar date");
    }
    if (!HASH_PATTERN.test(inputHash)) {
      throw new TypeError("inputHash must be a lowercase SHA-256 hex string");
    }
    const values = { pipelineVersion, provider, model, promptVersion, schemaVersion };
    for (const [name, value] of Object.entries(values)) {
      if (typeof value !== "string" || value.length === 0) {
        throw new TypeError(`${name} must be a non-empty string`);
      }
    }

    const result = await this.requestRpc("prepare_nightly_job", {
      p_day: day,
      p_pipeline_version: pipelineVersion,
      p_input_hash: inputHash,
      p_provider: provider,
      p_model: model,
      p_prompt_version: promptVersion,
      p_schema_version: schemaVersion
    }, "SUPABASE_NIGHTLY_PREPARE_FAILED");
    if (
      !PREPARE_ACTIONS.has(result?.action)
      || typeof result?.jobRunId !== "string"
      || !UUID_PATTERN.test(result.jobRunId)
      || (
        result.action === "noop"
        && (
          typeof result.diaryId !== "string"
          || !UUID_PATTERN.test(result.diaryId)
          || !Number.isInteger(result.diaryVersion)
          || result.diaryVersion < 1
        )
      )
    ) {
      throw codedError(
        "SUPABASE_NIGHTLY_INVALID_RESPONSE",
        "Supabase prepare_nightly_job returned an invalid response"
      );
    }
    return result;
  }

  async save({ jobRunId, output, snapshot }) {
    if (typeof jobRunId !== "string" || !UUID_PATTERN.test(jobRunId)) {
      throw new TypeError("jobRunId must be a UUID");
    }
    if (!snapshot || !Array.isArray(snapshot.messages)) {
      throw new TypeError("snapshot with messages is required");
    }
    const validation = validateNightlyExtraction(output, {
      expectedDay: snapshot.day,
      allowedMessageIds: snapshot.messages.map(({ id }) => id)
    });
    if (!validation.valid) {
      throw codedError(
        "INVALID_NIGHTLY_EXTRACTION",
        "Nightly extraction does not match the save contract",
        { validationErrors: validation.errors }
      );
    }

    const result = await this.requestRpc("persist_nightly_extraction_versioned", {
        p_job_run_id: jobRunId,
        p_result: output
      }, "SUPABASE_NIGHTLY_SAVE_FAILED");
    if (
      result?.jobRunId !== jobRunId
      || !new Set(["saved", "noop"]).has(result?.action)
      || typeof result?.diaryId !== "string"
      || !UUID_PATTERN.test(result.diaryId)
      || !Number.isInteger(result?.diaryVersion)
      || result.diaryVersion < 1
    ) {
      throw codedError(
        "SUPABASE_NIGHTLY_INVALID_RESPONSE",
        "Supabase nightly save returned an invalid response"
      );
    }
    return result;
  }
}
