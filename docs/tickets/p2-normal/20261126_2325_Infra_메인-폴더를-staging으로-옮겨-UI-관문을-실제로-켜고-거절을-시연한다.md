---
id: "20261126_2325"
category: Infra
priority: P2
status: CLOSED
created: 2026-11-26
closed: 2026-11-27
---

# [Infra] JAM! 작업 폴더(메인 폴더)를 옛 작업 브랜치에서 staging으로 옮겨 UI 관문을 실제로 켜고 거절을 시연한다

> «메인 폴더»는 이 PC의 작업 폴더 `/Volumes/뚝섬하드/시현/JAM!`이다. main 브랜치(실제 서비스)와 무관하다. 개발은 staging(개발 서버) 기준으로 하고, 이 폴더도 staging을 쓴다(사용자, 2026-11-27).

## 핵심 요약

- 요구사항: 티켓 20261125_1923(UI 소스 한 벌 정리, 10회차 완료)의 완료 조건 «정본 목록 밖 UI 코드를 쓰려는 편집이 훅·lint·pre-commit에서 거절되는 것을 시연한다»를 넘겨받는다. 사용자 결정(2026-11-26, 10회차 ⑤)으로 그 회차에서 다루지 않았다.
- 확인한 사실(2026-11-26): 메인 폴더 브랜치는 `claude/jamwork-20261125_1650-badge-grey-ds-cleanup`이고 `core.hooksPath`는 메인 폴더 `.githooks`다. 그래서 모든 작업 폴더의 커밋이 그 브랜치의 옛 훅을 쓴다. 메인 폴더 훅에는 `check-ui-rules`·`check-ui-approval`·`gen-component-list`·`gen-token-catalog`가 없고, 메인 폴더 `.claude/settings.json`에는 `ui-guard` 편집 훅이 없다. 지금은 verify·CI만 강제된다.
- 전제: 메인 폴더 브랜치 위에 staging에 없는 다른 세션의 커밋 `ee37aec58`·`8a81bebd4`(48주차 홈피드 카드·묶음 SQL 기록)가 있다. 메인 폴더 전환 전에 이 두 커밋을 staging으로 옮긴다. 메인 폴더 브랜치 전환은 사용자나 메인 세션이 한다(다른 세션이 쓰는 중인지 먼저 확인).
- 관련 파일: `.githooks/pre-commit`·`commit-msg`, `.claude/hooks/ui-guard.mjs`, `.claude/settings.json`, `scripts/check-ui-rules.mjs`·`check-ui-approval.mjs`·`gen-component-list.mjs`·`gen-token-catalog.mjs`, `scripts/ensure-hooks-path.sh`.

- 진행 상황 (2026-11-26 23:55경 KST): 1번 끝 — `ee37aec58`·`8a81bebd4`를 로컬 staging에 체리픽했다(`ed78fd91f`·`e4021e018`, `git cherry`로 내용 동일 확인). 메인 폴더는 깨끗하고 실행 중인 세션은 없었다. 2번 메인 폴더 전환은 구체 명령(이 세션 작업 폴더의 staging 브랜치 풀기 → 메인 폴더 `git switch staging` → 메인 폴더 jam-web `npm install`)과 영향을 보이고 물었고, 사용자가 «보류»를 골랐다. 이 티켓은 OPEN으로 둔다.

## 구현 계획

1. 두 커밋을 staging으로 옮긴다(체리픽, 충돌 확인).
2. 메인 폴더를 staging으로 바꾼다(사용자 또는 메인 세션).
3. 새 세션에서 시연한다: (a) 정본 폴더 밖 화면 파일에 임의값 클래스·색 리터럴을 쓰는 편집이 `ui-guard` 훅에 거절된다 (b) 서브에이전트의 같은 편집도 거절된다 (c) 승인 줄 없이 토큰·정본 파일을 바꾼 커밋이 commit-msg에서 거절된다 (d) pre-commit의 ui-rules·정본 목록·토큰 카탈로그(`--stage`) 단계가 실제 jam-web 커밋에서 돈다(9-5 넘김 ⑨) (e) 홈피드 동반 검사 전용 우회 `JAM_SKIP_HOMEFEED_DOC=1`(10-6)이 홈피드 검사만 건너뛴다. 시연 뒤 시험 변경은 커밋하지 않고 되돌린다.

