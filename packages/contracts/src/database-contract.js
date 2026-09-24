const eventTypes = ["work", "social", "health", "family", "hobby", "other"];
const moodSources = ["inferred", "checkin"];
const safetyLevels = ["none", "concern", "urgent"];
const safetyReasonCodes = ["self_harm", "suicide", "acute_distress"];

const sourceRelation = (table, parentColumn) => ({
  storage: "relation",
  table,
  parentColumn,
  sourceColumn: "message_id",
  primaryKey: [parentColumn, "message_id"],
  parentDelete: "cascade",
  sourceDelete: "restrict",
  minimumSources: 1
});

export const nightlyDatabaseContract = {
  version: "1.0.0",
  access: {
    schema: "public",
    rlsRequired: true,
    grants: {
      anon: [],
      authenticated: [],
      service_role: ["select", "insert", "update", "delete"]
    }
  },
  enums: {
    eventTypes,
    moodSources,
    safetyLevels,
    safetyReasonCodes
  },
  mappings: {
    topLevel: {
      schemaVersion: {
        storage: "column",
        table: "job_runs",
        column: "schema_version",
        sqlType: "text",
        nullable: false,
        allowed: ["1.0.0"]
      },
      day: {
        storage: "column",
        table: "job_runs",
        column: "day",
        sqlType: "date",
        nullable: false
      },
      events: { storage: "collection", table: "events" },
      moods: { storage: "collection", table: "mood_entries" },
      healthEntries: { storage: "collection", table: "health_entries" },
      safety: { storage: "object", table: "safety_assessments" },
      diary: { storage: "object", table: "diaries" }
    },
    event: {
      eventRef: {
        storage: "transient",
        purpose: "Resolve diary sourceEventRefs to generated event IDs within one transaction."
      },
      type: {
        storage: "column",
        table: "events",
        column: "type",
        sqlType: "text",
        nullable: false,
        allowed: eventTypes
      },
      summary: {
        storage: "column",
        table: "events",
        column: "summary",
        sqlType: "text",
        nullable: false,
        minLength: 1,
        maxLength: 500
      },
      occurredAt: {
        storage: "column",
        table: "events",
        column: "occurred_at",
        sqlType: "timestamptz",
        nullable: true
      },
      people: {
        storage: "column",
        table: "events",
        column: "people",
        sqlType: "text[]",
        nullable: false,
        default: [],
        maxItems: 20,
        itemMinLength: 1,
        itemMaxLength: 80,
        uniqueItems: "application"
      },
      keywords: {
        storage: "column",
        table: "events",
        column: "keywords",
        sqlType: "text[]",
        nullable: false,
        default: [],
        maxItems: 20,
        itemMinLength: 1,
        itemMaxLength: 50,
        uniqueItems: "application"
      },
      confidence: {
        storage: "column",
        table: "events",
        column: "confidence",
        sqlType: "numeric(5,4)",
        nullable: false,
        minimum: 0,
        maximum: 1
      },
      sourceMessageIds: sourceRelation("event_message_sources", "event_id")
    },
    mood: {
      score: {
        storage: "column",
        table: "mood_entries",
        column: "score",
        sqlType: "smallint",
        nullable: false,
        minimum: 1,
        maximum: 5
      },
      label: {
        storage: "column",
        table: "mood_entries",
        column: "label",
        sqlType: "text",
        nullable: false,
        minLength: 1,
        maxLength: 80
      },
      source: {
        storage: "column",
        table: "mood_entries",
        column: "source",
        sqlType: "text",
        nullable: false,
        allowed: moodSources
      },
      confidence: {
        storage: "column",
        table: "mood_entries",
        column: "confidence",
        sqlType: "numeric(5,4)",
        nullable: false,
        minimum: 0,
        maximum: 1
      },
      sourceMessageIds: sourceRelation("mood_message_sources", "mood_entry_id")
    },
    health: {
      symptom: {
        storage: "column",
        table: "health_entries",
        column: "symptom",
        sqlType: "text",
        nullable: false,
        minLength: 1,
        maxLength: 120
      },
      severity: {
        storage: "column",
        table: "health_entries",
        column: "severity",
        sqlType: "smallint",
        nullable: true,
        minimum: 1,
        maximum: 3
      },
      note: {
        storage: "column",
        table: "health_entries",
        column: "note",
        sqlType: "text",
        nullable: true,
        minLength: 1,
        maxLength: 500
      },
      occurredAt: {
        storage: "column",
        table: "health_entries",
        column: "occurred_at",
        sqlType: "timestamptz",
        nullable: true
      },
      confidence: {
        storage: "column",
        table: "health_entries",
        column: "confidence",
        sqlType: "numeric(5,4)",
        nullable: false,
        minimum: 0,
        maximum: 1
      },
      sourceMessageIds: sourceRelation("health_message_sources", "health_entry_id")
    },
    safety: {
      level: {
        storage: "conditional-column",
        table: "safety_assessments",
        column: "level",
        sqlType: "text",
        nullable: false,
        allowed: safetyLevels,
        persistedWhen: ["concern", "urgent"]
      },
      reasonCodes: {
        storage: "column",
        table: "safety_assessments",
        column: "reason_codes",
        sqlType: "text[]",
        nullable: false,
        maxItems: 3,
        allowedItems: safetyReasonCodes,
        uniqueItems: "application"
      },
      sourceMessageIds: sourceRelation("safety_message_sources", "safety_assessment_id"),
      checkerVersion: {
        storage: "column",
        table: "safety_assessments",
        column: "checker_version",
        sqlType: "text",
        nullable: false,
        minLength: 1,
        maxLength: 64
      }
    },
    diary: {
      title: {
        storage: "column",
        table: "diaries",
        column: "title",
        sqlType: "text",
        nullable: false,
        minLength: 1,
        maxLength: 40
      },
      summaryMood: {
        storage: "column",
        table: "diaries",
        column: "summary_mood",
        sqlType: "text",
        nullable: true,
        minLength: 1,
        maxLength: 120
      },
      tags: {
        storage: "column",
        table: "diaries",
        column: "tags",
        sqlType: "text[]",
        nullable: false,
        default: [],
        maxItems: 10,
        itemMinLength: 1,
        itemMaxLength: 40,
        uniqueItems: "application"
      },
      blocks: { storage: "collection", table: "diary_blocks", minimumItems: 1 }
    },
    diaryBlock: {
      text: {
        storage: "column",
        table: "diary_blocks",
        column: "text",
        sqlType: "text",
        nullable: false,
        minLength: 1,
        maxLength: 1000
      },
      sourceMessageIds: sourceRelation("diary_block_message_sources", "diary_block_id"),
      sourceEventRefs: {
        storage: "relation",
        table: "diary_block_event_sources",
        parentColumn: "diary_block_id",
        sourceColumn: "event_id",
        primaryKey: ["diary_block_id", "event_id"],
        parentDelete: "cascade",
        sourceDelete: "restrict",
        maximumSources: 20
      }
    }
  },
  tableRules: {
    domainRows: {
      columns: {
        id: "uuid primary key default gen_random_uuid()",
        day: "date not null",
        job_run_id: "uuid not null references job_runs(id) on delete restrict",
        created_at: "timestamptz not null default now()"
      }
    },
    diaries: {
      version: "integer not null check (version > 0)",
      unique: ["day", "version"]
    },
    diaryBlocks: {
      diaryId: "uuid not null references diaries(id) on delete cascade",
      position: "integer not null check (position >= 0)",
      unique: ["diary_id", "position"]
    },
    relations: {
      sourceMessageDelete: "restrict",
      derivedParentDelete: "cascade"
    }
  },
  applicationRules: [
    "Validate the complete JSON Schema and semantic contract before opening a save transaction.",
    "Resolve eventRef values only inside the same save transaction; never persist eventRef.",
    "Require every source message to belong to the immutable user-message input snapshot for the run day.",
    "Insert each derived row and all of its source links atomically; never commit a parent without evidence.",
    "Reject duplicate array values and duplicate source IDs before insert.",
    "Do not persist a safety row when level is none.",
    "Delete or mark impacted derived rows stale before deleting a referenced source message."
  ]
};
