---
tags: [mindcompanion, dev-log, supabase]
date: 2026-09-24
milestone: M0
status: completed-foundation
---

# 2026-09-24 Supabase dailyChat 구성

## 결과

- [x] `j25ng Personal` 조직에 `dailyChat` 프로젝트 생성
- [x] 서울 리전 `ap-northeast-2` 선택
- [x] 프로젝트 상태 `ACTIVE_HEALTHY` 확인
- [x] foundation migration 적용
- [x] Data API 최소 권한 보정 migration 적용
- [x] RPC 함수 실행 권한 강화 migration 적용
- [x] 로컬 `.env`에 Project URL과 publishable key 반영

## 생성된 객체

- `settings`
- `messages`
- `telegram_updates`
- `job_runs`
- `local_day(...)`
- `claim_telegram_update(...)`

## 검증

- 04:00 KST 직전: 전날 반환
- 04:00 KST: 새 날짜 반환
- 네 테이블 모두 RLS 활성화
- `anon`과 `authenticated`: 테이블 권한 없음
- `service_role`: SELECT, INSERT, UPDATE, DELETE만 허용
- RPC 실행: `service_role`만 허용
- update claim: 첫 호출 true, 중복 호출 false
- 보안 Advisor 경고 없음, RLS 정책 없음 INFO 4건은 서버 전용 단계의 의도된 상태

## 남은 사용자 설정

- [x] `.env`에 Supabase 서버 Secret Key 입력
- [x] `SUPABASE_OWNER_EMAIL` 입력
- [x] `settings` 단일 행 초기화 및 Data API 검증
- [ ] 향후 Dashboard Auth/RLS 사용자 정책 migration 추가
