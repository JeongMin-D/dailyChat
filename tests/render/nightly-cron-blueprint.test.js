import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const blueprint = await readFile(
  new URL("../../config/render-nightly-cron.example.yaml", import.meta.url),
  "utf8"
);

test("Render nightly cron 예시는 04:05 KST를 19:05 UTC로 예약한다", () => {
  assert.match(blueprint, /type: cron/);
  assert.match(blueprint, /name: dailychat-nightly/);
  assert.match(blueprint, /schedule: ["']5 19 \* \* \*["']/);
  assert.match(blueprint, /startCommand: npm run run:nightly/);
  assert.match(blueprint, /plan: 0\.5c-512mb/);
  assert.match(blueprint, /region: singapore/);
});

test("Cron 비밀값은 기존 dailychat-bot 환경변수를 참조한다", () => {
  for (const key of [
    "TELEGRAM_BOT_TOKEN",
    "GROQ_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY"
  ]) {
    const escapedKey = key.replaceAll("_", "[_]");
    assert.match(
      blueprint,
      new RegExp(
        `key: ${escapedKey}[\\s\\S]*?name: dailychat-bot[\\s\\S]*?type: web[\\s\\S]*?envVarKey: ${escapedKey}`
      )
    );
  }
  assert.doesNotMatch(blueprint, /sync: false/);
  assert.doesNotMatch(blueprint, /NIGHTLY_TARGET_DAY/);
});
