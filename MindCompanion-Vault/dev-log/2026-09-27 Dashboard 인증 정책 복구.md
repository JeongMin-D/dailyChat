---
tags: [mindcompanion, dashboard, security]
status: complete
date: 2026-09-27
---

# Dashboard 인증 정책 복구

- 공개 Render Dashboard의 로컬 보관 인증값이 운영 환경과 일치하지 않아 인증 요청이 401임을 확인했다.
- 로컬 보관 암호가 4자라 공개 서비스에 동기화하지 않고 보존했다.
- `DASHBOARD_PASSWORD` 최소 길이를 문서와 같은 16자로 복구하고 회귀 테스트를 갱신했다.
- `npm run check`에서 lint, typecheck, 자동 테스트 175개가 통과했다.
- 커밋 `60a4a20`의 GitHub CI가 통과했다.
- GitHub push 뒤 Render 자동 배포가 생성되지 않는 문제를 재현했고, 최신 커밋은 수동 배포해 live 상태로 올렸다.
- 운영 health 200, 미인증 Dashboard 401, 배포 이후 오류 로그 0건을 확인했다.
- Render GitHub App 설치가 `healthCare`만 허용해 `dailyChat` push 이벤트를 받지 못한 것이 자동 배포 실패 원인이었다.
- GitHub App에 `dailyChat` 저장소 권한을 추가하고 Render 자격 증명 목록에서 두 저장소가 모두 노출되는 것을 확인했다.
- 빈 검증 커밋 `2100ad5`를 push하자 deploy `dep-dasd6uc9v7es73etafmg`가 `new_commit`으로 자동 생성되어 live가 됐고, 공개 `/health`가 200 `{"status":"ok"}`를 반환했다.
- 무작위 32자 운영 암호를 생성해 Git에서 제외된 `.env.dashboard`와 Render 환경변수에 동기화했으며 실제 값은 문서와 로그에 기록하지 않았다.
- 환경변수 반영 deploy `dep-dasd9n97lnhs738mv100`이 live가 된 뒤 미인증 401, 인증 200, 선택 날짜 `2026-09-24` 렌더링, viewport·반응형 CSS, 오류 로그 0건을 확인했다.
- 남은 P0 작업은 이전 정상 deploy 롤백 검증이다.
