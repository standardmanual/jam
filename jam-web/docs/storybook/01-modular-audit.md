# MODULAR Storybook Audit

> **기준일:** 2026-08-16  
> **분석 경로:** `jam-web/design-system/` (MODULAR) + `jam-web/src/` (서비스)  
> **iCloud 중복 제외:** `파일명 2.*`, `파일명 3.*` 형태 파일 전체 분석 제외  
> **코드 수정 없음** — 현재 구현을 사실 그대로 기록

---

## 1. MODULAR Overview

### 아키텍처 위치

```
MODULAR (jam-web/design-system/)
  역할: 참조 구현체 (Reference Implementation)
  형태: JSX + .d.ts + CSS 토큰 + HTML 가이드라인 카드 + dashboard.html
  소비: 서비스는 런타임 import 없이 동일 CSS 토큰 네임스페이스를 공유

서비스 (jam-web/src/components/ui/)
  역할: 실제 프로덕션 컴포넌트 (Next.js + Tailwind)
  토큰 참조: globals.css에서 MODULAR와 동일 토큰명 선언 후 사용

Storybook (jam-web/.storybook/)
  상태: 설치 완료 (v10.5.8, @storybook/nextjs-vite)
  MODULAR 연결: 미완성 (preview.tsx 토큰 미연결, stories 0개)
```

### MODULAR 루트 파일 목록

| 파일 | 역할 | 분류 |
|------|------|------|
| `dashboard.html` | 컴포넌트 카드 뷰어 (독립 실행) | KEEP → STORYBOOK 전환 예정 |
| `Canvas.dc.html` | 대형 캔버스 뷰 | DECISION REQUIRED |
| `thumbnail.html` | 썸네일 렌더링 | KEEP |
| `styles.css` | 토큰 통합 import 엔트리 | KEEP + STORYBOOK |
| `_ds_manifest.json` | 컴포넌트·토큰 레지스트리 | KEEP + STORYBOOK |
| `_ds_bundle.js` | dashboard용 번들 JS | KEEP |
| `_adherence.oxlintrc.json` | MODULAR 준수 lint 규칙 | KEEP (**⚠ 내용 불일치 — §7 참고**) |
| `SKILL.md` | Claude 스킬 정의 (시각 목업·프로토타입) | KEEP |
| `github.md` | MODULAR 출처 메모 | KEEP |
| `readme.md` | 사용 가이드 | KEEP |
| `support.js` | dashboard 지원 스크립트 | KEEP |

---

## 2. Token Inventory

### 2.1 색상 토큰 (`tokens/colors.css`)

| 레이어 | 변수 | 값 |
|--------|------|----|
| **Base** | `--color-base-white` | `#ffffff` |
| | `--color-base-black` | `#000000` |
| | `--color-base-red` | `#e8461f` |
| | `--color-base-brown` | `#8a5a2e` |
| | `--color-base-grey-200` | `rgb(234,232,226)` |
| | `--color-base-grey-500` | `#666666` |
| | `--color-base-grey-700` | `#2a2a2a` |
| | `--color-base-grey-800` | `#1a1a1a` |
| | `--color-base-amber` | `#ffb800` |
| **Semantic** | `--color-bg` | `var(--color-base-black)` |
| | `--color-bg-inverse` | `var(--color-base-white)` |
| | `--color-surface` | `var(--color-base-grey-800)` |
| | `--color-primary` | `var(--color-base-red)` |
| | `--color-secondary` | `var(--color-base-brown)` |
| | `--color-text` | `var(--color-base-white)` |
| | `--color-text-secondary` | `#9a9a9a` ⚠ |
| | `--color-text-on-primary` | `var(--color-base-white)` |
| | `--color-border` | `var(--color-base-grey-700)` |
| **Rarity** | `--color-rarity-common` | `#6b6b6b` |
| | `--color-rarity-rare` | `#00cc7a` |
| | `--color-rarity-legend` | `#f5a300` |
| | `--color-rarity-mythic` | `#ff2d87` |
| **Tags** | `--color-tag-1` ~ `--color-tag-8` | red / brown / legend / rare / mythic / #d6f24a / #4a4a4a / #c9663f |

> **⚠ `--color-text-secondary`**: MODULAR=`#9a9a9a` vs 서비스=`#b2b2b2` — 불일치

### 2.2 타이포그래피 토큰 (`tokens/typography.css`)

