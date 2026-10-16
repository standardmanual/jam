---
name: JAM!
description: 운동 보상 게이미피케이션 모바일 웹 — 크림 바탕 위 흰 카드와 테두리, 초록 강조색으로 이루어진 라이트 전용 시스템
---

# Design System: JAM!

값은 이 문서에 적지 않는다. 값의 원천은 `jam-web/design-system/tokens/*.css`이고, 결정 이력과
화면 규칙은 `docs/plan/jam2/11 JAM 2.0 디자인 시스템.md`(이하 문서 11)다. 이 문서는 어떤 토큰을
어디에 쓰는지만 적는다.

## Overview

크림 바탕(`--background`) 위에 흰 카드(`--surface`)를 테두리(`--border`)로 구분해 올리는 화면이다.
라이트 전용이고 다크 테마는 없다. 초록 강조색(`--accent`)은 버튼 같은 면 채우기에만 좁게 쓴다.
희귀도 4색(common·rare·epic·mystic)은 사용자가 이미 학습한 고정 신호 체계라 재매핑하지 않는다.

밀도는 촘촘한 그리드(배지 컬렉션·인벤토리) 쪽에 가깝고, 리스트 화면(미션·알림·활동 피드)은 여백 있는
카드 행으로 완화한다. 어드민(`/admin`)은 이 시스템 대상이 아니다. `[data-admin-theme]` 스코프로 격리된
별도 shadcn 테마를 쓴다.

**Key Characteristics:**
- 라이트 전용 고정 바탕, 그림자 없이 테두리로 구분하는 카드
- 희귀도 4색은 룩 앤 필이 아니라 데이터다
- 버튼·태그·탭바는 완전 캡슐(`rounded-full`)이 반복되는 실루엣이다
- 블러는 탭바만 쓴다. 나머지 크롬은 불투명이다

## Colors

컴포넌트는 Base 팔레트(`--base-white` 같은 이름)를 직접 참조하지 않고 아래 역할 토큰만 쓴다. 예외는 세 범주뿐이다: 이미지·지도 위 막이 `--base-black`을 섞는 곳, 그 막 위 오버레이 글자(`--base-white`), 시리얼 인장 면 재질(`--base-neutral-*`). 막과 오버레이 글자의 근거는 `docs/plan/jam2/11 JAM 2.0 디자인 시스템.md` 5.7절이다. 현재 목록은 `grep -rn "var(--base-" jam-web/src jam-web/design-system/components`로 확인한다.

- **바탕과 면:** `--background`(페이지 바탕), `--surface`(카드), `--background-secondary`(카드 안 구획),
  `--background-inverse`(반전 면), `--surface-transparent`(완전 투명)
- **글자:** `--foreground`(제목·필수 정보), `--muted`(설명·보조), `--link`(강조 글자·아이콘·선·포커스 링),
  `--snow`(반전 면 위 글자), `--accent-foreground`(accent 면 위 글자)
- **강조:** `--accent`는 면 채우기 전용이다. 크림 바탕 위 글자나 선으로 쓰면 읽히지 않으므로 `--link`를 쓴다.
  옅은 면은 `--accent-soft`와 `--accent-soft-hover`다.
- **accent-content:** `--accent-content-lightblue`·`--accent-content-green`·`--accent-content-yellow`·
  `--accent-content-red`·`--accent-content-pink`·`--accent-content-blue`는 면 채우기에만 쓴다. 선이나 점으로 쓰지 않는다.
- **선과 상태:** `--border`, `--field-border`, `--separator`, `--backdrop`, `--success`, `--warning`, `--danger`, `--default`

### Named Rules
**The Fixed Rarity Rule.** `--rarity-common`·`--rarity-rare`·`--rarity-epic`·`--rarity-mystic`은 재매핑하지 않는다.
칩 위 글자는 등급마다 정해진 짝(`--rarity-common-foreground` 같은 이름)을 쓴다.

**The Progress Rule.** 진행 상태 색은 두 층이다(문서 11 5.2절). 가는 선·점·링은 `--progress-short`(모자람),
`--progress-done`(다 채움·획득), `--progress-latest`(방금 들어옴), `--progress-track`(손대지 않음)이고, 면 채우기는
accent-content 계열이다. 진행 상태 색은 글자로 쓰지 않는다. 채움 스윕은 `--progress-sweep`이다.

**The Text On Surface Rule.** 이미지·영상·블롭·어두운 막 위 글자만 `--snow`를 쓰고 나머지는 `--foreground`·`--muted`·`--link`다.
불투명도로 글자색을 만들지 않는다(문서 11 5.7절). 상태 칩 색 매핑도 같은 절에 있다.

## Typography

**서체:** Noto Sans KR 하나(`--font-family-base`). 별도 display 서체 없이 굵기로 위계를 만든다.

- **크기와 행간:** `--text-xs`부터 `--text-5xl`까지가 쌍(`--text-xs--line-height` 같은 이름)이다. 클래스에서는 Tailwind 기본
  유틸리티(`text-xs`~`text-5xl`)를 쓰고, 인라인 style과 CSS에서는 변수를 읽는다.
- **굵기:** `font-normal`·`font-medium`·`font-semibold`·`font-bold` 네 단계를 쓴다. `font-extrabold`는 서비스가 쓰지 않는다.
- **자간:** 모든 단계에서 0이다. 제목의 마이너스 자간도, 라벨의 플러스 자간도 두지 않는다.
- **긴 글 행간:** `--leading-loose`(조건·설명 블록), `--leading-reading`(여러 문단 산문).

## Layout

