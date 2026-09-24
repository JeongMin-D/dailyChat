---
tags: [mindcompanion, backlog]
status: active
updated: 2026-09-24
---

# MVP 백로그

체크박스는 구현과 검증이 모두 끝났을 때만 완료한다. 각 작업은 가능하면 하루 이내 크기로 나눈다.

## EPIC A — 기반

- [x] A01 런타임 언어와 패키지 관리자 결정
- [x] A02 저장소 디렉터리와 환경별 설정 구성
- [x] A03 비밀정보 목록 및 `.env.example` 작성
- [x] A04 Supabase 개발 프로젝트 `dailyChat` 생성 및 연결
- [/] A05 기존 `schema.sql`을 순차 migration으로 변환 — foundation 및 보안 migration 3개 적용
- [x] A06 공통 오류 형식, request ID, JSON logger 구성
- [ ] A07 CI에서 lint, typecheck, unit test 실행

## EPIC B — Telegram 대화

- [x] B01 Bot HTTP endpoint 구현, Telegram webhook 등록 및 실대화 검증
- [x] B02 Telegram update 멱등 키 저장
- [x] B03 허용 `chat_id`/`user_id` 이중 검사
- [x] B04 user 메시지를 응답 전에 저장
- [x] B05 Groq provider 인터페이스 구현
- [x] B06 SOUL 프롬프트와 컨텍스트 빌더 구현 — 최근 12개·6,000자 제한
- [x] B07 assistant 메시지 저장 후 전송
- [/] B08 timeout·429·5xx 재시도 테스트 — timeout과 Telegram 재전송 경로 구현, backoff 대기
- [x] B09 비허용 사용자 무응답/차단 테스트

## EPIC C — 데이터 계약

- [ ] C01 event/mood/health/diary JSON Schema 확정
- [ ] C02 DB 제약과 애플리케이션 타입 일치
- [ ] C03 복수 원문 근거 연결 테이블 추가
- [ ] C04 `job_runs`, `notification_outbox` 추가
- [ ] C05 `safety_flag`, prompt/model version, input hash 저장
- [ ] C06 UTC 저장과 KST 04:00 경계 단위 테스트

## EPIC D — 야간 파이프라인

- [ ] D01 처리할 local day 선택
- [ ] D02 메시지 snapshot과 hash 생성
- [ ] D03 Structured Output LLM 호출
- [ ] D04 source ID와 enum/range 검증
- [ ] D05 events/health/mood 트랜잭션 저장
- [ ] D06 일기 생성과 근거 연결
- [ ] D07 동일 입력 재실행 멱등 처리
- [ ] D08 변경 입력 재생성/버전 증가 처리
- [ ] D09 Telegram 전송 outbox와 재시도
- [ ] D10 안전 플래그 알림 분기 테스트

## EPIC E — 기억

- [ ] E01 기억 후보 및 근거 스키마 추가
- [ ] E02 장기 가치 판단 규칙 구현
- [ ] E03 낮은 확신 사용자 확인 흐름
- [ ] E04 활성 기억 검색 및 컨텍스트 제한
- [ ] E05 기존 사실 갱신과 상충 처리
- [ ] E06 “잊어줘” 비활성화/삭제
- [ ] E07 `MEMORY.md` 투영 생성

## EPIC F — Dashboard

- [ ] F01 Next.js와 Supabase Auth 구성
- [ ] F02 오늘 요약 화면
- [ ] F03 Calendar와 날짜 상세
- [ ] F04 Diary 목록/상세/근거
- [ ] F05 Timeline
- [ ] F06 날짜·키워드 검색
- [ ] F07 일기 피드백
- [ ] F08 기억 조회·수정·삭제
- [ ] F09 기분/건강 기본 차트
- [ ] F10 모바일 레이아웃과 접근성 점검

## EPIC G — 보안·운영·출시

- [ ] G01 모든 테이블 RLS 및 부정 테스트
- [ ] G02 service role 브라우저 번들 미포함 검사
- [/] G03 로그 개인정보 마스킹 — 공통 logger 필드 마스킹 구현, 전체 로그 감사 대기
- [ ] G04 프롬프트 인젝션 회귀 테스트
- [ ] G05 DB 백업 자동화
- [ ] G06 빈 환경에서 복구 리허설
- [ ] G07 위기 연락처와 대응 문구 최신성 검증
- [ ] G08 사용량·지연·오류 대시보드/알림
- [ ] G09 배포와 롤백 runbook 검증
- [ ] G10 제한 운영 승인
