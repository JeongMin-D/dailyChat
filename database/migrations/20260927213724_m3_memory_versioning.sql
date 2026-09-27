-- M3 E05 versioned memory replacement with user-confirmed conflict resolution.

alter table public.memory_candidates
  add column memory_key text,
  add column version integer not null default 1 check (version >= 1),
  add column supersedes_memory_candidate_id uuid
    references public.memory_candidates(id) on delete restrict,
  add column superseded_at timestamptz;

update public.memory_candidates
set memory_key = category || '_legacy_' || replace(id::text, '-', '');

alter table public.memory_candidates
  alter column memory_key set not null,
  add constraint memory_candidates_memory_key_check
    check (memory_key ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  add constraint memory_candidates_supersedes_once_unique
    unique (supersedes_memory_candidate_id),
  add constraint memory_candidates_not_self_superseding_check
    check (supersedes_memory_candidate_id is null or supersedes_memory_candidate_id <> id);

alter table public.memory_candidates
  drop constraint memory_candidates_status_check,
  drop constraint memory_candidates_decision_state_check,
  add constraint memory_candidates_status_check
    check (status in ('pending', 'confirmed', 'rejected', 'superseded')),
  add constraint memory_candidates_decision_state_check
    check (
      (status = 'pending' and decided_at is null and decision_source is null
        and superseded_at is null)
      or
      (status in ('confirmed', 'rejected') and decided_at is not null
        and decision_source is not null and superseded_at is null)
      or
      (status = 'superseded' and decided_at is not null
        and decision_source is not null and superseded_at is not null)
    );

create index memory_candidates_logical_key_idx
  on public.memory_candidates (category, memory_key, version desc);
create unique index memory_candidates_one_confirmed_key_idx
  on public.memory_candidates (category, memory_key)
  where status = 'confirmed';

create or replace function public.resolve_memory_candidate_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_candidate public.memory_candidates%rowtype;
begin
  new.memory_key := lower(trim(new.memory_key));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dailychat:memory:' || new.category || ':' || new.memory_key,
      0
    )
  );

  select * into current_candidate
  from public.memory_candidates
  where category = new.category
    and memory_key = new.memory_key
    and status in ('pending', 'confirmed')
  order by version desc, created_at desc
  limit 1
  for update;

  if not found then
    new.version := 1;
    new.supersedes_memory_candidate_id := null;
    return new;
  end if;

  if lower(trim(current_candidate.fact)) = lower(trim(new.fact))
     or current_candidate.status = 'pending' then
    new.version := current_candidate.version;
    new.supersedes_memory_candidate_id := null;
    new.status := 'rejected';
    new.decided_at := now();
    new.decision_source := 'automatic';
    new.superseded_at := null;
    return new;
  end if;

  new.version := current_candidate.version + 1;
  new.supersedes_memory_candidate_id := current_candidate.id;
  new.status := 'pending';
  new.decided_at := null;
  new.decision_source := null;
  new.superseded_at := null;
  return new;
end;
$$;

create trigger resolve_memory_candidate_version_before_insert
before insert on public.memory_candidates
for each row execute function public.resolve_memory_candidate_version();

