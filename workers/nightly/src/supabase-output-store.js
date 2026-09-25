import { validateNightlyExtraction } from "../../../packages/contracts/src/index.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  async save({ jobRunId, output, snapshot, diaryVersion = 1 }) {
    if (typeof jobRunId !== "string" || !UUID_PATTERN.test(jobRunId)) {
      throw new TypeError("jobRunId must be a UUID");
    }
    if (!snapshot || !Array.isArray(snapshot.messages)) {
      throw new TypeError("snapshot with messages is required");
    }
    if (!Number.isInteger(diaryVersion) || diaryVersion < 1) {
      throw new RangeError("diaryVersion must be a positive integer");
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

    const response = await this.fetch(`${this.baseUrl}/rpc/persist_nightly_extraction`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        p_job_run_id: jobRunId,
        p_result: output,
        p_diary_version: diaryVersion
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) {
      throw codedError(
        "SUPABASE_NIGHTLY_SAVE_FAILED",
        `Supabase nightly save failed with status ${response.status}`,
        { status: response.status }
      );
    }

    let result;
    try {
      result = await response.json();
    } catch {
      throw codedError(
        "SUPABASE_NIGHTLY_SAVE_INVALID_RESPONSE",
        "Supabase nightly save returned an invalid response"
      );
    }
    if (
      result?.jobRunId !== jobRunId
      || typeof result?.diaryId !== "string"
      || !UUID_PATTERN.test(result.diaryId)
    ) {
      throw codedError(
        "SUPABASE_NIGHTLY_SAVE_INVALID_RESPONSE",
        "Supabase nightly save returned an invalid response"
      );
    }
    return result;
  }
}
