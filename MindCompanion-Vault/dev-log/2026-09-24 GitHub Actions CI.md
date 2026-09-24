---
tags: [mindcompanion, dev-log, ci, github-actions]
date: 2026-09-24
milestone: M1
status: complete
---

# 2026-09-24 GitHub Actions CI

## 선검증

- 사용자 변경 `MindCompanion-Vault/01 제안서 검토.md`의 단일 문자 `0` 확인
- 사용자 변경 `.obsidian/workspace.json` 확인
- 두 변경 모두 CI와 무관하여 보존하고 작업·커밋 대상에서 제외
- 로컬과 GitHub `main`이 `77d20a2`로 일치함을 작업 시작 전에 확인

## 완료

- [x] `.github/workflows/ci.yml` 생성
- [x] `main` push와 pull request에서 실행
- [x] 최소 권한 `contents: read`
- [x] 동일 ref의 이전 실행 취소
- [x] 작업 제한 시간 10분
- [x] Node.js 24와 npm cache
- [x] `npm ci` 재현 설치
- [x] ESLint 검사
- [x] TypeScript `checkJs` 기반 운영 JavaScript typecheck
- [x] Node test runner 전체 테스트
- [x] 개발 의존성 정확한 버전으로 lockfile 고정
- [x] 로컬 `npm ci`와 `npm run check` 통과

## 고정 버전

- ESLint `10.11.0`
- globals `17.12.0`
- TypeScript `7.0.2`
- `@types/node` `26.6.2`
- `actions/checkout@v7`
- `actions/setup-node@v7`

## 검사 명령

```bash
npm run check
```

실행 순서:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`

## 다음 작업

- B08 429·일시적 5xx·네트워크 오류 지수 backoff와 jitter 구현
