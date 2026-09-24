# AI 라이프 로깅 & 메모리 일기 비서

## MindCompanion

**Version:** 3.0
**작성일:** 2026-09-20
**목표:** 개인의 일상 대화와 기록을 장기적으로 축적하고, 이를 기반으로 대화·기억·일기·생활 분석을 제공하는 개인용 AI 비서 구축

---

# 1. 프로젝트 개요

## 1.1 서비스 정의

**MindCompanion**은 Telegram을 통해 AI와 일상적으로 대화하면 대화 내용을 장기적으로 축적하고, 이를 바탕으로 사용자의 일상·감정·건강 상태·주요 사건을 기억하는 **개인용 AI 라이프 로깅 및 메모리 일기 비서**이다.

사용자는 별도의 입력 양식을 작성하지 않고 평소처럼 AI와 대화한다.

예:

> 오늘 회사에서 HMI 작업했는데 생각보다 오래 걸렸어.
> 슬라이더 UI 때문에 한참 수정했는데 결국 해결했어.

MindCompanion은 이를 단순 대화로만 처리하지 않고 다음과 같이 구조화한다.

```text
대화
 ↓
이벤트 추출
 ↓
감정/상태 추출
 ↓
중요 기억 판단
 ↓
장기 기억 저장
 ↓
일상 데이터 축적
 ↓
일일/주간/월간 분석
 ↓
개인화된 대화 및 일기 생성
```

---

# 2. 핵심 목표

### 목표 1. 자연스러운 라이프 로깅

사용자가 별도의 기록 앱을 조작하지 않고 Telegram에서 AI와 대화하는 것만으로 일상을 기록한다.

### 목표 2. 장기 기억

단순히 현재 대화의 문맥만 기억하는 것이 아니라 과거의 중요한 사건·관계·선호·생활 패턴 등을 장기적으로 관리한다.

### 목표 3. 자동 일기 생성

매일 하루의 대화와 기록을 분석하여 사용자의 관점에서 자연스러운 1인칭 일기를 생성한다.

### 목표 4. 생활 데이터 구조화

대화에서 다음 정보를 자동 추출한다.

* 주요 사건
* 일정
* 감정
* 스트레스
* 건강 관련 기록
* 사람/장소/프로젝트
* 중요한 결정
* 기억할 만한 사실

### 목표 5. 검색 가능한 개인 기록

과거의 특정 사건이나 기간을 자연어로 검색할 수 있도록 한다.

예:

> 지난달에 회사에서 힘들었던 일이 뭐였지?

> 내가 최근에 HMI 관련해서 어떤 문제를 해결했었지?

> 9월에 병원에 갔던 기록 보여줘.

---

# 3. MVP 범위

## 포함

* Telegram 텍스트 대화
* Groq API 기반 AI 대화
* 장기 기억 관리
* 일상 이벤트 자동 추출
* 감정/상태 기록
* 건강 관련 기록 저장
* 매일 밤 자동 일기 생성
* Telegram 일기 전달
* Web Dashboard
* 캘린더
* 일기 조회
* 감정/건강 추세 그래프
* 과거 기록 검색
* 기억 관리
* 데이터 백업
* 단일 사용자 접근 제한

## MVP 제외

* 다중 사용자
* 회원가입/결제
* 사진 분석
* 음성 입력
* 영상 분석
* 의료 진단
* 의약품 처방/복용 결정
* 외부 서비스 자동 실행
* 공개 서비스 운영

---

# 4. 전체 시스템 아키텍처

```text
                    ┌──────────────────┐
                    │     Telegram     │
                    │  사용자 대화창   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │    OpenClaw      │
                    │ Agent / Memory   │
                    │ Automation / Cron│
                    └────────┬─────────┘
                             │
                  ┌──────────┴──────────┐
                  │                     │
                  ▼                     ▼
        ┌──────────────────┐   ┌──────────────────┐
        │    Groq API      │   │    Supabase      │
        │                  │   │                  │
        │ GPT-OSS 120B     │   │ messages         │
        │ GPT-OSS 20B      │   │ events           │
        │                  │   │ mood             │
        │ 대화/추출/일기   │   │ health           │
        └──────────────────┘   │ diaries          │
                               │ memory_mirror    │
                               └────────┬─────────┘
                                        │
                                        ▼
                               ┌──────────────────┐
                               │  Next.js Web     │
                               │    Dashboard     │
                               └──────────────────┘
```

