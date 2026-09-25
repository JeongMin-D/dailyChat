import { timingSafeEqual } from "node:crypto";

import { dashboardStyles, renderDashboard, renderDashboardError } from "./dashboard-view.js";

function same(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function credentials(value) {
  if (typeof value !== "string" || !value.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(value.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 1) return null;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

function commonHeaders(requestId, contentType) {
  return {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-request-id": requestId
  };
}

export class DashboardApp {
  constructor({ username, password, store }) {
    this.username = username;
    this.password = password;
    this.store = store;
    this.enabled = Boolean(username && password && store);
  }

  authorized(request) {
    const input = credentials(request.headers.authorization);
    return Boolean(input && same(input.username, this.username) && same(input.password, this.password));
  }

  async handle(request, response, requestId) {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/") {
      response.writeHead(302, { location: "/dashboard", "x-request-id": requestId });
      response.end();
      return 302;
    }
    if (!url.pathname.startsWith("/dashboard")) return null;
    if (!this.enabled) {
      response.writeHead(503, commonHeaders(requestId, "text/plain; charset=utf-8"));
      response.end("Dashboard is not configured");
      return 503;
    }
    if (!this.authorized(request)) {
      response.writeHead(401, {
        ...commonHeaders(requestId, "text/plain; charset=utf-8"),
        "www-authenticate": 'Basic realm="MindCompanion Dashboard", charset="UTF-8"'
      });
      response.end("Authentication required");
      return 401;
    }
    if (url.pathname === "/dashboard/styles.css") {
      response.writeHead(200, commonHeaders(requestId, "text/css; charset=utf-8"));
      response.end(dashboardStyles);
      return 200;
    }
    if (url.pathname !== "/dashboard" || request.method !== "GET") return null;
    try {
      const data = await this.store.load({
        day: url.searchParams.get("day") || undefined,
        query: url.searchParams.get("q") || ""
      });
      response.writeHead(200, commonHeaders(requestId, "text/html; charset=utf-8"));
      response.end(renderDashboard(data));
      return 200;
    } catch (error) {
      response.writeHead(502, commonHeaders(requestId, "text/html; charset=utf-8"));
      response.end(renderDashboardError());
      throw Object.assign(error, { responseSent: true });
    }
  }
}
