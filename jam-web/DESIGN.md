---
name: JAM!
description: 운동 보상 게이미피케이션 모바일 웹 — 검정 캔버스 위 레드오렌지 액센트, 경계선만으로 뜨는 카드
colors:
  primary: "#e8461f"
  secondary: "#8a5a2e"
  bg: "#000000"
  surface: "#1a1a1a"
  surface-elevated: "#1f1f1f"
  bg-tint: "#222222"
  text: "#ffffff"
  text-secondary: "#b2b2b2"
  border: "#2a2a2a"
  border-light: "rgba(255, 255, 255, 0.3)"
  rarity-common: "#6b6b6b"
  rarity-rare: "#00cc7a"
  rarity-legend: "#f5a300"
  rarity-mythic: "#ff2d87"
typography:
  h1:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif"
    fontSize: "56px"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-1.4px"
  h3:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.28px"
  body:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.4px"
rounded:
  xs: "4px"
  sm: "8px"
  card: "16px"
  pill: "9999px"
spacing:
  4: "4px"
  8: "8px"
  12: "12px"
  16: "16px"
  24: "24px"
  32: "32px"
  48: "48px"
  64: "64px"
components:
  rarity-badge:
    backgroundColor: "{colors.rarity-common}"
    textColor: "#ffffff"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "{spacing.24}"
  list-row-card:
    backgroundColor: "{colors.surface-elevated}"
    rounded: "{rounded.card}"
    padding: "{spacing.16}"
---

# Design System: JAM!

## Overview