| 토큰 | 크기 | weight | leading | tracking |
|------|------|--------|---------|---------|
| `--text-display` | 96px | 300 | 1.08 | -2.4px |
| `--text-h1` | 56px | 600 | 1.08 | -1.4px |
| `--text-h2` | 44px | 600 | 1.1 | -1.1px |
| `--text-h3` | 28px | 500 | 1.2 | -0.28px |
| `--text-h4` | 24px | 500 | 1.3 | -0.24px |
| `--text-body-l` | 20px | 400 | 1.4 | — |
| `--text-body` | 16px | 400 | 1.5 | — |
| `--text-small` | 14px | 400 | 1.43 | — |
| `--text-caption` | 12px | 400 | 1.4 | — |
| `--text-bold-display` | 72px | 900 | 0.95 | -2px |
| `--text-bold-lg` | 40px | 900 | 1.0 | — |

> **⚠ 폰트 패밀리**: MODULAR=`"Noto Sans KR"` vs 서비스 globals.css=`"Pretendard Variable"` — **중요한 불일치** (§7 참고)

### 2.3 간격 토큰 (`tokens/spacing.css`)

`--spacing-4 / 8 / 12 / 16 / 24 / 32 / 48 / 64` (4px 기반)  
`--touch-target-min: 44px` (iOS HIG)

### 2.4 반경 토큰 (`tokens/radius.css`)

| 토큰 | 값 | 별칭 |
|------|----|----|
| `--radius-xs` | 4px | `--radius-subtle` |
| `--radius-sm` | 8px | `--radius-input` |
| `--radius-md` | 12px | `--radius-button` |
| `--radius-card` | 10px | — |
| `--radius-pill` | 9999px | — |

> **⚠ 반경 불일치**: 서비스 globals.css의 `--radius-card: 16px` vs MODULAR `--radius-card: 10px`

### 2.5 모션 토큰 (`tokens/motion.css`)

| 토큰 | 값 |
|------|-----|
| `--duration-quick` | 150ms |
| `--duration-fast` | 250ms |
| `--duration-medium` | 350ms |
| `--duration-slow` | 400ms |
| `--duration-very-slow` | 500ms |
| `--ease-smooth-out` | cubic-bezier(0.22,1,0.36,1) |
| `--ease-bounce` | cubic-bezier(0.34,1.36,0.64,1) |
| `--ease-out` | ease-out |
| `--scale-press` | 0.96 |
| `--scale-modal` | 0.96 |

### 2.6 폰트 로딩 (`tokens/fonts.css`)

지침 전용 파일 — `@font-face` 없음. Next.js = `next/font/google (Noto_Sans_KR)` 방식 권장.

### 2.7 서비스 전용 토큰 (MODULAR에 없는 것)

서비스 `globals.css`에만 존재:

```
--color-main: #0033e5
--color-sub: #f0f7ff
--color-jam-*: orange / lime / teal / pink / purple / yellow / cream (7종)
--color-bg-tint: #222222
--color-overlay: rgba(0,0,0,0.6)
--color-border-light: rgba(255,255,255,0.3)
--color-border-inverse: rgba(0,0,0,0.12)
--color-icon-inactive: #2a2a2a
--color-rarity-*-text (4종 — 레어리티별 텍스트 색)
--radius-tags / --radius-cards / --radius-buttons / --radius-nav-buttons / --radius-pill-buttons
--text-body-sm / --text-subheading / --text-heading-sm / --text-heading / --text-heading-lg
```

---

## 3. Component Inventory

### 3.1 Buttons (2개)

#### `Button`
| Prop | 타입 | 기본값 |
|------|------|--------|
| `variant` | `'primary' \| 'secondary' \| 'ghost'` | `'primary'` |
| `surface` | `'light' \| 'dark'` | — |
| `fullWidth` | `boolean` | false |
| `disabled` | `boolean` | false |
| `loading` | `boolean` | false |
| `type` | `'button' \| 'submit' \| 'reset'` | — |

**prompt.md 예시:** `<Button variant="primary">드랍하러 가기</Button>`

#### `IconButton`
| Prop | 타입 | 필수 |
|------|------|------|
| `icon` | `'chevron-left' \| 'chevron-right' \| 'close' \| 'check' \| 'info' \| 'search' \| 'menu'` | — |
| `label` | `string` | **필수** |
| `surface` | `'light' \| 'dark'` | — |

---

### 3.2 Cards (4개)

#### `Card`
| Prop | 타입 |
|------|------|
| `tone` | `'default' \| 'tint' \| 'inverse'` |
| `onClick` | `MouseEventHandler` |

