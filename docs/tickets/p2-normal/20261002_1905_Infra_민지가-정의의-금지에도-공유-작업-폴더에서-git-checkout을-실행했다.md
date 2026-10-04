---
id: "20261002_1905"
category: Infra
priority: P2
status: IN_PROGRESS
created: 2026-10-02
closed:
---

# [Infra] 민지가 정의의 금지에도 공유 작업 폴더에서 git checkout을 실행했다

> 범위 밖 발견물(2026-10-02 민지 자진 보고, 티켓 20261002_1814 ⑦-b 게이트 리뷰). 신호 **주의**.

## 핵심 요약

- 요구사항: 민지(`jam-reviewer`)가 ⑦-b 검토 중 읽기 명령에 섞어 `git checkout -q --detach`를 실행해 공유 작업 폴더(`/home/user/jam`, 클라우드 세션의 메인 트리)의 HEAD를 잠시 `staging`에서 분리했다.
  민지가 곧바로 `git symbolic-ref HEAD refs/heads/staging`으로 되돌렸고, 카리나가 확인한 결과 브랜치 `staging`·HEAD 94871c3·작업 트리 변경 없음이었다(reflog에 「checkout: moving from staging to HEAD」 한 줄).
  민지 정의는 이미 이 명령을 금지한다(`.claude/agents/jam-reviewer.md` 142–150행 「Never move the folder you are running in」, 근거 티켓 20260926_0121). 글 규칙만으로는 막히지 않으므로 기계 장치로 막는다.
- 구현 계획(착수 때 확정): 후보는 (가) 서브에이전트의 Bash `PreToolUse` 훅이 메인 트리에서 `git checkout`·`git switch`·`git reset --hard`·`git rebase`를 막는다(작업 폴더가 `.claude/worktrees/` 아래면 허용),
  (나) 워크플로(`.claude/workflows/jam-work.js`)가 민지를 격리 워크트리에서 부른다. 민지는 `baseSha..commitSha` 두 커밋 사이만 보므로 (나)로도 판정은 같다.
- 관련 파일: `.claude/settings.json` 68행 `hooks`, `.claude/agents/jam-reviewer.md` 142–150행, `.claude/workflows/jam-work.js`(민지 호출부의 `isolation`), 티켓 20260926_0121(같은 위험의 첫 사고).

## 착수 전에 정한 것 (2026-10-02 카리나, 사용자 지시 「1905(민지 checkout을 기계적으로 막기)」)

1. **(가) 훅으로 막는다. 다만 `settings.json`이 아니라 민지 정의의 frontmatter에 건다.** Claude Code는 서브에이전트 정의 파일 frontmatter의 `hooks`(`PreToolUse`, matcher `Bash`)를
   그 서브에이전트가 도는 동안에만 적용한다(공식 문서 hooks.md 「Subagent hooks (defined in frontmatter) run only while that subagent is running」, 2026-10-02 claude-code-guide 확인).
   Workflow의 `agent(…, { agentType })`와 Agent 도구(`/jam-ship` 5단계의 민지 모드 ②·③) 양쪽에 걸리고, 메인 세션(카리나)의 `git checkout staging` 같은 명령은 막지 않는다.
   (나) 격리 워크트리 호출은 민지가 매번 리뷰 커밋을 체크아웃하고 `node_modules`를 연결해야 해서 게이트 흐름이 바뀌므로 고르지 않았다.
2. **막는 조건.** 훅 입력(stdin JSON)의 `tool_input.command`에 공유 폴더의 HEAD·작업 트리를 바꾸는 git 하위 명령(`checkout`·`switch`·`reset`·`rebase`·`merge`·`pull`·`cherry-pick`·`revert`·`stash`·`restore`·`clean`·`commit`·`am`)이 있고,
   `cwd`가 메인 워크트리(`git rev-parse --path-format=absolute --git-dir`과 `--git-common-dir`이 같음)이며, 명령이 `.claude/worktrees/` 아래 경로로 옮겨 실행하지 않을 때(`cd <경로>`나 `git -C <경로>`가 그 아래가 아님) 막는다.
   `git worktree add --detach .claude/worktrees/gate-<sha> <sha>` → 그 안에서 실행하는 정의의 탈출구는 그대로 쓸 수 있다. `git show`·`diff`·`log`·`cat-file`·`status`·`fetch`·`worktree` 같은 읽기·워크트리 명령은 막지 않는다.
