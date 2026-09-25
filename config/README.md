# Configuration

## Render nightly Cron

`render-nightly-cron.example.yaml`은 아직 활성화되지 않은 검토용 Blueprint입니다. `04:05 Asia/Seoul`은 Render의 UTC cron에서 `5 19 * * *`이며, Cron은 `dailychat-bot`의 Telegram·Groq·Supabase 비밀 환경변수를 `fromService.envVarKey`로 참조합니다.

Render Cron은 유료 리소스이므로 비용 승인 전에는 루트 `render.yaml`에 합치거나 서비스를 생성하지 않습니다. 승인 후 예시의 service 항목을 루트 Blueprint에 추가하고 첫 수동 실행 및 다음 예약 실행을 검증합니다.

환경변수의 기준은 루트 `.env.example`입니다.

- 비밀값은 저장소에 커밋하지 않습니다.
- `NEXT_PUBLIC_`에는 공개 가능한 값만 둡니다.
- `SUPABASE_SERVICE_ROLE_KEY`에는 최신 `sb_secret_...` 키를 우선 사용합니다. 기존 service_role JWT도 호환됩니다.
- Supabase Secret Key, Telegram token, Groq key는 서버 런타임에만 둡니다.
- DB에는 UTC를 저장하고 `APP_TIMEZONE`과 `DAY_BOUNDARY_HOUR`로 기록 날짜를 계산합니다.
