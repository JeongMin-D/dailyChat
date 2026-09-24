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
