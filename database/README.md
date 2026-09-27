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

## Safety와 실행 재현 정보

`0006_safety_reproducibility.sql`은 nightly 실행을 재현할 수 있는 식별 정보와 제한된 safety metadata를 추가합니다.

- nightly job의 day, pipeline/input hash, provider/model, prompt/schema version 필수화
- lowercase SHA-256 input hash 형식 검사
- `concern|urgent`만 저장하는 `safety_assessments`
- 제한 reason code, checker version, 판정 시각
- 원문을 복제하지 않는 `safety_message_sources` FK 관계
- RLS와 server-only 명시 권한

`none` 판정은 저장하지 않습니다. safety 테이블에는 원문 인용, 진단명, 자유 형식 추론, 일기·건강 내용을 넣지 않습니다. source snapshot 소속, reason code 중복, 부모당 최소 근거는 Worker의 저장 전 검증과 같은 트랜잭션에서 강제합니다.

`0011_safety_notification_routing.sql`은 safety와 outbox를 연결합니다. none·concern은 `daily_diary`, urgent는 `safety_guidance`로 등록합니다. urgent notification은 claim 조건에서도 safety level을 다시 확인하고 diary title·block을 반환하지 않습니다.

## 메시지 시간 경계 무결성

`0007_message_day_integrity.sql`은 원문 시각과 local day가 어긋난 메시지 저장을 차단합니다.

- `messages.sent_at`은 실제 시각을 `timestamptz`로 저장하고 DB timezone은 UTC를 유지
- `messages.day`는 `settings.timezone`과 `day_boundary_hour`로 계산한 `date`
- insert 또는 `sent_at`/`day` update 때 `local_day()` 결과와 supplied day 대조
- trigger 함수는 `SECURITY INVOKER`이며 Data API 역할의 직접 실행 권한 없음

## 기억 후보와 근거

`20260927160533_m3_memory_candidates.sql`은 M3 E01 기억 후보 원장을 시작한다.

- 분류·사실·확신도·확인 상태와 유효 기간
- 원문 message와 검증된 event의 유형별 FK 근거
- 원문·event 삭제 전 영향 처리를 강제하는 `RESTRICT`
- 후보 삭제 시 연결 행만 제거하는 `CASCADE`
- 모든 테이블 RLS와 server-only 명시 권한

후보 판단·사용자 확인·활성 기억 버전은 E02~E05에서 구현했다. 투영은 E07 범위다. 부모당 최소 한 개 근거와 job snapshot 소속은 저장 트랜잭션에서 강제한다.

`20260927161547_m3_memory_candidate_persistence.sql`은 E02 후보 추출 결과를 기존 nightly 결과와 같은 트랜잭션에 저장한다.

- `schemaVersion 1.1.0`, `nightly-v2`, `nightly-pipeline-v2`
- 후보마다 직접 user message 근거 1개 이상 필수
- source message의 처리일·role을 DB 경계에서 재검증
- 새 후보의 `valid_from`은 job day, `valid_to`는 null로 고정
- 일기·파생 데이터·기억 후보 중 하나라도 실패하면 전체 rollback

event-only 후보 저장은 검증 규칙을 추가하는 후속 단계까지 사용하지 않는다.

`20260927163138_m3_memory_confirmation_flow.sql`은 E03 확인 흐름을 추가한다.

- 비건강 후보 confidence 0.8 이상은 자동 확정
- confidence 0.8 미만 또는 건강 후보는 사용자 확인 대기
- 후보 ID만 보관하는 Telegram 확인 outbox와 bounded retry
- 설정된 Telegram user/chat ID를 재검증하는 멱등 확인·거절 RPC
- RLS, `SECURITY INVOKER`, service-role 전용 접근

긴급 safety 알림에서는 기억 후보 확인을 보내지 않는다.

`20260927213724_m3_memory_versioning.sql`은 E05 갱신과 상충 처리를 추가한다.

- schema `1.2.0`, prompt `nightly-v3`, pipeline `nightly-pipeline-v3`
- category와 안정 `memory_key`별 advisory transaction lock
- 동일 사실 자동 rejected, 변경 사실은 다음 version pending
- Telegram 확인 시 기존 confirmed를 superseded로 바꾸고 새 버전을 confirmed로 전환
- rollback 검증과 service-role 전용 RPC 권한 유지

`20260927215433_m3_memory_forget.sql`은 E06 사용자 요청 비활성화를 추가한다.

- `forgotten` 상태와 `forgotten_at`으로 원문 근거·변경 이력을 보존하는 논리 삭제
- 설정된 Telegram user/chat ID를 재검증하는 멱등 `forget_memory_candidate` RPC
- 비활성화 즉시 활성 기억 조회와 대화 Context에서 제외
- `SECURITY INVOKER`, anon/authenticated 실행 차단, service-role 전용 실행

원문까지 파기하는 개인정보 완전 삭제는 보존·백업 복구 정책과 함께 별도 작업으로 처리한다.