3. **막는 방식.** 종료 코드 0과 `hookSpecificOutput.permissionDecision: "deny"`·`permissionDecisionReason`(한국어, 정의의 「Never move the folder you are running in」과 탈출구 안내) JSON을 출력한다. 사유 문장은 모델이 본다.
   입력을 읽지 못하거나 git 판정이 실패하면 막지 않고 stderr에 남긴다(읽기 명령까지 막아 판정을 못 하게 되는 일을 피한다. 2026-10-02 두 번째 발생 때 거부 뒤 읽기까지 막혔다).
4. **적용 대상.** 민지(`jam-reviewer`)와, 같은 게이트 단계에서 같은 공유 폴더 규칙(`WORKDIR_RULE`)을 받는 채원(`jam-designer`). 아현은 격리 워크트리에서 돌아 대상이 아니다.
5. 스크립트는 저장소 관례대로 Node(`scripts/*.mjs`)로 쓴다(`jq` 의존 없음). 훅 명령은 `node "$CLAUDE_PROJECT_DIR/scripts/guard-shared-head.mjs"`.

## 2차: 격리 워크트리로 바꾼다 (2026-10-04, 사용자 결정 「민지를 격리 워크트리에서 부르기」)

> 1차(frontmatter 훅)는 머지했지만 실제 호출에서 걸리지 않았다(2026-10-02 같은 세션, 2026-10-04 컨테이너 재시작 뒤 다시 연 세션 모두 `git clean -n`이 그대로 실행됨). 원인은 확인하지 못했다(아래 완료 기록).
> 사용자가 후속 범위의 대안 가운데 (나)를 골랐다. 명령을 막는 대신 게이트 에이전트가 공유 폴더에 서지 않게 한다.

1. **게이트 단계의 민지와 채원②를 격리 워크트리에서 부른다.** `runGateReview`의 두 `agent()` 호출에 `isolation: 'worktree'`(아현과 같은 방식). 표준 경로와 `gateOnly`가 이 함수를 함께 쓰므로 둘 다 바뀐다.
   채원① 사전 판정은 아현 전에 돌고 사고 이력이 없어 이번에 바꾸지 않는다.
2. **프롬프트.** `WORKDIR_RULE`을 「지금 폴더는 너만의 격리 워크트리다. 첫 명령으로 `git fetch origin <review 브랜치> && git checkout --detach <commitSha>`(범위가 없으면 `git fetch origin staging && git checkout --detach origin/staging`)를 실행하고,
   테스트를 직접 돌려야 할 때만 `scripts/workspace-setup.sh link "$(pwd)"`로 `node_modules`를 연결한다. 그 전에 본 파일은 무효다. 메인 작업 폴더(공유 폴더)로 `cd`하지 않는다」로 바꾼다. 브랜치·SHA는 `devResult`에서 넣는다.
   격리 워크트리가 기본 브랜치(main) 기준이라, 체크아웃 전에는 staging에만 있는 티켓·코드가 보이지 않는다(아현 프롬프트와 같은 이유).
3. **1차 훅은 남긴다.** 해가 없고, 다른 실행 환경(PC CLI)에서는 동작할 수 있다. 다만 문서에는 「등록돼 있으나 클라우드 세션의 실제 호출에서 걸리지 않음」만 사실로 적는다(CLAUDE.md 규칙 5). `team-operations.md` §5의 「차단」 문장을 고친다.
4. **`/jam-ship` 5단계의 민지 호출.** 카리나가 Agent 도구로 민지 모드 ②·③을 부를 때도 `isolation: "worktree"`를 주고 첫 명령으로 `git fetch origin staging && git checkout --detach origin/staging`을 지시하게 한다(`.claude/skills/jam-ship/SKILL.md` 135행 부근).
5. **계약.** `docs/agents/contract.json` `worktree_isolated_agents.agents`에 `jam-reviewer`·`jam-designer`를 더하고 `_why`를 「쓰기 주체 + 공유 폴더에서 git을 쓰는 게이트 에이전트」로 고친다(`scripts/check-contract.mjs`가 `jam-work.js`의 `agentType`·`isolation` 쌍을 대조한다.
   정규식이 `[^}]*`라 채원② 호출은 `isolation`을 스프레드(`...(workType === 'ds' ? {} : {...})`)보다 앞에 둔다). `team-operations.md`의 생성 구간(`worktree-isolation`)은 `node scripts/gen-team-doc.mjs`로, `team-map.html`은 `node scripts/gen-team-map.mjs`로 다시 만든다.

### 2차 구현 계획 (파일 단위)

