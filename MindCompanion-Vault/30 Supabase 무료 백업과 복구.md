---
tags: [mindcompanion, supabase, backup, runbook]
status: ready
updated: 2026-09-28
---

# Supabase 무료 백업과 복구

## 백업

제안된 GitHub Actions `Encrypted Supabase backup`은 매주 월요일 05:20 KST에 전체 DB를 SQL로 내보낸다. 평문은 즉시 AES-256으로 암호화한 뒤 삭제하고, 암호화 artifact만 14일 보관한다. 전체 DB를 GitHub에 외부 저장하는 별도 승인을 받기 전에는 workflow를 배포하지 않는다.

필요한 GitHub Actions Secret:

- `SUPABASE_DB_URL`: Supabase Dashboard의 direct database connection string
- `BACKUP_PASSPHRASE`: 별도 암호 관리자에 보관한 긴 무작위 암호

외부 저장 승인 후 workflow 배포와 Secret 등록, 수동 실행 1회를 성공시켜야 G05가 완료된다. 두 값은 코드·로그·Obsidian에 기록하지 않는다.

## 복구 리허설

1. 비어 있는 별도 PostgreSQL/Supabase 환경을 준비한다. 운영 DB에는 복구하지 않는다.
2. GitHub artifact `dailychat.sql.enc`를 내려받는다.
3. `openssl enc -d -aes-256-cbc -pbkdf2 -in dailychat.sql.enc -out dailychat.sql -pass env:BACKUP_PASSPHRASE`로 복호화한다.
4. `psql "$RECOVERY_DB_URL" -v ON_ERROR_STOP=1 -f dailychat.sql`로 복원한다.
5. 테이블 수, 최신 `job_runs` 상태, 일기·원문·기억·outbox 행 수를 운영 백업 시점과 대조한다.
6. 앱을 복구 DB에 연결해 `/health`, Dashboard 인증·날짜 조회, nightly dry-run을 확인한다.
7. 평문 dump와 임시 복구 환경을 제거한다.

현재 로컬에는 `psql`과 별도 빈 DB가 없으므로 G06 실제 리허설은 완료로 표시하지 않는다.
