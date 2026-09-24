import { readFile } from "node:fs/promises";

const DEFAULT_SOUL_URL = new URL("../../../files/SOUL.md", import.meta.url);

export async function loadSoulPrompt(url = DEFAULT_SOUL_URL) {
  const prompt = (await readFile(url, "utf8")).trim();
  if (!prompt) throw new Error("SOUL prompt is empty");
  return prompt;
}

export function buildConversationMessages({
  systemPrompt,
  history = [],
  currentText,
  maxContextChars
}) {
  const selected = [];
  let remaining = maxContextChars;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (!item || !["user", "assistant"].includes(item.role)) continue;

    const content = item.content?.trim();
    if (!content) continue;
    if (content.length > remaining) break;

    selected.unshift({ role: item.role, content });
    remaining -= content.length;
  }

  return [
    { role: "system", content: systemPrompt },
    ...selected,
    { role: "user", content: currentText }
  ];
}
