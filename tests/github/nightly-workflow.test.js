import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../../.github/workflows/nightly.yml", import.meta.url),
  "utf8"
);
const packageJson = JSON.parse(
  await readFile(new URL("../../package.json", import.meta.url), "utf8")
);

test("GitHub Actions는 매일 04:05 KST에 nightly 작업을 예약한다", () => {
  assert.match(workflow, /cron: ["']5 19 \* \* \*["']/);
  assert.match(workflow, /run: npm run run:nightly/);
  assert.match(workflow, /timeout-minutes: 15/);
  assert.match(workflow, /group: nightly-diary/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("수동 실행은 기본 dry-run이며 live만 외부 쓰기 비밀값을 받는다", () => {
  assert.match(workflow, /default: dry-run/);
  assert.match(workflow, /inputs\.mode == 'dry-run'/);
  assert.match(workflow, /github\.event_name == 'schedule' \|\| inputs\.mode == 'live'/);
  assert.match(workflow, /secrets\.GROQ_API_KEY/);
  assert.match(workflow, /secrets\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(workflow, /secrets\.TELEGRAM_BOT_TOKEN/);

  const dryRunStep = workflow.slice(
    workflow.indexOf("- name: Verify pipeline without external writes"),
    workflow.indexOf("- name: Generate and deliver diary")
  );
  assert.doesNotMatch(dryRunStep, /SUPABASE_SERVICE_ROLE_KEY|TELEGRAM_BOT_TOKEN/);
});

test("workflow 권한과 실행 환경을 최소 범위로 고정한다", () => {
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /SUPABASE_URL: https:\/\/ofximcgkhherplhvwkny\.supabase\.co/);
  assert.doesNotMatch(workflow, /gsk_[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+/);
});

test("nightly dry-run은 CI에서 로컬 .env 없이 실행할 수 있다", () => {
  assert.equal(
    packageJson.scripts["smoke:nightly:pipeline"],
    "node --env-file-if-exists=.env scripts/check-nightly-pipeline.js"
  );
});
