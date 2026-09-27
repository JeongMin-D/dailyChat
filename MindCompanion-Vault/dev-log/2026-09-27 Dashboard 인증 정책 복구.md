---
tags: [mindcompanion, dashboard, security]
status: in-progress
date: 2026-09-27
---

# Dashboard 인증 정책 복구

- 공개 Render Dashboard의 로컬 보관 인증값이 운영 환경과 일치하지 않아 인증 요청이 401임을 확인했다.
- 로컬 보관 암호가 4자라 공개 서비스에 동기화하지 않고 보존했다.
- `DASHBOARD_PASSWORD` 최소 길이를 문서와 같은 16자로 복구하고 회귀 테스트를 갱신했다.
- `npm run check`에서 lint, typecheck, 자동 테스트 175개가 통과했다.
- 다음 단계는 안전한 운영 인증값 확정·동기화와 인증 200 확인이다.
