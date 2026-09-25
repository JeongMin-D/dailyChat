---
tags: [dev-log, github-actions, scheduler, m2]
date: 2026-09-25
status: verifying
---

# GitHub Actions Scheduler

## 변경

- `.github/workflows/nightly.yml`에 매일 04:05 KST 예약 실행을 추가했다.
- `workflow_dispatch`에 안전한 기본값 `dry-run`, 명시적 `live`, 선택적 `target_day`를 추가했다.
- dry-run에는 Groq Secret만, live에는 Supabase와 Telegram Secret까지 전달하도록 격리했다.
- workflow 권한, timeout, concurrency와 Node 24/npm ci 실행 조건을 고정했다.
- workflow 계약을 검증하는 자동 테스트 3개를 추가했다.

## 검증 근거

- GitHub 저장소가 public이며 Actions Secret이 0개인 상태를 확인했다.
- workflow 전용 테스트, lint, typecheck가 통과했다.
- 전체 `npm run check` 기준 자동 테스트 166개가 통과했다.
- workflow와 Git diff에서 API key·token literal이 없음을 확인했다.

## 남은 작업

Repository Secret 3개를 등록하고 dry-run, 수동 live, 첫 예약 실행 순으로 외부 상태를 검증한다. 관련 없는 사용자 변경인 `.obsidian/workspace.json`은 보존하고 커밋에서 제외한다.
