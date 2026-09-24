const RETRYABLE_STATUS = new Set([429]);

function isRetryableStatus(status) {
  return RETRYABLE_STATUS.has(status) || (status >= 500 && status <= 599);
}

function parseRetryAfterHeader(value, nowMs) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs) : null;
}

async function retryAfterMs(response, nowMs) {
  const headerDelay = parseRetryAfterHeader(response.headers.get("retry-after"), nowMs);
  if (headerDelay !== null) return headerDelay;

  if (!response.headers.get("content-type")?.includes("application/json")) return null;
  try {
    const payload = await response.clone().json();
    const seconds = Number(payload?.parameters?.retry_after);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : null;
  } catch {
    return null;
  }
}

function backoffDelayMs({ attempt, baseDelayMs, maxDelayMs, random, serverDelayMs }) {
  const exponentialCap = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
  const jittered = exponentialCap / 2 + random() * exponentialCap / 2;
  return Math.round(Math.min(maxDelayMs, Math.max(jittered, serverDelayMs ?? 0)));
}

/**
 * @param {string | URL} url
 * @param {RequestInit} init
 * @param {{
 *   timeoutMs: number,
 *   maxAttempts: number,
 *   baseDelayMs: number,
 *   maxDelayMs: number,
 *   fetchImpl?: typeof fetch,
 *   sleepImpl?: (delayMs: number) => Promise<void>,
 *   random?: () => number,
 *   now?: () => number,
 *   onRetry?: (details: {
 *     attempt: number,
 *     delayMs: number,
 *     status?: number,
 *     errorName?: string
 *   }) => void
 * }} options
 */
export async function fetchWithRetry(url, init, {
  timeoutMs,
  maxAttempts = 1,
  baseDelayMs = 0,
  maxDelayMs = 0,
  fetchImpl = fetch,
  sleepImpl = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  random = Math.random,
  now = Date.now,
  onRetry = () => {}
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (attempt === maxAttempts) throw error;

      const delayMs = backoffDelayMs({
        attempt,
        baseDelayMs,
        maxDelayMs,
        random,
        serverDelayMs: null
      });
      onRetry({
        attempt,
        delayMs,
        errorName: error instanceof Error ? error.name : "Error"
      });
      await sleepImpl(delayMs);
      continue;
    }

    if (!isRetryableStatus(response.status) || attempt === maxAttempts) return response;

    const delayMs = backoffDelayMs({
      attempt,
      baseDelayMs,
      maxDelayMs,
      random,
      serverDelayMs: await retryAfterMs(response, now())
    });
    if (response.body) await response.body.cancel().catch(() => {});
    onRetry({ attempt, delayMs, status: response.status });
    await sleepImpl(delayMs);
  }

  throw new Error("Retry loop ended unexpectedly");
}
