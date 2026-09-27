---
tags: [mindcompanion, dashboard, diary]
status: done
date: 2026-09-26
---

# Dashboard 날짜 선택

## 구현

- Dashboard 상단에 `date` 입력과 `날짜 보기` 버튼을 추가했다.
- 선택한 값은 기존 `/dashboard?day=YYYY-MM-DD` 서버 조회 경로로 전달한다.
- 검색은 현재 선택 날짜를 hidden field로 유지한다.
- 데스크톱은 날짜·검색 도구를 나란히, 900px 이하에서는 세로로 배치한다.

## 일기 생성 방식 확인

- 야간 입력은 해당 날짜의 사용자 메시지 원문 전체를 시간과 ID 순으로 canonical snapshot에 담는다.
- Groq는 키워드만 받아 문장을 만드는 것이 아니라 원문 전체를 근거로 제목, 태그, 기분, 구조화 사건과 일기 문단을 새로 구성한다.
- 단순 원문 이어 붙이기는 아니며, 모든 일기 문단은 한 개 이상의 원문 메시지 ID를 직접 근거로 가져야 한다.
- Dashboard는 저장된 최신 일기 version의 block을 순서대로 표시한다.

## 검증

- 렌더링 테스트에서 날짜 입력의 이름, 선택값, 제출 버튼을 확인했다.
- 로컬 Dashboard에서 `2026-09-25` 조회가 HTTP 200이고 제목과 날짜 입력값이 함께 변경됨을 확인했다.
- 실제 Supabase 읽기 응답을 사용했으며 service role 식별자 노출은 없었다.
- `npm run check`: lint, typecheck, 자동 테스트 175개 통과.

## 다음 작업

- 월간 Calendar 그리드는 F03 잔여 작업으로 유지한다.
- 일기 원문 근거 직접 이동은 F04 잔여 작업이다.
