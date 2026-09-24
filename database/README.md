# Database

`migrations/`의 번호 순서대로 적용합니다. 기존 `files/schema.sql`은 제안서 참고본이며 운영 DB에는 migration만 적용합니다.

## 첫 migration

`0001_foundation.sql`은 다음을 만듭니다.

- 단일 사용자 설정과 KST 04:00 경계
- Telegram 원문 메시지와 중복 방지 제약
- Telegram update claim 및 실패 재처리 상태
- 야간/알림 작업의 멱등 실행 원장
- RLS 활성화
- Data API에서 `anon`/`authenticated` 접근 차단 및 서버 전용 `service_role` 명시 권한

RLS 정책은 소유자 함수와 전체 도메인 테이블을 함께 설계하는 다음 migration에서 추가합니다. 현재 migration은 `anon`/`authenticated` 권한을 명시적으로 회수하므로 사용자 클라이언트에서는 접근할 수 없고, Bot/Worker의 서버 전용 `service_role`만 접근합니다.

## settings 초기화

`.env`의 Supabase Secret Key, 소유자 이메일, Telegram ID를 채운 뒤 실행합니다.

```bash
npm run setup:supabase
```

스크립트는 실제 값이나 비밀키를 출력하지 않고 설정 여부만 검증합니다.
