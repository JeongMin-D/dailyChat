-- Privacy deletion for one closed local day. The caller must be the configured owner
-- and repeat the exact day as a confirmation string.

create or replace function public.delete_personal_data_for_day(
  p_day date,
  p_confirm_day text,
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_day date;
  target_job_ids uuid[];
  target_message_ids uuid[];
  target_update_ids bigint[];
  target_memory_ids uuid[];
  deleted_notifications integer := 0;
  deleted_memory_notifications integer := 0;
  deleted_memories integer := 0;
  deleted_safety integer := 0;
  deleted_diaries integer := 0;
  deleted_health integer := 0;
  deleted_moods integer := 0;
  deleted_events integer := 0;
  deleted_messages integer := 0;
  deleted_updates integer := 0;
  deleted_jobs integer := 0;
begin
  if p_day is null or p_confirm_day is distinct from p_day::text then
    raise exception 'exact deletion day confirmation is required';
  end if;

  select public.local_day(now(), settings.timezone, settings.day_boundary_hour)
  into current_day
  from public.settings as settings
  where settings.id = 1
    and settings.telegram_user_id = p_telegram_user_id
    and settings.telegram_chat_id = p_telegram_chat_id;
  if current_day is null then raise exception 'Telegram identity is not authorized'; end if;
  if p_day >= current_day then raise exception 'only closed local days can be deleted'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dailychat:diary:' || p_day::text, 0)
  );

  select coalesce(pg_catalog.array_agg(id), '{}'::uuid[])
  into target_job_ids
  from public.job_runs
  where day = p_day;

  select coalesce(pg_catalog.array_agg(id), '{}'::uuid[])
  into target_message_ids
  from public.messages
  where day = p_day;

  select coalesce(
    pg_catalog.array_agg(distinct update_id) filter (where update_id is not null),
    '{}'::bigint[]
  )
  into target_update_ids
  from (
    select telegram_update_id as update_id
    from public.messages where day = p_day
    union all
    select reply_to_update_id
    from public.messages where day = p_day
  ) updates;

  if exists (
    select 1 from public.job_runs
    where id = any(target_job_ids) and status = 'running'
  ) or exists (
    select 1 from public.notification_outbox
    where job_run_id = any(target_job_ids) and status = 'sending'
  ) or exists (
    select 1 from public.memory_confirmation_outbox
    where job_run_id = any(target_job_ids) and status = 'sending'
  ) then
    raise exception 'day has an active job or notification';
  end if;

  if exists (
    select 1 from public.event_message_sources source
    join public.events derived on derived.id = source.event_id
    where source.message_id = any(target_message_ids) and derived.day <> p_day
    union all
    select 1 from public.mood_message_sources source
    join public.mood_entries derived on derived.id = source.mood_entry_id
    where source.message_id = any(target_message_ids) and derived.day <> p_day
    union all
    select 1 from public.health_message_sources source
    join public.health_entries derived on derived.id = source.health_entry_id
    where source.message_id = any(target_message_ids) and derived.day <> p_day
    union all
    select 1 from public.diary_block_message_sources source
    join public.diary_blocks block on block.id = source.diary_block_id
    join public.diaries derived on derived.id = block.diary_id
    where source.message_id = any(target_message_ids) and derived.day <> p_day
    union all
    select 1 from public.safety_message_sources source
    join public.safety_assessments derived on derived.id = source.safety_assessment_id
    where source.message_id = any(target_message_ids) and derived.day <> p_day
    union all
    select 1 from public.memory_candidate_message_sources source
    join public.memory_candidates derived on derived.id = source.memory_candidate_id
    where source.message_id = any(target_message_ids) and derived.day <> p_day
  ) then
    raise exception 'cross-day source dependency requires manual review';
  end if;

  select coalesce(pg_catalog.array_agg(id), '{}'::uuid[])
  into target_memory_ids
  from public.memory_candidates
  where day = p_day or job_run_id = any(target_job_ids);

  delete from public.memory_confirmation_outbox
  where job_run_id = any(target_job_ids)
     or memory_candidate_id = any(target_memory_ids);
  get diagnostics deleted_memory_notifications = row_count;

  update public.memory_candidates
  set supersedes_memory_candidate_id = null, updated_at = now()
  where supersedes_memory_candidate_id = any(target_memory_ids)
    and id <> all(target_memory_ids);

  delete from public.memory_candidates
  where id = any(target_memory_ids);
  get diagnostics deleted_memories = row_count;

  delete from public.notification_outbox
  where job_run_id = any(target_job_ids)
     or diary_id in (
       select id from public.diaries
       where day = p_day or job_run_id = any(target_job_ids)
     );
  get diagnostics deleted_notifications = row_count;

  delete from public.safety_assessments
  where day = p_day or job_run_id = any(target_job_ids);
  get diagnostics deleted_safety = row_count;

  delete from public.diaries
  where day = p_day or job_run_id = any(target_job_ids);
  get diagnostics deleted_diaries = row_count;

  delete from public.health_entries
  where day = p_day or job_run_id = any(target_job_ids);
  get diagnostics deleted_health = row_count;

  delete from public.mood_entries
  where day = p_day or job_run_id = any(target_job_ids);
  get diagnostics deleted_moods = row_count;

  delete from public.events
  where day = p_day or job_run_id = any(target_job_ids);
  get diagnostics deleted_events = row_count;

  delete from public.messages where id = any(target_message_ids);
  get diagnostics deleted_messages = row_count;

  delete from public.telegram_updates where update_id = any(target_update_ids);
  get diagnostics deleted_updates = row_count;

  delete from public.job_runs where id = any(target_job_ids);
  get diagnostics deleted_jobs = row_count;

  return pg_catalog.jsonb_build_object(
    'day', p_day,
    'notifications', deleted_notifications,
    'memoryNotifications', deleted_memory_notifications,
    'memories', deleted_memories,
    'safetyAssessments', deleted_safety,
    'diaries', deleted_diaries,
    'healthEntries', deleted_health,
    'moodEntries', deleted_moods,
    'events', deleted_events,
    'messages', deleted_messages,
    'telegramUpdates', deleted_updates,
    'jobRuns', deleted_jobs
  );
end;
$$;

revoke all on function public.delete_personal_data_for_day(date, text, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.delete_personal_data_for_day(date, text, bigint, bigint)
  to service_role;

comment on function public.delete_personal_data_for_day(date, text, bigint, bigint) is
  'Atomically deletes one closed local day after exact confirmation and owner validation.';
