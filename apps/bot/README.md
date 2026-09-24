# Bot

Telegram webhook을 받아 허용 사용자 검사, 메시지 선저장, LLM 응답, Telegram 발송을 담당합니다.

## Endpoint

- `GET /health`
- `POST /telegram/webhook`

Webhook은 `X-Telegram-Bot-Api-Secret-Token`을 검증하고 허용된 user/chat만 처리합니다. 필요한 값은 루트 `.env.example`을 참고합니다.

## 처리 순서

1. webhook secret과 사용자 검사
2. Telegram update claim
3. 사용자 메시지 선저장
4. 최근 대화 조회 및 문자 예산에 맞춘 Context 구성
5. `files/SOUL.md`를 system prompt로 사용해 Groq 응답 생성
6. assistant 메시지 저장 및 Telegram 전송
7. update 완료 처리

실패한 update는 `retryable_failed`로 남기며 Telegram 재전송 시 저장된 assistant 응답을 재사용합니다.

Groq와 Telegram의 429·5xx·네트워크 오류·timeout은 지수 backoff와 jitter로 제한 재시도합니다. `Retry-After` 헤더와 Telegram `parameters.retry_after`를 우선하되 최대 지연을 넘기지 않습니다. 인증·권한 등 다른 4xx는 재시도하지 않으며, 각 재시도는 `upstream_retry_scheduled` 경고 로그에 upstream, attempt, delay, status 또는 오류 이름을 남깁니다.

기본 Context 제한은 최근 12개 메시지와 총 6,000자입니다. 각각 `CONVERSATION_HISTORY_LIMIT`, `CONVERSATION_CONTEXT_CHARS`로 조정할 수 있습니다.
