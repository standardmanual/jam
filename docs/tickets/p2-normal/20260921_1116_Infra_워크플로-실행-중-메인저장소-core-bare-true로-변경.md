---
id: 20260921_1116
category: Infra
priority: P2
status: OPEN
created: 2026-09-21
---

# [Infra] 워크플로 실행 중 메인 저장소의 `core.bare`가 `true`로 바뀌어 git이 작업 트리로 인식하지 못했다

## 핵심 요약

- 현상: jam-work 워크플로(아현 구현 → 민지 리뷰)를 돌린 직후 메인 체크아웃에서 `git status`·`git add`가 `fatal: this operation must be run in a work tree`로 실패했다. `git worktree list`가 메인 체크아웃을 `(bare)`로 표시했다.
- 확인한 사실: `.git/config`의 `core.bare`가 `true`였고, 이 파일의 수정 시각은 11:14:42 KST로 워크플로 실행 시간대(약 11:10~11:14)와 겹친다. `git config core.bare false` 한 줄로 복구됐고, 이후 `git status`가 정상이며 작업 트리 파일은 그대로였다.
- **원인은 확인하지 못했다.** `core.bare`를 누가 바꿨는지 알 수 없다. 워크트리를 만들거나 지우는 git 조작, 아현의 실행 명령, 병렬로 열린 다른 세션 등이 후보이지만 어느 것도 확인하지 않았다.
- 관련 파일: `.git/config`, `.claude/workflows/jam-work.js`, `.claude/agents/jam-developer.md`(아현의 워크트리 절차)

## 배경 / 문제 정의

메인 체크아웃이 bare로 인식되면 카리나의 커밋·push가 모두 막히고, 병렬 세션도 같은 영향을 받는다. 이번에는 실패 메시지로 바로 드러나 즉시 복구했지만, 값이 조용히 바뀌는 경로가 있다면 재발할 수 있다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 워크플로가 돌 때 `core.bare`를 바꾸는 명령이 있는지 확인한다(`jam-work.js`, 아현·민지 정의, `scripts/workspace-setup.sh`, 훅). 이번 시간대의 워크트리 생성·삭제 흐름을 재현해 본다.
- 원인을 찾으면 그 경로를 막는다. 찾지 못하면 `scripts/ensure-hooks-path.sh`처럼 세션 시작 때 `core.bare`가 `true`이면 알리거나 되돌리는 보장 장치를 둘지 판단한다.
- 새 환경 주장이 생기면 `docs/agents/contract.json`에 검사 줄을 함께 추가한다(CLAUDE.md 규칙 5).

## 완료 조건

- 원인이 확인돼 재현 경로가 막혀 있거나, 확인되지 않았더라도 재발 시 자동으로 드러나거나 복구되는 장치가 있다.

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
- 환경:
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
