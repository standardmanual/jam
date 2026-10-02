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

## 구현 계획 (파일 단위)

1. 새 `scripts/guard-shared-head.mjs`: stdin JSON 읽기 → 명령 분석(위 2) → 메인 워크트리 판정 → deny JSON 출력. 판정 함수는 내보내 테스트한다.
2. 새 `scripts/guard-shared-head.test.mjs`(`verify.sh`가 `scripts/*.test.mjs`로 돈다): 막는 명령(`git checkout -q --detach <sha>`, `git switch`, `git reset --hard`, `&&`로 이은 읽기+checkout), 통과하는 명령(`git show`·`diff`·`log`·`fetch`,
   `git worktree add --detach .claude/worktrees/gate-x <sha>`, `cd .claude/worktrees/gate-x && git checkout …`, `git -C .claude/worktrees/gate-x checkout …`), 격리 워크트리 `cwd`면 통과, 잘못된 입력이면 통과,
   그리고 두 정의 파일 frontmatter에 훅 명령이 등록돼 있는지(빠지면 실패).
3. `.claude/agents/jam-reviewer.md`·`.claude/agents/jam-designer.md` frontmatter에 `hooks.PreToolUse`(matcher `Bash`). 민지 본문 「Never move the folder you are running in」(142–150행)에 「훅이 막는다」 한 줄.
4. `docs/agents/contract.json` `paths_exist`에 스크립트와 테스트. `docs/agents/team-operations.md` §8 사고 이력에 이 티켓의 기계 방어 한 줄(생성 구간이면 근거 설정을 고치고 `node scripts/gen-team-doc.mjs`).

## 완료 조건

- 민지가 공유 작업 폴더에서 HEAD를 옮기는 명령을 실행하면 막히거나, 민지가 애초에 격리 워크트리에서만 돈다(재현 시험 또는 훅 테스트).

---
## 완료 기록 *(작업 완료 후 작성)*

### 주요 의사결정 / 핵심 메모
- 2026-10-02 두 번째 발생: 티켓 20261002_1944(⑥) 게이트에서 민지가 읽기 명령에 `git checkout --detach`를 다시 섞어 보냈다. 이번에는 권한 단계에서 거부돼 작업 폴더가 그대로였다(카리나 확인: `staging`·836e765·변경 없음).
  거부 뒤 같은 파일을 읽는 명령까지 거부돼 민지가 일부 파일을 직접 읽지 못했다(판정은 테스트·CI로 대신). 같은 날 두 번이라 착수 우선순위를 높게 본다.

### 잔여 이슈
-
