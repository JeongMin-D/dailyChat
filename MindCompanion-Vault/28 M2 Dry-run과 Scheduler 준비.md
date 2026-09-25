---
aliases:
  - DailyChat nightly dry run
  - DailyChat Render Cron 준비
tags: [mindcompanion, nightly, render, scheduler, m2]
status: awaiting-approval
updated: 2026-09-25
---

# M2 Dry-run과 Scheduler 준비

## 합성 종단 dry-run

`npm run smoke:nightly:pipeline`은 고정된 합성 사용자 메시지만 실제 Groq에 전달한다. Supabase와 Telegram은 production adapter에 가짜 `fetch`를 주입하므로 요청 구성, 응답 검증, 포맷과 단계 순서는 그대로 실행하지만 외부 DB 저장과 Telegram 발송은 하지 않는다.

검증된 순서는 다음과 같다.

1. input 조회
2. job prepare
3. job claim
4. Groq 구조화 추출
5. 원자 저장 요청
6. outbox enqueue
7. notification claim
8. Telegram send 요청
9. notification complete

2026-09-25 실행 결과는 `externalWrites=false`, Groq 1회 성공, safety `none`, mood 1개, diary block 1개, Telegram text 55자였다. 원문·일기 본문·비밀값은 출력하지 않았다.

## Render Cron 계획

Render Cron 표현식은 UTC 기준이다. 목표 시각 `04:05 Asia/Seoul`은 전날 `19:05 UTC`이므로 다음 표현식을 사용한다.

```text
5 19 * * *
```

검토용 Blueprint는 `config/render-nightly-cron.example.yaml`에 두었다. 실제 루트 `render.yaml`에는 아직 합치지 않았다.

- 서비스: `dailychat-nightly`
- runtime: Node.js
- region: Singapore
- plan: `0.5c-512mb`
- command: `npm run run:nightly`
- 비밀값: 기존 `dailychat-bot`의 Telegram token, Groq key, Supabase service role key 참조
- 수동 target day는 설정하지 않아 매 실행 시 마지막 닫힌 날짜를 계산

## 보류 이유

Render Cron은 실행 시간 기준 과금과 별개로 서비스당 월 최소 $1 비용이 발생한다. 비용 승인이 필요한 외부 리소스이므로 실제 Cron 생성, 루트 Blueprint 활성화, 첫 실제 Telegram 발송은 수행하지 않았다.

## 다음 작업

비용 승인 후 Blueprint를 활성화하고 Cron을 생성한다. 첫 수동 실행에서 Render 로그, Supabase job/diary/outbox, Telegram 수신을 확인한 뒤 다음 04:05 KST 예약 실행을 관찰한다.
