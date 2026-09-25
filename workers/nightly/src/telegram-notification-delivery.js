import { notificationOutboxContract } from "../../../packages/contracts/src/index.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const {
  maxAttempts: DEFAULT_MAX_ATTEMPTS,
  maxRetryAfterSeconds: MAX_RETRY_AFTER_SECONDS,
  telegramMaxTextLength: MAX_TELEGRAM_TEXT_LENGTH
} = notificationOutboxContract.delivery;

function truncateWithoutBreakingSurrogatePair(text, maxLength) {
  if (text.length <= maxLength) return text;
  let truncated = text.slice(0, maxLength);
  const last = truncated.charCodeAt(truncated.length - 1);
  if (last >= 0xD800 && last <= 0xDBFF) truncated = truncated.slice(0, -1);
  return truncated;
}

export function formatDiaryNotification(payload, maxLength = MAX_TELEGRAM_TEXT_LENGTH) {
  if (!Number.isInteger(maxLength) || maxLength < 32 || maxLength > MAX_TELEGRAM_TEXT_LENGTH) {
    throw new RangeError("maxLength must be between 32 and 4096");
  }
  if (
    payload?.notificationType !== "daily_diary"
    || !new Set(["none", "concern"]).has(payload?.safetyLevel)
    || typeof payload?.day !== "string"
    || typeof payload?.title !== "string"
    || !Number.isInteger(payload?.version)
    || !Array.isArray(payload?.blocks)
    || payload.blocks.length === 0
  ) {
    throw new TypeError("A complete diary payload is required");
  }

  const concernPrefix = payload.safetyLevel === "concern"
    ? "오늘은 마음이 많이 힘들었을 수 있어요. 아래 기록은 대화에서 확인된 내용만 담았어요.\n\n"
    : "";
  const header = `📖 ${payload.day} 일기\n${payload.title}`;
  const body = payload.blocks.map(({ text }) => text).join("\n\n");
  const fullText = `${concernPrefix}${header}\n\n${body}\n\n(v${payload.version})`;
  if (fullText.length <= maxLength) return fullText;

  const suffix = "\n\n…(일부 생략)";
  return `${truncateWithoutBreakingSurrogatePair(
    fullText,
    maxLength - suffix.length
  )}${suffix}`;
}

export const SAFETY_GUIDANCE_TEXT = `지금 안전한가요?

지금 당장 자신이나 다른 사람을 해칠 위험이 있다면 혼자 있지 말고 가까운 사람에게 알린 뒤 112 또는 119에 연락해 주세요.

24시간 도움:
- 자살예방 상담전화 109
- 정신건강 위기상담전화 1577-0199

가능하다면 답장으로 지금 안전한지 알려주세요. 이 안내는 진단이나 자동 신고가 아니며, 일반 일기는 자동 발송하지 않았어요.`;

export function formatSafetyGuidanceNotification(payload) {
  if (
    payload?.notificationType !== "safety_guidance"
    || payload?.safetyLevel !== "urgent"
  ) {
    throw new TypeError("An urgent safety guidance payload is required");
  }
  return SAFETY_GUIDANCE_TEXT;
}

export function formatTelegramNotification(payload) {
  if (payload?.notificationType === "daily_diary") {
    return formatDiaryNotification(payload);
  }
  if (payload?.notificationType === "safety_guidance") {
    return formatSafetyGuidanceNotification(payload);
  }
  throw new TypeError("Unsupported notification type");
}

function classifyTelegramFailure(error) {
  const status = Number(error?.status);
  if (status === 429) return { code: "TELEGRAM_RATE_LIMITED", retryable: true };
  if (status >= 500 && status <= 599) {
    return { code: "TELEGRAM_SERVER_ERROR", retryable: true };
  }
  if (status === 401 || status === 403) {
    return { code: "TELEGRAM_AUTH_FAILED", retryable: false };
  }
  if (status >= 400 && status <= 499) {
    return { code: "TELEGRAM_REQUEST_REJECTED", retryable: false };
  }
  if (error?.code === "TELEGRAM_INVALID_RESPONSE") {
    return { code: "TELEGRAM_INVALID_RESPONSE", retryable: true };
  }
  return { code: "TELEGRAM_NETWORK_ERROR", retryable: true };
}

function retryDelaySeconds({ attempt, baseDelaySeconds, maxDelaySeconds, serverDelaySeconds }) {
  const exponential = Math.min(maxDelaySeconds, baseDelaySeconds * (2 ** (attempt - 1)));
  return Math.min(maxDelaySeconds, Math.max(exponential, serverDelaySeconds ?? 0));
}

export class TelegramNotificationDelivery {
  constructor({
    store,
    telegramClient,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelaySeconds = 60,
    maxDelaySeconds = 3_600
  }) {
    if (!store || !telegramClient) throw new TypeError("store and telegramClient are required");
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RangeError("maxAttempts must be positive");
    }
    if (
      !Number.isInteger(baseDelaySeconds)
      || !Number.isInteger(maxDelaySeconds)
      || baseDelaySeconds < 0
      || maxDelaySeconds < baseDelaySeconds
      || maxDelaySeconds > MAX_RETRY_AFTER_SECONDS
    ) {
      throw new RangeError("retry delays must be ordered integers from 0 to 86400 seconds");
    }
    this.store = store;
    this.telegramClient = telegramClient;
    this.maxAttempts = maxAttempts;
    this.baseDelaySeconds = baseDelaySeconds;
    this.maxDelaySeconds = maxDelaySeconds;
  }

  async deliver(notificationId) {
    if (typeof notificationId !== "string" || !UUID_PATTERN.test(notificationId)) {
      throw new TypeError("notificationId must be a UUID");
    }

    const payload = await this.store.claim(notificationId);
    if (payload === null) return { action: "not_claimed", notificationId };

    let messageId;
    try {
      ({ messageId } = await this.telegramClient.sendText(
        payload.recipientChatId,
        formatTelegramNotification(payload)
      ));
    } catch (error) {
      const failure = classifyTelegramFailure(error);
      const retryable = failure.retryable && payload.attempt < this.maxAttempts;
      const serverDelay = Number(error?.retryAfterSeconds);
      const retryAfterSeconds = retryable
        ? retryDelaySeconds({
            attempt: payload.attempt,
            baseDelaySeconds: this.baseDelaySeconds,
            maxDelaySeconds: this.maxDelaySeconds,
            serverDelaySeconds: Number.isInteger(serverDelay) && serverDelay >= 0
              ? serverDelay
              : null
          })
        : 0;

      await this.store.markFailed({
        notificationId,
        errorCode: failure.code,
        retryable,
        retryAfterSeconds
      });
      return {
        action: retryable ? "retry_scheduled" : "failed",
        notificationId,
        errorCode: failure.code,
        retryAfterSeconds
      };
    }

    await this.store.markSent({ notificationId, providerMessageId: messageId });
    return { action: "sent", notificationId, providerMessageId: messageId };
  }
}
