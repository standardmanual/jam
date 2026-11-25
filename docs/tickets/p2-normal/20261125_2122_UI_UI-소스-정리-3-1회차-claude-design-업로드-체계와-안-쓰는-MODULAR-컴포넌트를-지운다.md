---
id: "20261125_2122"
category: UI
priority: P2
status: CLOSED
created: 2026-11-25
closed: 2026-11-25
parent: "20261125_1923"
---

# [UI] UI 소스 정리 3-1회차: claude.ai/design 업로드 체계와 안 쓰는 MODULAR 컴포넌트를 지운다

## 핵심 요약

- 요구사항: 상위 티켓 20261125_1923 3회차(미사용 제거 1)의 첫 조각. 사용자가 쓰지 않는 claude.ai/design 업로드 체계
  (업로드 전용 파일·`*.prompt.md`·`.design-sync/`·매니페스트 생성 스크립트)와, 서비스 화면이 쓰지 않고 스토리·시험에서만 쓰는
  MODULAR 컴포넌트 13개를 지운다. 지운 것을 가리키던 코드·검사·설정을 정리해 `verify.sh`를 통과시킨다.
- 사용자 결정(2026-11-25): claude.ai/design 업로드는 쓰지 않는다(«그게 뭔지도 모름»). MODULAR 폴더에는 토큰만 남기는 방향이다.
  삭제 회차는 화면 변화가 없어야 한다.
- **서비스 화면은 바뀌지 않는다.** 지우는 컴포넌트 13개는 서비스 화면(`src/app/**`의 서비스 경로·`src/components/**`)이 import하지 않는다
  (1회차 측정·knip).
- 관련 파일: 아래 「삭제 목록」과 「정리할 참조」.

## 삭제 목록

1. `jam-web/design-system/` 업로드 전용 파일: `Canvas.dc.html`, `thumbnail.html`, `support.js`, `_adherence.oxlintrc.json`,
   `_ds_manifest.json`, `SKILL.md`, `readme.md`, `github.md`, `uploads/`(폴더 전체)
2. `jam-web/design-system/components/**/*.prompt.md` 전부
3. 저장소 루트 `.design-sync/`(폴더 전체)
4. `jam-web/scripts/ds-manifest-sync.mjs`
5. 서비스가 쓰지 않는 MODULAR 컴포넌트 13개의 `.jsx`·`.d.ts`·`.stories.tsx`:
   BadgeFrame, MissionCard, ModalToast, Textarea(서비스 사본 없음) / BadgeGridCard, BottomSheet, CollectionGridCard, ListCard, ListRow,
   LoadMoreButton, SlidingTabs, TabBar, Toast(서비스 `src/components/ui/`에 정본이 따로 있음)

남기는 것: `tokens/`, `styles.css`, `assets/`(`gen-brand-assets.mjs`·logo3d 시험이 씀), `foundations/*.stories.tsx`, 서비스가 쓰는
MODULAR 컴포넌트 24개와 그 스토리, `IconCatalog`(6회차 스토리북 재구성 때 정한다). 서비스 정본 `src/components/ui/`는 이번 조각에서
건드리지 않는다.

## 정리할 참조

- `jam-web/package.json`: `scripts`의 `ds:manifest` 줄만 지운다(의존성 칸은 건드리지 않는다 — 3-2회차가 같은 파일의 의존성 칸을 고친다).
- `jam-web/eslint.config.mjs`: `globalIgnores`의 `design-system/support.js` 줄과 그 주석을 지운다.
- `jam-web/scripts/ds-sync-check.mjs`(`npm run ds:check`, `verify.sh`가 돌림): 지운 층(claude.ai/design 동기화 상태·매니페스트·
  prompt.md)과 지운 MODULAR 사본과의 짝 비교를 검사에서 뺀다. 남은 짝(Button·TopNav 등 두 벌이 남은 것)과 나머지 검사는 그대로 동작해야 한다.
- `.githooks/pre-commit` 367~370행 근처 MODULAR 스토리 경고 문구의 «네 층(… claude.ai/design)» 안내를 «서비스 UI·MODULAR·Storybook»으로 고친다.
  경고 동작은 바꾸지 않는다.
- 지운 컴포넌트를 import하는 시험(예: `src/components/__tests__/dsLiteralColors.test.ts`, `src/components/ui/__tests__/` 아래 DS 짝 비교 시험)은
  지운 컴포넌트에 해당하는 사례만 뺀다. 서비스 정본을 검사하는 사례는 남긴다.
- `.claude/skills/jam-ds/SKILL.md`·`.claude/agents/jam-designer.md`: 맨 위(또는 해당 모드 설명 바로 아래)에 한 줄만 더한다 —
  «claude.ai/design 업로드·동기화는 2026-11-25 사용자 결정으로 중단했다. 해당 절차는 쓰지 않는다(규칙 문서 정리는 상위 티켓 20261125_1923 10회차)».
  다른 문장은 고치지 않는다.
- 문서(`docs/**`, `jam-web/docs/storybook/*.md`, `jam-web/PRODUCT.md`)의 언급은 이번에 고치지 않는다(10회차). 단 `verify.sh`·pre-commit이
  **오류**로 막는 참조가 있으면 그 줄만 «삭제됨(2026-11-25, 티켓 20261125_2122)»으로 바꾼다.

