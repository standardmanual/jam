---
id: "20261002_1905"
category: Infra
priority: P2
status: OPEN
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

## 완료 조건

- 민지가 공유 작업 폴더에서 HEAD를 옮기는 명령을 실행하면 막히거나, 민지가 애초에 격리 워크트리에서만 돈다(재현 시험 또는 훅 테스트).

---
## 완료 기록 *(작업 완료 후 작성)*

### 주요 의사결정 / 핵심 메모
- 2026-10-02 두 번째 발생: 티켓 20261002_1944(⑥) 게이트에서 민지가 읽기 명령에 `git checkout --detach`를 다시 섞어 보냈다. 이번에는 권한 단계에서 거부돼 작업 폴더가 그대로였다(카리나 확인: `staging`·836e765·변경 없음).
  거부 뒤 같은 파일을 읽는 명령까지 거부돼 민지가 일부 파일을 직접 읽지 못했다(판정은 테스트·CI로 대신). 같은 날 두 번이라 착수 우선순위를 높게 본다.

### 잔여 이슈
-
