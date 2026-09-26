---
id: "20260922_1401"
category: Infra
priority: P3
status: CLOSED
created: 2026-09-22
parent: "20260921_2311"
---

# [Infra] `checkWorkflowFreeze`가 훅 파일의 문자열 존재만 대조하는 한계 — 실동작 검증을 추가한다

## 핵심 요약

- 요구사항: `scripts/check-contract.mjs`의 `checkWorkflowFreeze`는 `.githooks/pre-commit` 텍스트에 `frozen_prefix`·`exempt_file` 문자열이 있는지만 본다. ⑨ 블록을 주석 처리하거나 case 분기만 무력화하면서 문자열을 남겨 두면 잡지 못한다. 또 `checkWorkflowFreeze` 자체를 격리해 검증하는 유닛 테스트가 없어 `contract.json`의 `workflow_freeze` 절이 오탈자로 깨지는 경우를 `verify.sh` 1회 실행에만 의존한다.
- 구현 계획: (a) `scripts/doc-check-hook.test.mjs`의 임시 저장소 시나리오에 "⑨ 블록을 주석 처리한 훅"을 만들어 차단이 풀리는지 확인하고, `check-contract`가 그 상태를 위반으로 잡도록 대조 방식을 문자열 존재에서 "실제 커밋 시도 결과"로 바꿀 수 있는지 판단한다. (b) `workflow_freeze` 절의 필수 키 누락·오탈자를 잡는 테스트 1건을 추가한다. `routine_commit_restriction`도 같은 패턴이므로 같은 방식으로 다룰 수 있으면 함께 적는다.
- 관련 파일: `scripts/check-contract.mjs`(`checkWorkflowFreeze`), `docs/agents/contract.json`(`workflow_freeze`), `scripts/doc-check-hook.test.mjs`
- 상위 티켓: 20260921_2311(민지 게이트의 범위 밖 발견물 2건을 한 티켓으로 묶음 — 같은 테스트로 해소된다). 경로: ③ 표준(infra) 또는 ① 경미

## 배경 / 문제 정의

민지 2차 발견물: 동결 규칙의 존재를 `check-contract`가 대조하지만, 실제 동작이 아니라 문자열만 본다. 기존 `checkMirrorDocs`·`routine_commit_restriction`과 같은 성격이라 이번 변경이 기준을 낮춘 것은 아니지만, 구조적 한계는 남는다.

## 상세 요구사항

### 서비스/코드베이스 관점

- 훅 블록이 무력화된 상태를 `check-contract` 또는 훅 테스트 중 하나가 잡는다.
- `workflow_freeze` 절 키 오탈자를 테스트가 잡는다.

## 구현 계획

1. 훅 테스트에 무력화 시나리오 추가.
2. `check-contract` 대조 방식 보강 여부 판단·구현.
3. 계약 절 오탈자 테스트 추가.

## 완료 조건

- ⑨ 블록을 주석 처리한 훅으로 폴더 안 파일을 커밋하면 테스트 또는 `check-contract`가 실패한다.
- `workflow_freeze` 절에서 `frozen_prefix` 키를 빼면 테스트가 실패한다.
- `scripts/verify.sh` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 묶음 티켓 20260926_1440으로 처리했다. 상세와 실행 지표는 그 티켓의 완료 기록에 있다.
- `scripts/check-contract.mjs`의 `checkWorkflowFreeze`가 문자열 대조 뒤 `probeWorkflowFreeze`를 호출한다. 임시 저장소에 훅을 복사해 동결 폴더 파일 커밋이 실제로 막히는지, 예외 파일(`README.md`)이 통과하는지를 실제 `git commit`으로 확인한다. `GIT_*` 환경변수는 버려 실제 저장소 설정을 건드리지 않고, 임시 저장소에는 `scripts/`가 없어 재귀하지 않는다. 임시 저장소를 만들지 못하면 위반이 아니라 참고로만 남긴다. 실제 저장소에서 검사 시간은 약 0.3~0.7초다.

### 변경된 파일
```
- scripts/check-contract.mjs
- scripts/doc-check-hook.test.mjs
```

### 테스트 결과
- [x] ⑨ 블록을 주석 처리한 훅이 동결 폴더 파일을 통과시키는 것을 재현하고, `check-contract`가 그 훅을 `[workflow_freeze]` 위반으로 잡는다. 온전한 훅은 통과, `frozen_prefix`·`exempt_file` 키가 없으면 위반. 임시 저장소 테스트 24건과 `check-contract` 전체 통과, CI 성공

### 잔여 이슈
- 티켓이 "가능하면 함께"로 적은 선택 항목인 `routine_commit_restriction`(예약 루틴 커밋 제한)의 실동작 검증은 하지 않았다. 필요해지면 같은 방식(임시 저장소 실제 커밋)으로 추가한다.