---

# 5. 핵심 기술 구성

| 영역         | 기술                                 |
| ---------- | ---------------------------------- |
| 사용자 인터페이스  | Telegram                           |
| Agent      | OpenClaw                           |
| LLM        | Groq API                           |
| 주 모델       | `openai/gpt-oss-120b`              |
| 경량 작업      | `openai/gpt-oss-20b`               |
| Backend DB | Supabase PostgreSQL                |
| Web        | Next.js                            |
| 인증         | Supabase Auth 또는 단일 사용자 인증         |
| Scheduler  | OpenClaw Cron                      |
| API        | Groq OpenAI-compatible API         |
| 데이터 형식     | JSON / JSON Schema                 |
| 배포         | 개인 서버 또는 PC                        |
| 시간 기준      | KST 04:00 day boundary / DB UTC 저장 |

Groq는 OpenAI 호환 API endpoint를 제공하기 때문에 OpenAI SDK 방식으로 연결할 수 있다.

---

# 6. LLM 구성

## 6.1 GPT-OSS 120B

주요 모델로 사용한다.

사용 영역:

* 자연스러운 Telegram 대화
* 장기 기억 기반 답변
* 복잡한 질문
* 하루 일기 생성
* 주간/월간 회고
* 중요한 정보 추출
* 과거 기록 종합

현재 Groq에서 GPT-OSS 120B는 131,072 token context window와 약 500 tok/s의 속도를 제공한다. 가격은 현재 입력 $0.15/1M tokens, 출력 $0.60/1M tokens로 표시되어 있다.

## 6.2 GPT-OSS 20B

상대적으로 단순한 작업에 사용한다.

* 이벤트 추출
* 감정 분류
* 데이터 정규화
* 간단한 요약
* 태그 생성
* 중요도 판단

현재 Groq에서는 GPT-OSS 20B가 약 1000 tok/s로 표시되며 입력 $0.075/1M tokens, 출력 $0.30/1M tokens이다.

---

# 7. LLM Routing

모든 요청을 동일한 모델로 처리하지 않는다.

```text
사용자 메시지
      │
      ▼
 OpenClaw Router
      │
      ├── 단순 대화
      │       ↓
      │    GPT-OSS 20B
      │
      ├── 이벤트/감정 추출
      │       ↓
      │    GPT-OSS 20B
      │
      ├── 복잡한 질문
      │       ↓
      │    GPT-OSS 120B
      │
      ├── 장기 기억 기반 답변
      │       ↓
      │    GPT-OSS 120B
      │
      └── 일기 생성
              ↓
           GPT-OSS 120B
```

초기 개발에서는 안정성을 위해 모든 작업을 120B로 처리한 뒤, 실제 사용량을 확인하면서 20B로 분리해도 된다.

---

# 8. 대화 처리 구조

사용자가 Telegram에서 메시지를 보내면 다음 과정으로 처리한다.

```text
Telegram Message
       ↓
OpenClaw
       ↓
메시지 원본 저장
       ↓
관련 Memory 검색
       ↓
필요한 Context 구성
       ↓
Groq API
       ↓
AI Response
       ↓
Telegram
```

동시에 메시지를 Supabase에 저장한다.

```text
messages
├── id
├── role
├── content
├── telegram_message_id
├── created_at
└── metadata
```

---

# 9. 이벤트 추출

모든 메시지를 단순 텍스트로만 저장하지 않고 중요한 사건을 구조화한다.

예:

```text
사용자:
오늘 회사에서 HMI 슬라이더 문제를 해결했어.
```

↓

```json
{
  "event_type": "work",
  "title": "HMI 슬라이더 문제 해결",
  "description": "HMI 슬라이더 관련 문제를 수정하고 해결함",
  "importance": 0.7,
  "occurred_at": "2026-09-20"
}
```

Groq의 Structured Outputs를 사용하여 JSON Schema 기반으로 결과를 강제한다. 현재 GPT-OSS 20B/120B는 `strict: true` Structured Outputs를 지원한다.

---

# 10. 감정 데이터

대화에서 명시적 또는 추정 가능한 감정 상태를 별도 구조로 저장한다.