1. `.claude/workflows/jam-work.js` `runGateReview`(160–245행 부근): 두 호출의 `isolation`, `WORKDIR_RULE`(194–197행) 교체, 범위 지시(`rangeInstruction`)와 겹치는 fetch 문장 정리.
2. `.claude/workflows/jam-work.test.mjs`: 게이트 두 호출이 `isolation: 'worktree'`이고 프롬프트에 체크아웃 첫 명령이 들어가는지(표준·`gateOnly` 둘 다).
3. `.claude/agents/jam-reviewer.md` 「Never move the folder you are running in」(142–150행 부근): 워크플로 게이트에서는 격리 워크트리에서 돌고 첫 명령으로 리뷰 커밋을 체크아웃한다, 그 밖의 호출에서는 기존 규칙 그대로. `jam-designer.md`에 같은 취지 한 줄.
4. `.claude/skills/jam-ship/SKILL.md` 5단계(가정 4).
5. `docs/agents/contract.json`(가정 5), `docs/agents/team-operations.md`(§5 민지·채원 「물리적 제약」 칸, §8 1905 행, 생성 구간 재생성), `docs/agents/team-map.html`(재생성).

### 2차 완료 조건

- 워크플로 게이트의 민지·채원②가 격리 워크트리에서 돌고, 첫 명령으로 리뷰 커밋을 체크아웃한다(워크플로 테스트, 머지 뒤 첫 워크플로 실행의 `isolation` 기록으로 카리나가 확인).
- `scripts/check-contract.mjs`·`scripts/verify.sh` 전 항목 통과. 문서는 확인한 사실만 적는다.

## 구현 계획 (파일 단위)

1. 새 `scripts/guard-shared-head.mjs`: stdin JSON 읽기 → 명령 분석(위 2) → 메인 워크트리 판정 → deny JSON 출력. 판정 함수는 내보내 테스트한다.
2. 새 `scripts/guard-shared-head.test.mjs`(`verify.sh`가 `scripts/*.test.mjs`로 돈다): 막는 명령(`git checkout -q --detach <sha>`, `git switch`, `git reset --hard`, `&&`로 이은 읽기+checkout), 통과하는 명령(`git show`·`diff`·`log`·`fetch`,
   `git worktree add --detach .claude/worktrees/gate-x <sha>`, `cd .claude/worktrees/gate-x && git checkout …`, `git -C .claude/worktrees/gate-x checkout …`), 격리 워크트리 `cwd`면 통과, 잘못된 입력이면 통과,
   그리고 두 정의 파일 frontmatter에 훅 명령이 등록돼 있는지(빠지면 실패).
3. `.claude/agents/jam-reviewer.md`·`.claude/agents/jam-designer.md` frontmatter에 `hooks.PreToolUse`(matcher `Bash`). 민지 본문 「Never move the folder you are running in」(142–150행)에 「훅이 막는다」 한 줄.
4. `docs/agents/contract.json` `paths_exist`에 스크립트와 테스트. `docs/agents/team-operations.md` §8 사고 이력에 이 티켓의 기계 방어 한 줄(생성 구간이면 근거 설정을 고치고 `node scripts/gen-team-doc.mjs`).

## 완료 조건

- 민지가 공유 작업 폴더에서 HEAD를 옮기는 명령을 실행하면 막히거나, 민지가 애초에 격리 워크트리에서만 돈다(재현 시험 또는 훅 테스트).

### 후속 범위 (담당: 카리나, 시점: 이 머지 뒤 새로 연 첫 세션)
- 새 세션에서 민지를 한 번 불러 `git clean -n -- __guard_probe_nonexistent__`(무해한 dry-run, 민지 정의의 금지 목록 밖)를 실행하게 하고 훅의 deny가 걸리는지 본다. 걸리면 CLOSED.
  걸리지 않으면 frontmatter 훅이 이 환경에서 동작하지 않는 것이므로 대안((나) 격리 워크트리 호출, 또는 `settings.json`의 `PreToolUse` 훅에서 입력의 `agent_type`으로 민지·채원만 가르기)을 사용자에게 묻는다.
  checkout 명령으로 시험하지 않는다. 민지가 정의의 금지 규칙 때문에 스스로 실행을 거부해 훅까지 가지 않는다(2026-10-02 1차 시험).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 민지(`jam-reviewer`)·채원(`jam-designer`) 정의 frontmatter에 `hooks.PreToolUse`(matcher `Bash`) → `node "$CLAUDE_PROJECT_DIR/scripts/guard-shared-head.mjs"`.
