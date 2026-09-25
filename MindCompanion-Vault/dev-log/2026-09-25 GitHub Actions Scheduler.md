---
tags: [dev-log, github-actions, scheduler, m2]
date: 2026-09-25
status: active
---

# GitHub Actions Scheduler

## 변경

- `.github/workflows/nightly.yml`에 매일 04:05 KST 예약 실행을 추가했다.
- `workflow_dispatch`에 안전한 기본값 `dry-run`, 명시적 `live`, 선택적 `target_day`를 추가했다.
- dry-run에는 Groq Secret만, live에는 Supabase와 Telegram Secret까지 전달하도록 격리했다.
- workflow 권한, timeout, concurrency와 Node 24/npm ci 실행 조건을 고정했다.
- workflow 계약을 검증하는 자동 테스트 3개를 추가했다.

## 검증 근거

- GitHub 저장소가 public임을 확인하고 Actions Secret 3개를 공개키 암호화 방식으로 등록했다.
- workflow 전용 테스트, lint, typecheck가 통과했다.
- 로컬 `.env`가 없는 runner를 위해 smoke 명령을 `--env-file-if-exists`로 수정하고 회귀 테스트를 추가했다.
- GitHub Actions run `36142874248`의 dry-run이 성공했고 외부 DB 저장·Telegram 발송은 수행하지 않았다.
- 전체 `npm run check` 기준 자동 테스트 167개가 통과했다.
- workflow와 Git diff에서 API key·token literal이 없음을 확인했다.

## 남은 작업

처리 날짜를 확인한 수동 live와 첫 예약 실행 순으로 외부 상태를 검증한다. Groq strict 400이 반복되면 오류 본문을 노출하지 않는 제한 재시도를 검토한다. 관련 없는 사용자 변경인 `.obsidian/workspace.json`은 보존하고 커밋에서 제외한다.
