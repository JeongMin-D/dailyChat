# Contracts

Bot, Worker, Dashboard가 공유하는 JSON Schema와 API 계약을 둡니다.

## 구현된 계약

- `eventSchema`: 사건 유형, 요약, 확신도, 복수 원문 근거
- `moodSchema`: 1~5 점수, 표현 라벨, inferred/checkin 구분, 근거
- `healthSchema`: 증상, nullable 심각도·시각·메모, 근거
- `diarySchema`: 순서가 있는 근거 block과 직접 원문/event 참조
- `safetySchema`: `none | concern | urgent`와 제한된 사유 코드
- `nightlyExtractionSchema`: 위 계약을 묶은 Groq strict Structured Outputs 응답

모든 스키마는 JSON Schema Draft 2020-12 객체이며 Groq strict mode에 맞게 모든 필드를 required로, 모든 객체를 `additionalProperties: false`로 정의한다. 선택 값은 필드 생략 대신 `null` 또는 빈 배열을 사용한다.

## 사용

```js
import {
  nightlyExtractionSchema,
  validateNightlyExtraction
} from "@mindcompanion/contracts";

const result = validateNightlyExtraction(modelOutput, {
  allowedMessageIds: inputSnapshot
    .filter((message) => message.role === "user")
    .map((message) => message.id)
});
```

JSON Schema 검증 뒤 의미 검증을 추가로 수행한다.

- `eventRef` 중복 금지
- 일기에서 존재하지 않는 event 참조 금지
- 안전 등급과 사유·근거의 일관성
- 입력 snapshot 밖의 source message ID 금지

`safety.level=none`은 사유 코드가 비어 있어야 한다. 모델이 검사 대상으로 반환한 source ID는 snapshot 검증 후 허용하지만 저장 단계에서는 none safety 레코드를 만들지 않는다. `concern|urgent`는 사유 코드와 source ID가 모두 필요하다.

실제 Groq strict mode와 현재 모델의 호환성은 로컬 `.env`가 있는 환경에서 `npm run smoke:contract`로 확인한다. 이 명령은 비식별 고정 문장 한 건을 전송하고 schema 호환성과 의미 검증 결과를 분리해 보고하며 응답 본문은 출력하지 않는다. 의미 검증 실패는 Worker가 저장을 거부하고 D04의 교정 호출 대상으로 처리한다.

## DB 정합성 계약

`nightlyDatabaseContract`는 JSON 필드를 PostgreSQL 컬럼, 연결 테이블, transient 값으로 분류한다. C03 이후 migration은 이 명세를 구현하며 다음 원칙을 지킨다.

- 시간은 `timestamptz`, local day는 `date`, 확신도는 `numeric(5,4)`로 저장한다.
- `sourceMessageIds`와 일기 block의 event 근거는 복합 PK와 FK를 가진 연결 테이블로 저장한다.
- 파생 부모 삭제 시 근거 연결은 cascade하고, 원문 삭제는 영향 처리 전까지 restrict한다.
- RLS를 켜고 `anon`/`authenticated` 권한은 회수하며 서버의 `service_role` 권한만 명시한다.
- 배열 원소 중복, 입력 snapshot 소속, 부모당 최소 근거 수처럼 단일 CHECK로 안전하게 표현할 수 없는 규칙은 저장 전 검증과 같은 트랜잭션으로 강제한다.

이 파일은 target 계약이다. C02에서 정의한 core 계약은 C03 migration으로, 작업·알림 계약은 C04 migration으로 운영 DB에 반영했다. safety와 재현 metadata는 C05 migration에서 이어서 적용한다.

## 작업·알림 상태 계약

`jobRunStatuses`, `notificationStatuses`와 각 transition map은 Worker가 사용하는 상태 계약이다. `notificationOutboxContract`는 outbox가 사용자 내용 대신 `job_run_id`와 `diary_id` 참조만 저장하고, 고유한 `idempotency_key`로 한 일기의 같은 알림을 한 번만 등록하도록 고정한다.

DB claim 함수는 예약 시간이 지난 `queued|retryable_failed` 작업만 원자적으로 가져간다. 오래 멈춘 `running|sending`은 5분 뒤 회수할 수 있다. 외부 전송의 성공·실패 갱신과 재시도 backoff는 D09 Worker가 이 상태 계약 위에서 구현한다.

`jobRunReproducibilityContract`는 nightly 작업이 반드시 기록해야 할 `day`, pipeline/input hash, provider/model, prompt/schema version을 정의한다. input hash는 입력 snapshot을 canonical form으로 직렬화한 뒤 계산하는 lowercase SHA-256 hex다. 실제 canonical snapshot 생성은 D02에서 구현한다.

## 후속 계약

- Memory candidate
- Job run과 notification outbox