## 구현 계획

1. 삭제 목록 1~5를 지운다.
2. `node scripts/check-ui-rules.mjs`, `cd jam-web && npm run ds:check`, `npm run typecheck`, `npm run lint`, 관련 vitest를 돌려 깨지는
   참조를 찾고 「정리할 참조」대로 고친다.
3. `npm run build-storybook`(또는 스토리북 빌드가 오래 걸리면 `vitest`의 스토리 프로젝트)로 지운 스토리가 남긴 빈 참조가 없는지 확인한다.
4. `scripts/verify.sh` 전체 통과.

## 완료 조건

### 구현 범위 (게이트 판정 대상)
- 삭제 목록 1~5의 파일이 저장소에 없다.
- `jam-web/src/app/**`(어드민 포함)와 `jam-web/src/components/**`의 서비스 코드는 바뀌지 않는다(시험 파일 제외). 서비스 정본 `src/components/ui/`의
  비시험 파일은 바뀌지 않는다.
- `npm run ds:check`가 지운 층을 더 찾지 않고 통과한다. 스토리북 빌드(또는 스토리 시험)가 지운 컴포넌트 때문에 실패하지 않는다.
- `jam-ds` 스킬·`jam-designer` 정의에는 중단 안내 한 줄씩만 더해진다.
- `scripts/verify.sh` 전체 통과.

### 후속 범위 (담당: 카리나, 시점: 머지 뒤)
- claude.ai/design·MODULAR 사본을 전제로 한 티켓(20260901_1854, 20261016_2220, 20261107_1814, 20261102_2247 등)을 «사용자 결정으로 중단»으로 닫는다.
- 사용자가 쓰는 «JAM 화면 개선안 캔버스»(claude.ai 아티팩트)가 지운 파일과 무관한지 다시 확인한다.

## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 삭제 목록 1~5를 모두 지웠다: 업로드 전용 파일 8종·`uploads/`·`*.prompt.md` 전부·루트 `.design-sync/`·`ds-manifest-sync.mjs`·
  서비스가 안 쓰는 MODULAR 컴포넌트 13개(.jsx·.d.ts·.stories.tsx). `design-system/`에는 `assets`·`components`(서비스가 쓰는 24개 +
  IconCatalog)·`foundations`·`styles.css`·`tokens`만 남았다.
- 참조 정리: `ds-sync-check.mjs`는 매니페스트 대신 `components/*.jsx`를 직접 훑어 남은 짝(Button·TopNav)만 비교한다(매니페스트·매니페스트
  토큰·업로드 노후 검사 제거). `package.json` scripts의 `ds:manifest` 줄, `eslint.config.mjs`의 support.js 무시 줄 삭제, pre-commit 경고
  문구를 «세 층»으로 수정, `jam-ds` 스킬·`jam-designer` 정의에 중단 안내 한 줄씩.
- 티켓 밖 연쇄 정리 2건(민지가 범위 안으로 판정): `gen-brand-assets.mjs`·시험에서 지운 `uploads/jam_logo.png` 대상 제거,
  지운 ListRow 사본만 검사하던 `dsListRowStyleOnce.test.tsx` 삭제. 시험 10개에서 지운 사본 사례만 뺐다.
- 서비스 비시험 코드 변경 0건.

### 테스트 결과
- [x] CI `verify` success (커밋 `494956bff`), 게이트(민지) PASS
- [x] 카리나 머지 뒤 확인: `check-ui-rules` 통과, `ds:check` 종료 코드 0

### 배포 정보
- 배포일: (staging push 대기 — 사용자 요청 시)
- 환경: staging
- 커밋: `494956bff` (머지 `1a7feb3ca`)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 2 | 169,941 | 24,854 / 22,144 | 31분 15초 | 79 |
| 합계 | 2 | 169,941 | 24,854 / 22,144 | 31분 15초 | 79 |

### 주요 의사결정 / 핵심 메모
- 후속 범위(카리나, 머지 뒤): claude.ai/design·MODULAR 사본을 전제로 한 티켓 4건(20260901_1854, 20261016_2220, 20261107_1814,
  20261102_2247)을 «사용자 결정으로 중단»으로 닫았다. 사용자가 쓰는 «JAM 화면 개선안 캔버스»는 claude.ai 아티팩트 안의 자체 파일
  (`project/*.dc.html`·`canvas.json`)로 이루어져 있어 저장소 파일 삭제의 영향을 받지 않는다.
- 민지 참고: 서비스 컴포넌트 주석 몇 곳(`ListRow.tsx:8`, `ListCard.tsx:10`, `LoadMoreButton.tsx:7`, `BadgeGridCard.tsx:84`, `transitions.css:586`)이
  지운 사본을 «원본»으로 안내한다 → 10회차. `jam2-token-migrate.mjs:46-47`의 지운 경로는 과거 일회성 스크립트라 그대로 둔다.
- 민지 참고: 워크플로가 넘긴 기준 SHA(`8fdd96248`)가 실제 분기점(`70b15698b`)보다 앞서 검토 범위에 앞 회차 커밋이 섞였다. 기준 SHA를
  `origin/staging`에서 잡기 때문이다(로컬 staging이 원격보다 앞선 상태) — 워크플로 개선 후보로 상위 티켓에 적는다.

### 잔여 이슈
- 없음
