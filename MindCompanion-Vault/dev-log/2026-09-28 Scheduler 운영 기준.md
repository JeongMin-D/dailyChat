---
tags: [dev-log, github-actions, scheduler, operations]
date: 2026-09-28
status: complete
---

# Scheduler 운영 기준

- 공개 GitHub API로 예약 run `36195668147`, `36274617442`를 대조했고 모두 성공했지만 예정 시각보다 각각 188분, 171분 늦게 시작했다.
- 처리 대상 날짜 명시와 멱등 재실행이 보장되므로 MVP 허용 지연을 240분으로 정했다.
- workflow에 30분 초과 warning·summary 기록과 240분 초과 사후 실패 처리를 추가했다. 늦어도 일기 처리는 먼저 시도한다.
- 실패 run은 `Re-run failed jobs`, 누락 run은 수동 `live`와 명시적 `target_day`로 복구하고 DB·Telegram 결과를 대조한다.
- 정시 실행이 필수 요구가 아니므로 추가 scheduler와 유료 서비스는 도입하지 않았다.
- 비밀값과 사용자 원문은 코드, 문서와 검사 출력에 포함하지 않았다.