#### `BadgeFrame`
| Prop | 타입 | 기본값 |
|------|------|--------|
| `shape` | `'circle' \| 'ticket-v' \| 'ticket-h' \| 'scallop' \| 'corner-cut' \| 'tab-notch' \| 'dumbbell'` | — |
| `width` | `number` | 200 |
| `height` | `number` | 200 |
| `color` | `string` | `var(--color-primary)` |

#### `RarityBadge`
`rarity: 'common' | 'rare' | 'legend' | 'mythic'`

#### `ShapeTag`
| Prop | 타입 | 비고 |
|------|------|------|
| `shape` | `'rect' \| 'pill' \| 'circle' \| 'dome' \| 'triangle' \| 'flag' \| 'hex'` | — |
| `colorIndex` | `number` | 0~7 |
| `color` | `string` | 직접 지정 |
| `faction` | `string` | 팩션명 → 자동 매핑 |
| `surface` | `'light' \| 'dark'` | ⚠ v2에서 `dark: boolean` 대체 |

---

### 3.3 Feedback (5개)

#### `EmptyState`
`icon?, title?, description?, action?: { label, onClick }`

#### `ModalToast`
`message, type: 'success'|'error'|'info', open?, onDismiss?, iconSlot?`

#### `Skeleton`
`width?, height?, borderRadius?`

#### `Toast`
`message, type: 'success'|'error'|'info', open?, onDismiss?`

#### `WanderingEyesLoader`
`duration?, eyeColor?, pupilColor?`

---

### 3.4 Forms (4개)

공통: `state?: 'default' | 'error' | 'success'`

- `Checkbox`: checked, onChange, label, state
- `Input`: value, onChange, type, id, name, aria-label, aria-describedby, state, disabled
- `Select`: options: `Array<{value, label}>`, value, state
- `Textarea`: value, onChange, rows, state

---

### 3.5 Navigation (5개)

- `Accordion`: `items: Array<{title, content, defaultOpen?}>` (단일 열림)
- `BottomSheet`: `open (필수), onDismiss?, title?`
- `SlidingTabs`: `tabs: Array<{key, label}>, active?, onChange?`
- `TabBar`: `active: 'today'|'badges'|'drops'|'missions'|'inventory'|'profile', onChange?`
- `TopNav`: `title?, showBack?, onBack?, rightSlot?`

---

### 3.6 Patterns (3개)

- `BadgeGridCard`: `name, imageUrl?, rarity?, href|onClick, earned?, undiscovered?, selected?`
- `CollectionGridCard`: `name, imageUrl?, collected, total, completed?, href|onClick`
- `ListRowCard`: `icon?, title?, subtitle?, trailing?, href|onClick`

---

### 3.7 Manifest 등록 현황

| 상태 | 컴포넌트 목록 |
|------|--------------|
| ✅ 등록 (15개) | Button, IconButton, BadgeFrame, Card, RarityBadge, ShapeTag, ModalToast, Toast, WanderingEyesLoader, Input, TabBar, TopNav, BadgeGridCard, ListRowCard, CollectionGridCard |
| ❌ 미등록 (8개) | **EmptyState, Skeleton, Checkbox, Select, Textarea, Accordion, BottomSheet, SlidingTabs** |

---

## 4. Component Usage (실제 서비스 사용 현황)

서비스는 MODULAR를 직접 import하지 않는다. 동일한 컴포넌트 개념을 `@/components/ui/`에 독립 구현한다.

| MODULAR | 서비스 경로 | 사용 | Props 차이 |
|---------|-------------|------|-----------|
| Button | `@/components/ui/Button.tsx` | 주력 | variant: secondary→**outline** 이름 다름 |
| Card | `@/components/ui/Card.tsx` | 주력 | tone: white→**default** (v2 변경) |
| TabBar | `@/components/ui/TabBar.tsx` | layout.tsx | 6탭 고정, 구조 동일 |
| BadgeGridCard | `@/components/ui/BadgeGridCard.tsx` | 주력 | props 구조 거의 동일 |
| CollectionGridCard | `@/components/ui/CollectionGridCard.tsx` | 있음 | props 구조 거의 동일, **하드코딩 있음** |
| ListRowCard | `@/components/ui/ListRowCard.tsx` | 있음 | 구조 동일 |
| BottomSheet | `@/components/ui/BottomSheet.tsx` | 있음 | 구조 유사 |
| SlidingTabs | `@/components/ui/SlidingTabs.tsx` | 있음 | 구조 유사 |
| Toast | `@/components/ui/Toast.tsx` | 주력 | **ToastProvider + useToast Context** 패턴 (단순 prop과 다름) |
| TopNav | `@/components/ui/TopNav.tsx` | 있음 | **`backHref?: string` 추가 prop** |
| RarityBadge | `@/components/ui/Badge.tsx` | 있음 | **이름 다름** |
| WanderingEyesLoader | `@/components/ui/WanderingEyesLoader.tsx` | 있음 | **기본값 하드코딩** (§7 참고) |
| Accordion | `@/components/ui/accordion.tsx` | admin만 | **Radix UI 기반 shadcn** — 완전히 다른 구현 |

