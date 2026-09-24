import { createServer } from "node:http";

async function readJson(request, limitBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export function createHttpServer({ conversation, bodyLimitBytes, logger = console }) {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      return json(response, 200, { status: "ok" });
    }

    if (request.method !== "POST" || request.url !== "/telegram/webhook") {
      return json(response, 404, { error: "not_found" });
    }

    try {
      const update = await readJson(request, bodyLimitBytes);
      const result = await conversation.handle({
        secret: request.headers["x-telegram-bot-api-secret-token"],
        update
      });
      return json(response, result.status, { result: result.result });
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : error.status || 500;
      logger.error("http_request_failed", { status, error: error?.message });
      return json(response, status, { error: status === 400 ? "invalid_json" : "request_failed" });
    }
  });
}
