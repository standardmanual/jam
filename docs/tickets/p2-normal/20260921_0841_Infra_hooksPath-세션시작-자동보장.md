---
id: "20260921_0841"
category: Infra
priority: P2
status: OPEN
created: 2026-09-21
---

# [Infra] core.hooksPath를 세션 시작 때 자동으로 맞추고 계약 검사에 넣는다

## 핵심 요약

- 요구사항: 새 클론이나 옛 설정(절대경로)이 남은 PC에서도 Claude Code 세션이 시작되면 `core.hooksPath`가 `.githooks`로 자동 설정되게 하고, 이 값이 어긋나면 `scripts/verify.sh`의 계약 검사가 잡게 한다.
- 구현 계획: 세션 시작 스크립트 `scripts/ensure-hooks-path.sh`를 신설해 `.claude/settings.json`의 `SessionStart`에 연결하고, `docs/agents/contract.json`에 `git_config` 절을 추가해 `scripts/check-contract.mjs`가 실제 값과 대조한다. 생성기와 안내 문서는 함께 갱신한다.
- 관련 파일: `scripts/ensure-hooks-path.sh`(신규), `.claude/settings.json`(`hooks.SessionStart`), `docs/agents/contract.json`(`paths_exist`·`hooks`·`git_config` 신설), `scripts/check-contract.mjs`(`checkGitConfig` 신설, 실행부 호출 추가), `scripts/gen-team-doc.mjs`(`genSessionHooks`의 `explain` 표), `docs/agents/team-operations.md`(생성 구간 재생성), `CLAUDE.md`(규칙 4), `docs/agents/orchestrator.md`(§5)
- 선행·관련 티켓: 20260816_005(자동화 가능성만 적고 미구현), 20260919_1245(워크트리가 메인 체크아웃의 훅을 실행하던 문제), 20260920_1907(문서·실제 정합성 기계 검사)
- 경로: ③ 표준 (infra 유형이라 채원 없이 아현 → 민지)

## 배경 / 문제 정의

`core.hooksPath`는 `.git/config`에만 저장되어 git으로 동기화되지 않으므로, 클론한 PC마다 사람이 한 번씩 설정해야 한다. 지금은 이 절차가 `CLAUDE.md` 규칙 4와 `docs/agents/orchestrator.md` §5에 문장으로만 적혀 있다. 빠뜨리면 `pre-commit`과 `pre-push`가 조용히 동작하지 않는다.

2026-09-21 점검에서 확인한 사실은 다음과 같다.

- 이 PC의 값이 절대경로(`/Volumes/뚝섬하드/시현/JAM!/.githooks`)였다. 상대경로 `.githooks`로 바꾼 뒤, 임시 워크트리에서 훅 경로가 그 워크트리 자신의 `.githooks`로 해석되는 것을 실측했다. 절대경로일 때는 어느 워크트리에서 커밋하든 메인 체크아웃의 훅이 실행되어, 훅 스크립트를 고치는 작업이 자기 커밋에는 적용되지 않았다(티켓 20260919_1245 기록).
- 티켓 20260816_005가 "SessionStart 훅으로 자동화 가능"이라고 적었으나 구현되지 않았다.
- `docs/agents/contract.json`에는 `core.hooksPath` 값을 검사하는 줄이 없다.
- `.githooks/pre-commit`은 `check-contract.mjs`를 호출하지만, 훅 경로가 비어 있으면 `pre-commit` 자체가 돌지 않는다. 따라서 "값이 비어 있는" 상태는 커밋 훅이 아니라 세션 시작 스크립트와 `verify.sh`가 잡아야 한다.

## 상세 요구사항

### 서비스/코드베이스 관점

**① `scripts/ensure-hooks-path.sh` 신설 (bash, 멱등)**

- 저장소 루트는 `workspace-setup.sh`와 같은 방식(`git rev-parse --show-toplevel`)으로 구한다.
- 루트에 `.githooks/` 폴더가 없으면 아무것도 바꾸지 않고 종료한다(옛 브랜치 등).
- `git config --get core.hooksPath`의 값이 `.githooks`이면 **아무것도 출력하지 않고** 종료한다. 정상 상태의 세션 시작 출력에 잡음이 생기지 않아야 한다.
- 값이 다르면(비어 있음·절대경로·다른 값) `git config core.hooksPath .githooks`로 맞추고 한 줄만 출력한다. 예: `훅 경로를 .githooks로 맞췄습니다 (이전 값: 없음)`.
- 맞춘 뒤에도 실효값이 다르면(다른 범위의 설정이 덮어쓰는 경우) `git config --show-origin --get-all core.hooksPath` 결과를 붙여 알린다.
- 종료 코드는 항상 0이다. 세션 시작을 막지 않는다.
- 출력은 한국어이고, 파일을 만들거나 고치지 않으며, 저장소 로컬 설정 한 키만 바꾼다.

**② `.claude/settings.json`**

- `hooks.SessionStart`의 기존 세 명령 뒤에 `bash "$CLAUDE_PROJECT_DIR/scripts/ensure-hooks-path.sh" || true`를 추가한다. 기존 항목은 건드리지 않는다.

**③ `docs/agents/contract.json`**

- `paths_exist.paths`에 `scripts/ensure-hooks-path.sh`를 추가한다.
- `hooks.SessionStart`에 `scripts/ensure-hooks-path.sh`를 추가한다.
- 새 절 `git_config`를 만든다. `_why`에는 절대경로일 때 워크트리가 메인 체크아웃의 훅을 실행한다는 이유를 적고, `values`에 `"core.hooksPath": ".githooks"`를 둔다.

**④ `scripts/check-contract.mjs`에 `checkGitConfig(c)` 추가 (⑩번 검사)**