- 훅은 공유 폴더(메인 워크트리)에서 HEAD·작업 트리를 바꾸는 git 하위 명령 13종을 deny JSON(한국어 사유와 `git worktree add --detach .claude/worktrees/gate-<sha>` 탈출구)으로 막는다.
  `.claude/worktrees/` 아래로 옮겨(`cd`·`git -C`) 실행하는 명령과 읽기 명령은 통과하고, 입력·판정 오류는 막지 않는다. 따옴표·heredoc·`&&`·`;`·`|`·`$(…)`·`bash -c`를 따라간다.
- 머지 뒤 카리나가 `team-operations.md` §5 「물리적 제약」 칸에 훅 방어를 보완하고 `team-map.html`을 다시 생성했다(게이트 WARN 3).

### 변경된 파일
```
scripts/guard-shared-head.mjs (신규), scripts/guard-shared-head.test.mjs (신규)
.claude/agents/jam-reviewer.md, .claude/agents/jam-designer.md
docs/agents/contract.json, docs/agents/team-operations.md(§8 아현, §5 카리나), docs/agents/team-map.html(재생성)
```
6파일 +602/−1줄(리뷰 브랜치). 사전 판정(약 7파일·300줄)보다 줄이 컸다(명령 분석 때문, 아현 [주의]).

### 테스트 결과
- [x] 아현: `scripts/verify.sh` 전 항목 통과. 막는 명령 32건·통과 명령 38건, 임시 git 저장소 실제 실행(메인·하위 폴더·연결 워크트리·저장소 아님·깨진 JSON), 두 정의의 훅 등록 검사.
- [x] 민지: CI verify(run 37014470886) success, 별도 워크트리에서 훅 스크립트 직접 실행 확인 → **WARN**(실제 호출 미확인, 우회 구멍, §5 표).
- [ ] 실제 서브에이전트 호출에서 훅이 걸리는지: 이 세션에서는 **걸리지 않았다**(아래 메모). 새 세션에서 다시 본다(후속 범위).

### 배포 정보
- 배포일: (staging만, 2026-10-02)
- 환경: staging(프로덕션 배포 전)
- 커밋: 머지 ef3fb54, 문서 보완 32b8016

### 실행 지표
| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | 아현·민지 | 164,486 | 133,445 / 36,440 | 16분 48초 | 73 |
| 합계 | 2 | 164,486 | 133,445 / 36,440 | 16분 48초 | 73 |

### 주요 의사결정 / 핵심 메모
- 2026-10-02 사용자 「1905(민지 checkout을 기계적으로 막기)」로 착수. 방식(frontmatter 훅)과 막는 조건은 카리나가 정했다(「착수 전에 정한 것」). 근거는 claude-code-guide가 확인한 공식 문서다.
- 2026-10-02 게이트 **WARN**. 사용자 「머지 승인」으로 머지했다(ef3fb54). WARN 3(§5 표)은 카리나가 보완했고, WARN 2와 범위 밖 발견물 넷은 P3 20261002_2251(우회 구멍 5건)로 뗐다(주의 1건을 P3로 조정: 실수를 막는 장치이고 사고 형태는 막는다).
- 2026-10-02 실제 적용 시험(머지 뒤, 같은 세션에서 새로 띄운 민지): (1) `git checkout HEAD -- <없는 경로>`는 민지가 정의의 금지 규칙으로 스스로 실행을 거부해 훅까지 가지 않았다.
  (2) `git clean -n -- <없는 경로>`는 **훅에 막히지 않고 실행됐다**(출력 없음, 바뀐 것 없음). 같은 입력으로 훅 스크립트를 직접 돌리면 deny가 나온다.
  원인 후보: 에이전트 정의를 세션 시작 때 읽어 머지 전 정의가 쓰였다, frontmatter 훅이 이 환경에서 동작하지 않는다, 훅 실행 환경에 `CLAUDE_PROJECT_DIR`가 없다. 원인을 가르려고 사용자 영역에 시험용 에이전트 정의를 만들려 했으나
  자동 모드 분류기가 자기 설정 변경으로 거부했고 우회하지 않았다. 그래서 상태를 WAITING으로 두고 새 세션에서 다시 본다(후속 범위).
- 2026-10-02 두 번째 발생: 티켓 20261002_1944(⑥) 게이트에서 민지가 읽기 명령에 `git checkout --detach`를 다시 섞어 보냈다. 이번에는 권한 단계에서 거부돼 작업 폴더가 그대로였다(카리나 확인: `staging`·836e765·변경 없음).
  거부 뒤 같은 파일을 읽는 명령까지 거부돼 민지가 일부 파일을 직접 읽지 못했다(판정은 테스트·CI로 대신). 같은 날 두 번이라 착수 우선순위를 높게 본다.

### 잔여 이슈
-
