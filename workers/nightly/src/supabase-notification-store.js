import { notificationOutboxContract } from "../../../packages/contracts/src/index.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,100}$/;
const OUTBOX_STATUSES = new Set([
  "pending",
  "sending",
  "sent",
  "retryable_failed",
  "failed"
]);
const NOTIFICATION_TYPES = new Set(notificationOutboxContract.types);
const SAFETY_LEVELS = new Set(["none", "concern", "urgent"]);
const { maxRetryAfterSeconds: MAX_RETRY_AFTER_SECONDS } = notificationOutboxContract.delivery;

function hasValidSafetyRoute(value) {
  return SAFETY_LEVELS.has(value?.safetyLevel)
    && NOTIFICATION_TYPES.has(value?.notificationType)
    && notificationOutboxContract.safetyRouting[value.safetyLevel] === value.notificationType;
}

function codedError(code, message, fields = {}) {
  return Object.assign(new Error(message), { code, ...fields });
}

function requireUuid(name, value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a UUID`);
  }
}

export class SupabaseNotificationOutboxStore {
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

  async requestRpc(name, body) {
    const response = await this.fetch(`${this.baseUrl}/rpc/${name}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) {
      throw codedError(
        "SUPABASE_NOTIFICATION_RPC_FAILED",
        `Supabase ${name} failed with status ${response.status}`,
        { status: response.status }
      );
    }

    try {
      return await response.json();
    } catch {
      throw codedError(
        "SUPABASE_NOTIFICATION_INVALID_RESPONSE",
        `Supabase ${name} returned an invalid response`
      );
    }
  }

  async enqueue({ jobRunId, diaryId }) {
    requireUuid("jobRunId", jobRunId);
    requireUuid("diaryId", diaryId);
    const result = await this.requestRpc("enqueue_diary_notification", {
      p_job_run_id: jobRunId,
      p_diary_id: diaryId
    });
    if (
      !UUID_PATTERN.test(result?.notificationId ?? "")
      || result?.jobRunId !== jobRunId
      || result?.diaryId !== diaryId
      || !hasValidSafetyRoute(result)
      || !OUTBOX_STATUSES.has(result?.status)
    ) {
      throw codedError(
        "SUPABASE_NOTIFICATION_INVALID_RESPONSE",
        "Supabase enqueue_diary_notification returned an invalid response"
      );
    }
    return result;
  }

  async claim(notificationId) {
    requireUuid("notificationId", notificationId);
    const result = await this.requestRpc("claim_diary_notification", {
      p_notification_id: notificationId
    });
    if (result === null) return null;
    const commonInvalid = (
      result?.notificationId !== notificationId
      || !UUID_PATTERN.test(result?.jobRunId ?? "")
      || !UUID_PATTERN.test(result?.diaryId ?? "")
      || !hasValidSafetyRoute(result)
      || !/^-?\d+$/.test(result?.recipientChatId ?? "")
      || !Number.isInteger(result?.attempt)
      || result.attempt < 1
      || !/^\d{4}-\d{2}-\d{2}$/.test(result?.day ?? "")
      || !Number.isInteger(result?.version)
      || result.version < 1
      || !Array.isArray(result?.blocks)
    );
    const diaryPayloadInvalid = result?.notificationType === "daily_diary" && (
      typeof result?.title !== "string"
      || result.title.length === 0
      || result.blocks.length === 0
      || result.blocks.some((block, index) => (
        block?.position !== index
        || typeof block?.text !== "string"
        || block.text.length === 0
      ))
    );
    const safetyPayloadInvalid = result?.notificationType === "safety_guidance" && (
      result.title !== null || result.blocks.length !== 0
    );
    if (commonInvalid || diaryPayloadInvalid || safetyPayloadInvalid) {
      throw codedError(
        "SUPABASE_NOTIFICATION_INVALID_RESPONSE",
        "Supabase claim_diary_notification returned an invalid response"
      );
    }
    return result;
  }

  async markSent({ notificationId, providerMessageId }) {
    requireUuid("notificationId", notificationId);
    if (
      typeof providerMessageId !== "string"
      || providerMessageId.length < 1
      || providerMessageId.length > 100
    ) {
      throw new TypeError("providerMessageId must contain 1 to 100 characters");
    }
    const result = await this.requestRpc("complete_diary_notification", {
      p_notification_id: notificationId,
      p_provider_message_id: providerMessageId
    });
    if (result !== true) {
      throw codedError(
        "SUPABASE_NOTIFICATION_STATE_CONFLICT",
        "Notification was not in sending state"
      );
    }
  }

  async markFailed({ notificationId, errorCode, retryable, retryAfterSeconds = 0 }) {
    requireUuid("notificationId", notificationId);
    if (typeof errorCode !== "string" || !ERROR_CODE_PATTERN.test(errorCode)) {
      throw new TypeError("errorCode must be a stable uppercase code");
    }
    if (typeof retryable !== "boolean") throw new TypeError("retryable must be boolean");
    if (
      !Number.isInteger(retryAfterSeconds)
      || retryAfterSeconds < 0
      || retryAfterSeconds > MAX_RETRY_AFTER_SECONDS
    ) {
      throw new RangeError(
        `retryAfterSeconds must be between 0 and ${MAX_RETRY_AFTER_SECONDS}`
      );
    }
    const result = await this.requestRpc("fail_diary_notification", {
      p_notification_id: notificationId,
      p_error_code: errorCode,
      p_retryable: retryable,
      p_retry_after_seconds: retryAfterSeconds
    });
    if (result !== true) {
      throw codedError(
        "SUPABASE_NOTIFICATION_STATE_CONFLICT",
        "Notification was not in sending state"
      );
    }
  }
}
