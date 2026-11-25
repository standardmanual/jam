---
id: "20261125_2122"
category: UI
priority: P2
status: OPEN
created: 2026-11-25
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
