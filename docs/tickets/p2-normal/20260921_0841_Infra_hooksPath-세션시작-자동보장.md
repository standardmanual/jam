---
id: "20260921_0841"
category: Infra
priority: P2
status: CLOSED
created: 2026-09-21
closed: 2026-09-21
---

# [Infra] core.hooksPath를 세션 시작 때 자동으로 맞추고 계약 검사에 넣는다

## 핵심 요약

- 요구사항: 새 클론이나 잘못된 설정이 남은 PC에서도 Claude Code 세션이 시작되면 `core.hooksPath`가 `.githooks`로 자동 설정되게 하고, 값이 비어 있거나 이 저장소의 `.githooks`가 아닌 곳을 가리키면 `scripts/verify.sh`의 계약 검사가 잡게 한다. 절대경로여도 이 저장소의 `.githooks`를 가리키면 정상으로 본다(2026-09-21 재작업, 아래 배경 참조).
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

**재작업 사유 (첫 구현이 게이트를 통과한 뒤 발견).** 위 점검에서 값을 상대경로로 바꾼 뒤 워크플로가 격리 워크트리를 만들자, 메인 저장소의 `.git/config` 값이 다시 절대경로(`<메인 체크아웃>/.githooks`)로 돌아와 있었다. 실행 중인 하네스(Claude Code 2.1.275)에 워크트리를 만들 때 `core.hooksPath`를 설정하는 코드가 있고 과거 티켓 20260827_022·20260918_0423도 같은 값을 기록했지만, 하네스가 원인이라는 점은 아직 직접 재현으로 확정하지 않았다. 어느 쪽이든 첫 구현은 값이 정확히 `.githooks`일 때만 정상으로 보기 때문에, 워크플로가 한 번 돌 때마다 메인 체크아웃의 커밋이 `pre-commit` 계약 검사에 막힌다(아현이 `JAM_SKIP_DOCLINT=1`·`JAM_SKIP_VERIFY=1` 예외를 쓴 이유). 이 절대경로는 이 저장소의 `.githooks`를 가리키므로 훅은 정상 실행된다. 문제인 것은 비어 있거나, 다른 곳을 가리키거나, 폴더를 옮겨 사라진 경로다.

## 상세 요구사항

### 서비스/코드베이스 관점

**① `scripts/ensure-hooks-path.sh` 신설 (bash, 멱등)**

- 저장소 루트는 `workspace-setup.sh`와 같은 방식(`git rev-parse --show-toplevel`)으로 구한다.
- 루트에 `.githooks/` 폴더가 없으면 아무것도 바꾸지 않고 종료한다(옛 브랜치 등).
- **정상 판정**: `git config --get core.hooksPath`의 값이 비어 있지 않고, 그 경로가 실제로 존재하는 디렉터리이며 `realpath`가 **현재 워크트리 루트의 `.githooks`** 또는 **메인 체크아웃 루트의 `.githooks`**와 같으면 정상이다. 상대경로는 현재 워크트리 루트 기준으로 해석하고 절대경로는 그대로 쓴다. 메인 체크아웃 루트는 `git rev-parse --git-common-dir`의 상위 폴더다. 이 판정은 `check-contract.mjs`와 같은 규칙이어야 한다.
- 정상이면(값이 `.githooks`든, 이 저장소의 `.githooks`를 가리키는 절대경로든) **아무것도 출력하지 않고** 종료한다. 정상 상태의 세션 시작 출력에 잡음이 생기지 않아야 한다.
- 정상이 아니면(비어 있음·다른 곳을 가리킴·사라진 경로) `git config core.hooksPath .githooks`로 맞추고 한 줄만 출력한다. 예: `훅 경로를 .githooks로 맞췄습니다 (이전 값: 없음)`.
- 맞춘 뒤에도 실효값이 다르면(다른 범위의 설정이 덮어쓰는 경우) `git config --show-origin --get-all core.hooksPath` 결과를 붙여 알린다.
- 종료 코드는 항상 0이다. 세션 시작을 막지 않는다.
- 출력은 한국어이고, 파일을 만들거나 고치지 않으며, 저장소 로컬 설정 한 키만 바꾼다.

**② `.claude/settings.json`**

- `hooks.SessionStart`의 기존 세 명령 뒤에 `bash "$CLAUDE_PROJECT_DIR/scripts/ensure-hooks-path.sh" || true`를 추가한다. 기존 항목은 건드리지 않는다.