```json
{
  "mood": "frustrated",
  "intensity": 0.6,
  "stress": 0.7,
  "source_message_id": "..."
}
```

단, AI가 감정을 확정적인 사실로 기록하지 않도록 한다.

예:

```text
"사용자가 화났다"
```

보다는

```text
"사용자가 답답함을 표현함"
```

과 같이 **대화에서 확인 가능한 표현을 중심으로 기록**한다.

---

# 11. 건강 기록

건강과 관련된 대화도 별도 구조로 저장한다.

예:

```json
{
  "category": "symptom",
  "content": "오늘 가슴이 답답하다고 느낌",
  "severity": null,
  "occurred_at": "2026-09-20",
  "source_message_id": "..."
}
```

MindCompanion은 건강 데이터를 기록하고 정리할 수 있지만 MVP에서는 다음 기능을 제공하지 않는다.

* 질병 진단
* 치료 결정
* 약물 변경 권고
* 응급 여부의 의학적 확정 판단

건강 관련 응답은 기록과 일반적인 정보 제공을 중심으로 구성한다.

---

# 12. 장기 기억 시스템

장기 기억은 두 계층으로 관리한다.

```text
OpenClaw Memory
       │
       ├── MEMORY.md
       └── USER.md

Supabase
       │
       └── memory_mirror
```

### OpenClaw Memory

AI Agent가 실제 대화에서 활용하는 장기 기억의 기준 데이터.

### Supabase memory_mirror

Web Dashboard에서 조회하기 위한 복제 데이터.

따라서 **Supabase와 OpenClaw Memory가 서로 다른 기억을 독립적으로 관리하지 않도록 한다.**

---

# 13. 기억 저장 기준

모든 대화를 장기 기억으로 저장하지 않는다.

다음 조건을 만족하는 경우 장기 기억 후보로 판단한다.

* 지속적으로 유지되는 사용자 정보
* 반복적으로 등장하는 선호
* 중요한 인간관계
* 장기간 진행되는 프로젝트
* 중요한 사건
* 중요한 결정
* 반복되는 생활 패턴

반대로 다음은 기본적으로 장기 기억에서 제외한다.

* 일회성 잡담
* 단순 인사
* 중요하지 않은 질문
* 임시적인 정보

---

# 14. 일일 일기 생성

매일 **23:30 KST**에 Cron 작업을 실행한다.

```text
23:30
 ↓
당일 메시지 조회
 ↓
이벤트 조회
 ↓
감정 조회
 ↓
건강 기록 조회
 ↓
관련 장기 기억 조회
 ↓
Context 생성
 ↓
Groq GPT-OSS 120B
 ↓
일기 생성
 ↓
Supabase 저장
 ↓
Telegram 전달
```

---

# 15. 일기 생성 원칙

일기는 AI가 임의로 사건을 만들어내지 않도록 한다.

### 원칙

1. 실제 대화/기록에 존재하는 내용만 사용
2. 확인되지 않은 사실 생성 금지
3. 감정 과장 금지
4. 사용자의 1인칭 관점 사용
5. 사건의 시간 순서 유지
6. 중요한 사건을 중심으로 작성
7. 민감한 정보는 불필요하게 반복하지 않음

예:

```text
오늘은 회사에서 HMI 작업을 했다.
슬라이더 UI에서 문제가 있어서 한동안 수정했는데,
결국 원인을 찾아 해결했다.

생각보다 시간이 오래 걸려서 조금 답답했지만
문제가 해결되고 나니 한결 편해졌다.
```

---

# 16. 일기 Source Event 연결

각 일기는 어떤 데이터에서 생성되었는지 추적할 수 있어야 한다.

```text
diary
 ├── diary_id
 ├── date
 ├── content
 └── source_events[]
```

이를 통해 사용자가 일기의 특정 문장을 확인하면 관련 이벤트로 이동할 수 있도록 한다.

```text
일기
 ↓
"오늘 HMI 슬라이더 문제를 해결했다."
 ↓
[관련 기록 보기]
 ↓
2026-09-20 14:32
Telegram Message
```

이를 통해 **근거 기반 일기(evidence-grounded diary)**를 구현한다.

---

# 17. Supabase 데이터베이스

## settings

```text
id
user_id
timezone
day_boundary
diary_time
created_at
updated_at
```

