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
4. Groq 응답 생성 및 assistant 메시지 저장
5. Telegram 전송
6. update 완료 처리

실패한 update는 `retryable_failed`로 남기며 Telegram 재전송 시 저장된 assistant 응답을 재사용합니다.