---

## 5. Service-only UI (MODULAR에 없는 서비스 UI)

### 5.1 서비스 전용 공유 컴포넌트

| 파일 | 역할 | Storybook 후보 |
|------|------|----------------|
| `icons.tsx` | 아이콘 세트 (SVG 컴포넌트 집합) | ✅ |
| `LoadingSpinner.tsx` | 범용 로딩 스피너 | ✅ |
| `PopInNumber.tsx` | 숫자 팝인 애니메이션 | ✅ |
| `SwapText.tsx` | 텍스트 교체 애니메이션 | ✅ |
| `Footer.tsx` | 앱 푸터 | — |
| `dotm-hex-8.tsx` | 헥사 도트 매트릭스 로더 | ✅ |
| `dotm-square-3.tsx` | 3×3 스퀘어 도트 로더 | ✅ |
| `NavigationLoader.tsx` | WanderingEyes 래퍼 | — |
| `wandering-eyes.css` | WanderingEyes CSS 모듈 | — |

### 5.2 서비스 전용 도메인 컴포넌트

| 파일 | 역할 | 분류 |
|------|------|------|
| `InventoryGrid.tsx` | 인벤토리 아이템 그리드 | SERVICE-SPECIFIC |
| `MapView.tsx` | Leaflet 지도 뷰 | SERVICE-SPECIFIC |
| `StravaStatusCard.tsx` | Strava 연결 상태 카드 | SERVICE-SPECIFIC |
| `StravaLink.tsx` | Strava OAuth 링크 | SERVICE-SPECIFIC |
| `LocalDate.tsx` | 로케일 날짜 포맷터 | SERVICE-SPECIFIC |
| `transitions-pages.ts/.css` | 페이지 진입/퇴장 트랜지션 | SERVICE-SPECIFIC |
| `transitions.css` | 공유 트랜지션 CSS | SERVICE-SPECIFIC |

### 5.3 Admin 전용 컴포넌트 (DS 적용 대상 외)

`src/components/admin/` 전체 — **어드민은 DS 패턴 적용 대상 아님** (프로젝트 정책)

### 5.4 shadcn 컴포넌트 (admin 전용)

| 파일 | 사용처 |
|------|--------|
| `shadcn-button.tsx` | admin 페이지 5개 |
| `shadcn-card.tsx` | admin ItemBook, POI |
| `shadcn-badge.tsx` | admin ItemBook, POI |
| `sheet.tsx` | AdminNav (모바일 사이드바) |
| `accordion.tsx` | AdminNav, AdminSidebar |
| `dialog.tsx`, `table.tsx`, `tabs.tsx`, `checkbox.tsx`, `select.tsx`, `input.tsx`, `textarea.tsx`, `alert.tsx` | admin 내부 |

---

## 6. MODULAR-only UI (서비스에서 사용 안 하는 MODULAR)

| 컴포넌트 | 서비스 대응 없음 이유 |
|----------|----------------------|
| `BadgeFrame` | 서비스에서 clip-path 직접 구현 또는 미구현 상태 |
| `ShapeTag` | 서비스에서 미구현 |
| `EmptyState` | 페이지별 인라인 Empty State |
| `Skeleton` | 페이지별 인라인 Skeleton |
| `Checkbox` (MODULAR) | admin은 shadcn `checkbox.tsx` 사용, 서비스는 네이티브 |
| `Select` (MODULAR) | admin은 shadcn `select.tsx`, 서비스는 네이티브 |
| `Textarea` (MODULAR) | admin은 shadcn `textarea.tsx`, 서비스는 네이티브 |
| `Accordion` (MODULAR) | admin은 shadcn Radix Accordion 사용 |

