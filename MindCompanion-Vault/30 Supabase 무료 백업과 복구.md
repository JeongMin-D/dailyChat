---
tags: [mindcompanion, supabase, backup, runbook]
status: verified
updated: 2026-09-28
---

# Supabase 무료 백업과 복구

## 백업

GitHub Actions `Encrypted Supabase backup`이 매주 월요일 05:20 KST에 Supabase의 public 앱 테이블 22개를 JSON으로 내보낸다. schema와 권한은 저장소의 `database/migrations/`가 원본이며, 데이터 JSON은 AES-256-CBC/PBKDF2로 암호화한 artifact만 14일 보관한다. 평문은 runner 종료 전 삭제한다.

필요한 GitHub Actions Secret은 `SUPABASE_SERVICE_ROLE_KEY`와 `BACKUP_PASSPHRASE`다. 암호는 코드·로그·Obsidian에 기록하지 않고 GitHub Secret과 별도의 사용자 비밀번호 관리자에 함께 보관한다.

2026-09-28 수동 run `36395981814`가 성공했다. 암호화 artifact 1개만 생성됐으며 사용자 원문과 비밀값은 로그에 표시하지 않았다.

## 복구

1. artifact의 `dailychat-public.json.enc`를 내려받는다.
2. `openssl enc -d -aes-256-cbc -pbkdf2 -in dailychat-public.json.enc -out dailychat-public.json -pass env:BACKUP_PASSPHRASE`로 복호화한다.
3. 빈 PostgreSQL에 `database/migrations/*.sql`을 순서대로 적용한다.
4. `node scripts/render-public-backup-sql.js`로 복구 SQL을 만들고, 빈 DB에 `psql -v ON_ERROR_STOP=1 -f dailychat-restore.sql`을 실행한다.
5. `public` 테이블 22개와 필요한 행 수를 백업 시점과 대조한 뒤 평문 JSON·SQL을 삭제한다.

백업 workflow는 위 과정을 GitHub의 빈 PostgreSQL 16 service에서 매 실행 자동 검증한다. run `36395981814`가 복호화·migration·22개 table 복원을 모두 통과했다. 운영 DB에는 복구하지 않는다.
