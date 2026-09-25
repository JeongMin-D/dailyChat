---
tags: [dev-log, d09, telegram, outbox]
date: 2026-09-25
status: complete
---

# D09 Telegram 일기 Outbox

## 시작 전 확인

- 기준 커밋: `c163186 feat: make nightly replays idempotent`
- 사용자 변경: `.obsidian/workspace.json` 화면 배치 상태만 존재
- 기능 코드·DB migration 충돌 없음, 사용자 파일은 수정·커밋 대상에서 제외

## 구현

- `0010_telegram_diary_outbox_delivery.sql`
  - 성공 diary의 멱등 outbox 등록
  - reference-only outbox의 원자적 payload claim
  - sent와 retryable/terminal failure 상태 RPC
  - provider/error 길이, 안정적 오류 코드, 0~86,400초 지연 제한
- `SupabaseNotificationOutboxStore`
  - 등록·claim·성공·실패 RPC와 응답 계약 검증
  - bigint Telegram chat ID를 문자열로 유지
- `TelegramNotificationDelivery`
  - 4,096자 일반 텍스트 formatter
  - 429·5xx·network backoff, non-retryable 4xx, 최대 5회
  - Telegram 성공 후 DB 완료 실패를 별도 불확실 구간으로 보존
- 기존 `TelegramClient`
  - 성공 body와 `message_id` 검증
  - 상태·retry_after를 포함한 안정적인 오류

## 검증

- `npm run check`: lint, typecheck, 테스트 144개 통과
- 운영 Supabase migration 10번째 단계 적용
- 합성 트랜잭션에서 등록·중복 등록·claim·중복 claim·retry·재claim·sent 확인
- rollback 후 probe job/diary/notification 모두 0건
- 신규 RPC anon/authenticated 실행 불가, service_role 실행 가능
- 실제 service-role Data API claim 경로 도달 확인
- Security Advisor 새 ERROR/WARN 없음; 정책 없음 INFO는 server-only 단계의 기존 의도
- Performance Advisor의 unused index INFO는 아직 운영량이 없는 초기 상태로 유지

## 외부 영향

실제 Telegram 메시지는 보내지 않았다. 개인 채팅에 테스트 알림을 만드는 대신 Telegram client 단위 테스트와 운영 DB rollback 검증으로 전송 경계를 확인했다.

## 다음 작업

D10 safety concern·urgent 알림 보류 및 안전 안내 분기 테스트.
