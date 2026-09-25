---
tags: [mindcompanion, backlog]
status: active
updated: 2026-09-25
---

# MVP 백로그

체크박스는 구현과 검증이 모두 끝났을 때만 완료한다. 각 작업은 가능하면 하루 이내 크기로 나눈다.

## 현재 포커스

- 현재 단계: M1 완료, M2 종단 실행 연결
- 완료: ADR-001~006 P0 결정 승인 및 문서화
- 완료: C01 event/mood/health/diary JSON Schema와 의미 검증
- 완료: C02 DB 제약과 애플리케이션 타입 target 계약 및 자동 대조
- 완료: C03 core domain과 복수 원문 근거 연결 테이블 migration
- 완료: C04 `job_runs` claim 보강과 reference-only `notification_outbox`
- 완료: C05 제한 safety 원장과 provider/model/prompt/schema/input 재현 metadata
- 완료: C06 UTC 저장과 KST 04:00 DB 무결성 검증
- 완료: D01 처리 local day 선택과 D02 canonical message snapshot/hash 생성
- 완료: D03 Groq Structured Output 호출과 D04 source/enum/range 검증
- 완료: D05 events/health/mood 트랜잭션 저장과 D06 일기·근거 연결
- 완료: D07 동일 입력 no-op과 D08 변경 입력 새 version 생성
- 완료: D09 Telegram outbox 등록·claim·전송·재시도
- 완료: D10 none·concern·urgent 안전 알림 분기
- 다음 작업: M2 scheduler→추출→저장→알림 종단 실행 연결
- 전체 상태: [[15 현재 진행 현황]]

## EPIC A — 기반

- [x] A01 런타임 언어와 패키지 관리자 결정
- [x] A02 저장소 디렉터리와 환경별 설정 구성
- [x] A03 비밀정보 목록 및 `.env.example` 작성
- [x] A04 Supabase 개발 프로젝트 `dailyChat` 생성 및 연결
- [/] A05 기존 `schema.sql`을 순차 migration으로 변환 — foundation부터 안전 알림 분기까지 migration 11개 적용
- [x] A06 공통 오류 형식, request ID, JSON logger 구성
- [x] A07 CI에서 lint, typecheck, unit test 실행 — Node 24, npm ci, npm run check
- [x] A08 ADR-001~006 P0 결정 승인 — 공급자·하루 경계·기억 원장·근거·런타임·안전

## EPIC B — Telegram 대화

- [x] B01 Bot HTTP endpoint 구현, Telegram webhook 등록 및 실대화 검증
- [x] B02 Telegram update 멱등 키 저장
- [x] B03 허용 `chat_id`/`user_id` 이중 검사
- [x] B04 user 메시지를 응답 전에 저장
- [x] B05 Groq provider 인터페이스 구현
- [x] B06 SOUL 프롬프트와 컨텍스트 빌더 구현 — 최근 12개·6,000자 제한
- [x] B07 assistant 메시지 저장 후 전송
- [x] B08 timeout·429·5xx 재시도 테스트 — Groq·Telegram bounded exponential backoff, jitter, Retry-After, 4xx 제외
- [x] B09 비허용 사용자 무응답/차단 테스트
- [x] B10 DB 실패 종단 시나리오 — claim·user 저장·assistant 저장·완료 상태 기록 장애와 재전달 검증

## EPIC C — 데이터 계약

- [x] C01 event/mood/health/diary JSON Schema 확정 — Draft 2020-12, Ajv, Groq strict shape, 근거 의미 검증
- [x] C02 DB 제약과 애플리케이션 타입 일치 — 컬럼·관계·삭제·권한 target 계약과 자동 대조
- [x] C03 복수 원문 근거 연결 테이블 추가 — core 5개·근거 5개, RLS·권한·FK 실DB 검증
- [x] C04 `job_runs`, `notification_outbox` 추가 — 원자적 claim·stale 회수·멱등 제약·server-only 검증
- [x] C05 safety level/reason/checker, prompt/model version, input hash 저장 — 제한 컬럼·SHA-256·원문 FK 실DB 검증
- [x] C06 UTC 저장과 KST 04:00 경계 단위 테스트 — 앱·DB 경계 일치, message day trigger, 실DB rollback 검증

## EPIC D — 야간 파이프라인

- [x] D01 처리할 local day 선택 — 마지막으로 완전히 닫힌 날짜를 scheduler가 job day로 명시
- [x] D02 메시지 snapshot과 hash 생성 — user-only, sentAt/id 정렬, UTF-8 JSON, SHA-256
- [x] D03 Structured Output LLM 호출 — strict JSON Schema, prompt injection 경계, 빈 입력 skip, 1회 교정
- [x] D04 source ID와 enum/range 검증 — snapshot day/source/event/safety 교차 검증과 안정적 오류 코드
- [x] D05 events/health/mood 트랜잭션 저장 — service-role 전용 단일 RPC, job 잠금·성공 전환과 rollback 검증
- [x] D06 일기 생성과 근거 연결 — block 순서, 원문·event·safety 근거를 같은 트랜잭션에 저장
- [x] D07 동일 입력 재실행 멱등 처리 — 성공 job은 LLM 전 no-op, 저장 재호출도 기존 diary 반환
- [x] D08 변경 입력 재생성/버전 증가 처리 — 날짜별 transaction lock과 `max(version)+1`
- [x] D09 Telegram 전송 outbox와 재시도 — 멱등 등록, payload claim, 429·5xx·네트워크 backoff, terminal 4xx, provider message ID 기록
- [x] D10 안전 플래그 알림 분기 테스트 — none 일반 일기, concern 지지 문구 일기, urgent 본문 차단·고정 안전 안내

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
