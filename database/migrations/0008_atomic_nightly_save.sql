-- Atomically persist one validated nightly extraction and all evidence links.
-- The Worker validates the complete JSON contract before invoking this RPC;
-- the database repeats trust-boundary checks for the run, day and source rows.

create or replace function public.persist_nightly_extraction(
  p_job_run_id uuid,
  p_result jsonb,
  p_diary_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  run_row public.job_runs%rowtype;
  item jsonb;
  block jsonb;
  source_id uuid;
  invalid_source_id uuid;
  event_id uuid;
  mood_entry_id uuid;
  health_entry_id uuid;
  safety_assessment_id uuid;
  diary_id uuid;
  diary_block_id uuid;
  event_ref text;
  event_ids jsonb := '{}'::jsonb;
  block_position integer := 0;
  event_count integer := 0;
  mood_count integer := 0;
  health_count integer := 0;
  diary_block_count integer := 0;
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'nightly result must be a JSON object';
  end if;
  if p_diary_version is null or p_diary_version < 1 then
    raise exception 'diary version must be positive';
  end if;

  select *
  into run_row
  from public.job_runs
  where id = p_job_run_id
  for update;

  if not found then
    raise exception 'nightly job run not found';
  end if;
  if run_row.job_type <> 'nightly' or run_row.status <> 'running' then
    raise exception 'nightly job run must be running';
  end if;
  if run_row.day::text <> p_result ->> 'day' then
    raise exception 'nightly result day does not match job run';
  end if;
  if run_row.schema_version <> p_result ->> 'schemaVersion' then
    raise exception 'nightly result schema version does not match job run';
  end if;
  if exists (select 1 from public.diaries where job_run_id = p_job_run_id) then
    raise exception 'nightly output already persisted for job run';
  end if;

  with source_ids as (
    select jsonb_array_elements_text(value -> 'sourceMessageIds')::uuid as id
    from jsonb_array_elements(p_result -> 'events')
    union
    select jsonb_array_elements_text(value -> 'sourceMessageIds')::uuid
    from jsonb_array_elements(p_result -> 'moods')
    union
    select jsonb_array_elements_text(value -> 'sourceMessageIds')::uuid
    from jsonb_array_elements(p_result -> 'healthEntries')
    union
    select jsonb_array_elements_text(p_result -> 'safety' -> 'sourceMessageIds')::uuid
    union
    select jsonb_array_elements_text(value -> 'sourceMessageIds')::uuid
    from jsonb_array_elements(p_result -> 'diary' -> 'blocks')
  )
  select source_ids.id
  into invalid_source_id
  from source_ids
  left join public.messages
    on messages.id = source_ids.id
   and messages.role = 'user'
   and messages.day = run_row.day
  where messages.id is null
  limit 1;

  if invalid_source_id is not null then
    raise exception 'nightly source message is outside the job snapshot day';
  end if;

  for item in select value from jsonb_array_elements(p_result -> 'events') loop
    event_ref := item ->> 'eventRef';
    if event_ids ? event_ref then
      raise exception 'duplicate event reference';
    end if;

    insert into public.events (
      job_run_id, day, type, summary, occurred_at, people, keywords, confidence
    ) values (
      p_job_run_id,
      run_row.day,
      item ->> 'type',
      item ->> 'summary',
      (item ->> 'occurredAt')::timestamptz,
      array(select jsonb_array_elements_text(item -> 'people')),
      array(select jsonb_array_elements_text(item -> 'keywords')),
      (item ->> 'confidence')::numeric
    ) returning id into event_id;

    event_ids := event_ids || jsonb_build_object(event_ref, event_id);
    event_count := event_count + 1;
    for source_id in
      select jsonb_array_elements_text(item -> 'sourceMessageIds')::uuid
    loop
      insert into public.event_message_sources (event_id, message_id)
      values (event_id, source_id);
    end loop;
  end loop;

  for item in select value from jsonb_array_elements(p_result -> 'moods') loop
    insert into public.mood_entries (
      job_run_id, day, score, label, source, confidence
    ) values (
      p_job_run_id,
      run_row.day,
      (item ->> 'score')::smallint,
      item ->> 'label',
      item ->> 'source',
      (item ->> 'confidence')::numeric
    ) returning id into mood_entry_id;

    mood_count := mood_count + 1;
    for source_id in
      select jsonb_array_elements_text(item -> 'sourceMessageIds')::uuid
    loop
      insert into public.mood_message_sources (mood_entry_id, message_id)
      values (mood_entry_id, source_id);
    end loop;
  end loop;

  for item in select value from jsonb_array_elements(p_result -> 'healthEntries') loop
    insert into public.health_entries (
      job_run_id, day, symptom, severity, note, occurred_at, confidence
    ) values (
      p_job_run_id,
      run_row.day,
      item ->> 'symptom',
      (item ->> 'severity')::smallint,
      item ->> 'note',
      (item ->> 'occurredAt')::timestamptz,
      (item ->> 'confidence')::numeric
    ) returning id into health_entry_id;

    health_count := health_count + 1;
    for source_id in
      select jsonb_array_elements_text(item -> 'sourceMessageIds')::uuid
    loop
      insert into public.health_message_sources (health_entry_id, message_id)
      values (health_entry_id, source_id);
    end loop;
  end loop;

  insert into public.diaries (
    job_run_id, day, version, title, summary_mood, tags
  ) values (
    p_job_run_id,
    run_row.day,
    p_diary_version,
    p_result -> 'diary' ->> 'title',
    p_result -> 'diary' ->> 'summaryMood',
    array(select jsonb_array_elements_text(p_result -> 'diary' -> 'tags'))
  ) returning id into diary_id;

  for block in select value from jsonb_array_elements(p_result -> 'diary' -> 'blocks') loop
    insert into public.diary_blocks (diary_id, position, text)
    values (diary_id, block_position, block ->> 'text')
    returning id into diary_block_id;

    diary_block_count := diary_block_count + 1;
    block_position := block_position + 1;
    for source_id in
      select jsonb_array_elements_text(block -> 'sourceMessageIds')::uuid
    loop
      insert into public.diary_block_message_sources (diary_block_id, message_id)
      values (diary_block_id, source_id);
    end loop;

    for event_ref in
      select jsonb_array_elements_text(block -> 'sourceEventRefs')
    loop
      event_id := (event_ids ->> event_ref)::uuid;
      if event_id is null then
        raise exception 'diary block references an unknown event';
      end if;
      insert into public.diary_block_event_sources (diary_block_id, event_id)
      values (diary_block_id, event_id);
    end loop;
  end loop;

  if p_result -> 'safety' ->> 'level' in ('concern', 'urgent') then
    insert into public.safety_assessments (
      job_run_id, day, level, reason_codes, checker_version
    ) values (
      p_job_run_id,
      run_row.day,
      p_result -> 'safety' ->> 'level',
      array(select jsonb_array_elements_text(p_result -> 'safety' -> 'reasonCodes')),
      p_result -> 'safety' ->> 'checkerVersion'
    ) returning id into safety_assessment_id;

    for source_id in
      select jsonb_array_elements_text(p_result -> 'safety' -> 'sourceMessageIds')::uuid
    loop
      insert into public.safety_message_sources (safety_assessment_id, message_id)
      values (safety_assessment_id, source_id);
    end loop;
  end if;

  update public.job_runs
  set status = 'succeeded',
      finished_at = now(),
      updated_at = now(),
      error_code = null
  where id = p_job_run_id;

  return jsonb_build_object(
    'jobRunId', p_job_run_id,
    'diaryId', diary_id,
    'diaryVersion', p_diary_version,
    'eventCount', event_count,
    'moodCount', mood_count,
    'healthEntryCount', health_count,
    'diaryBlockCount', diary_block_count,
    'safetyPersisted', safety_assessment_id is not null
  );
end;
$$;

revoke all on function public.persist_nightly_extraction(uuid, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.persist_nightly_extraction(uuid, jsonb, integer)
  to service_role;

comment on function public.persist_nightly_extraction(uuid, jsonb, integer) is
  'Atomically persists one validated nightly extraction and its evidence links.';
