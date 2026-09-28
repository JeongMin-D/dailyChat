---
tags: [mindcompanion, dev-log, dashboard, security]
date: 2026-09-28
---

# Dashboard 편집과 출시 보안 점검

## 구현

- 일기별 도움 여부와 선택 메모를 저장한다.
- 확정 기억을 조회하고, 수정 시 원문 근거를 복사한 새 버전을 만들며 이전 버전을 `superseded` 처리한다.
- 기억 삭제는 기존 감사 가능한 `forgotten` RPC를 재사용한다.
- Dashboard POST는 HTTP Basic 인증과 동일 Origin을 함께 요구한다.
- 최근 야간 작업·성공 횟수·전송 실패·실행 시간을 Dashboard에 표시한다.

## 운영 검증

- Supabase migration 적용 완료.
- `diary_feedback` RLS 활성, `anon`·`authenticated` 접근 없음, `service_role`만 테이블/RPC 접근 가능.
- 운영 public 테이블 22개 모두 RLS 활성, `anon`·`authenticated` CRUD 권한 0.
- Security Advisor의 22개 INFO는 server-only 설계상 정책 없이 RLS로 차단한 의도된 결과다.
- [보건복지부 정책 자료](https://www.mohw.go.kr/menu.es?mid=a10716040000)의 24시간 자살예방 상담 `109`와 [국가정신건강정보포털](https://www.mentalhealth.go.kr/portal/health/fac/PotalHealthFacListTab1.do)의 정신건강위기 상담 `1577-0199`를 2026-09-28 재확인했다.

## 백업

- 무료 GitHub Actions 암호화 DB dump 설계와 [[30 Supabase 무료 백업과 복구]]를 작성했다.
- 전체 DB의 GitHub artifact 외부 저장은 별도 승인이 필요해 workflow를 배포하지 않았고, Secret 등록·첫 실행과 별도 빈 DB 복구도 미완료 상태로 유지한다.
