---
aliases:
  - DailyChat Telegram diary delivery
tags: [mindcompanion, telegram, outbox, retry, m2]
status: implemented
updated: 2026-09-25
---

# Telegram 일기 Outbox

## 완료 범위

성공한 일기를 Telegram 알림으로 등록하고, 전송 Worker가 독립적으로 claim·발송·성공 또는 실패를 기록한다. 일기 생성 성공과 외부 발송 성공은 서로 다른 상태로 유지한다.

## 데이터 흐름

```text
succeeded diary
  → enqueue_diary_notification
  → pending outbox(reference only)
  → claim_diary_notification
  → sending + transient diary payload
  → Telegram sendMessage
  → sent | retryable_failed | failed
```

`enqueue_diary_notification`은 job과 diary 일치, job의 succeeded 상태, 운영 chat ID를 확인한다. `(diary_id, channel, notification_type)` 고유 제약과 결정적인 idempotency key로 반복 호출도 같은 알림을 반환한다.

## 전송 계약

- 일반 텍스트만 보내며 parse mode를 사용하지 않는다.
- 제목·날짜·version·순서가 있는 diary block으로 메시지를 만든다.
- Telegram 제한에 맞춰 최대 4,096자로 줄이고 UTF-16 surrogate pair를 자르지 않는다.
- 성공 응답의 `result.message_id`를 provider message ID로 저장한다.
- 429·5xx·네트워크·잘못된 성공 응답은 재시도 가능 오류다.
- 401·403과 그 밖의 4xx는 영구 실패다.
- 최대 5번 시도하며 지수 backoff와 Telegram `retry_after` 중 긴 값을 사용한다.
- DB 재시도 지연은 0~86,400초만 허용한다.

## 동시성과 불확실 구간

due 상태 하나만 원자적으로 `sending`으로 바뀐다. 활성 claim은 중복 전송하지 않고, 5분 이상 멈춘 sending만 회수한다.

Telegram 성공 후 DB의 sent 기록 전에 프로세스가 중단되면 외부 API 특성상 재전송될 수 있다. 이 구간은 exactly-once가 아니며, outbox ID·attempt·provider message ID로 추적한다. DB 완료 기록 실패를 전송 실패로 덮어쓰지 않아 불확실 상태를 보존한다.

## 검증 결과

- migration `d09_telegram_diary_outbox_delivery` 운영 적용
- 같은 diary의 중복 enqueue가 같은 notification ID 반환
- 첫 claim payload의 diary ID, chat ID, block 2개 일치
- 활성 sending의 중복 claim 거부
- 429 오류 코드와 120초 재시도 예약, claim 해제 확인
- 두 번째 claim attempt 2, sent 전환, provider message ID와 sent_at 확인
- 합성 데이터 전체 rollback 후 잔존 0건
- RPC 4개가 `SECURITY INVOKER`, 빈 search path, service-role 전용
- 실제 Data API에서 존재하지 않는 notification claim이 `null`로 정상 응답
- lint·typecheck·자동 테스트 144개 통과

## 다음 작업

D10 안전 분기는 [[26 안전 알림 분기]]에서 완료했다. 다음은 scheduler부터 추출·저장·알림까지 M2 실행 경로를 하나로 연결한다.
