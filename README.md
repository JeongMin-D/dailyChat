# MindCompanion

[![CI](https://github.com/JeongMin-D/dailyChat/actions/workflows/ci.yml/badge.svg)](https://github.com/JeongMin-D/dailyChat/actions/workflows/ci.yml)

Telegram 대화를 근거 있는 개인 기록과 일기로 만드는 단일 사용자용 AI 라이프 로깅 서비스입니다.

## 현재 상태

M1 대화 수직 슬라이스가 완료되어 Render에 배포돼 있습니다. KST 04:00 하루 경계, Telegram webhook 인증, 허용 사용자 검사, 메시지 선저장, SOUL 프롬프트, 제한된 최근 대화 컨텍스트, Groq 응답, Telegram 전송, 외부 오류 재시도 및 DB 장애 재처리 경로가 검증됐습니다.

## 요구 환경

- Node.js 24 이상
- npm 11 이상
- 이후 단계: Supabase 프로젝트, Telegram Bot, Groq API key

## 시작하기

```bash
npm test
```

커밋 전 CI와 동일한 전체 품질 검사를 실행합니다.

```bash
npm run check
```

이 명령은 ESLint, JavaScript typecheck, 전체 단위 테스트를 순서대로 실행합니다.

필수 환경변수를 설정한 뒤 Bot 서버를 실행합니다.

```bash
npm run start:bot
```

로컬 실행에서는 루트 `.env`를 자동으로 읽으며, 배포 환경에서는 플랫폼의 환경변수를 그대로 사용합니다.

- 상태 확인: `GET /health`
- Telegram webhook: `POST /telegram/webhook`
- 모든 HTTP 응답: `X-Request-ID` 헤더
- 오류 응답: `{ "error": { "code", "message", "requestId" } }`

Groq와 Telegram 호출은 429, 5xx, 네트워크 오류 및 timeout에서만 bounded exponential backoff와 jitter를 적용합니다. 기본값은 총 3회 시도, 250ms 시작, 최대 2초 지연이며 `.env.example`의 `UPSTREAM_RETRY_*` 값으로 조정할 수 있습니다.

외부 서비스 연결 상태를 비밀값 출력 없이 확인합니다.

```bash
npm run smoke:connections
```

비밀정보는 `.env.example`을 참고해 로컬 `.env`에만 둡니다. `.env`는 저장소에서 제외됩니다.

## 디렉터리

```text
apps/
  bot/                 Telegram webhook과 실시간 대화
  dashboard/           Next.js 사용자 화면
packages/
  core/                순수 도메인 로직
  contracts/           JSON Schema와 공유 계약
  observability/       로그·측정 공통 코드
workers/
  nightly/             추출·일기·기억 야간 작업
database/
  migrations/          Supabase/PostgreSQL migration
config/                 환경별 설정 문서
tests/
  fixtures/            비식별 LLM 평가 데이터
MindCompanion-Vault/    Obsidian 개발 문서
```

## 개발 원칙

- 사용자 메시지는 LLM 호출 전에 멱등 저장합니다.
- LLM 결과는 신뢰하지 않고 schema와 근거 ID를 검증합니다.
- DB에는 UTC를 저장하고 기록 날짜는 설정된 시간대와 하루 경계로 계산합니다.
- 브라우저에는 Supabase service role을 노출하지 않습니다.
- 기억은 수정·삭제·추적 가능해야 합니다.

## 운영 상태

- Supabase `dailyChat` migration 및 설정 적용 완료
- Telegram webhook 등록 및 실대화 검증 완료
- Groq 모델 연결 및 변경된 API key 검증 완료
- Render `dailychat-bot` 배포 및 `/health` 검증 완료

개발 순서는 [Obsidian 일정](<MindCompanion-Vault/14 개발 우선순위 및 일정.md>)을 따릅니다.
