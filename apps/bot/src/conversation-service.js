import { getLocalDay } from "../../../packages/core/src/time/local-day.js";
import { buildConversationMessages } from "./prompt-context.js";
import { isValidWebhookSecret, parseTextUpdate } from "./telegram.js";

function errorCode(error) {
  if (error?.name === "TimeoutError") return "UPSTREAM_TIMEOUT";
  return "CONVERSATION_FAILED";
}

/**
 * @param {{
 *   config: any,
 *   store: any,
 *   llm: any,
 *   telegram: any,
 *   systemPrompt: string,
 *   logger?: Pick<import("../../../packages/observability/src/json-logger.js").JsonLogger, "error">
 * }} options
 */
export function createConversationService({
  config,
  store,
  llm,
  telegram,
  systemPrompt,
  logger = console
}) {
  return {
    async handle({ secret, update, requestId = undefined }) {
      if (!isValidWebhookSecret(secret, config.telegram.webhookSecret)) {
        return { status: 401, result: "unauthorized" };
      }

      const message = parseTextUpdate(update);
      if (!message) return { status: 200, result: "ignored" };

      if (
        message.userId !== config.telegram.allowedUserId
        || message.chatId !== config.telegram.allowedChatId
      ) {
        return { status: 200, result: "ignored" };
      }

      const claimed = await store.claimUpdate(message.updateId);
      if (!claimed) return { status: 200, result: "duplicate" };

      try {
        const day = getLocalDay(message.sentAt, {
          timeZone: config.timeZone,
          boundaryHour: config.dayBoundaryHour
        });

        await store.saveUserMessage({ ...message, day });

        let reply = await store.findAssistantReply(message.updateId);
        if (!reply) {
          const history = config.conversation.historyLimit === 0
            ? []
            : await store.listRecentMessages({
                chatId: message.chatId,
                before: message.sentAt,
                limit: config.conversation.historyLimit
              });
          const messages = buildConversationMessages({
            systemPrompt,
            history,
            currentText: message.text,
            maxContextChars: config.conversation.maxContextChars
          });
          reply = await llm.generateReply({ messages });
          const replyTime = new Date();
          await store.saveAssistantReply({
            updateId: message.updateId,
            chatId: message.chatId,
            text: reply,
            sentAt: replyTime,
            day: getLocalDay(replyTime, {
              timeZone: config.timeZone,
              boundaryHour: config.dayBoundaryHour
            })
          });
        }

        await telegram.sendText(message.chatId, reply);
        await store.completeUpdate(message.updateId);
        return { status: 200, result: "completed" };
      } catch (error) {
        const code = errorCode(error);
        try {
          await store.failUpdate(message.updateId, code, true);
        } catch (statusError) {
          logger.error("telegram_update_status_failed", {
            requestId,
            updateId: message.updateId,
            errorName: statusError?.name || "Error"
          });
        }
        logger.error("conversation_failed", { requestId, updateId: message.updateId, code });
        return { status: 500, result: "retryable_failure" };
      }
    }
  };
}
