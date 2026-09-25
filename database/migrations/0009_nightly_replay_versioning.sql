-- Idempotent nightly job preparation and concurrency-safe diary version allocation.

create or replace function public.prepare_nightly_job(
  p_day date,
  p_pipeline_version text,
  p_input_hash text,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_schema_version text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  job_row public.job_runs%rowtype;
  diary_row public.diaries%rowtype;
  created boolean := false;
  result_action text;
begin
  insert into public.job_runs (
    job_type,
    day,
    status,
    pipeline_version,
    input_hash,
    provider,
    model,
    prompt_version,
    schema_version
  ) values (
    'nightly',
    p_day,
    'queued',
    p_pipeline_version,
    p_input_hash,
    p_provider,
    p_model,
    p_prompt_version,
    p_schema_version
  )
  on conflict (job_type, day, pipeline_version, input_hash) do nothing
  returning * into job_row;

  if found then
    created := true;
  else
    select *
    into job_row
    from public.job_runs
    where job_type = 'nightly'
      and day = p_day
      and pipeline_version = p_pipeline_version
      and input_hash = p_input_hash
    for update;
  end if;

  if job_row.provider <> p_provider
     or job_row.model <> p_model
     or job_row.prompt_version <> p_prompt_version
     or job_row.schema_version <> p_schema_version then
    raise exception 'nightly job metadata mismatch; change pipeline version';
  end if;

  if created then
    result_action := 'created';
  elsif job_row.status = 'succeeded' then
    result_action := 'noop';
    select *
    into diary_row
    from public.diaries
    where job_run_id = job_row.id;
    if not found then
      raise exception 'succeeded nightly job is missing its diary';
    end if;
  elsif job_row.status in ('queued', 'retryable_failed') then
    result_action := 'resume';
  elsif job_row.status = 'running' then
    result_action := 'in_progress';
  else
    result_action := 'terminal_failed';
  end if;

  return jsonb_build_object(
    'action', result_action,
    'jobRunId', job_row.id,
    'status', job_row.status,
    'diaryId', diary_row.id,
    'diaryVersion', diary_row.version
  );
end;
$$;

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
  return jsonb_build_object('action', 'saved') || save_result;
end;
$$;

revoke all on function public.prepare_nightly_job(
  date, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.prepare_nightly_job(
  date, text, text, text, text, text, text
) to service_role;

revoke all on function public.persist_nightly_extraction_versioned(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_nightly_extraction_versioned(uuid, jsonb)
  to service_role;

comment on function public.prepare_nightly_job(date, text, text, text, text, text, text) is
  'Creates one nightly job identity or returns a stable replay action.';
comment on function public.persist_nightly_extraction_versioned(uuid, jsonb) is
  'Allocates a day-scoped diary version and atomically persists the result.';