**Creative North Star: "The Night Vitrine"** — 배지·아이템이 어두운 진열장 속에서 자체 발광하듯
떠 보이는 화면. 캔버스는 항상 검정(다크 전용 고정, 라이트 모드 없음)이고, 카드는 그림자가 아니라
한 단계 밝은 회색 면(#1a1a1a → #1f1f1f)과 1px 인셋 보더만으로 캔버스 위에서 구분된다. 레드오렌지
(`#e8461f`)는 액션·강조에만 좁게 쓰이고, 희귀도 4색(common 회색/rare 초록/legend 앰버/mythic
핑크)은 사용자가 이미 학습한 고정 신호 체계라 절대 재매핑하지 않는다.

밀도는 촘촘한 그리드(배지 컬렉션·인벤토리 50슬롯) 쪽에 가깝지만, 리스트 화면(미션·알림·활동
피드)은 여백 있는 카드형 로우로 완화된다. 어드민(`/admin`)은 이 시스템 대상이 아니고 별도
shadcn 스코프(`[data-admin-theme]`)로 격리된 라이트 테마를 쓴다.

**Key Characteristics:**
- 다크 전용 고정 캔버스, 그림자 없는 인셋 보더 엘리베이션
- 희귀도 4색은 불변의 기능적 색 언어 — 룩 앤 필이 아니라 데이터
- 필/캡슐 형태(radius-pill)가 태그·배지·버튼 전반의 반복 실루엣
- TabBar만 예외적으로 반투명 흰 필 + blur(Apple HIG materials 원칙), 그 외 크롬은 불투명

## Colors

검정 캔버스 위에 레드오렌지 액센트 하나, 브라운 보조색 하나, 회색조 뉴트럴 스케일로 구성된
절제된 팔레트. 희귀도 4색은 팔레트가 아니라 별도의 기능적 신호 체계로 분리해서 다룬다.

### Primary
- **레드오렌지 (`#e8461f`)**: 주요 CTA, 강조 텍스트/아이콘, 선택 상태. 화면당 좁게만 등장.

### Secondary
- **브라운 (`#8a5a2e`)**: 보조 태그·세컨더리 강조. Primary보다 낮은 빈도.

### Neutral
- **캔버스 블랙 (`#000000`)**: 페이지 배경(`--color-bg`), `html`/`body` 기본값.
- **카드 그레이 (`#1a1a1a`)**: 기본 카드/떠 있는 면(`--color-surface`).
- **엘리베이트 그레이 (`#1f1f1f`)**: 카드 위에 한 번 더 뜨는 면(`--color-surface-elevated`,
  ListRowCard가 씀) — 보더 제거 이후 배경톤만으로 단차를 표현하는 신규 레벨.
- **틴트 그레이 (`#222222`)**: `--color-bg-tint`, surface와 별개의 은은한 강조 배경.
- **화이트 텍스트 (`#ffffff`)**: 1차 텍스트.
- **세컨더리 텍스트 (`#b2b2b2`)**: 2차 텍스트, 검정 위 4.6:1 (WCAG AA).
- **보더 그레이 (`#2a2a2a`)**: 기본 구분선(`--color-border`).
- **화이트 보더 30% (`rgba(255,255,255,0.3)`)**: 다크 캔버스 위 아웃라인 버튼·보더용.

### Named Rules (optional, powerful)
**The Fixed Rarity Rule.** 희귀도 4색(common `#6b6b6b`, rare `#00cc7a`, legend `#f5a300`,
mythic `#ff2d87`)은 절대 재매핑하지 않는다. 사용자가 이미 학습한 색 언어이며, 팔레트 취향이 아니라
기능(데이터 신호)이다.

## Typography

**Body/Display Font:** Pretendard Variable (Pretendard, -apple-system, BlinkMacSystemFont,
system-ui, Roboto, sans-serif 폴백)

**Character:** 한글 가변 폰트 하나로 display부터 caption까지 전 스케일을 커버 — 별도 display
서체 없이 굵기(300~900)와 자간으로 위계를 만든다.

### Hierarchy
- **Display** (300, 96px, 1.08): 히어로 순간 전용(거의 안 씀)
- **Bold Display** (900, 72px, 1.0): 히어로 스탯·큰 콜아웃 숫자
- **H1** (600, 56px, 1.08): 최상위 헤딩
- **H2** (600, 44px, 1.1) / **H3** (500, 28px, 1.2, = `--text-heading-sm` 카드·섹션 헤딩) /
  **H4** (500, 24px, 1.3)
- **Body** (400, 16px, 1.5): 본문. **Body L** (20px)/ **Small** (14px) 변형 존재
- **Caption** (700, 12px, 1.4, `tracking-label` 0.4px 대문자): 라벨용 — ShapeTag·RarityBadge 텍스트가
  이 스케일

### Named Rules (optional)
**The One Label Weight Rule.** 캡션 스케일은 항상 700 굵기 + 대문자 + 0.4px 자간 — 라벨·칩류
텍스트 전용 규약이며 본문 강조에 전용하지 않는다.

## Layout

모바일 웹 우선(유저 화면 전부), 어드민만 데스크탑 우선 별도 스코프. 4px 배수 스페이싱
스케일(4/8/12/16/24/32/48/64px). 시맨틱 레이아웃 토큰: 카드 내부 패딩 24px
(`--layout-card-padding`), 섹션 간 간격 48px(`--layout-section-gap`), 요소 간 간격
16px(`--layout-element-gap`). 터치 타겟 최소 44px(iOS HIG), iOS 세이프에어리어
하단 여백 자동 확보(`--spacing-safe-bottom`). 그리드형 화면(배지 컬렉션, 인벤토리 50슬롯,
컬렉션 슬롯)은 촘촘하게, 리스트형 화면(미션, 알림, 프로필 피드)은 카드 로우 사이 여백으로
완화한다.

## Elevation & Depth

그림자 없음. 카드 구분은 순수하게 배경톤 단차(블랙 → 그레이800 → 그레이1f1f1f)와 1px 인셋
보더로만 표현한다(`--shadow-subtle: inset 0 0 0 1px var(--color-border)`) — 드롭섀도는 금지.
유일한 예외는 재질감(material) 레이어: TabBar는 항상 반투명 흰 필 + 무거운 blur(20px,
`--blur-chrome`), BottomSheet 등 모달 백드롭은 가벼운 blur(8px, `--blur-scrim`) — Apple HIG
materials 원칙을 좁게 차용.

### Named Rules (optional)
**The Flat-By-Default Rule.** 표면은 정지 상태에서 항상 평평하다. 단차는 배경톤과 인셋 보더로만,
그림자는 절대 등장하지 않는다. TabBar/BottomSheet의 blur는 예외가 아니라 "재질"이라는 별도
카테고리다.

## Shapes

4단 반경 스케일이 단조 증가(`xs 4px < sm 8px < card 16px < pill 9999px`)한다. `xs`는 헤어라인용
(구분선, 내부 썸네일), `sm`은 인풋·작은 칩, `card`는 카드 표면, `pill`은 버튼·태그·RarityBadge 등
완전 캡슐형 — 필/캡슐 실루엣이 인터랙티브 요소 전반에서 반복되는 서명 형태다.

## Components

### RarityBadge (신호 컴포넌트)
- **역할:** 배지 희귀도 4단계를 나타내는 작은 대문자 필. `BadgeGridCard`, 배지 상세 히어로,
  컬렉션 그리드 카드 등 여러 화면이 공유해서 참조하는 단일 컴포넌트
  (`design-system/components/cards/RarityBadge.jsx`) — 이 컴포넌트를 고치면 참조하는 모든
  화면에 동시 반영된다.
- **Shape:** `radius-pill`(완전 캡슐), padding `6px 14px`
- **색상:** 희귀도별 고정 배경 + 대비 안전 텍스트 페어(위 Fixed Rarity Rule)
- **타이포:** caption 스케일(12px, 700, 대문자, `tracking-label`)
- **배치 관례:** `BadgeGridCard`는 썸네일 아래 `h-6` 고정 높이 슬롯 안에 중앙 정렬로 배치해
  칩 유무와 무관하게 카드 높이가 흔들리지 않게 한다 — 칩을 숨기는 변형에서도 이 고정 슬롯
  높이는 유지하거나, 슬롯 자체를 접을지 여부를 화면 단위로 판단해야 한다.

### ShapeTag
- **역할:** RarityBadge와 같은 필 형태를 공유하는 범용 칩(월드관·카테고리 태그 등),
  인덱스 기반 8색 팔레트(`--color-tag-1..8`)를 순환

### Cards / Containers
- **BadgeGridCard:** 그리드 셀 카드 — `bg-surface`, `radius-card`, 내부 패딩 12px, 썸네일 90×90,
  RarityBadge를 고정 높이 슬롯에 배치 후 이름 텍스트
- **ListRowCard:** 리스트 로우 카드 — `bg-surface-elevated`(카드보다 한 단계 밝음), `radius-card`,
  내부 패딩 16px, `icon` / `title`+`subtitle` / `trailing` 3분할 flex 레이아웃. 희귀도 칩은
  고정 슬롯이 없고 `subtitle`/`trailing` 자유 콘텐츠로 흘러들어가므로, 칩을 없애면 인접
  텍스트의 세로 정렬·간격을 화면마다 재확인해야 한다.
- **Shadow Strategy:** 위 Elevation 참조 — 그림자 없음, 배경톤 단차만

### Navigation
- **TabBar:** 화면 하단 고정, 반투명 흰 필(`--color-chrome-bg-inverse`) + `--blur-chrome`,
  비활성 아이콘은 흰 필 위 검정 고정(`--color-text-inverse`, 테마 무관)

## Do's and Don'ts

### Do:
- **Do** 희귀도 4색 매핑을 고정값으로 유지한다 — common/rare/legend/mythic 색은 절대 재정의하지 않는다.
- **Do** 카드 구분을 배경톤 단차 + 1px 인셋 보더로 표현한다.
- **Do** RarityBadge·ShapeTag·버튼 등 인터랙티브 필 요소는 `radius-pill`(완전 캡슐)을 쓴다.
- **Do** 공유 카드 컴포넌트(BadgeGridCard, ListRowCard 등)의 시각 변경 전, 그 컴포넌트를
  참조하는 모든 화면 목록을 먼저 확인한다.

### Don't:
- **Don't** 드롭섀도를 쓰지 않는다(TabBar/BottomSheet의 재질 blur는 예외 카테고리).
- **Don't** 희귀도 색을 룩앤필 취향으로 바꾸지 않는다 — 사용자 학습된 데이터 신호다.
- **Don't** 어드민(`/admin`) 화면에 이 시스템(MODULAR)을 적용하지 않는다 — 별도 shadcn 스코프.
