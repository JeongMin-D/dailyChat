export const jobRunStatuses = [
  "queued",
  "running",
  "succeeded",
  "retryable_failed",
  "failed"
];

export const notificationStatuses = [
  "pending",
  "sending",
  "sent",
  "retryable_failed",
  "failed"
];

export const jobRunTransitions = {
  queued: ["running"],
  running: ["succeeded", "retryable_failed", "failed"],
  retryable_failed: ["running", "failed"],
  succeeded: [],
  failed: []
};

export const notificationTransitions = {
  pending: ["sending"],
  sending: ["sent", "retryable_failed", "failed"],
  retryable_failed: ["sending", "failed"],
  sent: [],
  failed: []
};

export const notificationOutboxContract = {
  channels: ["telegram"],
  types: ["daily_diary", "safety_guidance"],
  payloadPolicy: "reference-only",
  requiredReferences: ["job_run_id", "diary_id"],
  idempotency: {
    column: "idempotency_key",
    unique: true
  },
  claimableStatuses: ["pending", "retryable_failed"],
  staleClaimStatus: "sending",
  staleAfterMinutes: 5,
  delivery: {
    maxAttempts: 5,
    maxRetryAfterSeconds: 86_400,
    telegramMaxTextLength: 4_096
  },
  safetyRouting: {
    none: "daily_diary",
    concern: "daily_diary",
    urgent: "safety_guidance",
    urgentPayloadPolicy: "fixed-guidance-only",
    automaticReporting: false
  }
};

export const jobRunReproducibilityContract = {
  nightlyJobType: "nightly",
  requiredFields: [
    "day",
    "pipeline_version",
    "input_hash",
    "provider",
    "model",
    "prompt_version",
    "schema_version"
  ],
  inputHash: {
    algorithm: "sha256",
    encoding: "lowercase-hex",
    pattern: "^[0-9a-f]{64}$"
  },
  provider: "groq",
  schemaVersions: ["1.0.0"]
};

export const nightlyInputSnapshotContract = {
  version: "1",
  role: "user",
  messageFields: ["id", "sentAt", "content"],
  order: ["sentAt", "id"],
  serialization: "utf8-json",
  hash: jobRunReproducibilityContract.inputHash
};
