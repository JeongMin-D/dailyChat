import test from "node:test";
import assert from "node:assert/strict";

import { buildConversationMessages, loadSoulPrompt } from "../src/prompt-context.js";

test("배포 파일에서 SOUL 프롬프트를 읽는다", async () => {
  const prompt = await loadSoulPrompt();
  assert.match(prompt, /MindCompanion/);
  assert.match(prompt, /위기 상황 규칙/);
});

test("SOUL, 최근 대화, 현재 메시지를 올바른 순서로 구성한다", () => {
  const messages = buildConversationMessages({
    systemPrompt: "SOUL",
    history: [
      { role: "user", content: " 첫 메시지 " },
      { role: "assistant", content: "첫 답변" }
    ],
    currentText: "현재 메시지",
    maxContextChars: 100
  });

  assert.deepEqual(messages, [
    { role: "system", content: "SOUL" },
    { role: "user", content: "첫 메시지" },
    { role: "assistant", content: "첫 답변" },
    { role: "user", content: "현재 메시지" }
  ]);
});

test("문자 예산을 넘는 오래된 대화는 제외한다", () => {
  const messages = buildConversationMessages({
    systemPrompt: "SOUL",
    history: [
      { role: "user", content: "12345" },
      { role: "assistant", content: "67890" }
    ],
    currentText: "현재",
    maxContextChars: 5
  });

  assert.deepEqual(messages, [
    { role: "system", content: "SOUL" },
    { role: "assistant", content: "67890" },
    { role: "user", content: "현재" }
  ]);
});
