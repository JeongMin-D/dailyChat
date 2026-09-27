-- M3 E06 owner-confirmed memory deactivation from Telegram.

alter table public.memory_candidates
  add column forgotten_at timestamptz;

alter table public.memory_candidates
  drop constraint memory_candidates_status_check,
  drop constraint memory_candidates_decision_state_check,
  add constraint memory_candidates_status_check
    check (status in ('pending', 'confirmed', 'rejected', 'superseded', 'forgotten')),
  add constraint memory_candidates_decision_state_check
    check (
      (status = 'pending' and decided_at is null and decision_source is null
        and superseded_at is null and forgotten_at is null)
      or
      (status in ('confirmed', 'rejected') and decided_at is not null
        and decision_source is not null and superseded_at is null and forgotten_at is null)
      or
      (status = 'superseded' and decided_at is not null
        and decision_source is not null and superseded_at is not null and forgotten_at is null)
      or
      (status = 'forgotten' and decided_at is not null
        and decision_source is not null and superseded_at is null and forgotten_at is not null)
    );

create or replace function public.forget_memory_candidate(
  p_memory_candidate_id uuid,
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
  forgotten_day date;
begin
  select public.local_day(now(), settings.timezone, settings.day_boundary_hour)
  into forgotten_day
  from public.settings as settings
  where settings.id = 1
    and settings.telegram_user_id = p_telegram_user_id
    and settings.telegram_chat_id = p_telegram_chat_id;
  if forgotten_day is null then raise exception 'Telegram identity is not authorized'; end if;

  select * into candidate
  from public.memory_candidates
  where id = p_memory_candidate_id
  for update;
  if not found then raise exception 'memory candidate not found'; end if;

  if candidate.status = 'confirmed' then
    update public.memory_candidates
    set status = 'forgotten', forgotten_at = now(),
        valid_to = greatest(valid_from, forgotten_day), updated_at = now()
    where id = p_memory_candidate_id;
    return jsonb_build_object(
      'action', 'updated', 'status', 'forgotten', 'version', candidate.version
    );
  end if;
  if candidate.status = 'forgotten' then
    return jsonb_build_object(
      'action', 'noop', 'status', 'forgotten', 'version', candidate.version
    );
  end if;
  return jsonb_build_object('action', 'conflict', 'status', candidate.status);
end;
$$;

revoke all on function public.forget_memory_candidate(uuid, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.forget_memory_candidate(uuid, bigint, bigint)
  to service_role;

comment on column public.memory_candidates.forgotten_at is
  'Owner-requested logical deletion time; evidence remains for audit and recovery.';
comment on function public.forget_memory_candidate(uuid, bigint, bigint) is
  'Idempotently deactivates one confirmed memory for the configured Telegram owner.';
