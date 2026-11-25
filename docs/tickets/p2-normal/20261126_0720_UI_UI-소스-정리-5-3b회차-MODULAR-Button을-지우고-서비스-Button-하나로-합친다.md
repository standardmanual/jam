---
id: "20261126_0720"
category: UI
priority: P2
status: OPEN
created: 2026-11-26
parent: "20261125_1923"
---

# [UI] UI 소스 정리 5-3b회차: MODULAR Button을 지우고 서비스 Button 하나로 합친다

## 핵심 요약

- 요구사항: 상위 티켓 20261125_1923 5회차(정본 단일화)의 셋째 조각 뒷부분. 마지막으로 남은 MODULAR 컴포넌트 `Button`
  (`jam-web/design-system/components/buttons/Button.jsx`·`.d.ts`·`.stories.tsx`)을 지우고, 가져다 쓰는 곳을 서비스 정본
  `jam-web/src/components/ui/Button.tsx`(default export)로 바꾼다. **서비스 Button의 구현(클래스·값·props)은 바꾸지 않는다**(주석만 고친다).
- 사용자 결정(2026-11-26, «추천대로»): 바꾸면 생기는 화면 차이 두 가지를 받아들인다. 그 밖의 화면 변화는 없어야 한다.
  1. `EmptyState`의 액션 버튼(알림 조회 실패·VOC 실패·전체 오류 화면의 «다시 시도» 등): 좌우 여백이 24px → 32px로 넓어진다(서비스 primary의 `px-8`).
     색은 `surface="sub"`로 지금과 같은 accent 알약을 유지한다(MODULAR light primary = 서비스 sub primary, `--accent` + `--accent-foreground`).
  2. `EmptyState` 액션 버튼과 배지 고르기 캐러셀(`BadgeRevealCarousel`)의 선택 버튼에 누를 때 줄어드는 효과(`active:scale-95`)가 생긴다.
     MODULAR의 눌림 규칙은 서비스가 읽지 않는 `design-system/styles.css`에 있어서 지금까지 효과가 없었다. 서비스의 다른 버튼에는 이미 있다.
- 사용자 승인: 2026-11-26 — MODULAR Button을 지우고 서비스 Button 하나로 합치며, 위 두 가지 화면 차이(다시 시도 버튼 좌우 여백 24→32px, 눌림 축소 효과)를 받아들인다(«추천대로»)
- 이번 조각에서 하지 않는 것: `ds:check`(`scripts/ds-sync-check.mjs`)와 그 참조 정리, `.githooks/pre-commit`의 MODULAR 스토리 경고 블록 제거(→ 5-3c회차),
  `design-system/styles.css`에 남는 `ds-spin` 등 잔재(→ 9회차), jam-ds 스킬 정리(→ 10회차).

## 구현 계획

5-1회차 티켓(20261126_0002)의 공통 규칙(실제 설치 `npm ci --ignore-scripts`, 커밋 직후 `git status`, 문서 검사 우회 금지, push 금지)을 따른다.
변경 파일은 약 12개(삭제 3 포함)다.

1. **사용처 교체** — import를 `import Button from '@/components/ui/Button'`(ui 폴더 안에서는 `'./Button'`)으로 바꾼다.
   - `src/components/ui/EmptyState.tsx` 2행 import, 106행 `<Button variant="primary" onClick={action.onClick}>` → `surface="sub"`를 더한다.
   - `src/components/ui/BadgeRevealCarousel.tsx` 5행 import, 1015행 `<Button variant={selected ? 'outline' : 'secondary'} fullWidth aria-pressed … >`:
     props는 그대로 둔다. 서비스 Button은 나머지 props(`aria-*`·`data-*`·`tabIndex`·`onClick`)를 `<button>`에 그대로 넘긴다.
     secondary·outline은 두 구현의 면·글자·여백(`px-6 py-[13px]`, 테두리 1px, 높이 52px)이 같다.
   - `src/app/spike/badge-reveal/BadgeRevealSpikeClient.tsx` 5행 import, 181·198·212행: primary는 `surface="sub"`를 더해 색을 유지한다. secondary·`loading`은 그대로.
   - `src/components/ui/TopNavBar.stories.tsx` 5행 import, 86행 `size="sm"` → `size="xs"`(서비스에서 같은 조밀 크기의 이름).
   - `src/components/ui/BadgeRevealCarousel.stories.tsx` 5행 import, 511행(`fullWidth`·`loading`): primary가 있으면 `surface="sub"`.
