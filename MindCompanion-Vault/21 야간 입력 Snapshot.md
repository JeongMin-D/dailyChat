---
aliases:
  - DailyChat nightly input
tags: [mindcompanion, worker, snapshot, reproducibility, m2]
status: implemented
updated: 2026-09-25
---

# 야간 입력 Snapshot

## D01 처리 날짜 선택

Scheduler는 실행 시각의 local day를 그대로 처리하지 않는다. `Asia/Seoul` 04:00 경계에서 완전히 닫힌 가장 최근 날짜를 선택해 job의 `day`로 명시한다.

| 실행 시각 | 열린 local day | 처리 day |
|---|---|---|
| KST 2026-09-25 03:59:59 | 2026-09-24 | 2026-09-23 |
| KST 2026-09-25 04:00:00 | 2026-09-25 | 2026-09-24 |
| KST 2026-09-25 04:05:00 | 2026-09-25 | 2026-09-24 |

늦은 실행과 재시도는 현재 시각으로 day를 다시 계산하지 않고 처음 job에 기록한 day를 사용한다.

## D02 조회 범위

- `messages.day = target day`
- `messages.role = user`
- `sent_at ASC, id ASC`
- 한 page 최대 1,000행
- assistant/system 메시지와 metadata는 snapshot에서 제외

정렬 없는 range pagination은 결과가 불안정하므로 항상 복합 정렬을 명시한다. Worker는 Supabase secret key를 서버에서만 사용한다.

## Canonical 형식

```json
{
  "version": "1",
  "day": "YYYY-MM-DD",
  "messages": [
    {
      "id": "uuid",
      "sentAt": "UTC ISO-8601",
      "content": "원문"
    }
  ]
}
```

- timestamp는 `toISOString()`으로 정규화한다.
- messages는 `sentAt`, `id` 순으로 다시 정렬한다.
- 중복 source ID와 잘못된 UUID·timestamp·빈 content를 거부한다.
- 빈 날짜도 빈 messages 배열의 결정적 hash를 만든다.

`input_hash = lowercase_hex(SHA-256(UTF-8(JSON.stringify(snapshot))))`

Snapshot 본문은 Worker 실행 중 D03 LLM 입력과 D04 source ID 검증에만 사용한다. `job_runs`에는 원문을 복제하지 않고 input hash, provider/model/prompt/schema/pipeline version만 기록한다.

## 검증 결과

- 자동 테스트 104개 통과
- 입력 배열 순서와 동등 timestamp 표기가 달라도 같은 hash
- day, content, source ID 변경 시 다른 hash
- 잘못된 날짜·UUID·timestamp·중복 source 거부
- 실제 Supabase의 2026-09-24 user 메시지 5건과 DB count 일치
- 같은 실제 입력을 연속 조회했을 때 snapshot과 hash가 동일