**③ `docs/agents/contract.json`**

- `paths_exist.paths`에 `scripts/ensure-hooks-path.sh`를 추가한다.
- `hooks.SessionStart`에 `scripts/ensure-hooks-path.sh`를 추가한다.
- 새 절 `git_config`를 만든다. `_why`에는 "값이 비면 훅이 돌지 않고, 이 저장소의 `.githooks`가 아닌 곳을 가리키면 엉뚱한 훅이 돈다. 절대경로여도 이 저장소의 `.githooks`를 가리키면 정상이다"는 취지를 적고(원인 추정은 적지 않는다), `values`에 `"core.hooksPath": ".githooks"`를 둔다.

**④ `scripts/check-contract.mjs`에 `checkGitConfig(c)` 추가 (⑩번 검사)**

- `c.git_config.values`의 각 키를 `git config --get`으로 읽는다(`cwd`는 `REPO`, 종료 코드 1은 "설정 없음"으로 취급). `core.hooksPath`처럼 값이 경로인 키는 문자열이 아니라 위 ①의 **정상 판정**(선언 경로 `.githooks`로 해석되는가)으로 비교한다. 정상이면 통과하고 아무것도 출력하지 않는다.
- 정상이 아니면 `violate('git_config', ...)`로 보고한다. 문구를 셋으로 나눈다.
  - 비어 있음: 이 클론에서는 `pre-commit`·`pre-push`가 돌지 않는다.
  - 절대경로인데 이 저장소의 `.githooks`가 아님: 다른 곳(또는 옮기기 전 옛 위치)의 훅이 실행되고 있고 이 저장소의 훅은 돌지 않는다.
  - 그 밖의 다른 값: 선언과 다르다.
  - 고치는 방법(공통): `git config core.hooksPath .githooks`를 직접 실행하거나 다음 Claude Code 세션 시작 때 자동으로 맞춰진다.
- 파일 상단 주석의 검사 목록이 있으면 함께 갱신한다.

**⑤ `scripts/gen-team-doc.mjs`와 `docs/agents/team-operations.md`**

- `genSessionHooks`의 `explain` 표에 `'ensure-hooks-path': '이 클론의 core.hooksPath가 .githooks가 아니면 맞춘다'`를 추가한다.
- `team-operations.md`의 생성 구간(`<!-- BEGIN generated: session-hooks -->`)은 **손으로 고치지 않고** `node scripts/gen-team-doc.mjs`로 다시 생성한다(CLAUDE.md 규칙 5).

**⑥ 안내 문서**

- `CLAUDE.md` 규칙 4의 "새로 클론한 환경에서는 최초 1회 `git config core.hooksPath .githooks`를 실행해야 한다"를 새 사실로 바꾼다. Claude Code 세션이 시작될 때 `scripts/ensure-hooks-path.sh`가 자동으로 맞추며, Claude Code를 거치지 않고 터미널에서 먼저 커밋하는 새 클론에서만 손으로 실행해야 한다고 적는다. 이 한계를 숨기지 않는다.
- `docs/agents/orchestrator.md` §5의 같은 문장은 **중복이므로**(CLAUDE.md 규칙 5) 규칙 4를 가리키는 한 줄로 줄인다. 단일 원천은 `CLAUDE.md`다.
- `.claude/skills/jam-sync/SKILL.md` B.3의 "`.githooks`로 설정되어 있는지 확인하고, 아니면 설정한다"는 상대·절대 형식을 정하지 않아 옛 절대경로 설정을 낳을 수 있으므로, "이 저장소의 `.githooks`로 해석되면 정상(상대·절대 모두), 아니면 `git config core.hooksPath .githooks`로 설정한다"로 고친다.
- 문서에는 훅 경로가 절대경로로 바뀌는 **원인**을 적지 않는다(하네스 때문이라는 점은 아직 확정되지 않았다). 값이 어떻게 판정되는지만 적는다(CLAUDE.md 규칙 5).

## 구현 계획