모바일 웹 우선이다. 유저 화면의 컨테이너 최대 폭은 `src/app/(main)/layout.tsx`를 따르고, 새 시스템의 화면 분기값은 유저 화면에 쓰지
않는다(문서 11 0.1절). 간격 눈금은 `--spacing-4`부터 `--spacing-96`까지이며 이름이 값을 따른다. Tailwind 단계 번호(`p-4`)와
다르므로 클래스 안에서는 변수를 쓰지 않는다.

시맨틱 토큰은 `--layout-card-padding`(카드 내부), `--layout-section-gap`(섹션 사이), `--layout-element-gap`(요소 사이)다.
터치 타겟 최소는 `--touch-target-min`, iOS 하단 안전영역은 `--spacing-safe-bottom`이다. 그리드형 화면은 촘촘하게,
리스트형 화면은 카드 행 사이 여백으로 완화한다.

## Elevation & Depth

그림자가 없다. 카드는 흰 면(`--surface`)과 테두리(`--border`)만으로 크림 바탕에서 구분된다. 테두리가 없으면 카드가 보이지 않는다.
카드 안의 구획(`ListRowCard tone="tint"`, 썸네일 칸, 라벨 칩)은 `--background-secondary` 면에 테두리가 없고, 크림 바탕 위
단독 카드로는 쓰지 않는다(문서 11 5.1절). 어두운 반전 카드 톤은 선택 신호처럼 면이 어두워야 하는 곳에만 남는다.

예외는 두 가지다. 그림자는 입력창만 남긴다. 블러는 탭바(`--tabbar-blur`)만 남기고, 화면 전환 모션과 블롭 배경 캔버스에만
예외를 둔다(문서 11 5.7절). 모달 스크림은 블러 없이 `--backdrop`이다. 안쪽 링으로 그린 테두리는 그림자가 아니다.

## Shapes

반경 눈금은 `--radius-xs`에서 `--radius-4xl`까지와 `--radius-full`이다. 클래스는 Tailwind 기본 유틸리티를 쓴다.
카드는 `rounded-2xl`, 버튼·태그·탭바는 `rounded-full`이다. 입력창은 캡슐(`--field-radius`)이고 Textarea만 카드와 같은
`rounded-2xl`이다. 카드에는 캡슐 반경을 섞지 않는다. 버튼으로 읽히기 때문이다.

## Components

### RarityBadge (신호 컴포넌트)
- **역할:** 배지 희귀도 4단계를 나타내는 캡슐 칩이다. `BadgeGridCard`, 배지 상세, 컬렉션 카드가 공유하는 단일 컴포넌트
  (`design-system/components/cards/RarityBadge.jsx`)라 고치면 참조하는 모든 화면에 반영된다.
- **색:** 등급별 배경과 대비 안전 글자 쌍(Fixed Rarity Rule). 무한레벨형 배지는 `rarity`가 NULL이라 RarityBadge 대신 레벨 칩을 쓴다.

### Cards
- **BadgeGridCard:** 그리드 셀 카드. 썸네일, 이름, RarityBadge 또는 레벨 칩 순서다.
- **ListRowCard:** 리스트 행. `icon` / `title`+`subtitle` / `trailing` 3분할이다. `tone="default"`는 흰 면과 테두리로 크림 바탕 위에
  놓고, `tone="tint"`는 이미 카드 안에 들어간 행 전용이다.
- **ShapeTag:** 범용 칩. accent-content 6색을 인덱스로 순환한다. 글자는 항상 `--foreground`다.

### Buttons
변형 표는 문서 11 5.4절이다(`primary`·`secondary`·`danger`·`outline`·`ghost`). 모든 변형이 테두리를 가져 변형을 바꿔도 높이가
같다. 한 영역에 `primary`는 하나다. `danger` 위 글자는 흰색이 아니다.

### Navigation
- **TabBar:** 하단 고정, 항상 흰 필(`--tabbar-background`) + `--tabbar-blur`. 아이콘은 `--tabbar-icon`과 `--tabbar-icon-active`다.
- **TopNav:** 불투명 `--background` 면이고 구분선과 그림자가 없다. 로고는 `--foreground`로 칠한다.
- **BottomSheet:** 스크림은 `--backdrop`, 패널은 `--background`, 푸터는 `--surface`다.

## Do's and Don'ts

### Do:
- **Do** 크림 바탕을 유지하고 카드를 `--surface` + `--border`로 구분한다.
- **Do** `--accent`는 면 채우기에만 쓰고 강조 글자·아이콘·선은 `--link`를 쓴다.
- **Do** 카드는 `rounded-2xl`, 버튼과 태그는 `rounded-full`, 입력창은 `--field-radius`를 쓴다.
- **Do** 자간을 두지 않고 굵기는 400·500·600·700 중에서 고른다.
- **Do** 공유 컴포넌트(BadgeGridCard, ListRowCard, RarityBadge 등)의 시각 변경 전에 참조하는 모든 화면을 확인한다.

### Don't:
- **Don't** 다크 바탕이나 다크 테마를 만들지 않는다. 이 시스템은 라이트 전용이다.
- **Don't** accent 면 위에 흰 글자를 쓰지 않는다. `--accent-foreground`를 쓴다.
- **Don't** 카드에 캡슐 반경을 섞지 않는다.
- **Don't** 박스 섀도를 추가하지 않는다. 구분은 테두리와 면 색으로 한다.
- **Don't** 진행 상태 색(`--progress-short`·`--progress-done` 등과 `--warning`·`--success`)을 글자에 쓰지 않는다.
- **Don't** 희귀도 색을 취향으로 바꾸지 않는다.
- **Don't** 팔레트 밖의 색을 이유 문서화 없이 추가하지 않는다.
- **Don't** 어드민(`/admin`)에 이 시스템을 적용하지 않는다.
