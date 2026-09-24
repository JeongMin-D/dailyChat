import { createHash } from "node:crypto";

import { nightlyInputSnapshotContract } from "../../../packages/contracts/src/index.js";
import { getLastClosedLocalDay } from "../../../packages/core/src/time/local-day.js";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertDay(day) {
  if (typeof day !== "string" || !DAY_PATTERN.test(day)) {
    throw new TypeError("day must use YYYY-MM-DD format");
  }
  const normalized = new Date(`${day}T00:00:00.000Z`).toISOString().slice(0, 10);
  if (normalized !== day) throw new RangeError("day must be a valid calendar date");
}

function canonicalMessage(message) {
  if (!message || typeof message.id !== "string" || !UUID_PATTERN.test(message.id)) {
    throw new TypeError("snapshot message id must be a UUID");
  }
  if (typeof message.content !== "string" || message.content.length === 0) {
    throw new TypeError("snapshot message content must be a non-empty string");
  }

  const instant = new Date(message.sentAt ?? message.sent_at);
  if (Number.isNaN(instant.getTime())) {
    throw new TypeError("snapshot message sentAt must be a valid timestamp");
  }

  return {
    id: message.id,
    sentAt: instant.toISOString(),
    content: message.content
  };
}

/**
 * Scheduler가 새 nightly job에 명시할, 완전히 닫힌 최근 local day를 선택한다.
 */
export function selectNightlyTargetDay(now, options = {}) {
  return getLastClosedLocalDay(now, options);
}

/**
 * 순서와 필드가 고정된 canonical snapshot과 lowercase SHA-256을 만든다.
 * 원문 snapshot은 실행 중 검증/LLM 입력에만 사용하며 job_runs에는 hash만 저장한다.
 */
export function createNightlyInputSnapshot({ day, messages }) {
  assertDay(day);
  if (!Array.isArray(messages)) throw new TypeError("messages must be an array");

  const canonicalMessages = messages.map(canonicalMessage).sort((left, right) => {
    const timeOrder = left.sentAt.localeCompare(right.sentAt);
    return timeOrder || left.id.localeCompare(right.id);
  });
  const ids = new Set(canonicalMessages.map(({ id }) => id));
  if (ids.size !== canonicalMessages.length) {
    throw new Error("snapshot message ids must be unique");
  }

  const snapshot = {
    version: nightlyInputSnapshotContract.version,
    day,
    messages: canonicalMessages
  };
  const canonicalJson = JSON.stringify(snapshot);
  const inputHash = createHash("sha256").update(canonicalJson, "utf8").digest("hex");

  return { snapshot, inputHash };
}

/**
 * 명시된 job day의 user messages를 읽어 snapshot을 준비한다.
 */
export async function prepareNightlyInput({ day, store }) {
  assertDay(day);
  if (!store || typeof store.listUserMessagesForDay !== "function") {
    throw new TypeError("store.listUserMessagesForDay is required");
  }
  const messages = await store.listUserMessagesForDay(day);
  return createNightlyInputSnapshot({ day, messages });
}