## messages

```text
id
telegram_message_id
role
content
created_at
metadata
```

## events

```text
id
event_type
title
description
occurred_at
importance
source_message_id
created_at
```

## mood_entries

```text
id
mood
intensity
stress
source_message_id
occurred_at
created_at
```

## health_entries

```text
id
category
content
value
unit
occurred_at
source_message_id
created_at
```

## diaries

```text
id
date
content
source_events
created_at
```

## memory_mirror

```text
id
memory_type
content
importance
source
updated_at
```

---

# 18. Web Dashboard

## Dashboard

```text
┌─────────────────────────────────────┐
│ MindCompanion                       │
├─────────────────────────────────────┤
│ 오늘                                │
│                                     │
│ 주요 이벤트                         │
│ • HMI 개발                          │
│ • 문제 해결                         │
│                                     │
│ 기분                                 │
│ ███████░░░                          │
│                                     │
│ 건강                                 │
│ ─────────────────────               │
│                                     │
│ 오늘의 일기                          │
│ ─────────────────────               │
└─────────────────────────────────────┘
```

## 주요 메뉴

```text
Dashboard
Calendar
Diary
Timeline
Mood
Health
Memory
Search
Settings
```

---

# 19. Calendar

날짜별로 기록을 확인한다.

```text
2026 September

Sun Mon Tue Wed Thu Fri Sat
        1   2   3   4   5
6   7   8   9  10  11  12
13 14  15  16  17  18  19
20 21  22  23  24  25  26
27 28  29  30
```

날짜 선택:

```text
2026-09-20

Events
- HMI 개발
- UI 수정

Mood
- 평온 → 답답함 → 만족

Diary
[오늘의 일기]
```

---

# 20. Timeline

사용자의 생활 기록을 시간 순서로 보여준다.

```text
09:20
회사 출근

10:10
HMI 개발 시작

13:40
슬라이더 UI 문제 발생

16:20
문제 해결

19:30
MindCompanion 기획
```

---

# 21. 검색

자연어 검색을 지원한다.

예:

> 9월에 회사에서 해결했던 문제

↓

```text
검색 결과

2026-09-20
HMI 슬라이더 문제 해결

2026-09-15
Machining Condition UI 수정

2026-09-10
HMI DrawText 관련 문제 해결
```

검색은 향후 Embedding + Vector Search를 추가하여 의미 기반 검색으로 확장한다.

---

# 22. Groq API 연동

Groq는 OpenAI-compatible API를 제공한다.

기본 구성:

```text
Base URL

https://api.groq.com/openai/v1
```

예시:

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["GROQ_API_KEY"],
    base_url="https://api.groq.com/openai/v1"
)

response = client.chat.completions.create(
    model="openai/gpt-oss-120b",
    messages=[
        {
            "role": "system",
            "content": SYSTEM_PROMPT
        },
        {
            "role": "user",
            "content": user_message
        }
    ]
)
```

실제 API endpoint도 `/openai/v1/chat/completions`를 사용한다.

---

# 23. Structured Output

이 프로젝트에서는 자유로운 텍스트 응답과 구조화된 데이터 응답을 분리한다.

### 일반 대화

```text
Groq
 ↓
자연어
 ↓
Telegram
```

### 데이터 추출

```text
Groq
 ↓
JSON Schema
 ↓
Supabase
```

예:

```json
{
  "events": [],
  "moods": [],
  "health_entries": [],
  "memory_candidates": []
}
```

GPT-OSS 20B/120B의 Strict Structured Outputs를 활용하면 지정한 JSON Schema에 맞는 결과를 강제할 수 있어 데이터 파이프라인 구현에 적합하다.

---

# 24. 비용 관리

Groq를 사용하되 API 호출을 무제한으로 증가시키지 않는다.

### 1단계

사용자 메시지마다 Groq 호출

```text
메시지 → Groq → 응답
```

### 2단계

구조화 데이터 추출을 배치 처리

```text
메시지 저장
 ↓
밤에 일괄 분석
 ↓
이벤트/감정/건강 추출
```

이를 통해 불필요한 API 호출을 줄인다.

### 권장 구조

```text
실시간

Telegram
 ↓
Groq 120B
 ↓
응답


야간

오늘의 Messages
 ↓
Groq 20B
 ↓
