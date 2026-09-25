# Configuration

## Nightly scheduler

운영 scheduler는 `.github/workflows/nightly.yml`의 GitHub Actions를 사용합니다. 매일 `19:05 UTC` (`04:05 Asia/Seoul`)에 실행하며, 저장소 Actions Secret으로 `GROQ_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`이 필요합니다.

## Render nightly Cron (inactive alternative)

`render-nightly-cron.example.yaml`은 아직 활성화되지 않은 검토용 Blueprint입니다. `04:05 Asia/Seoul`은 Render의 UTC cron에서 `5 19 * * *`이며, Cron은 `dailychat-bot`의 Telegram·Groq·Supabase 비밀 환경변수를 `fromService.envVarKey`로 참조합니다.

Render Cron은 유료 리소스이므로 루트 `render.yaml`에 합치거나 서비스를 생성하지 않습니다. GitHub Actions를 사용할 수 없는 경우에만 대안으로 재검토합니다.

환경변수의 기준은 루트 `.env.example`입니다.

- 비밀값은 저장소에 커밋하지 않습니다.
- `NEXT_PUBLIC_`에는 공개 가능한 값만 둡니다.
- `SUPABASE_SERVICE_ROLE_KEY`에는 최신 `sb_secret_...` 키를 우선 사용합니다. 기존 service_role JWT도 호환됩니다.
- Supabase Secret Key, Telegram token, Groq key는 서버 런타임에만 둡니다.
- DB에는 UTC를 저장하고 `APP_TIMEZONE`과 `DAY_BOUNDARY_HOUR`로 기록 날짜를 계산합니다.
