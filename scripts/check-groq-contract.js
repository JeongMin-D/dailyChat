import { readFile } from "node:fs/promises";
import {
  nightlyExtractionSchema,
  validateNightlyExtraction,
  validateNightlyExtractionShape
} from "@mindcompanion/contracts";

const MESSAGE_ID = "00000000-0000-4000-8000-000000000001";

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    values[name] = value;
  }
  return values;
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const env = parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
const baseUrl = required(env, "GROQ_BASE_URL").replace(/\/$/, "");
const model = env.GROQ_EXTRACTION_MODEL?.trim() || required(env, "GROQ_CHAT_MODEL");
const timeout = Number(env.UPSTREAM_TIMEOUT_MS || 15_000);

const response = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${required(env, "GROQ_API_KEY")}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    model,
    messages: [
      {
        role: "system",
        content: [
          "Return only a grounded nightly record matching the supplied JSON Schema.",
          "Do not invent facts and use only the exact user message UUID as evidence.",
          "This benign sample has no safety concern: set safety.level to none and both safety arrays to empty.",
          "Set safety.checkerVersion to safety-v1 and create at least one evidence-backed diary block."
        ].join(" ")
      },
      {
        role: "user",
        content: `day=2026-09-24\n${MESSAGE_ID} | user | 오늘 데이터 계약 테스트를 마쳤고 마음이 차분해.`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "nightly_extraction",
        strict: true,
        schema: nightlyExtractionSchema
      }
    }
  }),
  signal: AbortSignal.timeout(timeout)
});

const payload = await response.json().catch(() => null);
if (!response.ok) {
  throw new Error(`Groq contract smoke test failed: ${payload?.error?.message || `HTTP ${response.status}`}`);
}

const raw = payload?.choices?.[0]?.message?.content;
if (!raw) throw new Error("Groq contract smoke test returned no content");
const output = JSON.parse(raw);
const shapeValidation = validateNightlyExtractionShape(output);
if (!shapeValidation.valid) {
  throw new Error(`Groq output failed schema validation: ${JSON.stringify(shapeValidation.errors)}`);
}
const validation = validateNightlyExtraction(output, {
  allowedMessageIds: [MESSAGE_ID]
});

console.log(JSON.stringify({
  event: "groq_contract_verified",
  model,
  schemaCompatible: true,
  semanticValid: validation.valid,
  semanticErrorCount: validation.errors.length,
  schemaVersion: output.schemaVersion,
  eventCount: output.events.length,
  moodCount: output.moods.length,
  healthEntryCount: output.healthEntries.length,
  diaryBlockCount: output.diary.blocks.length,
  safetyLevel: output.safety.level
}));