create or replace function public.persist_nightly_extraction_versioned(
  p_job_run_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  run_row public.job_runs%rowtype;
  diary_row public.diaries%rowtype;
  next_version integer;
  save_result jsonb;
  candidate jsonb;
  candidate_id uuid;
  source_id uuid;
  invalid_source_id uuid;
  candidate_confidence numeric;
  candidate_category text;
  memory_candidate_count integer := 0;
begin
  select * into run_row
  from public.job_runs
  where id = p_job_run_id
  for update;

  if not found or run_row.job_type <> 'nightly' then
    raise exception 'nightly job run not found';
  end if;

  if run_row.status = 'succeeded' then
    select * into diary_row from public.diaries where job_run_id = p_job_run_id;
    if not found then raise exception 'succeeded nightly job is missing its diary'; end if;
    return jsonb_build_object(
      'action', 'noop', 'jobRunId', p_job_run_id,
      'diaryId', diary_row.id, 'diaryVersion', diary_row.version
    );
  end if;

  if run_row.status <> 'running' then raise exception 'nightly job run must be running'; end if;
  if jsonb_typeof(p_result -> 'memoryCandidates') <> 'array' then
    raise exception 'memoryCandidates must be an array';
  end if;

  select candidate_source.id into invalid_source_id
  from (
    select jsonb_array_elements_text(value -> 'sourceMessageIds')::uuid as id
    from jsonb_array_elements(p_result -> 'memoryCandidates')
  ) candidate_source
  left join public.messages
    on messages.id = candidate_source.id
   and messages.role = 'user'
   and messages.day = run_row.day
  where messages.id is null
  limit 1;
  if invalid_source_id is not null then
    raise exception 'memory candidate source message is outside the job snapshot day';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dailychat:diary:' || run_row.day::text, 0)
  );
  select coalesce(max(version), 0) + 1 into next_version
  from public.diaries where day = run_row.day;
  save_result := public.persist_nightly_extraction(p_job_run_id, p_result, next_version);

  for candidate in select value from jsonb_array_elements(p_result -> 'memoryCandidates')
  loop
    if jsonb_array_length(candidate -> 'sourceMessageIds') < 1 then
      raise exception 'memory candidate requires a source message';
    end if;
    if candidate ->> 'validFrom' <> run_row.day::text
       or jsonb_typeof(candidate -> 'validTo') <> 'null' then
      raise exception 'new memory candidate validity must match the job day';
    end if;

    candidate_confidence := (candidate ->> 'confidence')::numeric;
    candidate_category := candidate ->> 'category';
    insert into public.memory_candidates (
      job_run_id, day, category, memory_key, fact, confidence, status,
      valid_from, valid_to, decided_at, decision_source
    ) values (
      p_job_run_id, run_row.day, candidate_category, candidate ->> 'memoryKey',
      candidate ->> 'fact', candidate_confidence,
      case when candidate_category <> 'health' and candidate_confidence >= 0.8
        then 'confirmed' else 'pending' end,
      (candidate ->> 'validFrom')::date, (candidate ->> 'validTo')::date,
      case when candidate_category <> 'health' and candidate_confidence >= 0.8
        then now() else null end,
      case when candidate_category <> 'health' and candidate_confidence >= 0.8
        then 'automatic' else null end
    ) returning id into candidate_id;

    for source_id in select jsonb_array_elements_text(candidate -> 'sourceMessageIds')::uuid
    loop
      insert into public.memory_candidate_message_sources (memory_candidate_id, message_id)
      values (candidate_id, source_id);
    end loop;
    memory_candidate_count := memory_candidate_count + 1;
  end loop;

  return jsonb_build_object(
    'action', 'saved', 'memoryCandidateCount', memory_candidate_count
  ) || save_result;
end;
$$;

create or replace function public.decide_memory_candidate(
  p_memory_candidate_id uuid,
  p_decision text,
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate public.memory_candidates%rowtype;
  previous_candidate public.memory_candidates%rowtype;
  target_status text;
begin
  if not exists (
    select 1 from public.settings
    where id = 1
      and telegram_user_id = p_telegram_user_id
      and telegram_chat_id = p_telegram_chat_id
  ) then
    raise exception 'Telegram identity is not authorized';
  end if;
  if p_decision not in ('confirm', 'reject') then
    raise exception 'memory decision is invalid';
  end if;
  target_status := case when p_decision = 'confirm' then 'confirmed' else 'rejected' end;

  select * into candidate
  from public.memory_candidates
  where id = p_memory_candidate_id
  for update;
  if not found then raise exception 'memory candidate not found'; end if;

  if candidate.status = 'pending' then
    if target_status = 'confirmed' and candidate.supersedes_memory_candidate_id is not null then
      select * into previous_candidate
      from public.memory_candidates
      where id = candidate.supersedes_memory_candidate_id
      for update;
      if not found or previous_candidate.status <> 'confirmed' then
        return jsonb_build_object('action', 'conflict', 'status', candidate.status);
      end if;
      update public.memory_candidates
      set status = 'superseded', superseded_at = now(),
          valid_to = greatest(valid_from, candidate.valid_from), updated_at = now()
      where id = previous_candidate.id;
    end if;

    update public.memory_candidates
    set status = target_status, decided_at = now(),
        decision_source = 'telegram', updated_at = now()
    where id = p_memory_candidate_id;
    return jsonb_build_object(
      'action', 'updated', 'status', target_status, 'version', candidate.version
    );
  end if;
  if candidate.status = target_status then
    return jsonb_build_object(
      'action', 'noop', 'status', target_status, 'version', candidate.version
    );
  end if;
  return jsonb_build_object('action', 'conflict', 'status', candidate.status);
end;
$$;

revoke all on function public.resolve_memory_candidate_version()
  from public, anon, authenticated, service_role;
revoke all on function public.persist_nightly_extraction_versioned(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.decide_memory_candidate(uuid, text, bigint, bigint)
  from public, anon, authenticated;

grant execute on function public.persist_nightly_extraction_versioned(uuid, jsonb)
  to service_role;
grant execute on function public.decide_memory_candidate(uuid, text, bigint, bigint)
  to service_role;

comment on column public.memory_candidates.memory_key is
  'Stable model-provided key for one logical fact across versions.';
comment on column public.memory_candidates.version is
  'Monotonic confirmed replacement version within category and memory_key.';
comment on function public.resolve_memory_candidate_version() is
  'Serializes memory keys, rejects duplicates, and requires confirmation for replacements.';
