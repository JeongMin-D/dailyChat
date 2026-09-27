-- M3 E01 memory candidates and traceable evidence relationships.
-- Candidate scoring and lifecycle transitions are implemented in later steps.

create table public.memory_candidates (
  id uuid primary key default gen_random_uuid(),
  job_run_id uuid not null references public.job_runs(id) on delete restrict,
  day date not null,
  category text not null
    check (category in (
      'profile',
      'preference',
      'relationship',
      'project',
      'decision',
      'routine',
      'health',
      'other'
    )),
  fact text not null check (length(fact) between 1 and 500),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected')),
  valid_from date not null,
  valid_to date check (valid_to is null or valid_to >= valid_from),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_run_id, category, fact)
);

create table public.memory_candidate_message_sources (
  memory_candidate_id uuid not null
    references public.memory_candidates(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete restrict,
  primary key (memory_candidate_id, message_id)
);

create table public.memory_candidate_event_sources (
  memory_candidate_id uuid not null
    references public.memory_candidates(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete restrict,
  primary key (memory_candidate_id, event_id)
);

create index memory_candidates_status_updated_at_idx
  on public.memory_candidates (status, updated_at desc);
create index memory_candidates_job_run_id_idx
  on public.memory_candidates (job_run_id);
create index memory_candidate_message_sources_message_id_idx
  on public.memory_candidate_message_sources (message_id);
create index memory_candidate_event_sources_event_id_idx
  on public.memory_candidate_event_sources (event_id);

alter table public.memory_candidates enable row level security;
alter table public.memory_candidate_message_sources enable row level security;
alter table public.memory_candidate_event_sources enable row level security;

revoke all on table
  public.memory_candidates,
  public.memory_candidate_message_sources,
  public.memory_candidate_event_sources
from anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.memory_candidates,
  public.memory_candidate_message_sources,
  public.memory_candidate_event_sources
to service_role;

comment on table public.memory_candidates is
  'Version-neutral memory candidates. Evidence is stored only in typed source relations.';
comment on table public.memory_candidate_message_sources is
  'Immutable message evidence for a memory candidate.';
comment on table public.memory_candidate_event_sources is
  'Validated derived-event evidence for a memory candidate.';