2. **시험** — MODULAR 쪽 대조만 빼고 서비스 Button의 값 고정은 그대로 유지한다.
   - `src/components/ui/__tests__/buttonVariantPairs.test.tsx`: 28행 `DsButton` import와 그것을 렌더하는 사례(55행 헬퍼, 99행 «MODULAR light primary는 --accent», 200행 «MODULAR: 테두리 2px → 1px»,
     210행 describe «MODULAR surface="dark"»의 DsButton 사례, 260행 `Button.jsx` 소스 읽기)를 뺀다. 서비스 쪽 사례(변형별 면·글자·테두리 표, main/sub/dark, 1px 테두리와 높이,
     241행의 서비스 dark 토큰 쌍)는 서비스 Button만으로 같은 값을 계속 단언한다. 「서비스와 MODULAR가 같은 토큰이다」 같은 describe 이름과 머리 주석(4행)을 서비스 기준으로 고친다.
   - `src/components/ui/__tests__/surfaceColorPairs.test.tsx`: 17행 `DsButton` import와 «MODULAR Button … surface="dark"» 사례(43·50행)를 뺀다. 서비스 dark 값은 buttonVariantPairs가 고정한다.
     IconButton 사례(60행)는 이미 서비스 IconButton이므로 남긴다(describe 이름에서 «MODULAR»만 고친다).
   - `src/components/__tests__/dsLiteralColors.test.ts`: 이번에 `design-system/components/` 폴더가 통째로 사라져 `listJsx(COMPONENTS_DIR)`가 ENOENT로 실패한다.
     기준 폴더를 `src/components/ui`로 바꾸고 `MOVED_TO_SERVICE_UI` 목록(23개)만 검사하게 한다. 검사 규칙(색 리터럴 가드)과 `FILES.length` 하한(20 초과)은 그대로 둔다.
     머리 주석의 «`design-system/components/**/*.jsx`» 설명을 고친다.
3. **주석** — 코드 줄은 바꾸지 않는다.
   - `src/components/ui/Button.tsx` 7~8행(«MODULAR `Button.jsx`와 병존하는 쌍… 두 구현이 같은 값»), 20~21행(«MODULAR light primary와 같은 쌍», «MODULAR surface="dark"와 같은 쌍»),
     34행(«DS Button.jsx `size="sm"`과 동일 스펙»), 60행 주석(«MODULAR surface="dark"와 동일»), 98~101행(«DS Button.jsx의 'sm'과 동일하게»)을 서비스 단독 기준으로 고친다.
   - `.storybook/main.ts` 45행 «@ds/components/buttons/Button 형태로 import 가능» 주석. `@ds` 별칭 자체는 토큰·foundations가 쓰므로 유지한다.
4. **삭제**: `design-system/components/buttons/Button.jsx`·`Button.d.ts`·`Button.stories.tsx`를 `git rm`한다. 이로써 `design-system/components/`에는 파일이 남지 않는다.
   `scripts/ds-sync-check.mjs`의 `walk`는 없는 폴더를 건너뛰므로(477~485행) `ds:check`는 그대로 통과해야 한다. 통과하지 않으면 그 원인만 최소로 고치고 `summary`에 적는다(정리는 5-3c).
5. **확인**: `git grep -nE "buttons/Button|DsButton"`이 코드·시험·스토리·`.storybook`에서 0건(옛 기록 문서·`scripts/jam2-token-migrate.report.json`은 그대로 둔다).
   기준선(`scripts/ui-rules-baseline.json`·spacing)은 늘지 않아야 한다.

## 완료 조건

### 구현 범위 (게이트 판정 대상)
- MODULAR `Button.jsx`·`.d.ts`·`.stories.tsx`가 없고 `design-system/components/` 아래 파일이 0개다.
- 사용처 5곳(EmptyState·BadgeRevealCarousel·spike·스토리 2개)이 서비스 Button을 쓴다. EmptyState·spike primary는 `surface="sub"`다.
- 서비스 `Button.tsx`는 주석 외 변경이 없다. 다른 파일의 코드 변경은 import·`surface="sub"` 추가·스토리의 `size` 이름뿐이다.
- 버튼 대조 시험은 MODULAR 쪽만 빠지고 서비스 값 단언은 그대로 남는다. `dsLiteralColors` 시험이 23개 파일을 계속 검사한다.
- 위 5번 grep 0건, 기준선 증가 없음.
- 실제 설치본에서 `scripts/verify.sh` 전체 통과, `build-storybook` 성공.

## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
-

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: staging
- 커밋:

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|

### 주요 의사결정 / 핵심 메모
-

### 잔여 이슈
-