1. `ensure-hooks-path.sh`를 작성하고, 임시 저장소에서 다섯 상태(비어 있음·이 저장소의 `.githooks`를 가리키는 절대경로·다른 곳을 가리키는 절대경로·사라진 절대경로·`.githooks` 상대경로)와 `.githooks/` 부재 상태, 그리고 임시 저장소의 링크드 워크트리(값이 메인의 절대경로인 경우)를 실행해 본다. **이 저장소의 실제 `.git/config`는 검증 중에 바꾸지 않는다.**
2. `settings.json`과 `contract.json`을 고친다.
3. `check-contract.mjs`에 검사를 추가하고, 환경변수 주입(`GIT_CONFIG_COUNT`·`GIT_CONFIG_KEY_0`·`GIT_CONFIG_VALUE_0`)으로 실제 설정을 건드리지 않고 통과·실패 양쪽을 확인한다.
4. 생성기를 고치고 `node scripts/gen-team-doc.mjs`를 실행한다.
5. `CLAUDE.md`와 `orchestrator.md`를 고친다.
6. `scripts/verify.sh`를 실행한다.

## 완료 조건

- 임시 저장소에서 `core.hooksPath`가 비어 있거나, 이 저장소의 `.githooks`가 아닌 곳을 가리키거나, 사라진 경로일 때 `bash scripts/ensure-hooks-path.sh`를 실행하면 한 줄을 출력하고 값이 `.githooks`가 된다. 이어서 다시 실행하면 출력이 없고 종료 코드는 0이다.
- 값이 이 저장소의 `.githooks`를 가리키는 절대경로이면(메인 체크아웃과 링크드 워크트리 양쪽에서) 아무것도 출력하지 않고 값도 바꾸지 않는다.
- `.githooks/`가 없는 임시 저장소에서는 설정을 바꾸지 않고 종료 코드 0으로 끝난다.
- `node scripts/check-contract.mjs`는 값이 `.githooks`이거나 이 저장소의 `.githooks`를 가리키는 절대경로일 때 통과한다. 환경변수로 값을 비우거나, 다른 절대경로(`/tmp/x`)나 사라진 경로로 주입하거나, 엉뚱한 상대경로(`hooks`)로 주입하면 실패하고, 각각 다른 안내 문구와 고치는 명령을 출력한다. 재현 경로: `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/tmp/x node scripts/check-contract.mjs`
- `CLAUDE_PROJECT_DIR`를 이 저장소로 지정해 `settings.json`의 새 명령 문자열을 그대로 실행하면, 정상 상태에서 출력이 없고 종료 코드 0이다.
- `.claude/settings.json`이 유효한 JSON이고, `node scripts/gen-team-doc.mjs --check`와 `scripts/verify.sh`가 통과한다.
- `team-operations.md`의 세션 훅 표에 새 스크립트가 "설명 미등록" 없이 나타난다.
- `CLAUDE.md`와 `orchestrator.md`에 "최초 1회 수동 실행이 필요하다"는 옛 서술이 남아 있지 않고, 한계(Claude Code를 거치지 않는 새 클론)가 `CLAUDE.md` 한 곳에만 적혀 있다.
- 실제 새 세션에서의 자동 실행 확인은 카리나가 다음 세션 시작 때 하고 완료 기록에 남긴다.

---
## 완료 기록

### 구현 내용 요약

두 차례 실행했다. 첫 구현이 게이트를 통과한 뒤 설계 결함이 드러나 같은 브랜치에서 보정했고, 보정본도 게이트를 통과해 병합했다(경위는 아래 「주요 의사결정」).

- `scripts/ensure-hooks-path.sh` 신설(bash, 멱등). 정상이면 아무것도 출력하지 않고, 정상이 아니면 로컬 설정 한 키만 `.githooks`로 맞추고 한 줄을 출력한다. 종료 코드는 항상 0이다.
- `.claude/settings.json`의 `SessionStart` 네 번째 명령으로 연결했다. 기존 세 명령은 그대로다.
- `docs/agents/contract.json`에 `paths_exist`·`hooks.SessionStart` 항목과 `git_config` 절을 추가했다.
- `scripts/check-contract.mjs`에 `checkGitConfig`(⑩)를 추가했다. 비어 있음 / 이 저장소의 `.githooks`가 아닌 절대경로 / 그 밖의 값 세 문구로 실패하고, 고치는 명령을 함께 출력한다.
- **정상 판정**: 값이 비어 있지 않고, 존재하는 디렉터리이며, 현재 워크트리 루트 또는 메인 체크아웃 루트의 `.githooks`와 같은 폴더이면 상대·절대 모두 정상이다. ensure와 check-contract가 같은 규칙을 쓴다.
- `scripts/gen-team-doc.mjs`의 설명 표에 새 스크립트를 등록하고 `team-operations.md` 생성 구간을 생성기로 다시 만들었다.
- 안내 문서: `CLAUDE.md` 규칙 4를 새 사실로 바꿨다(한계도 이 한 곳에만 적음). `docs/agents/orchestrator.md`의 중복 문장은 규칙 4를 가리키는 한 줄로 줄였다. `.claude/skills/jam-sync/SKILL.md` B.3은 "이 저장소의 `.githooks`로 해석되면 정상(상대·절대 모두)"으로 고쳤다.
- 테스트 `scripts/ensure-hooks-path.test.mjs` 27건을 신설했다. 같은 값 표를 ensure와 check-contract 양쪽에 돌려 결과가 일치하는지 확인하고, 링크드 워크트리와 한글 폴더 NFC/NFD 표기 차이도 다룬다.

