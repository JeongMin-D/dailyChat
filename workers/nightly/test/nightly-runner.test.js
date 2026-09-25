import assert from "node:assert/strict";
import test from "node:test";

import { NightlyPipelineRunner } from "../src/nightly-runner.js";

const DAY = "2026-09-24";
const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DIARY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const NOTIFICATION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function extractionOutput() {
  return {
    schemaVersion: "1.0.0",
    day: DAY,
    events: [],
    moods: [],
    healthEntries: [],
    safety: {
      level: "none",
      reasonCodes: [],
      sourceMessageIds: [],
      checkerVersion: "safety-v1"
    },
    diary: {
      title: "하루 기록",
      summaryMood: "차분함",
      tags: [],
      blocks: [{
        text: "오늘의 기록",
        sourceMessageIds: [MESSAGE_ID],
        sourceEventRefs: []
      }]
    }
  };
}

function createDependencies({ prepareAction = "created", messages } = {}) {
  const calls = [];
  const output = extractionOutput();
  return {
    calls,
    dependencies: {
      inputStore: {
        async listUserMessagesForDay(day) {
          calls.push(["input", day]);
          return messages ?? [{
            id: MESSAGE_ID,
            sent_at: "2026-09-24T03:00:00.000Z",
            content: "오늘의 기록"
          }];
        }
      },
      extractor: {
        model: "openai/gpt-oss-120b",
        promptVersion: "nightly-v1",
        async extract({ snapshot }) {
          calls.push(["extract", snapshot]);
          return { status: "completed", attempts: 1, output };
        }
      },
      outputStore: {
        async prepareRun(values) {
          calls.push(["prepare", values]);
          return {
            action: prepareAction,
            jobRunId: JOB_ID,
            status: prepareAction === "noop" ? "succeeded" : "queued",
            diaryId: prepareAction === "noop" ? DIARY_ID : null,
            diaryVersion: prepareAction === "noop" ? 1 : null
          };
        },
        async claimRun(jobRunId) {
          calls.push(["claim", jobRunId]);
          return true;
        },
        async save(values) {
          calls.push(["save", values]);
          return { action: "saved", jobRunId: JOB_ID, diaryId: DIARY_ID, diaryVersion: 1 };
        }
      },
      notificationStore: {
        async enqueue(values) {
          calls.push(["enqueue", values]);
          return { notificationId: NOTIFICATION_ID };
        }
      },
      notificationDelivery: {
        async deliver(notificationId) {
          calls.push(["deliver", notificationId]);
          return { action: "sent", notificationId, providerMessageId: "101" };
        }
      }
    }
  };
}

test("입력부터 Telegram 전송까지 순서대로 한 번 실행한다", async () => {
  const { calls, dependencies } = createDependencies();
  const runner = new NightlyPipelineRunner(dependencies);

  const result = await runner.run({ day: DAY });

  assert.equal(result.action, "completed");
  assert.equal(result.diaryId, DIARY_ID);
  assert.equal(result.delivery.action, "sent");
  assert.deepEqual(calls.map(([name]) => name), [
    "input",
    "prepare",
    "claim",
    "extract",
    "save",
    "enqueue",
    "deliver"
  ]);
  assert.equal(calls[1][1].pipelineVersion, "nightly-pipeline-v1");
  assert.equal(calls[1][1].schemaVersion, "1.0.0");
  assert.deepEqual(calls[4][1].output, extractionOutput());
});

test("성공한 동일 입력은 추출과 저장 없이 기존 알림을 재개한다", async () => {
  const { calls, dependencies } = createDependencies({ prepareAction: "noop" });
  const runner = new NightlyPipelineRunner(dependencies);

  const result = await runner.run({ day: DAY });

  assert.equal(result.action, "noop");
  assert.deepEqual(calls.map(([name]) => name), ["input", "prepare", "enqueue", "deliver"]);
});

test("사용자 메시지가 없으면 job과 외부 API를 만들지 않는다", async () => {
  const { calls, dependencies } = createDependencies({ messages: [] });
  const runner = new NightlyPipelineRunner(dependencies);

  const result = await runner.run({ day: DAY });

  assert.deepEqual(result, { action: "skipped", day: DAY, reason: "no_user_messages" });
  assert.deepEqual(calls.map(([name]) => name), ["input"]);
});

test("영구 실패한 job은 다시 claim하지 않는다", async () => {
  const { calls, dependencies } = createDependencies({ prepareAction: "terminal_failed" });
  const runner = new NightlyPipelineRunner(dependencies);

  const result = await runner.run({ day: DAY });

  assert.equal(result.action, "not_runnable");
  assert.equal(result.reason, "terminal_failed");
  assert.deepEqual(calls.map(([name]) => name), ["input", "prepare"]);
});

test("동시 실행에서 claim을 잃으면 추출하지 않는다", async () => {
  const { calls, dependencies } = createDependencies();
  dependencies.outputStore.claimRun = async (jobRunId) => {
    calls.push(["claim", jobRunId]);
    return false;
  };
  const runner = new NightlyPipelineRunner(dependencies);

  const result = await runner.run({ day: DAY });

  assert.equal(result.action, "not_claimed");
  assert.deepEqual(calls.map(([name]) => name), ["input", "prepare", "claim"]);
});

test("멈춘 running job은 DB claim이 허용하면 이어서 실행한다", async () => {
  const { calls, dependencies } = createDependencies({ prepareAction: "in_progress" });
  const runner = new NightlyPipelineRunner(dependencies);

  const result = await runner.run({ day: DAY });

  assert.equal(result.action, "completed");
  assert.deepEqual(calls.map(([name]) => name), [
    "input",
    "prepare",
    "claim",
    "extract",
    "save",
    "enqueue",
    "deliver"
  ]);
});

test("추출기가 완료 결과를 반환하지 않으면 저장과 알림을 중단한다", async () => {
  const { calls, dependencies } = createDependencies();
  dependencies.extractor.extract = async () => {
    calls.push(["extract"]);
    return { status: "skipped", output: null };
  };
  const runner = new NightlyPipelineRunner(dependencies);

  await assert.rejects(
    runner.run({ day: DAY }),
    (error) => error.code === "NIGHTLY_EXTRACTION_NOT_COMPLETED"
  );
  assert.deepEqual(calls.map(([name]) => name), ["input", "prepare", "claim", "extract"]);
});
