import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

async function readJson(request, limitBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) {
      throw Object.assign(new Error("Request body too large"), { status: 413 });
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response, status, body, requestId) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "x-request-id": requestId
  });
  response.end(JSON.stringify(body));
}

function requestIdFrom(value) {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(value)
    ? value
    : randomUUID();
}

function errorBody(code, message, requestId) {
  return { error: { code, message, requestId } };
}

function conversationError(result, requestId) {
  if (result.result === "unauthorized") {
    return errorBody("UNAUTHORIZED", "Request is not authorized", requestId);
  }
  return errorBody("CONVERSATION_FAILED", "Request could not be completed", requestId);
}

/**
 * @param {{
 *   conversation: {handle(input: object): Promise<{status: number, result: string}>},
 *   bodyLimitBytes: number,
 *   dashboard?: {handle(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse, requestId: string): Promise<number | null>},
 *   logger?: Pick<import("../../../packages/observability/src/json-logger.js").JsonLogger, "info" | "error">
 * }} options
 */
export function createHttpServer({ conversation, bodyLimitBytes, dashboard, logger = console }) {
  return createServer(async (request, response) => {
    const requestId = requestIdFrom(request.headers["x-request-id"]);
    const startedAt = performance.now();
    const path = request.url?.split("?", 1)[0] || "/";
    const send = (status, body) => {
      logger.info("http_request_completed", {
        requestId,
        method: request.method,
        path,
        status,
        durationMs: Math.round(performance.now() - startedAt)
      });
      return json(response, status, body, requestId);
    };

    if (request.method === "GET" && request.url === "/health") {
      return send(200, { status: "ok" });
    }

    if (request.method === "GET" && dashboard) {
      try {
        const status = await dashboard.handle(request, response, requestId);
        if (status !== null) {
          logger.info("http_request_completed", {
            requestId,
            method: request.method,
            path,
            status,
            durationMs: Math.round(performance.now() - startedAt)
          });
          return;
        }
      } catch (error) {
        logger.error("dashboard_request_failed", {
          requestId,
          status: 502,
          errorCode: error?.code || "DASHBOARD_FAILED"
        });
        if (error?.responseSent === true) return;
        return send(502, errorBody("DASHBOARD_FAILED", "Dashboard could not be loaded", requestId));
      }
    }

    if (request.method !== "POST" || request.url !== "/telegram/webhook") {
      return send(404, errorBody("NOT_FOUND", "Resource not found", requestId));
    }

    try {
      const update = await readJson(request, bodyLimitBytes);
      const result = await conversation.handle({
        secret: request.headers["x-telegram-bot-api-secret-token"],
        update,
        requestId
      });
      return result.status >= 400
        ? send(result.status, conversationError(result, requestId))
        : send(result.status, { result: result.result });
    } catch (error) {
      const status = error instanceof SyntaxError
        ? 400
        : error && typeof error === "object" && "status" in error
          && typeof error.status === "number"
          ? error.status
          : 500;
      const code = status === 400
        ? "INVALID_JSON"
        : status === 413 ? "PAYLOAD_TOO_LARGE" : "REQUEST_FAILED";
      const message = status === 400
        ? "Request body must be valid JSON"
        : status === 413 ? "Request body is too large" : "Request could not be completed";
      logger.error("http_request_failed", {
        requestId,
        status,
        errorName: error?.name || "Error"
      });
      return send(status, errorBody(code, message, requestId));
    }
  });
}
