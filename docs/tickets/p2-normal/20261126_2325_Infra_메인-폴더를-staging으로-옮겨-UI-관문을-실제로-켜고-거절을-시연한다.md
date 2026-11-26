---
id: "20261126_2325"
category: Infra
priority: P2
status: OPEN
created: 2026-11-26
---

# [Infra] 메인 폴더를 staging으로 옮겨 UI 관문을 실제로 켜고 거절을 시연한다

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
