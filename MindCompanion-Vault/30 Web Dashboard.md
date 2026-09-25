---
aliases:
  - DailyChat Web Dashboard
tags: [mindcompanion, dashboard, render, supabase, m4]
status: active
updated: 2026-09-26
---

# Web Dashboard

## 운영 주소와 인증

- URL: `https://dailychat-bot.onrender.com/dashboard`
- 기존 Render `dailychat-bot` 무료 Web Service 안에서 함께 실행한다.
- `DASHBOARD_USERNAME`과 16자 이상의 `DASHBOARD_PASSWORD`를 Render secret 환경변수로 관리한다.
- 로컬 복사본은 Git에서 제외된 `.env.dashboard`에만 저장한다.
- 둘 중 하나라도 없으면 Dashboard는 503으로 닫힌다.
- 잘못된 인증은 401이며 응답은 `no-store`, CSP, frame 차단, MIME sniff 차단을 적용한다.

## 데이터 경계

- 브라우저는 Supabase key를 받지 않는다.
- 서버만 service role로 Data API를 읽고 escape한 HTML을 반환한다.
- 사용자 원문은 인증된 화면의 타임라인과 검색 결과에만 렌더링한다.
- API 오류 본문이나 비밀값은 응답·로그에 포함하지 않는다.

## 현재 화면

1. 최근 기록 날짜 이동
2. 대화·이벤트·기분·일기 요약 카드
3. 최신 일기 제목·태그·기분·본문
4. 대화·이벤트·건강 기록의 시간순 타임라인
5. 선택 날짜의 키워드 검색
6. 최근 기분 점수 차트와 건강 메모
7. 모바일 단일 열 반응형 레이아웃

## 검증 결과

- 자동 검사 175개 통과
- 실제 Supabase `2026-09-24` 데이터: 메시지 10, 이벤트 1, 기분 1, 일기 1, block 1 표시
- 검색어 입력과 결과 표시 확인
- 운영 미인증 요청 401, 인증 요청 200
- 반환 HTML의 Supabase service role 포함 여부 false
- Render 배포 `dep-darerc59fdbs739ah9gg` live, 배포 후 오류 로그 0건

## 남은 범위

- 월간 Calendar 그리드
- 일기 block에서 원문 근거로 직접 이동
- 일기 👍/👎 피드백
- 장기 기억 원장이 구현된 뒤 기억 조회·수정·삭제

현재 산출물은 단일 사용자 읽기 중심 Dashboard다. Next.js + Supabase Auth는 편집·다중 페이지 요구가 생기는 후속 단계로 연기했다.
