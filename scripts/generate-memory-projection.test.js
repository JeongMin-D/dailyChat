import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  generateMemoryProjection,
  renderMemoryProjection
} from "./generate-memory-projection.js";

test("MEMORY.md 투영은 정렬되고 전체 재생성되어 삭제된 기억을 남기지 않는다", async () => {
  const first = renderMemoryProjection([
    { category: "project", fact: "DailyChat을 만든다" },
    { category: "preference", fact: "차를\n좋아한다 <!-- 숨김 -->" }
  ]);
  const reordered = renderMemoryProjection([
    { category: "preference", fact: "차를 좋아한다 <!-- 숨김 -->" },
    { category: "project", fact: "DailyChat을 만든다" }
  ]);
  assert.equal(first.content, reordered.content);
  assert.match(first.content, /차를 좋아한다 &lt;!-- 숨김 --&gt;/);

  const directory = await mkdtemp(join(tmpdir(), "dailychat-memory-"));
  const path = join(directory, "MEMORY.md");
  let rows = [
    { category: "preference", fact: "차를 좋아한다" },
    { category: "routine", fact: "아침에 산책한다" }
  ];
  const store = { listActiveMemories: async () => rows };

  try {
    await generateMemoryProjection({ store, day: "2026-09-28", path });
    rows = [{ category: "routine", fact: "아침에 산책한다" }];
    const result = await generateMemoryProjection({ store, day: "2026-09-28", path });
    const content = await readFile(path, "utf8");
    assert.equal(result.count, 1);
    assert.doesNotMatch(content, /차를 좋아한다/);
    assert.match(content, /아침에 산책한다/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
