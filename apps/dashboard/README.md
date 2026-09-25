# Dashboard

현재 Dashboard는 별도 유료 서비스 없이 기존 `dailychat-bot` Node 서버의 `/dashboard`에서 서버 렌더링됩니다.

## 제공 기능

- 단일 사용자 HTTP Basic 인증
- 최근 기록 날짜 이동
- 날짜별 대화·이벤트·기분·건강 요약
- 생성된 일기와 타임라인
- 현재 날짜 안의 키워드 검색
- 최근 기분 막대 차트와 모바일 반응형 화면

Supabase service role은 서버의 Data API 요청에만 사용하며 HTML이나 브라우저 JavaScript에 전달하지 않습니다. `DASHBOARD_USERNAME`과 16자 이상의 `DASHBOARD_PASSWORD`가 모두 없으면 `/dashboard`는 503으로 비활성화됩니다.

원래 계획했던 Next.js + Supabase Auth는 다중 화면 편집 기능이 필요한 시점으로 미뤘습니다. 현재 방식은 단일 사용자·읽기 중심 MVP와 무료 Render 한 서비스 제약을 만족합니다. 일기 근거 직접 이동, 피드백, 기억 관리는 후속 작업입니다.
