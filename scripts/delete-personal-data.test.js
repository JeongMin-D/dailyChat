import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { deleteDayAndRefreshMemory } from "./delete-personal-data.js";

test("완전 삭제 후 기억 투영을 전체 재생성해 삭제된 사실을 남기지 않는다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dailychat-delete-"));
  const path = join(directory, "MEMORY.md");
  let deleted = false;
  const store = {
    async deletePersonalDataForDay(input) {
      assert.equal(input.day, "2026-09-24");
      deleted = true;
      return { day: input.day, messages: 2 };
    },
    async listActiveMemories() {
      return deleted ? [{ category: "routine", fact: "산책한다" }] : [
        { category: "preference", fact: "삭제 대상" },
        { category: "routine", fact: "산책한다" }
      ];
    }
  };
  try {
    await assert.rejects(() => deleteDayAndRefreshMemory({
      store, day: "2026-09-24", confirmation: "WRONG", userId: 1, chatId: 1, projectionDay: "2026-09-28", path
    }), /exactly match/);
    await deleteDayAndRefreshMemory({
      store, day: "2026-09-24", confirmation: "2026-09-24", userId: 1, chatId: 1, projectionDay: "2026-09-28", path
    });
    const content = await readFile(path, "utf8");
    assert.doesNotMatch(content, /삭제 대상/);
    assert.match(content, /산책한다/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