Events / Mood / Health
 ↓
DB

          ↓

Events + Memory + Messages
 ↓
Groq 120B
 ↓
Diary
```

Groq의 현재 Developer plan 기준 GPT-OSS 120B/20B는 각각 250K TPM, 1K RPM의 개발자 플랜 한도를 표시하고 있다. Free 사용 시에는 별도의 더 낮은 rate limit이 적용되므로 초기 개발 단계에서는 실제 계정의 한도를 확인해야 한다.

---

# 25. 개인정보 및 보안

MindCompanion은 개인 생활 기록을 저장하기 때문에 보안을 핵심 요구사항으로 설정한다.

## Telegram

* 허용된 Telegram user ID만 접근
* 다른 사용자의 메시지 처리 금지
* Bot Token 환경변수 관리

## Groq

* API Key 환경변수 관리
* 소스코드에 API Key 저장 금지
* 필요한 Context만 전송
* 불필요한 전체 대화 전달 최소화

## Supabase

* Row Level Security 적용
* 단일 사용자라도 인증 적용
* 직접 DB 접근 제한
* Service Role Key 서버 외부 노출 금지

## OpenClaw

* 최소 권한
* 불필요한 Shell 권한 비활성화
* 검증되지 않은 Third-party Skill 사용 금지

---

# 26. 안전 정책

MindCompanion은 의료·정신건강 전문가를 대체하지 않는다.

특히 다음을 수행하지 않는다.

```text
진단
처방
약물 변경 지시
응급 여부 확정
전문적인 심리 진단
```

위험 상황이 명확하게 표현되는 경우에는 사용자를 실제 전문기관이나 긴급 지원 체계로 연결하는 안전 응답을 사용한다.

또한 민감한 위기 상황의 구체적인 표현을 자동 일기에 불필요하게 재현하지 않는다.

---

# 27. 프로젝트 디렉터리

권장 구조:

```text
mindcompanion/
│
├── apps/
│   ├── bot/
│   │   ├── telegram/
│   │   └── handlers/
│   │
│   └── dashboard/
│       ├── app/
│       ├── components/
│       └── lib/
│
├── services/
│   ├── llm/
│   │   ├── groq.py
│   │   ├── router.py
│   │   └── prompts/
│   │
│   ├── memory/
│   ├── diary/
│   ├── extraction/
│   └── search/
│
├── database/
│   ├── migrations/
│   └── schemas/
│
├── config/
│
├── tests/
│
└── README.md
```

---

# 28. LLM 추상화 계층

Groq에 직접 종속되지 않도록 한다.

```text
LLMService
    │
    ├── GroqProvider
    │
    └── OllamaProvider (선택)
```

예:

```python
class LLMProvider:
    def generate(self, request):
        raise NotImplementedError
```

```python
class GroqProvider(LLMProvider):

    def generate(self, request):
        ...
```

이 구조를 사용하면 향후 Claude, OpenAI 또는 Ollama를 추가할 수 있다.

---

# 29. 개발 단계

## Phase 1 — 기본 환경

* Telegram Bot 생성
* OpenClaw 설치
* Groq API Key 발급
* Supabase 프로젝트 생성
* 기본 DB 생성

## Phase 2 — 대화

* Telegram ↔ OpenClaw 연결
* Groq API 연결
* 대화 저장
* 기본 Prompt 구성

## Phase 3 — Memory

* USER.md / MEMORY.md 구성
* 기억 저장 기준 구현
* memory_mirror 구현
* 과거 기억 Context 주입

## Phase 4 — Data Extraction

* Event extraction
* Mood extraction
* Health extraction
* Structured Output 적용

## Phase 5 — Diary

* Daily Cron
* 하루 기록 조회
* 일기 Context 생성
* GPT-OSS 120B 일기 생성
* Telegram 전달

## Phase 6 — Dashboard

* Next.js
* Calendar
* Timeline
* Diary
* Mood
* Health
* Memory
* Search

## Phase 7 — 안정화

* API 오류 처리
* Rate limit 처리
* 중복 이벤트 제거
* 잘못된 기억 수정
* Backup
* 접근제어
* Prompt 개선

---

# 30. 개발 우선순위

초기부터 모든 기능을 구현하지 않는다.

### 1차 MVP

```text
Telegram
   ↓
