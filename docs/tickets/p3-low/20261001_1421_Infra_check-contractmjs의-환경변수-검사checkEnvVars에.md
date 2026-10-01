---
id: "20261001_1421"
category: Infra
priority: P3
status: OPEN
created: 2026-10-01
closed:
---

# [Infra] check-contract.mjs의 환경변수 검사(checkEnvVars)에 단위 테스트를 더한다

> `/jam-ship` 2026-10-01 병렬 점검(민지 모드 ③) 범위 밖 발견물. 점검 범위 `efd7be8d..946ebad7`(origin/main → origin/staging).

## 핵심 요약

- 요구사항: 새 `checkEnvVars`(+30줄)는 단위 테스트가 없다. 위반 경로(이름 누락, 파일 없음, 형식 오류)는 `verify.sh` 실행에서만 간접 확인된다. 기존 검사 함수도 같은 상태다. [구조/참고]
- 구현 계획: `scripts/*.test.mjs` 방식으로 세 위반 경로를 고정한다.
- 관련 파일: `scripts/check-contract.mjs:608`

## 완료 조건

- 세 위반 경로가 테스트로 고정된다.