- `c.git_config.values`의 각 키를 `git config --get`으로 읽어 선언값과 비교한다(`cwd`는 `REPO`, 종료 코드 1은 "설정 없음"으로 취급).
- 어긋나면 `violate('git_config', ...)`로 보고한다. 값이 비어 있을 때와 다른 값일 때 문구를 나눈다.
  - 비어 있음: 이 클론에서는 `pre-commit`·`pre-push`가 돌지 않는다.
  - 다른 값: 절대경로라면 워크트리가 메인 체크아웃의 훅을 실행한다.
  - 고치는 방법: `git config core.hooksPath .githooks`를 직접 실행하거나 다음 Claude Code 세션 시작 때 자동으로 맞춰진다.
- 파일 상단 주석의 검사 목록이 있으면 함께 갱신한다.

**⑤ `scripts/gen-team-doc.mjs`와 `docs/agents/team-operations.md`**

- `genSessionHooks`의 `explain` 표에 `'ensure-hooks-path': '이 클론의 core.hooksPath가 .githooks가 아니면 맞춘다'`를 추가한다.
- `team-operations.md`의 생성 구간(`<!-- BEGIN generated: session-hooks -->`)은 **손으로 고치지 않고** `node scripts/gen-team-doc.mjs`로 다시 생성한다(CLAUDE.md 규칙 5).

**⑥ 안내 문서**

- `CLAUDE.md` 규칙 4의 "새로 클론한 환경에서는 최초 1회 `git config core.hooksPath .githooks`를 실행해야 한다"를 새 사실로 바꾼다. Claude Code 세션이 시작될 때 `scripts/ensure-hooks-path.sh`가 자동으로 맞추며, Claude Code를 거치지 않고 터미널에서 먼저 커밋하는 새 클론에서만 손으로 실행해야 한다고 적는다. 이 한계를 숨기지 않는다.
- `docs/agents/orchestrator.md` §5의 같은 문장은 **중복이므로**(CLAUDE.md 규칙 5) 규칙 4를 가리키는 한 줄로 줄인다. 단일 원천은 `CLAUDE.md`다.
- `.claude/skills/jam-sync/SKILL.md`의 B.3 확인 단계는 그대로 둔다. 수동 동기화 흐름의 점검으로 여전히 유효하다.

## 구현 계획

1. `ensure-hooks-path.sh`를 작성하고, 임시 저장소에서 세 상태(비어 있음·절대경로·이미 정상)와 `.githooks/` 부재 상태를 실행해 본다. **이 저장소의 실제 `.git/config`는 검증 중에 바꾸지 않는다.**
2. `settings.json`과 `contract.json`을 고친다.
3. `check-contract.mjs`에 검사를 추가하고, 환경변수 주입(`GIT_CONFIG_COUNT`·`GIT_CONFIG_KEY_0`·`GIT_CONFIG_VALUE_0`)으로 실제 설정을 건드리지 않고 통과·실패 양쪽을 확인한다.
4. 생성기를 고치고 `node scripts/gen-team-doc.mjs`를 실행한다.
5. `CLAUDE.md`와 `orchestrator.md`를 고친다.
6. `scripts/verify.sh`를 실행한다.

## 완료 조건

- 임시 저장소에서 `core.hooksPath`가 비어 있거나 절대경로일 때 `bash scripts/ensure-hooks-path.sh`를 실행하면 한 줄을 출력하고 값이 `.githooks`가 된다. 이어서 다시 실행하면 출력이 없고 종료 코드는 0이다.
- `.githooks/`가 없는 임시 저장소에서는 설정을 바꾸지 않고 종료 코드 0으로 끝난다.
- `node scripts/check-contract.mjs`는 값이 `.githooks`일 때 통과한다. 환경변수로 값을 비우거나 절대경로로 주입하면 실패하고, 각각 다른 안내 문구와 고치는 명령을 출력한다. 재현 경로: `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/tmp/x node scripts/check-contract.mjs`
- `CLAUDE_PROJECT_DIR`를 이 저장소로 지정해 `settings.json`의 새 명령 문자열을 그대로 실행하면, 정상 상태에서 출력이 없고 종료 코드 0이다.
- `.claude/settings.json`이 유효한 JSON이고, `node scripts/gen-team-doc.mjs --check`와 `scripts/verify.sh`가 통과한다.
- `team-operations.md`의 세션 훅 표에 새 스크립트가 "설명 미등록" 없이 나타난다.
- `CLAUDE.md`와 `orchestrator.md`에 "최초 1회 수동 실행이 필요하다"는 옛 서술이 남아 있지 않고, 한계(Claude Code를 거치지 않는 새 클론)가 `CLAUDE.md` 한 곳에만 적혀 있다.
- 실제 새 세션에서의 자동 실행 확인은 카리나가 다음 세션 시작 때 하고 완료 기록에 남긴다.

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
- 별도 스크립트로 분리한 이유: `contract.json`의 `hooks.SessionStart`는 명령 문자열에 스크립트 경로가 들어 있는지로 검사한다. `workspace-setup.sh`의 하위 명령으로 넣으면 기존 항목과 구분되지 않아 새 훅의 존재를 따로 못 박을 수 없다.
- 선택하지 않은 대안: `.githooks`를 `core.hooksPath` 없이 쓰는 방법(`.git/hooks` 심볼릭 링크)은 링크가 클론마다 다시 필요해 같은 문제를 옮길 뿐이라 채택하지 않았다.

### 잔여 이슈
- Claude Code를 거치지 않고 터미널에서 먼저 커밋하는 새 클론은 여전히 첫 커밋에 훅이 돌지 않는다. 훅 기반 자동화로는 풀 수 없는 한계다.
