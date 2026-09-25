---
aliases:
  - DailyChat GitHub Actions Scheduler
tags: [mindcompanion, nightly, github-actions, scheduler, m2]
status: verifying
updated: 2026-09-25
---

# GitHub Actions Scheduler

## 선택 이유

공개 저장소의 표준 GitHub-hosted runner로 야간 파이프라인을 실행해 Render Cron의 월 최소 비용을 피한다. Render Web Service는 Telegram webhook 용도로 유지한다.

## 실행 계약

- workflow: `.github/workflows/nightly.yml`
- 예약: 매일 `19:05 UTC` = 다음 날 `04:05 Asia/Seoul`
- 명령: `npm run run:nightly`
- 수동 기본값: `dry-run`
- 수동 실제 실행: `live`, 선택적 `target_day`는 `YYYY-MM-DD`
- 권한: `contents: read`
- 동시성: `nightly-diary` 한 건씩 실행
- timeout: 15분

예약 실행은 항상 live다. 수동 실행은 실수 방지를 위해 dry-run이 기본이며, dry-run에는 Groq key만 전달한다. Supabase와 Telegram 비밀값은 live step에서만 사용할 수 있다.

## 필요한 Repository Secrets

GitHub 저장소 `Settings → Secrets and variables → Actions`에 아래 이름으로 등록한다.

1. `GROQ_API_KEY`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `TELEGRAM_BOT_TOKEN`

비밀값은 workflow, 로그, 문서, Git diff에 넣지 않는다. Supabase service role/secret key는 서버 전용이며 브라우저 코드에는 노출하지 않는다.

## 검증 순서

1. Actions Secret 3개 등록
2. `Nightly diary`를 `dry-run`으로 수동 실행하고 Groq 구조화 출력 성공 확인
3. 처리 대상 날짜를 확인한 뒤 `live` 수동 실행
4. Supabase의 job, diary, outbox 성공 상태와 Telegram 수신 확인
5. 다음 04:05 KST 예약 실행 확인
6. 실패 재실행에서 동일 입력 no-op과 알림 멱등성 확인

## 현재 상태

workflow와 정적 계약 테스트는 완료했다. GitHub 저장소에 Secret이 아직 없으므로 외부 연결을 포함한 첫 Actions 실행은 대기 중이다.
