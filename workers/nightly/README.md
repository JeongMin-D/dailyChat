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

## D05~D06 원자적 결과 저장

- `SupabaseNightlyOutputStore`는 저장 직전 snapshot day와 source ID 계약을 다시 검사합니다.
- 검증된 결과는 `persist_nightly_extraction` RPC 한 번으로만 전송합니다.
- RPC는 job row를 잠그고 domain row, diary block, 원문/event 근거, 제한 safety metadata를 한 트랜잭션으로 저장합니다.
- 성공한 경우에만 job을 `succeeded`로 바꾸며, 중간 오류는 전체 rollback됩니다.
- 함수는 `SECURITY INVOKER`이고 `service_role`만 실행할 수 있습니다.

## D07~D08 재실행과 version

- `prepareRun()`은 `day + pipelineVersion + inputHash`로 기존 job을 찾거나 새 job을 만듭니다.
- 성공한 동일 입력은 `noop`과 기존 diary ID/version을 반환하므로 추출을 다시 호출하지 않습니다.
- 변경된 hash는 새 job을 만들고 `persist_nightly_extraction_versioned`가 날짜별 transaction lock 안에서 다음 diary version을 할당합니다.
- 성공 job 저장 재호출은 기존 diary를 반환해 파생 데이터 중복을 막습니다.

## D09 Telegram 일기 Outbox

- `SupabaseNotificationOutboxStore.enqueue()`는 성공한 job과 diary 참조만 멱등 등록합니다.
- claim RPC가 `sending` 전이와 동시에 diary block을 읽으며, outbox에는 본문을 복제하지 않습니다.
- `TelegramNotificationDelivery`는 일반 텍스트를 4,096자 이내로 구성하고 성공 `message_id`를 저장합니다.
- 429·5xx·네트워크 오류는 최대 5번까지 지수 backoff하고, 401·403과 나머지 4xx는 영구 실패로 기록합니다.
- Telegram 성공 뒤 DB 완료 기록 전에 중단되면 중복 발송 가능성이 있으므로 stale claim과 provider message ID로 추적합니다.

## D10 안전 알림 분기

- safety `none`은 일반 일기, `concern`은 고정 지지 문구가 붙은 일기로 보냅니다.
- `urgent`는 `safety_guidance` outbox로 바꾸고 claim 단계에서 diary title과 block을 제거합니다.
- urgent 메시지는 코드에 고정된 112/119·109·1577-0199 안내만 사용하며 원문·일기·reason code를 포함하지 않습니다.
- 시스템은 사용자 대신 자동 신고하거나 제3자에게 안전 내용을 보내지 않습니다.

## M2 종단 실행기

- `NightlyPipelineRunner`가 target day 선택, snapshot/hash, job prepare·claim, Groq 추출, 원자 저장, outbox 등록과 Telegram 전송을 한 경로로 조합합니다.
- 사용자 메시지가 없으면 job과 외부 API 호출 없이 `skipped`로 종료합니다.
- 동일 성공 입력은 Groq와 저장을 건너뛰고 기존 outbox의 미완료 전송만 재개합니다.
- 동시 실행은 DB claim 승자만 처리하고, 5분 이상 멈춘 `running` job은 같은 claim 규칙으로 이어서 실행합니다.
- 실행 명령은 `npm run run:nightly`입니다. `NIGHTLY_TARGET_DAY`를 비우면 KST 04:00 경계 기준 마지막으로 닫힌 날짜를 선택합니다.
- 이 명령은 실제 Supabase·Groq·Telegram을 변경하고 메시지를 보냅니다. 운영 scheduler 연결과 실제 발송 검증은 별도 승인된 운영 단계에서 수행합니다.
- `npm run smoke:nightly:pipeline`은 합성 입력과 실제 Groq를 사용하되 Supabase·Telegram adapter는 메모리 대역으로 바꿔 저장·발송 없이 전체 순서를 검증합니다.
