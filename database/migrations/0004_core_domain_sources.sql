-- M2 core domain tables and traceable source relationships.
-- Cross-row rules such as snapshot membership and at least one source per parent
-- are validated by the Worker and persisted in one transaction.

create table events (
  id uuid primary key default gen_random_uuid(),
  job_run_id uuid not null references job_runs(id) on delete restrict,
  day date not null,
  type text not null
    check (type in ('work', 'social', 'health', 'family', 'hobby', 'other')),
  summary text not null check (length(summary) between 1 and 500),
  occurred_at timestamptz,
  people text[] not null default '{}'::text[]
    check (cardinality(people) <= 20),
  keywords text[] not null default '{}'::text[]
    check (cardinality(keywords) <= 20),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table mood_entries (
  id uuid primary key default gen_random_uuid(),
  job_run_id uuid not null references job_runs(id) on delete restrict,
  day date not null,
  score smallint not null check (score between 1 and 5),
  label text not null check (length(label) between 1 and 80),
  source text not null check (source in ('inferred', 'checkin')),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table health_entries (
  id uuid primary key default gen_random_uuid(),
  job_run_id uuid not null references job_runs(id) on delete restrict,
  day date not null,
  symptom text not null check (length(symptom) between 1 and 120),
  severity smallint check (severity between 1 and 3),
  note text check (note is null or length(note) between 1 and 500),
  occurred_at timestamptz,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table diaries (
  id uuid primary key default gen_random_uuid(),
  job_run_id uuid not null references job_runs(id) on delete restrict,
  day date not null,
  version integer not null check (version > 0),
  title text not null check (length(title) between 1 and 40),
  summary_mood text
    check (summary_mood is null or length(summary_mood) between 1 and 120),
  tags text[] not null default '{}'::text[]
    check (cardinality(tags) <= 10),
  created_at timestamptz not null default now(),
  unique (day, version)
);

create table diary_blocks (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries(id) on delete cascade,
  position integer not null check (position >= 0),
  text text not null check (length(text) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (diary_id, position)
);

create table event_message_sources (
  event_id uuid not null references events(id) on delete cascade,
  message_id uuid not null references messages(id) on delete restrict,
  primary key (event_id, message_id)
);

create table mood_message_sources (
  mood_entry_id uuid not null references mood_entries(id) on delete cascade,
  message_id uuid not null references messages(id) on delete restrict,
  primary key (mood_entry_id, message_id)
);

create table health_message_sources (
  health_entry_id uuid not null references health_entries(id) on delete cascade,
  message_id uuid not null references messages(id) on delete restrict,
  primary key (health_entry_id, message_id)
);

create table diary_block_message_sources (
  diary_block_id uuid not null references diary_blocks(id) on delete cascade,
  message_id uuid not null references messages(id) on delete restrict,
  primary key (diary_block_id, message_id)
);

create table diary_block_event_sources (
  diary_block_id uuid not null references diary_blocks(id) on delete cascade,
  event_id uuid not null references events(id) on delete restrict,
  primary key (diary_block_id, event_id)
);

create index events_day_occurred_at_idx on events (day, occurred_at);
create index events_job_run_id_idx on events (job_run_id);
create index mood_entries_day_idx on mood_entries (day);
create index mood_entries_job_run_id_idx on mood_entries (job_run_id);
create index health_entries_day_idx on health_entries (day);
create index health_entries_job_run_id_idx on health_entries (job_run_id);
create index health_entries_symptom_idx on health_entries (symptom);
create index diaries_job_run_id_idx on diaries (job_run_id);
create index event_message_sources_message_id_idx
  on event_message_sources (message_id);
create index mood_message_sources_message_id_idx
  on mood_message_sources (message_id);
create index health_message_sources_message_id_idx
  on health_message_sources (message_id);
create index diary_block_message_sources_message_id_idx
  on diary_block_message_sources (message_id);
create index diary_block_event_sources_event_id_idx
  on diary_block_event_sources (event_id);

alter table events enable row level security;
alter table mood_entries enable row level security;
alter table health_entries enable row level security;
alter table diaries enable row level security;
alter table diary_blocks enable row level security;
alter table event_message_sources enable row level security;
alter table mood_message_sources enable row level security;
alter table health_message_sources enable row level security;
alter table diary_block_message_sources enable row level security;
alter table diary_block_event_sources enable row level security;

revoke all on table
  events,
  mood_entries,
  health_entries,
  diaries,
  diary_blocks,
  event_message_sources,
  mood_message_sources,
  health_message_sources,
  diary_block_message_sources,
  diary_block_event_sources
from anon, authenticated, service_role;

grant select, insert, update, delete on table
  events,
  mood_entries,
  health_entries,
  diaries,
  diary_blocks,
  event_message_sources,
  mood_message_sources,
  health_message_sources,
  diary_block_message_sources,
  diary_block_event_sources
to service_role;

comment on table events is
  'Structured nightly events. Evidence is stored in event_message_sources.';
comment on table mood_entries is
  'Structured mood observations with inferred and explicit check-in sources.';
comment on table health_entries is
  'Non-diagnostic health observations extracted from immutable messages.';
comment on table diaries is
  'Versioned final diaries. Text is split into evidence-bearing diary_blocks.';
comment on table diary_blocks is
  'Ordered diary text units with direct message and optional event evidence.';