## 완료 조건

- 위 (a)~(e)의 거절·동작 결과(명령과 출력 요지)를 완료 기록에 남긴다.
- 메인 폴더가 staging이고 `core.hooksPath`가 그 `.githooks`로 해석된다.

## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 2026-11-26 사용자 «보류» → 2026-11-27 사용자가 «main이 아니라 개발 서버(staging)로 옮기는 일»임을 확인하고 «옮겨». 전환 직전 «자잘한 수정» 세션이 그 폴더에서 실행 중이라 멈췄고, 사용자가 «끝났어 옮겨»라고 한 뒤 다시 확인(실행 중 세션 없음, 저장 안 한 변경 0, 옛 브랜치의 내용은 `git cherry`로 모두 staging에 있음)하고 옮겼다.
- 명령: 카리나 작업 폴더(`ship-stg-20261125`)의 staging 브랜치를 `checkout --detach`로 풀기 → JAM! 작업 폴더 `git switch staging`(그사이 «자잘한 수정» 세션이 staging에 커밋 3개를 더하고 push해 둔 상태, `19e20fafc`, origin과 같음) → `jam-web`에서 `npm install`(jsdom 29.1.1 등). 실제 서비스(main)와 배포에는 영향 없음.
- 확인: `core.hooksPath`는 작업 폴더 `.githooks`(이제 staging 판, `ensure-hooks-path.sh` 통과). 그 안에 `check-ui-rules`·`check-ui-approval`·`gen-component-list`·`gen-token-catalog`·`JAM_SKIP_HOMEFEED_DOC`가 있고, `.claude/settings.json`에 `ui-guard` 편집 훅이 있다. 세션의 스킬 목록도 새 판(jam-design·jam-ds 없음)으로 다시 읽혔다.

### 테스트 결과 (거절 시연, 임시 작업 폴더에서 하고 시연용 커밋은 폴더와 함께 버림)
- [x] (a) 메인 세션 편집: 정본 밖 화면 파일(`src/app/(main)/demo-gate/page.tsx`)에 `p-[13px]`·색 리터럴·인라인 색을 Write → `PreToolUse:Write hook error`로 거절, 파일 생성 안 됨(위반 arbitrary 1·color-literal 2·inline-visual 1). 훅 스크립트 직접 호출도 종료 코드 2.
- [x] (b) 서브에이전트 편집: 같은 Write를 서브에이전트가 시도 → 같은 훅에 거절, 파일 생성 안 됨.
- [x] (c) 승인 줄 없이 토큰 파일(`semantic.css`)을 바꾼 커밋 → `차단(commit-msg): UI 승인 관문`, 커밋 안 됨.
- [x] (d) 편집 훅을 거치지 않고 셸로 만든 위반 화면 파일 커밋 → `차단(pre-commit): 서비스 화면에 DS 밖 값이 늘었습니다`. 토큰 값을 바꾸고 승인 줄을 붙인 커밋 → pre-commit이 `tokens.md`를 다시 만들어 같은 커밋에 넣음(9-5 넘김 ⑨ `--stage` 실커밋 확인).
- [x] (e) 캡슐 코드 값만 바꾼 커밋 → `차단(pre-commit): 홈피드 코드가 스테이지됐는데 기능 정의 문서가 함께 스테이지되지 않았습니다`. `JAM_SKIP_HOMEFEED_DOC=1`로 다시 커밋 → «홈피드 PRD 동반 검사를 건너뜁니다» 안내와 함께 통과, 토큰 카탈로그 등 다른 검사는 그대로 돎.

### 주요 의사결정 / 핵심 메모
- 편집 훅은 세션 시작 때만 읽히는 줄 알았으나, 브랜치 전환 뒤 이 세션의 Write에서도 바로 동작했다.
- 사용자 승인: 2026-11-27 — JAM! 작업 폴더를 staging으로 옮기기(«옮겨», «끝났어 옮겨»)

### 잔여 이슈
- 카리나 작업 폴더 `.claude/worktrees/ship-stg-20261125`는 detached로 남아 있다(이후 작업은 JAM! 작업 폴더의 staging에서 한다).