### 변경된 파일
```
scripts/ensure-hooks-path.sh            (신규)
scripts/ensure-hooks-path.test.mjs      (신규)
scripts/check-contract.mjs
scripts/gen-team-doc.mjs
.claude/settings.json
.claude/skills/jam-sync/SKILL.md
docs/agents/contract.json
docs/agents/team-operations.md          (생성 구간 재생성)
docs/agents/orchestrator.md
CLAUDE.md
```
10개 파일, +440/-6줄. `jam-web` 변경 없음.

### 테스트 결과
- [x] 게이트 리뷰(민지) 1차 PASS, 재작업 후 PASS
- [x] `scripts/verify.sh` 통과(lint · typecheck · test · ds:check · slop · contract · team-doc). 민지가 재실행해 확인
- [x] `node scripts/ensure-hooks-path.test.mjs` 27건 통과. 검증 중 이 저장소의 실제 `.git/config`는 바뀌지 않았다(민지가 실행 전후 해시로 확인)
- [x] 환경변수 주입(`GIT_CONFIG_COUNT`·`KEY_0`·`VALUE_0`) 재현: `.githooks`·이 저장소의 절대경로는 통과, 빈 값·`/tmp/x`·사라진 경로·`hooks`는 각각 다른 문구로 실패
- [x] 병합 후 재확인(카리나): 실제 설정값(절대경로)으로 `check-contract` 통과, `gen-team-doc --check` 최신, `settings.json`의 새 명령 문자열 실행 시 출력 없이 종료 코드 0
- [ ] 새 Claude Code 세션에서 `SessionStart`가 자동 실행되는지(후속 확인, 「잔여 이슈」 참조)

### 배포 정보
- 배포일: 2026-09-21
- 환경: staging (문서·스크립트만 변경되어 Vercel 빌드 없음)
- 커밋: 병합 `0bf810fb` (구현 `c4e8430d`, 재작업 `8282a4ed`)

### 주요 의사결정 / 핵심 메모

**설계 보정 경위.** 첫 구현은 값이 문자열로 정확히 `.githooks`일 때만 정상으로 봤다. 게이트를 통과한 직후, 이 PC의 값이 절대경로(`<메인 체크아웃>/.githooks`)로 되돌아와 있는 것이 발견됐다. 그 상태로 병합하면 워크플로가 한 번 돌 때마다 메인 체크아웃의 커밋이 계약 검사에 막힌다(아현이 첫 구현 커밋에 `JAM_SKIP_DOCLINT=1`, push에 `JAM_SKIP_VERIFY=1`을 쓴 이유이고, 사유는 커밋 메시지에 남아 있다). 그래서 판정 기준을 "이 저장소의 `.githooks`로 해석되는가"로 바꿔 재작업했다(스펙 변경 커밋 `a8e5f5e0`). 재작업은 우회 없이 통과했다.

**하네스 원인.** 격리 워크트리를 만드는 하네스가 워크트리를 만들 때 값을 절대경로로 쓰는 것으로 판단한다. 근거는 세 가지다.
- 상대경로로 바꿔 둔 값이 워크플로 실행 뒤 두 번 모두 절대경로로 돌아왔다(첫 실행 전 08:2x KST, 재작업 실행 직전 09:07 KST).
- 두 실행의 에이전트 기록을 검색했을 때 이 저장소의 `.git/config`에 값을 쓰는 명령이 없었다(쓰기 명령은 전부 임시 저장소용 테스트 코드).
- 실사용 Claude Code 2.1.275 바이너리에 워크트리 생성 시 `core.hooksPath`를 설정하고 "메인 저장소의 훅을 쓰도록 워크트리를 설정했다"고 알리는 코드가 있다. 과거 티켓 20260827_022·20260918_0423도 워크트리의 값이 메인 체크아웃의 절대경로라고 기록했다.
하네스만 단독으로 실행해 본 것은 아니므로 판단이라고 적는다. 문서에는 이 원인을 적지 않았고 판정 기준만 적었다.

