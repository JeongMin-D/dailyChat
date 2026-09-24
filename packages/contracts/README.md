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

## 후속 계약

- Memory candidate
- Job run과 notification outbox
