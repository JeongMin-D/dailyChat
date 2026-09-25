import assert from "node:assert/strict";
import test from "node:test";
import {
  jobRunStatuses,
  jobRunTransitions,
  notificationOutboxContract,
  notificationStatuses,
  notificationTransitions
} from "../src/index.js";

function assertTransitionMap(statuses, transitions) {
  assert.deepEqual(Object.keys(transitions).sort(), [...statuses].sort());

  for (const [from, destinations] of Object.entries(transitions)) {
    assert.ok(statuses.includes(from));
    assert.equal(new Set(destinations).size, destinations.length);
    for (const destination of destinations) {
      assert.ok(statuses.includes(destination));
    }
  }
}

test("job run과 notification 상태 전이는 선언된 상태 안에서만 이동한다", () => {
  assertTransitionMap(jobRunStatuses, jobRunTransitions);
  assertTransitionMap(notificationStatuses, notificationTransitions);
  assert.deepEqual(jobRunTransitions.succeeded, []);
  assert.deepEqual(notificationTransitions.sent, []);
});

test("outbox는 본문 대신 참조와 고유 멱등 키만 저장한다", () => {
  assert.equal(notificationOutboxContract.payloadPolicy, "reference-only");
  assert.deepEqual(notificationOutboxContract.requiredReferences, ["job_run_id", "diary_id"]);
  assert.equal(notificationOutboxContract.idempotency.unique, true);
  assert.deepEqual(notificationOutboxContract.channels, ["telegram"]);
  assert.deepEqual(notificationOutboxContract.types, ["daily_diary"]);
});

test("claim 계약은 재시도 가능 상태와 stale 회수 시간을 고정한다", () => {
  assert.deepEqual(notificationOutboxContract.claimableStatuses, ["pending", "retryable_failed"]);
  assert.equal(notificationOutboxContract.staleClaimStatus, "sending");
  assert.equal(notificationOutboxContract.staleAfterMinutes, 5);
  assert.deepEqual(notificationOutboxContract.delivery, {
    maxAttempts: 5,
    maxRetryAfterSeconds: 86_400,
    telegramMaxTextLength: 4_096
  });
});
