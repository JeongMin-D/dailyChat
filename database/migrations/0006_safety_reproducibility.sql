-- Restricted safety metadata and reproducible nightly-run configuration.
-- Never store source quotes, diagnoses, free-form reasoning, or diary content here.

alter table job_runs
  add column provider text,
  add column model text,
  add column prompt_version text,
  add column schema_version text,
  add constraint job_runs_input_hash_format_check
    check (input_hash is null or input_hash ~ '^[0-9a-f]{64}$'),
  add constraint job_runs_provider_length_check
    check (provider is null or length(provider) between 1 and 64),
  add constraint job_runs_model_length_check
    check (model is null or length(model) between 1 and 160),
  add constraint job_runs_prompt_version_length_check
    check (prompt_version is null or length(prompt_version) between 1 and 64),
  add constraint job_runs_schema_version_format_check
    check (schema_version is null or schema_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  add constraint job_runs_nightly_reproducibility_check
    check (
      job_type <> 'nightly'
      or (
        day is not null
        and input_hash is not null
        and provider is not null
        and model is not null
        and prompt_version is not null
        and schema_version is not null
      )
    );

create table safety_assessments (
  id uuid primary key default gen_random_uuid(),
  job_run_id uuid not null references job_runs(id) on delete restrict,
  day date not null,
  level text not null check (level in ('concern', 'urgent')),
  reason_codes text[] not null
    check (cardinality(reason_codes) between 1 and 3)
    check (array_position(reason_codes, null) is null)
    check (
      reason_codes <@ array['self_harm', 'suicide', 'acute_distress']::text[]
    ),
  checker_version text not null
    check (length(checker_version) between 1 and 64),
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (job_run_id)
);

create table safety_message_sources (
  safety_assessment_id uuid not null
    references safety_assessments(id) on delete cascade,
  message_id uuid not null references messages(id) on delete restrict,
  primary key (safety_assessment_id, message_id)
);

create index safety_assessments_day_level_idx
  on safety_assessments (day, level);
create index safety_message_sources_message_id_idx
  on safety_message_sources (message_id);

alter table safety_assessments enable row level security;
alter table safety_message_sources enable row level security;

revoke all on table safety_assessments, safety_message_sources
  from anon, authenticated, service_role;
grant select, insert, update, delete
  on table safety_assessments, safety_message_sources
  to service_role;

comment on table safety_assessments is
  'Restricted concern or urgent metadata only; none assessments are not persisted.';
comment on table safety_message_sources is
  'Validated immutable message evidence for a restricted safety assessment.';