OpenClaw
   ↓
Groq
   ↓
Supabase
```

구현 기능:

* 대화
* 메시지 저장
* 기본 Memory
* 이벤트 추출
* 일기 생성

### 2차

```text
Supabase
   ↓
Next.js
```

구현:

* Calendar
* Diary
* Timeline
* Search

### 3차

* Mood 분석
* Health 기록
* Memory 관리 UI
* 주간/월간 회고
* Embedding 검색
* 음성 입력

---

# 31. 최종 목표 아키텍처

```text
                         ┌──────────────┐
                         │   Telegram   │
                         └──────┬───────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │    OpenClaw     │
                       │                 │
                       │ Agent           │
                       │ Memory          │
                       │ Cron            │
                       │ Router          │
                       └───────┬─────────┘
                               │
                 ┌─────────────┼──────────────┐
                 │             │              │
                 ▼             ▼              ▼
           ┌──────────┐  ┌───────────┐  ┌──────────┐
           │ Groq     │  │ Supabase  │  │ Memory   │
           │          │  │           │  │          │
           │ 20B      │  │ Messages  │  │ USER.md  │
           │ 120B     │  │ Events    │  │ MEMORY.md│
           │          │  │ Mood      │  │          │
           └──────────┘  │ Health    │  └──────────┘
                         │ Diary     │
                         └─────┬─────┘
                               │
                               ▼
                       ┌─────────────────┐
                       │ Next.js         │
                       │ Dashboard       │
                       └─────────────────┘
```

---

# 32. 핵심 설계 원칙

MindCompanion은 다음 원칙을 기준으로 개발한다.

1. **Telegram을 기본 사용자 인터페이스로 사용한다.**
2. **Groq API를 메인 LLM으로 사용한다.**
3. **GPT-OSS 120B는 고품질 대화와 일기 생성에 사용한다.**
4. **GPT-OSS 20B는 구조화 데이터 추출과 경량 작업에 사용한다.**
5. **Supabase를 구조화 데이터의 Source of Truth로 사용한다.**
6. **OpenClaw Memory를 AI의 장기 기억 Source of Truth로 사용한다.**
7. **모든 대화를 장기 기억으로 저장하지 않는다.**
8. **일기는 실제 기록에 근거하여 생성한다.**
9. **LLM 결과는 Structured Output을 이용해 데이터 무결성을 확보한다.**
10. **Groq에 대한 의존성을 줄이기 위해 LLM Provider abstraction을 적용한다.**
11. **개인정보는 필요한 범위에서만 LLM API에 전달한다.**
12. **MVP는 단일 사용자 기준으로 최대한 단순하게 구현한다.**

---

# 33. MVP 완료 기준

다음 조건을 만족하면 1차 버전 완료로 정의한다.

* [ ] Telegram에서 AI와 대화 가능
* [ ] Groq API 정상 연동
* [ ] 대화 내용 Supabase 저장
* [ ] 이벤트 자동 추출
* [ ] 감정 데이터 자동 추출
* [ ] 장기 기억 저장
* [ ] 과거 기억을 활용한 답변 가능
* [ ] 매일 밤 자동 일기 생성
* [ ] Telegram으로 일기 전달
* [ ] Web에서 일기 조회
* [ ] 날짜별 Timeline 조회
* [ ] 자연어 검색
* [ ] Telegram 접근 제한
* [ ] Supabase RLS 적용
* [ ] API Key 외부 노출 방지
* [ ] 데이터 백업 기능

---

# 34. 최종 서비스 형태

최종적으로 사용자는 별도의 기록 앱을 의식하지 않고 다음과 같이 사용한다.

```text
사용자
│
├─ Telegram으로 AI와 대화
│
├─ AI가 중요한 내용을 기억
│
├─ 하루 동안의 사건/감정/건강 정보 축적
│
└─ 밤 23:30
       │
       ▼
   자동 분석
       │
       ▼
   오늘의 일기 생성
       │
       ▼
   Telegram 알림
       │
       ▼
   Web Dashboard에서
   과거 기록/일기/감정/건강 확인
```

즉, **사용자가 기록을 남기기 위해 별도의 앱을 사용하는 것이 아니라 평소 AI와 대화하는 과정 자체가 기록이 되는 구조**를 최종 목표로 한다.
