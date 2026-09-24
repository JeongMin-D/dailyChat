const SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";
const UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$";
const LOCAL_DAY_PATTERN = "^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$";
const RFC3339_PATTERN = "^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\\.[0-9]+)?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$";

const sourceMessageIds = {
  type: "array",
  items: { type: "string", pattern: UUID_PATTERN },
  minItems: 1,
  maxItems: 50
};

const eventDefinition = {
  type: "object",
  additionalProperties: false,
  properties: {
    eventRef: { type: "string", pattern: "^event-[1-9][0-9]*$" },
    type: {
      type: "string",
      enum: ["work", "social", "health", "family", "hobby", "other"]
    },
    summary: { type: "string", minLength: 1, maxLength: 500 },
    occurredAt: {
      type: ["string", "null"],
      pattern: RFC3339_PATTERN
    },
    people: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 80 },
      maxItems: 20
    },
    keywords: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 50 },
      maxItems: 20
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sourceMessageIds
  },
  required: [
    "eventRef",
    "type",
    "summary",
    "occurredAt",
    "people",
    "keywords",
    "confidence",
    "sourceMessageIds"
  ]
};

const moodDefinition = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer", minimum: 1, maximum: 5 },
    label: { type: "string", minLength: 1, maxLength: 80 },
    source: { type: "string", enum: ["inferred", "checkin"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sourceMessageIds
  },
  required: ["score", "label", "source", "confidence", "sourceMessageIds"]
};

const healthDefinition = {
  type: "object",
  additionalProperties: false,
  properties: {
    symptom: { type: "string", minLength: 1, maxLength: 120 },
    severity: { type: ["integer", "null"], minimum: 1, maximum: 3 },
    note: { type: ["string", "null"], minLength: 1, maxLength: 500 },
    occurredAt: { type: ["string", "null"], pattern: RFC3339_PATTERN },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sourceMessageIds
  },
  required: [
    "symptom",
    "severity",
    "note",
    "occurredAt",
    "confidence",
    "sourceMessageIds"
  ]
};

const diaryBlockDefinition = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string", minLength: 1, maxLength: 1000 },
    sourceMessageIds,
    sourceEventRefs: {
      type: "array",
      items: { type: "string", pattern: "^event-[1-9][0-9]*$" },
      maxItems: 20
    }
  },
  required: ["text", "sourceMessageIds", "sourceEventRefs"]
};

const diaryDefinition = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 40 },
    summaryMood: { type: ["string", "null"], minLength: 1, maxLength: 120 },
    tags: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 40 },
      maxItems: 10
    },
    blocks: {
      type: "array",
      items: diaryBlockDefinition,
      minItems: 1,
      maxItems: 30
    }
  },
  required: ["title", "summaryMood", "tags", "blocks"]
};

const safetyDefinition = {
  type: "object",
  additionalProperties: false,
  properties: {
    level: { type: "string", enum: ["none", "concern", "urgent"] },
    reasonCodes: {
      type: "array",
      items: {
        type: "string",
        enum: ["self_harm", "suicide", "acute_distress"]
      },
      maxItems: 3
    },
    sourceMessageIds: {
      type: "array",
      items: { type: "string", pattern: UUID_PATTERN },
      maxItems: 20
    },
    checkerVersion: { type: "string", minLength: 1, maxLength: 64 }
  },
  required: ["level", "reasonCodes", "sourceMessageIds", "checkerVersion"]
};

function standaloneSchema(id, definition) {
  return {
    $schema: SCHEMA_DIALECT,
    $id: id,
    ...definition
  };
}

export const eventSchema = standaloneSchema(
  "https://dailychat.local/schemas/event.schema.json",
  eventDefinition
);

export const moodSchema = standaloneSchema(
  "https://dailychat.local/schemas/mood.schema.json",
  moodDefinition
);

export const healthSchema = standaloneSchema(
  "https://dailychat.local/schemas/health.schema.json",
  healthDefinition
);

export const diarySchema = standaloneSchema(
  "https://dailychat.local/schemas/diary.schema.json",
  diaryDefinition
);

export const safetySchema = standaloneSchema(
  "https://dailychat.local/schemas/safety.schema.json",
  safetyDefinition
);

export const nightlyExtractionSchema = {
  $schema: SCHEMA_DIALECT,
  $id: "https://dailychat.local/schemas/nightly-extraction.schema.json",
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: { type: "string", enum: ["1.0.0"] },
    day: { type: "string", pattern: LOCAL_DAY_PATTERN },
    events: {
      type: "array",
      items: { $ref: "#/$defs/event" },
      maxItems: 100
    },
    moods: {
      type: "array",
      items: { $ref: "#/$defs/mood" },
      minItems: 1,
      maxItems: 20
    },
    healthEntries: {
      type: "array",
      items: { $ref: "#/$defs/health" },
      maxItems: 100
    },
    safety: { $ref: "#/$defs/safety" },
    diary: { $ref: "#/$defs/diary" }
  },
  required: ["schemaVersion", "day", "events", "moods", "healthEntries", "safety", "diary"],
  $defs: {
    event: eventDefinition,
    mood: moodDefinition,
    health: healthDefinition,
    safety: safetyDefinition,
    diary: diaryDefinition
  }
};
