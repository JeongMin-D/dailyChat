import { createRequire } from "node:module";
import {
  diarySchema,
  eventSchema,
  healthSchema,
  moodSchema,
  nightlyExtractionSchema,
  safetySchema
} from "./schemas.js";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validators = {
  diary: ajv.compile(diarySchema),
  event: ajv.compile(eventSchema),
  health: ajv.compile(healthSchema),
  mood: ajv.compile(moodSchema),
  nightlyExtraction: ajv.compile(nightlyExtractionSchema),
  safety: ajv.compile(safetySchema)
};

function copyErrors(errors = []) {
  return errors.map((error) => ({ ...error, params: { ...error.params } }));
}

function semanticError(instancePath, message, params = {}) {
  return {
    instancePath,
    schemaPath: "#/semantic",
    keyword: "semantic",
    params,
    message
  };
}

function collectSourceIds(value) {
  return [
    ...value.events.flatMap((item) => item.sourceMessageIds),
    ...value.moods.flatMap((item) => item.sourceMessageIds),
    ...value.healthEntries.flatMap((item) => item.sourceMessageIds),
    ...value.safety.sourceMessageIds,
    ...value.diary.blocks.flatMap((item) => item.sourceMessageIds)
  ];
}

function duplicateValues(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function addDuplicateErrors(errors, instancePath, values) {
  for (const duplicate of duplicateValues(values)) {
    errors.push(semanticError(instancePath, "array values must be unique", { duplicate }));
  }
}

function semanticErrors(value, allowedMessageIds) {
  const errors = [];
  const eventRefs = value.events.map((event) => event.eventRef);
  const knownEventRefs = new Set(eventRefs);

  for (const eventRef of duplicateValues(eventRefs)) {
    errors.push(semanticError("/events", "eventRef must be unique", { eventRef }));
  }

  value.events.forEach((event, index) => {
    addDuplicateErrors(errors, `/events/${index}/people`, event.people);
    addDuplicateErrors(errors, `/events/${index}/keywords`, event.keywords);
    addDuplicateErrors(errors, `/events/${index}/sourceMessageIds`, event.sourceMessageIds);
  });
  value.moods.forEach((mood, index) => {
    addDuplicateErrors(errors, `/moods/${index}/sourceMessageIds`, mood.sourceMessageIds);
  });
  value.healthEntries.forEach((entry, index) => {
    addDuplicateErrors(errors, `/healthEntries/${index}/sourceMessageIds`, entry.sourceMessageIds);
  });
  addDuplicateErrors(errors, "/safety/reasonCodes", value.safety.reasonCodes);
  addDuplicateErrors(errors, "/safety/sourceMessageIds", value.safety.sourceMessageIds);
  addDuplicateErrors(errors, "/diary/tags", value.diary.tags);

  value.diary.blocks.forEach((block, blockIndex) => {
    addDuplicateErrors(errors, `/diary/blocks/${blockIndex}/sourceMessageIds`, block.sourceMessageIds);
    addDuplicateErrors(errors, `/diary/blocks/${blockIndex}/sourceEventRefs`, block.sourceEventRefs);
    block.sourceEventRefs.forEach((eventRef) => {
      if (!knownEventRefs.has(eventRef)) {
        errors.push(semanticError(
          `/diary/blocks/${blockIndex}/sourceEventRefs`,
          "sourceEventRef must identify an event in the same result",
          { eventRef }
        ));
      }
    });
  });

  const hasSafetyEvidence = value.safety.reasonCodes.length > 0
    && value.safety.sourceMessageIds.length > 0;
  if (value.safety.level === "none" && value.safety.reasonCodes.length > 0) {
    errors.push(semanticError(
      "/safety",
      "none safety level must not include reason codes"
    ));
  }
  if (value.safety.level !== "none" && !hasSafetyEvidence) {
    errors.push(semanticError(
      "/safety",
      "concern and urgent safety levels require a reason and source message"
    ));
  }

  if (allowedMessageIds) {
    const allowed = new Set(allowedMessageIds);
    for (const sourceId of new Set(collectSourceIds(value))) {
      if (!allowed.has(sourceId)) {
        errors.push(semanticError(
          "",
          "sourceMessageId must belong to the input snapshot",
          { sourceMessageId: sourceId }
        ));
      }
    }
  }

  return errors;
}

function runValidator(validator, value) {
  const valid = validator(value);
  return {
    valid,
    errors: valid ? [] : copyErrors(validator.errors)
  };
}

export function validateEvent(value) {
  return runValidator(validators.event, value);
}

export function validateMood(value) {
  return runValidator(validators.mood, value);
}

export function validateHealth(value) {
  return runValidator(validators.health, value);
}

export function validateDiary(value) {
  return runValidator(validators.diary, value);
}

export function validateSafety(value) {
  return runValidator(validators.safety, value);
}

export function validateNightlyExtractionShape(value) {
  return runValidator(validators.nightlyExtraction, value);
}

/**
 * @param {unknown} value
 * @param {{ allowedMessageIds?: string[] }} [options]
 */
export function validateNightlyExtraction(value, options = {}) {
  const { allowedMessageIds } = options;
  const shape = validateNightlyExtractionShape(value);
  if (!shape.valid) {
    return shape;
  }

  const errors = semanticErrors(value, allowedMessageIds);
  return { valid: errors.length === 0, errors };
}

export function assertNightlyExtraction(value, options) {
  const result = validateNightlyExtraction(value, options);
  if (!result.valid) {
    const error = Object.assign(
      new Error("Nightly extraction does not match the contract"),
      {
        code: "INVALID_NIGHTLY_EXTRACTION",
        validationErrors: result.errors
      }
    );
    throw error;
  }
  return value;
}
