---
tags: [dev-log, nightly, render, scheduler, m2]
date: 2026-09-25
status: awaiting-approval
---

# M2 Dry-run과 Scheduler 준비

## 작업 전 확인

- 기준 커밋: `a7bbf39 feat: connect nightly pipeline end to end`
- 기존 사용자 변경 `.obsidian/workspace.json`은 기능과 무관해 보존했다.
- Render `My Workspace`에는 `dailychat-bot`, `healthCare`만 있고 nightly Cron은 없었다.

## 구현

- 실제 Groq와 메모리 Supabase·Telegram adapter를 조합한 `smoke:nightly:pipeline`을 추가했다.
- 운영 저장·발송 없이 production adapter의 전체 호출 순서와 계약을 검증한다.
- 04:05 KST를 19:05 UTC로 변환한 비활성 Render Cron Blueprint 예시를 추가했다.
- 세 비밀값은 기존 웹 서비스 환경변수 참조로 설계해 코드와 로그에 복제하지 않았다.
- Cron 표현식·명령·plan·region·비밀 참조를 자동 테스트에 고정했다.

## 검증

- 실제 Groq dry-run: 1회 추출 성공, 외부 쓰기 0건
- `npm run check`: lint, typecheck, 자동 테스트 163개 통과
- 비밀값과 사용자 원문 출력 없음

## 보류

Render Cron은 월 최소 $1 비용이 발생하므로 실제 생성은 사용자 승인 후 진행한다. 루트 `render.yaml`은 변경하지 않았다.
