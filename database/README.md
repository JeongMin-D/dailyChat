# Database

`migrations/`의 번호 순서대로 적용합니다. 기존 `files/schema.sql`은 제안서 참고본이며 운영 DB에는 migration만 적용합니다.

## 첫 migration

`0001_foundation.sql`은 다음을 만듭니다.

- 단일 사용자 설정과 KST 04:00 경계
- Telegram 원문 메시지와 중복 방지 제약
- Telegram update claim 및 실패 재처리 상태
- 야간/알림 작업의 멱등 실행 원장
- RLS 활성화
- Data API에서 `anon`/`authenticated` 접근 차단 및 서버 전용 `service_role` 명시 권한

RLS 정책은 소유자 함수와 전체 도메인 테이블을 함께 설계하는 다음 migration에서 추가합니다. 현재 migration은 `anon`/`authenticated` 권한을 명시적으로 회수하므로 사용자 클라이언트에서는 접근할 수 없고, Bot/Worker의 서버 전용 `service_role`만 접근합니다.

## settings 초기화

`.env`의 Supabase Secret Key, 소유자 이메일, Telegram ID를 채운 뒤 실행합니다.

```bash
npm run setup:supabase
```

스크립트는 실제 값이나 비밀키를 출력하지 않고 설정 여부만 검증합니다.

## Core domain과 근거 관계

`0004_core_domain_sources.sql`은 C02 DB 계약을 구현합니다.

- events, mood_entries, health_entries
- versioned final diaries와 순서가 있는 diary_blocks
- event/mood/health/diary block별 원문 근거 연결
- diary block과 event의 검증된 근거 연결
- 모든 테이블 RLS와 server-only 명시 권한

원문 message 삭제는 연결된 파생 데이터를 먼저 처리하도록 `RESTRICT`합니다. 파생 부모를 삭제하면 그 부모의 연결 행만 `CASCADE`합니다. 입력 snapshot 소속과 부모당 최소 근거 1개는 단일 FK/CHECK로 표현하지 않고 Worker의 저장 전 검증과 같은 트랜잭션에서 강제합니다.

## 작업 실행과 알림 outbox

`0005_job_runs_notification_outbox.sql`은 작업 생성과 Telegram 전송 성공을 분리합니다.

- `job_runs.available_at`, `updated_at`과 원자적 `claim_job_run`
- 일기·작업 참조만 보관하는 `notification_outbox`
- 고유 멱등 키와 일기별 Telegram final 알림 unique 제약
- 예약된 pending/retryable 작업과 5분 이상 멈춘 claim 회수
- 원자적 `claim_notification`, RLS, server-only 권한

outbox에는 사용자 원문이나 일기 본문을 복제하지 않습니다. 실제 전송 Worker는 `diary_id`로 내용을 읽고, 성공 시 provider message ID와 sent 시각만 기록합니다.
