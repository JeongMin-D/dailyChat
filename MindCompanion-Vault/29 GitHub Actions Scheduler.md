---
aliases:
  - DailyChat GitHub Actions Scheduler
tags: [mindcompanion, nightly, github-actions, scheduler, m2]
status: active
updated: 2026-09-26
---

# GitHub Actions Scheduler

## 선택 이유

공개 저장소의 표준 GitHub-hosted runner로 야간 파이프라인을 실행해 Render Cron의 월 최소 비용을 피한다. Render Web Service는 Telegram webhook 용도로 유지한다.

## 실행 계약

- workflow: `.github/workflows/nightly.yml`
- 예약: 매일 `19:05 UTC` = 다음 날 `04:05 Asia/Seoul`
- 명령: `npm run run:nightly`
- 수동 기본값: `dry-run`
- 수동 실제 실행: `live`, 선택적 `target_day`는 `YYYY-MM-DD`
- 권한: `contents: read`
- 동시성: `nightly-diary` 한 건씩 실행
- timeout: 15분

예약 실행은 항상 live다. 수동 실행은 실수 방지를 위해 dry-run이 기본이며, dry-run에는 Groq key만 전달한다. Supabase와 Telegram 비밀값은 live step에서만 사용할 수 있다.

## 필요한 Repository Secrets

GitHub 저장소 `Settings → Secrets and variables → Actions`에 아래 이름으로 등록한다.

1. `GROQ_API_KEY`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `TELEGRAM_BOT_TOKEN`

비밀값은 workflow, 로그, 문서, Git diff에 넣지 않는다. Supabase service role/secret key는 서버 전용이며 브라우저 코드에는 노출하지 않는다.

## 검증 순서

1. [x] Actions Secret 3개 등록
2. [x] `Nightly diary`를 `dry-run`으로 수동 실행하고 Groq 구조화 출력 성공 확인
3. [x] 처리 대상 날짜를 확인한 뒤 `live` 수동 실행
4. [x] Supabase의 job, diary, outbox 성공 상태와 Telegram 전송 확인
5. 다음 04:05 KST 예약 실행 확인
6. [x] 실패 재실행에서 동일 입력 no-op과 알림 멱등성 확인

## 현재 상태

workflow, 정적 계약 테스트, Actions Secret 등록과 GitHub-hosted runner dry-run을 완료했다. run `36142874248`에서 Groq 구조화 출력과 `externalWrites=false` 실행이 성공했다.

첫 실행은 `.env` 파일 부재 때문에 실패해 smoke 명령을 `--env-file-if-exists=.env`로 수정했다. 이후 Groq가 strict Structured Output 400을 두 번 반환했으나 같은 입력의 재실행에서 성공했다. Groq 공식 문서도 400 발생 시 재현 제보를 안내하므로, 예약 실행에서 같은 오류가 반복되면 제한된 400 재시도 정책을 추가 검토한다.

2026-09-24 live는 run `36191065811`에서 완료됐다. job succeeded, diary version 1, outbox sent와 Telegram provider message ID를 확인했다.

동일 날짜 재실행 run `36191616679`는 action `noop`, delivery `not_claimed`로 완료됐다. job, diary, outbox 수와 attempt, Telegram provider message ID가 증가하지 않았다.

실제 live와 중복 검증 로그에서 등록한 API 키·토큰 3개와 사용자 원문 5건을 대조해 노출이 없음을 확인했다. 남은 단계는 첫 04:05 KST 예약 실행 검증뿐이다.

사용자 요청으로 2026-09-26 06:37 KST에 즉시 live run `36192530118`도 실행했다. 파이프라인은 2026-09-25 처리일을 선택했고, Supabase 대조에서 user message·nightly job·diary·outbox가 모두 0건임을 확인해 `no_user_messages`로 skip했다. 새 Groq 호출, DB 쓰기, Telegram 전송은 발생하지 않았다. 이 검증은 수동 live 경로의 빈 입력 안전성을 보강하며, 첫 예약 실행 자체의 확인은 대체하지 않는다.