**정정: 앞선 설명.** 이 티켓의 배경 점검에서 "상대경로로 바꾸면 워크트리가 자기 `.githooks`를 실행해 티켓 20260919_1245의 문제가 해소된다"고 판단했다. 이는 `git worktree add`로 직접 만든 워크트리에서만 확인한 것이었고, 하네스가 만든 워크트리에서는 값이 절대경로로 바뀌므로 성립하지 않는다. 티켓 20260919_1245의 문제(워크트리 커밋이 메인 체크아웃의 훅으로 검사됨)는 이 티켓으로 해소되지 않았다.

**스펙 정정 기록.** 구현이 티켓 본문과 다른 곳이 있어 후속 작업이 옛 문구를 스펙으로 읽지 않도록 남긴다.
- 「상세 요구사항 ① 정상 판정」의 "realpath가 같다"는 디바이스·아이노드 비교(bash `-ef`, Node `statSync` bigint)로 구현했다. 이 PC의 값은 한글 폴더명이 NFC로 적혀 있고 `git rev-parse`가 돌려주는 경로는 NFD이며, Node의 `realpathSync` 문자열 비교로는 같은 폴더를 다르다고 판정하는 것을 실측했다. 의도(같은 폴더인가)는 그대로다.
- 「⑤」의 설명 문구 "`.githooks`가 아니면 맞춘다"는 "이 저장소의 `.githooks`로 해석되지 않으면 맞춘다"로 바꿨다.
- 출력 문구는 `훅 경로를 .githooks 로 맞췄습니다`로 조사 앞에 공백이 있다. 티켓의 예시와 띄어쓰기만 다르고 테스트 정규식이 이 형태로 굳어 있다.

**별도 스크립트로 분리한 이유.** `contract.json`의 `hooks.SessionStart`는 명령 문자열에 스크립트 경로가 들어 있는지로 검사한다. `workspace-setup.sh`의 하위 명령으로 넣으면 기존 항목과 구분되지 않아 새 훅의 존재를 따로 못 박을 수 없다.

**선택하지 않은 대안.** `.githooks`를 `core.hooksPath` 없이 쓰는 방법(`.git/hooks` 심볼릭 링크)은 링크가 클론마다 다시 필요해 같은 문제를 옮길 뿐이라 채택하지 않았다.

**토큰·시간.** `tokenUsage`는 에이전트 출력 토큰만, 나머지는 워크플로 완료 알림의 값이다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 첫 구현 | 2 | 166,921 | 35,851 / 22,637 | 11분 18초 | 85 |
| 재작업 | 2 | 191,061 | 45,082 / 23,749 | 14분 24초 | 78 |
| 합계 | 4 | 357,982 | 80,933 / 46,386 | 25분 42초 | 163 |

**범위 밖 발견물 처리.** 예약 루틴에서 훅이 처음 켜질 위험은 티켓 20260921_0901(P2), `~/` 값 과교정은 티켓 20260921_0923(P3)로 만들었다. 테스트가 `verify.sh`에 연결되지 않은 문제는 기존 티켓 20260919_1306이 다룬다.

### 잔여 이슈
- **후속 확인(완료, 2026-09-21 밤)**: 새 Claude Code 세션의 첫 출력에 `훅 경로를 .githooks 로 맞췄습니다 (이전 값: 없음)` 한 줄이 나왔고, 직후 `git config core.hooksPath`가 `.githooks`였다. `SessionStart`가 `ensure-hooks-path.sh`를 자동 실행하는 것이 확인됐다(티켓 20260921_2303 착수 세션에서 확인).
- Claude Code를 거치지 않고 터미널에서 먼저 커밋하는 새 클론은 첫 커밋에 훅이 돌지 않는다. 훅 기반 자동화로는 풀 수 없는 한계이며 `CLAUDE.md` 규칙 4에 명시했다.
