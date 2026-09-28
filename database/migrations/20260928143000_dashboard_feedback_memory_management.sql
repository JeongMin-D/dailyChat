-- M4 F07-F08 owner-only diary feedback and memory management.

alter table public.memory_candidates
  drop constraint memory_candidates_decision_source_check,
  add constraint memory_candidates_decision_source_check
    check (decision_source in ('automatic', 'telegram', 'dashboard'));

create table public.diary_feedback (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null unique references public.diaries(id) on delete cascade,
  rating text not null check (rating in ('helpful', 'unhelpful')),
  note text check (note is null or length(note) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.diary_feedback enable row level security;
revoke all on table public.diary_feedback from anon, authenticated, service_role;
grant select, insert, update, delete on table public.diary_feedback to service_role;

create or replace function public.save_diary_feedback(
  p_diary_id uuid,
  p_rating text,
  p_note text,
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare feedback_id uuid;
begin
  if not exists (
    select 1 from public.settings
    where id = 1 and telegram_user_id = p_telegram_user_id
      and telegram_chat_id = p_telegram_chat_id
  ) then raise exception 'Telegram identity is not authorized'; end if;
  if p_rating not in ('helpful', 'unhelpful') then raise exception 'feedback rating is invalid'; end if;
  if nullif(trim(p_note), '') is not null and length(trim(p_note)) not between 1 and 500 then
    raise exception 'feedback note is invalid';
  end if;
  if not exists (select 1 from public.diaries where id = p_diary_id) then
    raise exception 'diary not found';
  end if;

  insert into public.diary_feedback (diary_id, rating, note)
  values (p_diary_id, p_rating, nullif(trim(p_note), ''))
  on conflict (diary_id) do update
    set rating = excluded.rating, note = excluded.note, updated_at = now()
  returning id into feedback_id;
  return jsonb_build_object('id', feedback_id, 'rating', p_rating);
end;
$$;

create or replace function public.update_memory_candidate_from_dashboard(
  p_memory_candidate_id uuid,
  p_fact text,
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare current_candidate public.memory_candidates%rowtype;
declare next_candidate public.memory_candidates%rowtype;
begin
  if not exists (
    select 1 from public.settings
    where id = 1 and telegram_user_id = p_telegram_user_id
      and telegram_chat_id = p_telegram_chat_id
  ) then raise exception 'Telegram identity is not authorized'; end if;
  if length(trim(p_fact)) not between 1 and 500 then raise exception 'memory fact is invalid'; end if;

  select * into current_candidate from public.memory_candidates
  where id = p_memory_candidate_id for update;
  if not found then raise exception 'memory candidate not found'; end if;
  if current_candidate.status <> 'confirmed' then
    return jsonb_build_object('action', 'conflict', 'status', current_candidate.status);
  end if;
  if lower(trim(current_candidate.fact)) = lower(trim(p_fact)) then
    return jsonb_build_object('action', 'noop', 'id', current_candidate.id,
      'version', current_candidate.version);
  end if;

  insert into public.memory_candidates (
    job_run_id, day, category, memory_key, fact, confidence, status,
    valid_from, valid_to
  ) values (
    current_candidate.job_run_id, current_candidate.day, current_candidate.category,
    current_candidate.memory_key, trim(p_fact), current_candidate.confidence, 'pending',
    current_candidate.valid_from, current_candidate.valid_to
  ) returning * into next_candidate;

  insert into public.memory_candidate_message_sources (memory_candidate_id, message_id)
  select next_candidate.id, message_id from public.memory_candidate_message_sources
  where memory_candidate_id = current_candidate.id;
  insert into public.memory_candidate_event_sources (memory_candidate_id, event_id)
  select next_candidate.id, event_id from public.memory_candidate_event_sources
  where memory_candidate_id = current_candidate.id;

  update public.memory_candidates
  set status = 'superseded', superseded_at = now(),
      valid_to = greatest(valid_from, next_candidate.valid_from), updated_at = now()
  where id = current_candidate.id;
  update public.memory_candidates
  set status = 'confirmed', decided_at = now(), decision_source = 'dashboard', updated_at = now()
  where id = next_candidate.id;

  return jsonb_build_object('action', 'updated', 'id', next_candidate.id,
    'version', next_candidate.version);
end;
$$;

revoke all on function public.save_diary_feedback(uuid, text, text, bigint, bigint)
  from public, anon, authenticated;
revoke all on function public.update_memory_candidate_from_dashboard(uuid, text, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.save_diary_feedback(uuid, text, text, bigint, bigint)
  to service_role;
grant execute on function public.update_memory_candidate_from_dashboard(uuid, text, bigint, bigint)
  to service_role;
