---
id: "20260921_2311"
category: Infra
priority: P2
status: OPEN
created: 2026-09-21
parent: "20260921_2207"
---

# [Infra] 설계 원본 폴더 동결 — `docs/agents/workflow/`는 기록으로 잠그고 현재 규칙은 한 곳에서만 고친다

## 핵심 요약

- 요구사항: `docs/agents/workflow/`(구상·결정 기록, 한국어 설계 원본)와 `.claude/agents/`(영어 정의)가 서로 다른 날짜에 따로 수정되고 있다(2207 §2.1: 설계 09-19~20, 정의 09-18~21). README는 이 폴더를 "기록"이라 적었다. `jam-doc/archive/`처럼 pre-commit이 이 폴더의 추가·수정을 차단하고(README.md는 예외), 폴더 상단 배너로 "현재 규칙은 `team-operations.md`·`.claude/agents/`·`/jam-work` SKILL.md"임을 밝힌다.
- 구현 계획: `.githooks/pre-commit`의 ④(archive 읽기 전용) 검사 옆에 ⑨ 항목 추가, 각 파일 상단이 아니라 README 한 곳에 배너, `contract.json` `paths_exist`·검사 선언, `08_인수인계.md`의 "새 세션에서 이 문서부터 읽는다" 문장은 `orchestrator.md`(카리나 카드)로 대체되었음을 README에 적는다.
- 관련 파일: `.githooks/pre-commit`, `docs/agents/workflow/README.md`, `docs/agents/contract.json`, `docs/agents/team-operations.md` §10(함께 읽을 문서), `scripts/doc-check-hook.test.mjs`(훅 테스트 추가)
- 상위 티켓: 20260921_2207(#7). 경로: ③ 표준(infra)

## 배경 / 문제 정의

CLAUDE.md 규칙 5는 "같은 사실을 여러 문서에 적지 않는다. 중복은 드리프트의 필요조건"이라고 정한다. 설계 원본과 정의는 같은 역할(에이전트가 무엇을 하는가)을 두 언어로 적은 중복이고, 실제로 계속 갈라지고 있다. 정의(`.claude/agents/`)가 실행되는 쪽이므로 그쪽만 고치고, 설계 원본은 "왜 이렇게 만들었나"의 기록으로 잠근다.

## 상세 요구사항

### 서비스/코드베이스 관점

- 차단 범위: `docs/agents/workflow/**` 신규 파일·수정·이름 변경. 예외: `docs/agents/workflow/README.md`. 삭제는 허용하지 않는다(기록).
- 우회: 기존 `JAM_SKIP_DOCLINT=1`과 같은 방식으로만, 사유를 커밋 메시지에 남긴다.
- 배너(README): 기록 전용 선언, 현재 규칙의 위치 세 곳, 동결 날짜, 이 티켓 번호.
- 이 티켓 작업 자체는 README 수정만 하므로 훅에 걸리지 않게 순서를 정한다(README 먼저, 훅은 마지막 커밋).
- `docs/specs/INDEX.md`나 `doc-check` 링크 검사가 이 폴더를 참조하면 그대로 통과해야 한다(읽기는 자유).

## 완료 조건

- 임시 저장소 훅 테스트: 폴더 안 파일 수정·추가가 차단되고, README.md 수정과 폴더 밖 파일은 통과한다.
- README에 배너가 있고 현재 규칙 위치 세 곳이 링크로 연결되어 있다(`doc-check` 통과).
- `contract.json`에 검사 선언이 있고 `check-contract` 통과. `scripts/verify.sh` 통과.

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

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
