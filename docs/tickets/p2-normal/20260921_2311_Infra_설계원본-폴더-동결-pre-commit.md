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
- 관련 파일: `.githooks/pre-commit`, `docs/agents/workflow/README.md`, `docs/agents/contract.json`, `docs/agents/team-operations.md` §10(함께 읽을 문서), `scripts/doc-check-hook.test.mjs`(훅 테스트 추가). **A안 결정(아래)으로 추가**: `scripts/check-contract.mjs`(⑭ `checkMirrorDocs` 제거), `scripts/mirror-docs-hook.test.mjs`(삭제), `.claude/skills/jam-work/references/stop-conditions.md`(「참조하는 곳」에서 미러 문서 항목 제거)
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

### 미러 유지 장치 제거 (2026-09-22 사용자 결정, A안)

- 티켓 20260922_1030이 넣은 `mirror_docs` 검사는 `.claude/agents/*.md`를 고칠 때 `docs/agents/workflow/agents/*.md`(미러 9개)도 함께 고치라고 요구한다. 이 티켓의 동결과 양립할 수 없으므로 **동결을 택하고 미러 유지 장치를 걷어낸다**. 근거는 `CLAUDE.md` 규칙 5(중복은 드리프트의 필요조건) — 실행되는 쪽(`.claude/agents/`)만 남긴다.
- 제거 대상: `docs/agents/contract.json`의 `mirror_docs` 절, `scripts/check-contract.mjs`의 ⑭ `checkMirrorDocs`(와 그 호출·`warnings` 처리 중 mirror 전용 부분), `scripts/mirror-docs-hook.test.mjs`(파일 삭제). `contract.json`에 `mirror_docs`를 전제로 한 다른 검사 줄이 있으면 함께 정리한다.
- `stop-conditions.md` 「참조하는 곳」 목록에서 `docs/agents/workflow/agents/01_아현_개발.md` 항목을 뺀다(동결된 기록이므로 더 이상 동기화 대상이 아니다).
- 미러 문서 9개는 지우지 않고 기록으로 남긴다. README 배너가 "`agents/` 하위는 2026-09-22 동결 시점의 요약이며 현재 정의는 `.claude/agents/`"라고 밝힌다.
- 훅 동작 시점 주의: `core.hooksPath`가 메인 트리의 `.githooks`를 절대경로로 가리키므로, 리뷰 브랜치 안에서 고친 훅은 staging 머지 뒤부터 적용된다. 아현의 커밋 순서는 자유다.

## 후속 범위 (이 티켓의 구현 범위 밖, 담당자·시점 명시)

- 티켓 20260922_1235(경고→차단 전환)·20260922_1236(경로 존재 검증)·20260922_1326(카즈하 미러 동기화)을 "동결로 불필요" 사유로 CLOSED 처리: **카리나**, 이 티켓 머지 뒤.

## 완료 조건

- 임시 저장소 훅 테스트: 폴더 안 파일 수정·추가가 차단되고, README.md 수정과 폴더 밖 파일은 통과한다.
- README에 배너가 있고 현재 규칙 위치 세 곳이 링크로 연결되어 있다(`doc-check` 통과).
- `contract.json`에 검사 선언이 있고 `check-contract` 통과. `scripts/verify.sh` 통과.
- `mirror_docs`가 `contract.json`·`check-contract.mjs`·`scripts/`에서 검색되지 않고, `.claude/agents/` 파일만 고친 커밋이 미러 경고 없이 통과한다.

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
