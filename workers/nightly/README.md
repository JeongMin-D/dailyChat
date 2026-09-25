# Nightly Worker

04:05 KST에 전날 local day를 확정하고 구조화 추출, 근거 검증, 일기 생성, 알림 outbox 등록을 수행합니다.

작업은 `day + pipeline_version + input_hash`로 멱등 처리합니다.

## D01~D02 입력 준비

- Scheduler는 `selectNightlyTargetDay()`로 완전히 닫힌 최근 local day를 선택해 job에 명시합니다.
- Worker는 명시된 day의 user message만 Supabase Data API에서 읽습니다.
- 조회는 `sent_at`, `id` 오름차순과 최대 1,000행 pagination을 사용합니다.
- Snapshot은 version/day와 `id`, UTC `sentAt`, content만 포함하며 같은 순서로 canonical JSON을 만듭니다.
- `inputHash`는 canonical JSON의 lowercase SHA-256입니다.
- Snapshot 본문은 영속화하지 않고, 이후 D03~D06의 LLM 입력과 source ID 검증에만 사용합니다.

## D03~D04 구조화 추출과 검증

- `GroqNightlyExtractor`는 `openai/gpt-oss-120b`에 strict JSON Schema 응답을 요청합니다.
- 입력 JSON과 원문은 신뢰하지 않는 자료로 취급하며, 원문 내부의 명령을 실행하지 않도록 system 규칙을 고정합니다.
- 응답은 Ajv shape 검증 뒤 snapshot day, source ID, event 참조, enum·범위, 중복, safety 근거를 로컬에서 다시 검사합니다.
- JSON 또는 의미 검증 실패 시 원문과 잘못된 값을 포함하지 않은 검증 경로만 전달해 한 번 교정합니다.
- 두 번째 실패, refusal, HTTP 오류는 안정적인 오류 코드로 종료합니다.
- 사용자 메시지가 0건이면 Groq를 호출하지 않습니다.
- `npm run smoke:nightly`는 합성 입력만 사용합니다. 실제 Supabase 원문을 쓰는 `smoke:nightly:live-data`는 데이터 외부 전송 승인을 받은 경우에만 실행합니다.
