---
id: "20260922_1401"
category: Infra
priority: P3
status: OPEN
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

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### 배포 정보
- 배포일: 
- 환경: staging (빌드 없음)
- 커밋: 

### 실행 지표
| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
