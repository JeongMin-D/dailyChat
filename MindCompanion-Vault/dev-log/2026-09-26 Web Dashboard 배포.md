---
tags: [mindcompanion, m4, dashboard, render, supabase]
status: complete
date: 2026-09-26
---

# Web Dashboard 배포

## 구현

- 기존 Node HTTP 서버에 `/dashboard` 서버 렌더링 화면을 결합했다.
- Supabase 서버 전용 store가 날짜별 messages, events, mood, health, diary, block을 읽는다.
- 최신 기록, 요약, 일기, 타임라인, 키워드 검색, 기분 차트와 건강 목록을 반응형 화면으로 구성했다.
- HTTP Basic 인증을 timing-safe 비교하고 보안 응답 헤더를 적용했다.
- service role은 브라우저로 전달하지 않는다.

## 검증

- lint, typecheck, 자동 테스트 175개 통과
- 실제 Supabase 데이터 렌더링과 검색 UI를 브라우저에서 확인했다.
- Render 환경변수에 Dashboard 인증값을 등록하고 커밋 `3ba7647`을 배포했다.
- 운영 `/health` 200, Dashboard 미인증 401·인증 200, 실데이터 표시를 확인했다.
- 운영 HTML에서 service role 노출이 없고 배포 후 오류 로그도 0건이었다.
- Telegram webhook URL 일치, pending 0, 최근 오류 없음과 최종 점검 메시지 ID `15` 전송을 확인했다.

## 결정

단일 사용자 읽기 MVP와 비용 제약을 우선해 Next.js 별도 서비스 대신 기존 무료 Node 서비스에 Dashboard를 통합했다. 편집·기억 관리 단계에서 Supabase Auth와 프레임워크 전환 필요성을 다시 평가한다.
