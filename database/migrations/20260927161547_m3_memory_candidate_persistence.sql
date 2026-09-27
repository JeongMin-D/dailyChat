-- M3 E02 atomically persists validated memory candidates with nightly output.

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
  memory_candidate_count integer := 0;
begin
  select *
  into run_row
  from public.job_runs
  where id = p_job_run_id
  for update;

  if not found or run_row.job_type <> 'nightly' then
    raise exception 'nightly job run not found';
  end if;

  if run_row.status = 'succeeded' then
    select *
    into diary_row
    from public.diaries
    where job_run_id = p_job_run_id;
    if not found then
      raise exception 'succeeded nightly job is missing its diary';
    end if;
    return jsonb_build_object(
      'action', 'noop',
      'jobRunId', p_job_run_id,
      'diaryId', diary_row.id,
      'diaryVersion', diary_row.version
    );
  end if;

  if run_row.status <> 'running' then
    raise exception 'nightly job run must be running';
  end if;
  if jsonb_typeof(p_result -> 'memoryCandidates') <> 'array' then
    raise exception 'memoryCandidates must be an array';
  end if;

  select candidate_source.id
  into invalid_source_id
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
  select coalesce(max(version), 0) + 1
  into next_version
  from public.diaries
  where day = run_row.day;

  save_result := public.persist_nightly_extraction(
    p_job_run_id,
    p_result,
    next_version
  );

  for candidate in
    select value from jsonb_array_elements(p_result -> 'memoryCandidates')
  loop
    if jsonb_array_length(candidate -> 'sourceMessageIds') < 1 then
      raise exception 'memory candidate requires a source message';
    end if;
    if candidate ->> 'validFrom' <> run_row.day::text
       or jsonb_typeof(candidate -> 'validTo') <> 'null' then
      raise exception 'new memory candidate validity must match the job day';
    end if;

    insert into public.memory_candidates (
      job_run_id,
      day,
      category,
      fact,
      confidence,
      valid_from,
      valid_to
    ) values (
      p_job_run_id,
      run_row.day,
      candidate ->> 'category',
      candidate ->> 'fact',
      (candidate ->> 'confidence')::numeric,
      (candidate ->> 'validFrom')::date,
      (candidate ->> 'validTo')::date
    ) returning id into candidate_id;

    for source_id in
      select jsonb_array_elements_text(candidate -> 'sourceMessageIds')::uuid
    loop
      insert into public.memory_candidate_message_sources (
        memory_candidate_id,
        message_id
      ) values (candidate_id, source_id);
    end loop;

    memory_candidate_count := memory_candidate_count + 1;
  end loop;

  return jsonb_build_object(
    'action', 'saved',
    'memoryCandidateCount', memory_candidate_count
  ) || save_result;
end;
$$;

revoke all on function public.persist_nightly_extraction_versioned(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_nightly_extraction_versioned(uuid, jsonb)
  to service_role;

comment on function public.persist_nightly_extraction_versioned(uuid, jsonb) is
  'Allocates a diary version and atomically persists nightly output and memory candidates.';
