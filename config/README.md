# Configuration

환경변수의 기준은 루트 `.env.example`입니다.

- 비밀값은 저장소에 커밋하지 않습니다.
- `NEXT_PUBLIC_`에는 공개 가능한 값만 둡니다.
- `SUPABASE_SERVICE_ROLE_KEY`에는 최신 `sb_secret_...` 키를 우선 사용합니다. 기존 service_role JWT도 호환됩니다.
- Supabase Secret Key, Telegram token, Groq key는 서버 런타임에만 둡니다.
- DB에는 UTC를 저장하고 `APP_TIMEZONE`과 `DAY_BOUNDARY_HOUR`로 기록 날짜를 계산합니다.
