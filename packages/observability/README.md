# Observability

원문과 비밀정보를 기록하지 않는 구조화 로그, request ID, run ID, metric helper를 둡니다.

## JSON logger

`src/json-logger.js`는 한 줄 JSON 로그를 생성합니다.

- 공통 필드: `timestamp`, `level`, `service`, `event`
- 로그 레벨: `debug`, `info`, `warn`, `error`
- `token`, `secret`, `authorization`, `apiKey`, `serviceRole`, `content`, `text` 필드 자동 마스킹
- 1,000자를 넘는 문자열과 깊이 5를 넘는 객체 제한

사용자 원문이나 API 자격증명을 이벤트 이름 또는 임의 문자열 필드에 넣지 않습니다.