**guidelines/** 전체 (14개 HTML 파일) — 서비스에서 사용 없음, MODULAR 독립 문서

---

## 7. Inconsistencies (불일치)

### 7.1 linter 규칙 (`_adherence.oxlintrc.json`) vs `.d.ts` 불일치

| 컴포넌트 | linter 규칙 | .d.ts 실제 | 비고 |
|----------|-------------|------------|------|
| `Card.tone` | `'white' \| 'tint' \| 'inverse'` | `'default' \| 'tint' \| 'inverse'` | v2에서 `white` 제거, `default` 로 교체 — linter 미갱신 |
| `ShapeTag` | `dark` prop 허용 | `surface: 'light' \| 'dark'` | v2에서 `dark: boolean` → `surface` 교체 — linter 미갱신 |
| `ModalToast` | `iconSlot` 허용 안 함 | `iconSlot?: ReactNode` | linter 미갱신 |
| `Input` | `id, name, aria-*, state, disabled` 허용 안 함 | 모두 있음 | linter가 최초 props만 반영 |
| `Card` | `padding, radius` 허용 | .d.ts에 없음 | linter가 구버전 API 반영 |

### 7.2 토큰 불일치 (MODULAR vs 서비스 globals.css)

| 토큰 | MODULAR | 서비스 | 비고 |
|------|---------|--------|------|
| `--font-family-base` | `"Noto Sans KR"` | `"Pretendard Variable"` | **다른 폰트** |
| `--color-text-secondary` | `#9a9a9a` | `#b2b2b2` | 밝기 다름 |
| `--radius-card` | `10px` | `16px` | 서비스가 더 큰 반경 |
| `--color-surface-card` | MODULAR token 목록에 포함 | globals.css에 없음 | adherence.json에는 있으나 colors.css에 없음 |
| `--color-surface-tint` | adherence에 있음 | globals.css에 없음 | 동일 |
| `--color-text-tertiary` | adherence에 있음 | globals.css에 없음 | 동일 |
| `--color-white`, `--color-black` | adherence에 있음 | globals.css에 없음 | 동일 |

### 7.3 서비스 컴포넌트 Props 불일치

| 컴포넌트 | MODULAR | 서비스 | 비고 |
|----------|---------|--------|------|
| `Button.variant` | `primary \| secondary \| ghost` | `primary \| outline \| ghost \| text` | `secondary` → `outline`, `text` 추가 |
| `Card.tone` | `default \| tint \| inverse` | 서비스에서 `white` 도 여전히 사용 가능 | 마이그레이션 중 |
| `TopNav` | `title?, showBack?, onBack?, rightSlot?` | `title (필수), showBack?, onBack?, backHref?, rightSlot?, style?` | `backHref` 추가 |
| `Toast` | 단순 prop 방식 | Context/Provider 패턴 | 구조적 차이 |

### 7.4 하드코딩 토큰 미준수 (원칙: DS 토큰만 사용)

| 파일 | 위치 | 하드코딩 값 | 올바른 토큰 |
|------|------|-------------|-------------|
| `WanderingEyesLoader.tsx` | L47-48 | `eyeColor='#f8fafc'`, `pupilColor='#0f172a'` | `var(--color-bg-inverse)`, `var(--color-text-inverse)` |
| `wandering-eyes.css` | L19, L37 | `#f8fafc`, `#0f172a` | 동일 |
| `CollectionGridCard.tsx` | L50, L62 | `bg-[#E8461F]` (2곳) | `var(--color-primary)` |
| `MissionsListClient.tsx` | L26-34 | `#1A1A1A`, `#2A2A2A`, `#B2B2B2`, `#E8461F`, `#FFFFFF` (7개) | 토큰 대체 가능 |
| `MissionDetailClient.tsx` | L32-35 | `#fff`, `#000` (rarity text) | `var(--color-rarity-*-text)` |
| `error.tsx` | L15 | `bg-[#0A0A0A]` | `var(--color-bg)` |
| `forbidden/page.tsx` | L5, L10 | `bg-[#0A0A0A]`, `#AEEA00` | `var(--color-bg)` + 신규 토큰 필요 |
| `layout.tsx` | L27 | `themeColor: "#000000"` | metadata 값, 예외 허용 |

---

## 8. Documentation Gaps

### 8.1 문서에는 있지만 코드에 없는 것

| 항목 | 문서 위치 | 내용 |
|------|-----------|------|
| `--color-surface-card` | `_adherence.oxlintrc.json` tokens | `colors.css`에 정의 없음 |
| `--color-surface-tint` | 동일 | `colors.css`에 정의 없음 |
| `--color-text-tertiary` | 동일 | `colors.css`에 정의 없음 |
| `--color-white`, `--color-black` | 동일 | `colors.css`에 정의 없음 |
| Card `padding`, `radius` props | `_adherence.oxlintrc.json` | `Card.d.ts`에 없음 |

### 8.2 코드에는 있지만 문서에 없는 것

| 항목 | 코드 위치 | 내용 |
|------|-----------|------|
| `EmptyState, Skeleton, Checkbox, Select, Textarea, Accordion, BottomSheet, SlidingTabs` | `design-system/components/` | Manifest 미등록 |
| `TopNav.backHref` prop | `src/components/ui/TopNav.tsx` | MODULAR `.d.ts`에 없음 |
| `Button` variant `text`, `outline` | `src/components/ui/Button.tsx` | MODULAR 문서에 없음 |
| `Toast` Context 패턴 | `src/components/ui/Toast.tsx` | MODULAR에 문서화 없음 |
| `--color-jam-*` 토큰 7종 | `globals.css` | MODULAR에 없음 |
| `--color-rarity-*-text` 4종 | `globals.css` | MODULAR에 없음 |
| `--radius-buttons / pill-buttons / nav-buttons` | `globals.css` | MODULAR는 `--radius-button` 하나만 |
| `dotm-hex-8.tsx`, `dotm-square-3.tsx` | `src/components/ui/` | 특수 로더 2종 — 어디에도 문서 없음 |

### 8.3 실제 구현과 문서가 다른 것 (요약)

→ §7에 상세 기술. 핵심:
- `Card.tone`: 문서/코드=`'default'`, linter=`'white'`
- `ShapeTag.surface`: 문서/코드=`surface`, linter=`dark`
- 폰트 패밀리: MODULAR=Noto Sans KR, 서비스=Pretendard Variable

---

## 9. Storybook Candidates

### 9.1 즉시 Story 작성 가능 (API 확인됨)

| 컴포넌트 | 우선순위 | 주요 시나리오 |
|----------|---------|--------------|
| `Button` | 🔴 1순위 | primary/secondary/ghost × light/dark, loading, disabled |
| `BadgeGridCard` | 🔴 1순위 | earned/undiscovered/selected × 4 rarity |
| `TabBar` | 🔴 1순위 | 6개 탭 × active 상태 |
| `Toast` | 🟠 2순위 | success/error/info, auto-dismiss |
| `ModalToast` | 🟠 2순위 | type × iconSlot 유무 |
| `CollectionGridCard` | 🟠 2순위 | completed/진행중 × 비율 |
| `ListRowCard` | 🟠 2순위 | icon/trailing 슬롯 조합 |
| `BadgeFrame` | 🟠 2순위 | 7개 shape × 색상 |
| `Card` | 🟡 3순위 | tone 3종 |
| `TopNav` | 🟡 3순위 | title/showBack/rightSlot |
| `BottomSheet` | 🟡 3순위 | open/close |
| `SlidingTabs` | 🟡 3순위 | 탭 수 변형 |
| `ShapeTag` | 🟡 3순위 | 7 shape × 8 color |
| `RarityBadge` | 🟡 3순위 | 4 rarity |
| `Input` | 🟢 4순위 | state 3종 |
| `Skeleton` | 🟢 4순위 | width/height/borderRadius |
| `EmptyState` | 🟢 4순위 | icon/action 유무 |
| `Accordion` | 🟢 4순위 | 단일 열림 |
| `Checkbox, Select, Textarea` | 🟢 4순위 | state 3종 |
| `WanderingEyesLoader` | 🟢 4순위 | 색상 변형 |
| `IconButton` | 🟢 4순위 | 7개 icon |

### 9.2 서비스 전용 Story 후보

| 컴포넌트 | 이유 |
|----------|------|
| `icons.tsx` | 아이콘 캐탈로그 |
| `LoadingSpinner` | 사용 현황 시각화 |
| `PopInNumber` | 애니메이션 파라미터 탐색 |
| `SwapText` | 텍스트 교체 시나리오 |
| `dotm-hex-8`, `dotm-square-3` | 특수 로더 탐색 |

---

## 10. Service-specific UI

### 10.1 페이지 전용 인라인 UI (컴포넌트화 미완성)

| 페이지 | 인라인 패턴 |
|--------|-------------|
| `missions/MissionsListClient.tsx` | 미션 카드 전체 인라인, 하드코딩 7개 |
| `missions/[id]/MissionDetailClient.tsx` | 미션 상세 레이아웃, rarity 색상 인라인 |
| `error.tsx`, `forbidden/page.tsx` | 에러 화면 (`bg-[#0A0A0A]`) |
| `drops/BadgeDetailSheet.tsx` | 배지 상세 BottomSheet |
| `drops/DropsClient.tsx` | 드랍 지도 + 목록 |
| `(main)/FeedSection.tsx` | 피드 섹션 |
| `(main)/UserSearchBar.tsx` | 유저 검색 바 |

### 10.2 도메인 고유 컴포넌트

| 컴포넌트 | 도메인 |
|----------|--------|
| `MapView.tsx` | 지도 (Leaflet) |
| `InventoryGrid.tsx` | 인벤토리 |
| `StravaStatusCard.tsx` | Strava 연동 상태 |
| `NavigationLoader.tsx` | Next.js 라우팅 로더 |

---

## 11. Decision Required

| 항목 | 현황 | 선택지 |
|------|------|--------|
| **폰트 패밀리** | MODULAR=Noto Sans KR, 서비스=Pretendard Variable | A) MODULAR를 Pretendard로 업데이트 B) 서비스를 Noto Sans KR로 변경 C) 두 폰트 공존 문서화 |
| **Button variant 이름** | MODULAR=secondary, 서비스=outline | A) MODULAR를 outline으로 교체 B) 서비스를 secondary로 변경 C) 불일치 유지 + 문서화 |
| **Card.tone white** | linter=white 허용, .d.ts=default | A) linter를 'default'로 갱신 B) .d.ts에 white 복원 |
| **TopNav.backHref** | 서비스에만 있음 | A) MODULAR .d.ts에 추가 B) 서비스 전용으로 문서화 |
| **Toast 패턴** | MODULAR=단순 prop, 서비스=Context/Provider | A) MODULAR에 Provider 패턴 추가 B) 서비스 패턴을 Story에서 별도 문서화 |
| **manifest 미등록 8개** | Storybook에도 미포함 상태 | 전체 등록 후 Storybook 일괄 추가 권장 |
| **MissionsListClient 하드코딩 7개** | `#1A1A1A`, `#2A2A2A` 등 | A) 토큰으로 교체 B) 상수 파일 분리 |
| **Canvas.dc.html** | 역할 불명확 | DECISION REQUIRED |
| **dotm-hex-8, dotm-square-3** | 어디에도 문서 없음 | MODULAR에 추가 vs 서비스 전용 유지 |
| **shadcn accordion vs MODULAR Accordion** | admin=shadcn, 서비스=없음, MODULAR=있음 | admin 제외 정책 유지하면 그대로 |

---

## 12. Recommended Migration Scope

### Phase 1 — Storybook 기반 연결 (코드 변경 없음)

1. `preview.tsx`에 MODULAR 토큰 CSS 6개 연결
2. `main.ts`에 `design-system/**/*.stories.*` 경로 추가
3. Button, BadgeGridCard, TabBar Story 작성 (1순위 3개)
4. 기존 `src/stories/` 예시 파일 삭제 또는 `examples/`로 이동

### Phase 2 — 불일치 해소 (소규모 수정)

1. `_adherence.oxlintrc.json` — Card `white`→`default`, ShapeTag `dark`→`surface`, ModalToast `iconSlot` 추가, Input props 갱신
2. `WanderingEyesLoader.tsx` + `wandering-eyes.css` — 하드코딩 색상 → 토큰
3. `CollectionGridCard.tsx` — `bg-[#E8461F]` → `var(--color-primary)`
4. Manifest에 미등록 8개 추가

### Phase 3 — 나머지 Story 작성 (2~4순위)

5. Toast, ModalToast, CollectionGridCard, ListRowCard, BadgeFrame
6. TopNav, BottomSheet, SlidingTabs, ShapeTag, RarityBadge
7. Form 컴포넌트 4개 + Skeleton, EmptyState

### Phase 4 — Decision 이후

8. 폰트 패밀리 결정 → MODULAR 또는 서비스 갱신
9. MissionsListClient 하드코딩 토큰 교체

---

## Appendix. 파일 역할 분류 전체

| 경로 | 역할 분류 |
|------|----------|
| `design-system/tokens/*.css` | KEEP + STORYBOOK |
| `design-system/styles.css` | KEEP + STORYBOOK |
| `design-system/components/**/Button.*` | KEEP + STORYBOOK |
| `design-system/components/**/IconButton.*` | KEEP + STORYBOOK |
| `design-system/components/**/Card.*` | KEEP + STORYBOOK |
| `design-system/components/**/BadgeFrame.*` | KEEP + STORYBOOK |
| `design-system/components/**/RarityBadge.*` | KEEP + STORYBOOK |
| `design-system/components/**/ShapeTag.*` | KEEP + STORYBOOK |
| `design-system/components/**/EmptyState.*` | KEEP + STORYBOOK |
| `design-system/components/**/ModalToast.*` | KEEP + STORYBOOK |
| `design-system/components/**/Skeleton.*` | KEEP + STORYBOOK |
| `design-system/components/**/Toast.*` | KEEP + STORYBOOK |
| `design-system/components/**/WanderingEyesLoader.*` | KEEP + STORYBOOK |
| `design-system/components/**/Checkbox.*` | KEEP + STORYBOOK |
| `design-system/components/**/Input.*` | KEEP + STORYBOOK |
| `design-system/components/**/Select.*` | KEEP + STORYBOOK |
| `design-system/components/**/Textarea.*` | KEEP + STORYBOOK |
| `design-system/components/**/Accordion.*` | KEEP + STORYBOOK |
| `design-system/components/**/BottomSheet.*` | KEEP + STORYBOOK |
| `design-system/components/**/SlidingTabs.*` | KEEP + STORYBOOK |
| `design-system/components/**/TabBar.*` | KEEP + STORYBOOK |
| `design-system/components/**/TopNav.*` | KEEP + STORYBOOK |
| `design-system/components/**/BadgeGridCard.*` | KEEP + STORYBOOK |
| `design-system/components/**/CollectionGridCard.*` | KEEP + STORYBOOK |
| `design-system/components/**/ListRowCard.*` | KEEP + STORYBOOK |
| `design-system/components/**/*.card.html` | STORYBOOK (Story Docs 참고용) |
| `design-system/components/**/*.prompt.md` | KEEP (AI 사용 지침) |
| `design-system/guidelines/*.html` | KEEP (파운데이션 문서) |
| `design-system/dashboard.html` | KEEP → STORYBOOK 전환 후 DECISION REQUIRED |
| `design-system/Canvas.dc.html` | DECISION REQUIRED |
| `design-system/_adherence.oxlintrc.json` | INCONSISTENT (§7.1 참고 — 갱신 필요) |
| `design-system/_ds_manifest.json` | KEEP + STORYBOOK (8개 추가 후) |
| `design-system/SKILL.md` | KEEP |
| `src/components/ui/Button.tsx` | INCONSISTENT (variant 이름 다름) |
| `src/components/ui/Card.tsx` | INCONSISTENT (tone v2 마이그레이션 중) |
| `src/components/ui/WanderingEyesLoader.tsx` | INCONSISTENT (하드코딩) |
| `src/components/ui/CollectionGridCard.tsx` | INCONSISTENT (하드코딩) |
| `src/components/ui/Toast.tsx` | SERVICE-SPECIFIC (패턴 다름) |
| `src/components/ui/TopNav.tsx` | INCONSISTENT (추가 prop backHref) |
| `src/components/ui/TabBar.tsx` | KEEP |
| `src/components/ui/BadgeGridCard.tsx` | KEEP |
| `src/components/ui/ListRowCard.tsx` | KEEP |
| `src/components/ui/CollectionGridCard.tsx` | KEEP |
| `src/components/ui/SlidingTabs.tsx` | KEEP |
| `src/components/ui/BottomSheet.tsx` | KEEP |
| `src/components/ui/Badge.tsx` | SERVICE-SPECIFIC (이름 다름) |
| `src/components/ui/accordion.tsx` | SERVICE-SPECIFIC (shadcn, admin 전용) |
| `src/components/ui/icons.tsx` | SERVICE-SPECIFIC |
| `src/components/ui/LoadingSpinner.tsx` | SERVICE-SPECIFIC |
| `src/components/ui/PopInNumber.tsx` | SERVICE-SPECIFIC |
| `src/components/ui/SwapText.tsx` | SERVICE-SPECIFIC |
| `src/components/ui/Footer.tsx` | SERVICE-SPECIFIC |
| `src/components/ui/dotm-*.tsx` | SERVICE-SPECIFIC |
| `src/components/admin/**` | SERVICE-SPECIFIC (DS 대상 외) |
| `src/stories/Button.stories.ts` | UNUSED (Storybook 기본 예시, MODULAR 무관) |
| `src/stories/Header.stories.ts` | UNUSED |
| `src/stories/Page.stories.ts` | UNUSED |
| `src/app/(main)/missions/MissionsListClient.tsx` | INCONSISTENT (하드코딩 7개) |
