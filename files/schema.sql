-- =====================================================================
-- MindCompanion (개인용) Supabase / PostgreSQL 스키마
-- 사용법: Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 실행
-- 전제: 사용자는 나 한 명. 쓰기는 게이트웨이 서버(service_role 키),
--       읽기는 대시보드(내 이메일로 로그인)만 가능.
-- =====================================================================

create extension if not exists pg_trgm;   -- 한글 부분일치 검색용
create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- 0. 설정 (단일 행)
-- ---------------------------------------------------------------------
create table settings (
  id                int primary key default 1 check (id = 1),
  owner_email       text not null,                -- ★ 본인 이메일로 교체
  telegram_chat_id  bigint,
  timezone          text not null default 'Asia/Seoul',
  day_boundary_hour int  not null default 4,      -- 새벽 4시 전 대화는 '전날'로 취급
  diary_time        time not null default '23:30',
  quiet_hours       jsonb not null default '{"start":"23:00","end":"08:00"}',
  proactive_enabled boolean not null default true,
  diary_tone        text not null default 'warm'  -- warm | plain | humor
);

insert into settings (owner_email) values ('you@example.com');  -- ★ 교체

-- ---------------------------------------------------------------------
-- 하루의 경계 계산 (UTC 저장 → 로컬 날짜 변환)
-- 예: local_day(now(), 'Asia/Seoul', 4)
-- ---------------------------------------------------------------------
create or replace function local_day(
  ts timestamptz,
  tz text default 'Asia/Seoul',
  boundary_hour int default 4
) returns date
language sql stable as $$
  select ((ts at time zone tz) - make_interval(hours => boundary_hour))::date
$$;

-- ---------------------------------------------------------------------
-- 1. 원문 대화 로그 (추출 전 원본. 일기/추출의 근거 데이터)
-- ---------------------------------------------------------------------
create table messages (
  id           uuid primary key default gen_random_uuid(),
  sent_at      timestamptz not null default now(),
  day          date not null,                     -- local_day() 로 계산해서 삽입
  role         text not null check (role in ('user','assistant')),
  text         text not null,
  telegram_msg_id bigint,
  unique (telegram_msg_id, role)
);
create index messages_day_idx on messages (day, sent_at);

-- ---------------------------------------------------------------------
-- 2. 추출된 이벤트 (하루 밤 배치 또는 실시간 툴로 채움)
-- ---------------------------------------------------------------------
create table events (
  id             uuid primary key default gen_random_uuid(),
  day            date not null,
  occurred_at    timestamptz,
  type           text,                            -- work | social | health | family | hobby | other
  summary        text not null,
  people         text[] not null default '{}',
  keywords       text[] not null default '{}',
  confidence     numeric(3,2) check (confidence between 0 and 1),
  message_id     uuid references messages(id) on delete set null,
  user_corrected boolean not null default false,
  created_at     timestamptz not null default now()
);
create index events_day_idx on events (day);
create index events_summary_trgm on events using gin (summary gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 3. 건강 기록 (증상별 시계열 → 트렌드 차트용)
-- ---------------------------------------------------------------------
create table health_entries (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  logged_at   timestamptz,
  symptom     text not null,                      -- 두통, 피로, 소화불량 ...
  severity    smallint check (severity between 1 and 3),  -- 1 약함 ~ 3 심함
  note        text,
  message_id  uuid references messages(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index health_day_idx on health_entries (day);
create index health_symptom_idx on health_entries (symptom);

-- ---------------------------------------------------------------------
-- 4. 기분 기록 (AI 추정 vs 내가 직접 체크인한 값을 구분)
-- ---------------------------------------------------------------------
create table mood_entries (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  score       smallint not null check (score between 1 and 5),  -- 1 매우 나쁨 ~ 5 매우 좋음
  label       text,                               -- 지침, 설렘 ...
  source      text not null default 'inferred' check (source in ('inferred','checkin')),
  message_id  uuid references messages(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index mood_day_idx on mood_entries (day);

-- ---------------------------------------------------------------------
-- 5. 일기 (draft/final + 버전 관리)
-- ---------------------------------------------------------------------
create table diaries (
  id              uuid primary key default gen_random_uuid(),
  day             date not null,
  version         int  not null default 1,
  status          text not null default 'final' check (status in ('draft','final')),
  title           text,
  content         text not null,
  summary_mood    text,
  mood_avg        numeric(3,2),
  tags            text[] not null default '{}',
  source_event_ids uuid[] not null default '{}',  -- 근거 이벤트 (환각 점검용)
  model           text,                           -- 생성에 쓴 모델
  user_edited     boolean not null default false,
  rating          smallint check (rating in (-1, 1)),   -- 👎 / 👍
  created_at      timestamptz not null default now(),
  unique (day, version)
);
create index diaries_content_trgm on diaries using gin (content gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 6. (선택) 장기 기억 미러 — 원본은 OpenClaw MEMORY.md.
--    대시보드에서 '내 기억 보기/삭제' 화면을 만들 때 사용
-- ---------------------------------------------------------------------
create table memory_mirror (
  id                uuid primary key default gen_random_uuid(),
  category          text,                         -- health | person | hobby | worry | preference
  fact              text not null,
  confidence        numeric(3,2),
  last_confirmed_at timestamptz,
  is_active         boolean not null default true,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. 대시보드용 뷰 (RLS 를 그대로 적용하려면 security_invoker)
-- ---------------------------------------------------------------------
create view v_daily_mood with (security_invoker = true) as
select day,
       round(avg(score)::numeric, 2) as avg_score,
       count(*) as n
from mood_entries
group by day;

create view v_symptom_monthly with (security_invoker = true) as
select date_trunc('month', day)::date as month,
       symptom,
       count(*) as times,
       round(avg(severity)::numeric, 2) as avg_severity
from health_entries
group by 1, 2;

-- ---------------------------------------------------------------------
-- 8. 보안: RLS — 내 이메일로 로그인한 세션만 읽기/수정 가능
--    (게이트웨이 서버는 service_role 키를 쓰므로 RLS 우회 → 쓰기 담당)
-- ---------------------------------------------------------------------
create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'email', '') = (select owner_email from settings where id = 1)
$$;

do $$
declare t text;
begin
  foreach t in array array['settings','messages','events','health_entries',
                           'mood_entries','diaries','memory_mirror']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy owner_all on %I for all using (is_owner()) with check (is_owner())', t);
  end loop;
end $$;

-- ★ 배포 체크리스트
-- 1) Authentication > Providers 에서 신규 가입(Sign ups) 비활성화, 내 계정만 생성
-- 2) service_role 키는 게이트웨이 서버 환경변수에만 저장 (대시보드/프론트에 절대 노출 금지)
-- 3) Supabase 자동 백업 확인 (또는 주 1회 pg_dump)
