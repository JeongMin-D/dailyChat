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
  types: ["daily_diary"],
  payloadPolicy: "reference-only",
  requiredReferences: ["job_run_id", "diary_id"],
  idempotency: {
    column: "idempotency_key",
    unique: true
  },
  claimableStatuses: ["pending", "retryable_failed"],
  staleClaimStatus: "sending",
  staleAfterMinutes: 5
};
