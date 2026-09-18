---
id: 20260918_0927
category: Infra
priority: P3
status: CLOSED
created: 2026-09-18
closed: 2026-09-18
---

# [Infra] jam-work.js에 args 방어적 파싱 추가

## 배경 / 문제 정의
티켓 20260918_0423 작업 중 `Workflow` 도구 호출이 3회 연속 실패했다(`args`의 모든 필드가
`undefined`로 스크립트에 전달됨). 원인을 조사한 결과, 호출부(오케스트레이터)가 넘긴
`userRequest` 텍스트 안에 잘못된 유니코드 이스케이프 오타(`\uc”_ ` — "씬"을 잘못 이스케이프)가
섞여 있었고, 이 때문에 상위 파서가 `args`를 정상 객체로 파싱하지 못하고 조용히 원본 문자열
그대로 스크립트에 넘겼다. 스크립트가 `const {...} = args`로 문자열을 구조분해하면 에러 없이
모든 필드가 `undefined`가 되어, 근본 원인(오타)을 알아내는 데 상당한 시간이 걸렸다.

## 상세 요구사항
`.claude/workflows/jam-work.js`의 args 수신부에 `typeof args === 'string' ? JSON.parse(args) : args`
방어 코드를 추가한다. 이러면 같은 상황이 재발해도 "조용한 undefined" 대신 명확한
`SyntaxError`로 즉시 드러난다.

## 완료 기록

### 구현 내용 요약
- `.claude/workflows/jam-work.js`의 args 구조분해 앞에 방어적 파싱 한 줄 추가
- `node --check`로 문법 검증, 짧은/긴/특수문자 포함 args로 3회 시험 실행해 정상 케이스는
  그대로 통과하고(object 그대로 사용), 오타 있는 케이스는 명확한 SyntaxError로 실패함을 확인

### 변경된 파일
```
.claude/workflows/jam-work.js
```

### 테스트 결과
- [x] node --check 통과
- [x] 정상 args(특수문자 포함) → 정상 파싱, 필드 전달 확인
- [x] 오타 있는 args(재현) → 명확한 SyntaxError로 실패 확인 (이전엔 조용히 undefined였음)

### 주요 의사결정 / 핵심 메모
근본 원인은 도구 버그가 아니라 오케스트레이터의 입력 오타였다. 다만 실패 시 "조용한
undefined"보다 "명확한 에러"가 디버깅에 유리하므로 방어 코드는 그대로 유지한다.
