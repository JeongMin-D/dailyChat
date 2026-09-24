# Nightly Worker

04:05 KST에 전날 local day를 확정하고 구조화 추출, 근거 검증, 일기 생성, 알림 outbox 등록을 수행합니다.

작업은 `day + pipeline_version + input_hash`로 멱등 처리합니다.
