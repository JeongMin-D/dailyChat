import assert from "node:assert/strict";
import test from "node:test";

import {
  createNightlyInputSnapshot,
  prepareNightlyInput,
  selectNightlyTargetDay
} from "../src/nightly-input.js";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

const messages = [
  {
    id: secondId,
    sent_at: "2026-09-24T02:00:00+00:00",
    content: "두 번째"
  },
  {
    id: firstId,
    sent_at: "2026-09-24T01:00:00Z",
    content: "첫 번째"
  }
];

test("scheduler는 KST 04:00에 닫힌 전날을 선택한다", () => {
  assert.equal(selectNightlyTargetDay("2026-09-24T19:05:00Z"), "2026-09-24");
});

test("snapshot을 UTC sentAt과 고정 순서로 canonicalize한다", () => {
  const { snapshot, inputHash } = createNightlyInputSnapshot({
    day: "2026-09-24",
    messages
  });

  assert.deepEqual(snapshot, {
    version: "1",
    day: "2026-09-24",
    messages: [
      { id: firstId, sentAt: "2026-09-24T01:00:00.000Z", content: "첫 번째" },
      { id: secondId, sentAt: "2026-09-24T02:00:00.000Z", content: "두 번째" }
    ]
  });
  assert.equal(inputHash, "ab0fe83f3dc024d3e49ed41adad9b4a27ab7bd33926e1dee3ca87aed0066de2c");
});

test("같은 snapshot은 입력 순서와 timestamp 표기와 무관하게 같은 hash를 만든다", () => {
  const forward = createNightlyInputSnapshot({ day: "2026-09-24", messages });
  const reverse = createNightlyInputSnapshot({
    day: "2026-09-24",
    messages: [...messages].reverse()
  });

  assert.equal(forward.inputHash, reverse.inputHash);
});

test("day, content, source ID가 바뀌면 input hash가 바뀐다", () => {
  const baseline = createNightlyInputSnapshot({ day: "2026-09-24", messages }).inputHash;
  const changedDay = createNightlyInputSnapshot({
    day: "2026-09-25",
    messages
  }).inputHash;
  const changedContent = createNightlyInputSnapshot({
    day: "2026-09-24",
    messages: [{ ...messages[0], content: "수정" }, messages[1]]
  }).inputHash;
  const changedId = createNightlyInputSnapshot({
    day: "2026-09-24",
    messages: [{ ...messages[0], id: "33333333-3333-4333-8333-333333333333" }, messages[1]]
  }).inputHash;

  assert.notEqual(baseline, changedDay);
  assert.notEqual(baseline, changedContent);
  assert.notEqual(baseline, changedId);
});

test("빈 날짜도 재현 가능한 빈 snapshot hash를 만든다", () => {
  const first = createNightlyInputSnapshot({ day: "2026-09-24", messages: [] });
  const second = createNightlyInputSnapshot({ day: "2026-09-24", messages: [] });

  assert.deepEqual(first.snapshot.messages, []);
  assert.equal(first.inputHash, second.inputHash);
});

test("잘못된 날짜, 메시지, 중복 source ID를 거부한다", () => {
  assert.throws(
    () => createNightlyInputSnapshot({ day: "2026-02-30", messages: [] }),
    RangeError
  );
  assert.throws(
    () => createNightlyInputSnapshot({
      day: "2026-09-24",
      messages: [{ ...messages[0], id: "not-a-uuid" }]
    }),
    /UUID/
  );
  assert.throws(
    () => createNightlyInputSnapshot({
      day: "2026-09-24",
      messages: [{ ...messages[0], sent_at: "invalid" }]
    }),
    /sentAt/
  );
  assert.throws(
    () => createNightlyInputSnapshot({
      day: "2026-09-24",
      messages: [messages[0], { ...messages[1], id: secondId }]
    }),
    /unique/
  );
});

test("명시된 job day로 store를 읽고 snapshot을 준비한다", async () => {
  const calls = [];
  const store = {
    async listUserMessagesForDay(day) {
      calls.push(day);
      return messages;
    }
  };

  const result = await prepareNightlyInput({ day: "2026-09-24", store });
  assert.deepEqual(calls, ["2026-09-24"]);
  assert.equal(result.snapshot.day, "2026-09-24");
  assert.equal(result.snapshot.messages.length, 2);
});
