# Storybook Information Architecture

> **기준일:** 2026-08-16  
> **근거 문서:** `docs/storybook/01-modular-audit.md`  
> **코드 수정 없음** — 구조 설계 전용

---

## 목적

| # | 목적 |
|---|------|
| 1 | MODULAR 컴포넌트 탐색 |
| 2 | 실제 variants / states 시각 확인 |
| 3 | 디자인 토큰 · 파운데이션 확인 |
| 4 | 서비스 개발 전 재사용 가능한 UI 식별 |
| 5 | Claude Code의 UI 탐색 기준점 |

Pages는 이번 구축 범위에서 제외한다.

---

## 1. Storybook Hierarchy (전체 트리)

```
Storybook
│
├── Foundations/
│   ├── Colors
│   │   ├── Base Palette
│   │   ├── Semantic Roles
│   │   ├── Rarity Colors
│   │   └── Tag Colors
│   ├── Typography
│   │   ├── Heading Scale
│   │   ├── Body & Caption
│   │   └── Bold Display
│   ├── Spacing
│   ├── Radius
│   ├── Motion
│   └── Icons
│
├── Components/
│   ├── Buttons/
│   │   ├── Button
│   │   └── IconButton
│   ├── Cards/
│   │   ├── Card
│   │   ├── BadgeFrame
│   │   ├── RarityBadge
│   │   └── ShapeTag
│   ├── Navigation/
│   │   ├── TopNav
│   │   ├── TabBar
│   │   ├── SlidingTabs
│   │   ├── BottomSheet
│   │   └── Accordion
│   ├── Feedback/
│   │   ├── Toast
│   │   ├── ModalToast
│   │   ├── EmptyState
│   │   ├── Skeleton
│   │   └── WanderingEyesLoader
│   └── Forms/
│       ├── Input
│       ├── Checkbox
│       ├── Select
│       └── Textarea
│
└── Patterns/
    ├── BadgeGridCard
    ├── CollectionGridCard
    └── ListRowCard
```

### 설계 판단

- **MODULAR 카테고리 그대로 유지** — buttons / cards / feedback / forms / navigation / patterns 6분류가 이미 명확하다.
- **Foundations를 최상위 추가** — dashboard.html에 있던 가이드라인 카드들(Colors, Typography 등)을 Storybook Docs로 흡수하는 위치.
- **Icons 추가** — 서비스 `icons.tsx` 전용. MODULAR에는 없지만 서비스 개발자가 가장 자주 탐색하는 항목.
- **Pages 제외** — 이번 범위 밖.
- **Admin 제외** — 프로젝트 정책상 DS 적용 대상 아님.

---

## 2. 각 컴포넌트의 Story 목록

### Foundations/Colors

| Story 이름 | 내용 |
|-----------|------|
| `BasePalette` | base-white ~ base-amber 9개 스와치 |
| `SemanticRoles` | bg / surface / primary / secondary / text / border |
| `RarityColors` | common / rare / legend / mythic — 4색 고정 |
| `TagColors` | tag-1 ~ tag-8 + 사용 규칙 |

### Foundations/Typography

| Story 이름 | 내용 |
|-----------|------|
| `HeadingScale` | display ~ h4, 각 weight/tracking 표시 |
| `BodyAndCaption` | body-l / body / small / caption |
| `BoldDisplay` | bold-display / bold-lg, 사용 맥락 |

### Foundations/Spacing

| Story 이름 | 내용 |
|-----------|------|
| `SpacingScale` | spacing-4 ~ spacing-64 시각화 |
| `TouchTarget` | touch-target-min 44px 기준 |

### Foundations/Radius

| Story 이름 | 내용 |
|-----------|------|
| `RadiusScale` | xs / sm / md / card / pill |
| `SemanticAlias` | button / input / subtle 별칭 |

### Foundations/Motion

| Story 이름 | 내용 |
|-----------|------|
| `DurationScale` | quick ~ very-slow 5단계 애니메이션 데모 |
| `EasingFunctions` | smooth-out / bounce / ease-out 비교 |
| `PressScale` | scale-press 0.96 데모 |

### Foundations/Icons

| Story 이름 | 내용 |
|-----------|------|
| `IconGallery` | `icons.tsx` 전체 아이콘 그리드 |

---

### Components/Buttons — Button

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Primary` | variant=primary, surface=dark (기본) |
| `Secondary` | variant=secondary |
| `Ghost` | variant=ghost |
| `SurfaceLight` | surface=light × 3 variant |
| `FullWidth` | fullWidth=true |
| `Loading` | loading=true × variant별 |
| `Disabled` | disabled=true × variant별 |
| `AllVariants` | 3 variant × 2 surface 매트릭스 |

**Controls:** `variant`, `surface`, `fullWidth`, `disabled`, `loading`, `children`

---

### Components/Buttons — IconButton

| Story 이름 | 표현 상태 |
|-----------|----------|
| `AllIcons` | icon 7종 갤러리 |
| `SurfaceDark` | surface=dark |
| `SurfaceLight` | surface=light |
| `Disabled` | disabled=true |

**Controls:** `icon`, `surface`, `disabled`, `label`

---

### Components/Cards — Card

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Default` | tone=default |
| `Tint` | tone=tint |
| `Inverse` | tone=inverse |
| `Clickable` | onClick 있음 (hover/press 확인) |

**Controls:** `tone`, `children`

> ⚠ `tone='white'`는 v2에서 제거됨. Story에 포함하지 않는다.

---

### Components/Cards — BadgeFrame

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Circle` | shape=circle |
| `TicketV` | shape=ticket-v |
| `TicketH` | shape=ticket-h |
| `Scallop` | shape=scallop |
| `CornerCut` | shape=corner-cut |
| `TabNotch` | shape=tab-notch |
| `Dumbbell` | shape=dumbbell |
| `AllShapes` | 7종 갤러리 |
| `WithContent` | 이미지/아이콘 children 포함 |
| `ColorVariants` | 레어리티 4색 × circle shape |

**Controls:** `shape`, `color`, `width`, `height`

---

### Components/Cards — RarityBadge

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Common` | rarity=common |
| `Rare` | rarity=rare |
| `Legend` | rarity=legend |
| `Mythic` | rarity=mythic |
| `AllRarities` | 4종 나란히 |

**Controls:** `rarity`

---

### Components/Cards — ShapeTag

| Story 이름 | 표현 상태 |
|-----------|----------|
| `AllShapes` | 7 shape 갤러리 |
| `AllColors` | colorIndex 0~7 |
| `FactionMapping` | faction prop → 자동 색상 매핑 |
| `SurfaceDark` | surface=dark |
| `SurfaceLight` | surface=light |

**Controls:** `shape`, `colorIndex`, `color`, `faction`, `surface`, `children`

---

### Components/Navigation — TopNav

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Default` | title만 |
| `WithBack` | showBack=true |
| `WithRightSlot` | rightSlot=IconButton |
| `Full` | title + showBack + rightSlot |
| `NoBack` | showBack=false (루트 화면) |

**Controls:** `title`, `showBack`, `rightSlot`

> ⚠ 서비스 전용 `backHref` prop은 MODULAR에 없음 — Story에 포함하지 않는다.

---

### Components/Navigation — TabBar

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Today` | active=today |
| `Badges` | active=badges |
| `Drops` | active=drops |
| `Missions` | active=missions |
| `Inventory` | active=inventory |
| `Profile` | active=profile |
| `Interactive` | onChange 연결, 탭 전환 |

**Controls:** `active`

---

### Components/Navigation — SlidingTabs

| Story 이름 | 표현 상태 |
|-----------|----------|
| `TwoTabs` | tabs 2개 |
| `ThreeTabs` | tabs 3개 |
| `FiveTabs` | tabs 5개 (오버플로 확인) |
| `Interactive` | onChange 연결 |

**Controls:** `tabs`, `active`

---

### Components/Navigation — BottomSheet

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Open` | open=true |
| `Closed` | open=false |
| `WithTitle` | title 있음 |
| `WithContent` | children 풍부 |
| `Interactive` | onDismiss 연결, dismiss 동작 확인 |

**Controls:** `open`, `title`

---

### Components/Navigation — Accordion

| Story 이름 | 표현 상태 |
|-----------|----------|
| `TwoItems` | items 2개 |
| `DefaultOpen` | defaultOpen=true 항목 포함 |
| `MultiItems` | items 5개 |

**Controls:** `items`

---

### Components/Feedback — Toast

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Success` | type=success, open=true |
| `Error` | type=error |
| `Info` | type=info |
| `AllTypes` | 3종 나란히 |
| `Interactive` | open 토글 + onDismiss |

**Controls:** `message`, `type`, `open`

---

### Components/Feedback — ModalToast

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Success` | type=success |
| `Error` | type=error |
| `Info` | type=info |
| `WithIconSlot` | iconSlot=BadgeFrame 예시 |
| `Interactive` | open 토글 + onDismiss |

**Controls:** `message`, `type`, `open`, `iconSlot (텍스트 제어는 별도)`

---

### Components/Feedback — EmptyState

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Default` | 기본 아이콘 + title + description |
| `WithAction` | action 버튼 포함 |
| `NoIcon` | icon=null |
| `CustomIcon` | icon=emoji/svg |

**Controls:** `title`, `description`, `icon`, `action`

---

### Components/Feedback — Skeleton

| Story 이름 | 표현 상태 |
|-----------|----------|
| `TextLine` | width=100%, height=16 |
| `Avatar` | borderRadius=50%, width=40, height=40 |
| `Card` | width=100%, height=120 |
| `Group` | 텍스트 3줄 + 아바타 조합 |

**Controls:** `width`, `height`, `borderRadius`

---

### Components/Feedback — WanderingEyesLoader

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Default` | 기본값 (토큰 기반) |
| `Fast` | duration=1s |
| `Slow` | duration=3s |

**Controls:** `duration`, `eyeColor`, `pupilColor`

> ⚠ 기본값을 토큰으로 교체 후 작성 (현재 하드코딩 `#f8fafc`, `#0f172a`)

---

### Components/Forms — Input

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Default` | state=default |
| `Error` | state=error |
| `Success` | state=success |
| `Disabled` | disabled=true |
| `WithPlaceholder` | placeholder 있음 |
| `Interactive` | onChange 연결 |

**Controls:** `placeholder`, `value`, `state`, `disabled`, `type`

---

### Components/Forms — Checkbox

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Unchecked` | checked=false |
| `Checked` | checked=true |
| `Error` | state=error |
| `Success` | state=success |
| `Disabled` | disabled=true |
| `WithLabel` | label 있음 |

**Controls:** `checked`, `label`, `state`, `disabled`

---

### Components/Forms — Select

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Default` | options 3개 |
| `Error` | state=error |
| `Disabled` | disabled=true |
| `ManyOptions` | options 10개 |

**Controls:** `options`, `value`, `state`, `disabled`, `placeholder`

---

### Components/Forms — Textarea

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Default` | state=default |
| `Error` | state=error |
| `Disabled` | disabled=true |
| `Rows` | rows=6 |

**Controls:** `placeholder`, `value`, `rows`, `state`, `disabled`

---

### Patterns — BadgeGridCard

| Story 이름 | 표현 상태 |
|-----------|----------|
| `Earned` | earned=true, rarity 4종 |
| `Unearned` | earned=false (흑백) |
| `Undiscovered` | undiscovered=true (??? 표시) |
| `Selected` | selected=true |
| `AllRarities` | common/rare/legend/mythic 2×2 그리드 |
| `LinkMode` | href 있음 |
| `ButtonMode` | onClick 있음 |
| `WithChildren` | 만료일 텍스트 children |
| `Grid3Col` | 3열 그리드 배치 예시 |

**Controls:** `name`, `rarity`, `earned`, `undiscovered`, `selected`, `imageUrl`

---

### Patterns — CollectionGridCard

| Story 이름 | 표현 상태 |
|-----------|----------|
| `InProgress` | collected=3, total=9 |
| `Completed` | completed=true |
| `Empty` | collected=0, total=9 |
| `LinkMode` | href 있음 |
| `Grid2Col` | 2열 그리드 배치 예시 |

**Controls:** `name`, `collected`, `total`, `completed`, `imageUrl`

---

### Patterns — ListRowCard

| Story 이름 | 표현 상태 |
|-----------|----------|
| `WithIcon` | icon 슬롯 있음 |
| `WithTrailing` | trailing 슬롯 있음 |
| `Full` | icon + title + subtitle + trailing |
| `NoIcon` | icon 없음 |
| `CustomContent` | children으로 전체 커스텀 |
| `LinkMode` | href 있음 |
| `ButtonMode` | onClick 있음 |
| `List` | 3개 연속 배치 예시 |

**Controls:** `title`, `subtitle`, `trailing`

---

## 3. 각 Story에서 표현해야 할 States 매트릭스

| 컴포넌트 | 필수 states |
|----------|------------|
| Button | variant(3) × surface(2) × disabled × loading |
| IconButton | icon(7) × surface(2) × disabled |
| Card | tone(3) × clickable |
| BadgeFrame | shape(7) × color |
| RarityBadge | rarity(4) |
| ShapeTag | shape(7) × colorIndex(8) × surface(2) |
| TopNav | showBack(T/F) × rightSlot(T/F) |
| TabBar | active(6) |
| SlidingTabs | tab수(2/3/5) |
| BottomSheet | open(T/F) × title(T/F) |
| Accordion | defaultOpen(T/F) |
| Toast | type(3) × open(T/F) |
| ModalToast | type(3) × iconSlot(T/F) × open(T/F) |
| EmptyState | icon(있음/없음/null) × action(T/F) |
| Skeleton | 용도별 3종 (text/avatar/card) |
| WanderingEyesLoader | duration(3단계) |
| Input | state(3) × disabled × type |
| Checkbox | checked(T/F) × state(3) × disabled × label |
| Select | state(3) × disabled × option수 |
| Textarea | state(3) × disabled × rows |
| BadgeGridCard | earned × undiscovered × selected × rarity(4) |
| CollectionGridCard | progress(0/부분/완성) |
| ListRowCard | icon × trailing × href/onClick |

---

## 4. Controls가 필요한 Props

Storybook Controls 패널에 등록할 props. 타입별 컨트롤 형태:

| props 타입 | Storybook control |
|-----------|------------------|
| union string ('primary'\|'secondary') | `select` |
| boolean | `boolean` |
| string | `text` |
| number | `number` |
| ReactNode | `text` (단순 텍스트로 제한) |
| CSS color | `color` |

### Controls 우선순위

| 우선 | 컴포넌트 | 핵심 props |
|------|----------|-----------|
| 🔴 필수 | Button | variant, surface, disabled, loading |
| 🔴 필수 | BadgeGridCard | rarity, earned, undiscovered, selected |
| 🔴 필수 | TabBar | active |
| 🔴 필수 | Toast / ModalToast | type, open, message |
| 🟠 권장 | BadgeFrame | shape, color |
| 🟠 권장 | ShapeTag | shape, colorIndex, surface |
| 🟠 권장 | Input / Checkbox / Select / Textarea | state, disabled |
| 🟡 선택 | Skeleton | width, height, borderRadius |
| 🟡 선택 | WanderingEyesLoader | duration |
| 🟡 선택 | CollectionGridCard | collected, total, completed |

---

## 5. Docs가 필요한 컴포넌트

Storybook `autodocs` 태그를 붙여 자동 Props 테이블을 생성한다.
추가로 사용 지침이 필요한 컴포넌트는 `.mdx` 문서를 별도 작성한다.

### autodocs 자동 생성 (전체)

모든 컴포넌트 Story에 `tags: ['autodocs']`를 기본 적용한다.

### MDX 추가 문서가 필요한 컴포넌트

| 컴포넌트 | 추가 문서 내용 |
|----------|--------------|
| **Button** | surface 선택 기준, loading 사용 정책, UX Writing 예시 ("드랍하러 가기", "취소", "더보기 →") |
| **BadgeFrame** | 7개 shape 사용 맥락, clip-path 주의사항, 이미지 비율 가이드 |
| **RarityBadge** | 레어리티 색상 절대 재매핑 금지 정책 |
| **ShapeTag** | faction 매핑 테이블, colorIndex 순환 규칙 |
| **Toast vs ModalToast** | 두 컴포넌트 선택 기준 (Bottom anchor vs 중앙 모달) |
| **TabBar** | 6개 탭 키 고정 정책, 신규 탭 추가 프로세스 |
| **BadgeGridCard** | earned/undiscovered 상태 전환 로직, 그리드 레이아웃은 호출부 책임 |
| **Input / Forms** | state 3단계 규칙, aria-describedby 연결 패턴, 에러 메시지 3단계 구조 (UX Writing) |
| **WanderingEyesLoader** | NavigationLoader 래퍼와의 관계, 사용 시점 |

---

## 6. 기존 guidelines/*.html → Docs 이전 항목

`design-system/guidelines/` 14개 HTML 파일을 Storybook Docs로 흡수 가능한 항목:

| guidelines 파일 | Storybook 위치 | 이전 방식 |
|----------------|----------------|----------|
| `colors-neutral.html` | Foundations/Colors › SemanticRoles | MDX 또는 Story |
| `colors-primary.html` | Foundations/Colors › SemanticRoles | MDX 또는 Story |
| `colors-rarity.html` | Foundations/Colors › RarityColors | MDX 또는 Story |
| `type-headings.html` | Foundations/Typography › HeadingScale | MDX + 라이브 렌더 |
| `type-body.html` | Foundations/Typography › BodyAndCaption | MDX + 라이브 렌더 |
| `type-bold.html` | Foundations/Typography › BoldDisplay | MDX + 라이브 렌더 |
| `spacing-scale.html` | Foundations/Spacing | MDX + 시각화 |
| `radius-scale.html` | Foundations/Radius | MDX + 시각화 |
| `badge-frames.html` | Components/Cards/BadgeFrame › AllShapes | Story로 대체 |
| `shapes.html` | Components/Cards/ShapeTag + RarityBadge | Story로 대체 |
| `loader.html` | Components/Feedback/WanderingEyesLoader | Story로 대체 |
| `logo.html` | 별도 Foundations/Brand MDX | 이전 |
| `dos-donts.html` | Foundations/Brand › DosAndDonts MDX | 이전 |

**이전하지 않는 항목 (KEEP):**
- 모든 guidelines/*.html — dashboard.html과 함께 독립 열람 기능은 유지  
  → Storybook 구축 후에도 빠른 참조 수단으로 병존

---

## 7. dashboard.html vs Storybook 역할 중복 분석

### 현재 dashboard.html 역할

| 기능 | 내용 |
|------|------|
| 컴포넌트 카드 뷰 | `.card.html` 파일을 iframe으로 렌더 |
| 가이드라인 카드 | Colors, Typography, Spacing 등 HTML 카드 |
| 토큰 목록 | `_ds_manifest.json` 기반 토큰 사이드패널 |
| JAM! 모바일 UI 킷 | `ui_kits/jam-app/` 인터랙티브 클릭스루 |
| 독립 실행 | 브라우저에서 바로 열 수 있음 (Next.js 불필요) |

### Storybook이 대체하는 영역

| dashboard 기능 | Storybook 대체 | 완전 대체 여부 |
|----------------|----------------|--------------|
| 컴포넌트 카드 뷰 | Story Canvas | ✅ 완전 대체 |
| Props 문서 | autodocs | ✅ 완전 대체 + 개선 |
| Controls 탐색 | Controls 패널 | ✅ 완전 대체 + 개선 |
| 가이드라인 카드 | Foundations MDX | ✅ 대체 가능 |
| 토큰 목록 | Foundations Stories | 🟡 부분 대체 (토큰 테이블 수동 작성 필요) |
| 인터랙티브 탐색 | Story + a11y addon | ✅ 더 강력 |

### Storybook이 대체하지 못하는 영역

| dashboard 기능 | 이유 |
|----------------|------|
| JAM! 모바일 UI 킷 클릭스루 | Pages 제외 범위, UI Kit의 전체 화면 플로우는 별도 |
| 독립 실행 (Next.js 없이) | Storybook은 `npm run storybook` 필요 |
| `thumbnail.html` | DS 대외 공유용 — KEEP |

### 결론

- **Storybook 구축 완료 후**: dashboard.html은 **병존**  
  - 독립 열람이 필요한 빠른 참조 → dashboard.html  
  - 인터랙티브 탐색 + Props 확인 + 개발 연동 → Storybook
- **dashboard.html 제거 시점**: Pages 포함 Storybook이 완성되고 UI Kit까지 이전한 이후 (이번 범위 밖)

---

## 8. *.card.html의 Story 대체 가능 여부

`design-system/components/**/*.card.html` — 총 5개 (buttons, cards, feedback, forms, navigation, patterns)

| card.html | Story 대체 | 비고 |
|-----------|------------|------|
| `buttons.card.html` | ✅ 완전 대체 | Button AllVariants Story가 동등 이상 |
| `cards.card.html` | ✅ 완전 대체 | Card(3종) + BadgeFrame + RarityBadge + ShapeTag Story |
| `feedback.card.html` | ✅ 완전 대체 | Toast + ModalToast + 기타 Story |
| `forms.card.html` | ✅ 완전 대체 | Input + state Story |
| `navigation.card.html` | ✅ 완전 대체 | TopNav + TabBar Story |
| `patterns.card.html` | ✅ 완전 대체 | BadgeGridCard + ListRowCard + CollectionGridCard |

**처리 방침:**
- Story 작성 완료 후 `.card.html`은 **KEEP** (dashboard.html 렌더링 유지)
- Storybook이 주 탐색 수단이 된 이후 삭제 여부는 별도 결정

---

## 9. _ds_manifest.json 대체/연결 방식

### 현재 역할

```json
{
  "namespace": "JAMShopifyDesignSystem_f8de83",
  "components": [...],   // 15개 등록
  "cards": [...],        // dashboard.html 렌더 카드 목록
  "tokens": [...],       // 전체 토큰 값
  "globalCssPaths": [...] // CSS 파일 순서
}
```

### Storybook과의 관계

| manifest 항목 | Storybook에서의 역할 |
|---------------|---------------------|
| `components` | Story 파일로 대체. manifest는 dashboard용으로 유지 |
| `cards` | `.card.html` 경로 — dashboard 전용. Storybook 무관 |
| `tokens` | `preview.tsx`에서 CSS 파일을 import해 자동 적용 |
| `globalCssPaths` | `preview.tsx` import 순서와 동일하게 맞춤 |
| `themes` | 현재 비어있음 |

### preview.tsx에서의 연결 방식 (STEP 4-2)

```typescript
// preview.tsx 에 추가할 내용 (설계 전용, 아직 코드 수정 안 함)
import '../design-system/tokens/fonts.css'
import '../design-system/tokens/colors.css'
import '../design-system/tokens/typography.css'
import '../design-system/tokens/spacing.css'
import '../design-system/tokens/radius.css'
import '../design-system/tokens/motion.css'
import '../design-system/styles.css'
```

순서 = `globalCssPaths` 배열 순서와 동일.

### manifest 갱신 필요사항

- 미등록 8개 추가: EmptyState, Skeleton, Checkbox, Select, Textarea, Accordion, BottomSheet, SlidingTabs
- 단, manifest 갱신은 dashboard.html 렌더용 — Storybook 동작과는 독립

---

## 10. SKILL.md / *.prompt.md 유지 방식

### SKILL.md

| 항목 | 내용 |
|------|------|
| 위치 | `design-system/SKILL.md` |
| 역할 | Claude Code 스킬 정의 — 시각 목업·프로토타입 제작 |
| Storybook과의 관계 | 완전히 독립. Storybook은 탐색·검증 계층, SKILL.md는 AI 설계 지침 |
| 처리 | **KEEP** — 변경 없음 |

### *.prompt.md

현재 존재하는 prompt.md 파일 (14개):

```
components/buttons/Button.prompt.md
components/buttons/IconButton.prompt.md
components/cards/Card.prompt.md
components/cards/RarityBadge.prompt.md
components/cards/ShapeTag.prompt.md
components/feedback/ModalToast.prompt.md
components/feedback/Toast.prompt.md
components/forms/Input.prompt.md
components/navigation/TabBar.prompt.md
components/navigation/TopNav.prompt.md
components/patterns/BadgeGridCard.prompt.md
components/patterns/CollectionGridCard.prompt.md
components/patterns/ListRowCard.prompt.md
```

| 항목 | 내용 |
|------|------|
| 역할 | Claude Code가 컴포넌트 사용 시 읽는 AI 힌트 + JSX 예시 |
| Storybook과의 관계 | Story의 args/docs 예시와 동기화 필요 (내용이 다르면 AI가 틀린 코드 생성) |
| 처리 | **KEEP + Story 작성 후 동기화 검토** |

### prompt.md ↔ Story 동기화 원칙

Story 작성 시 `.prompt.md`의 JSX 예시를 Primary story의 args로 그대로 반영한다.  
Story가 정한 variant/prop 이름과 `.prompt.md` 예시가 달라지면 `.prompt.md`를 교체가 아닌 보완한다.

**예시 (Button):**
```md
# Button.prompt.md 현재
<Button variant="primary">드랍하러 가기</Button>
<Button variant="secondary">취소</Button>
<Button variant="ghost">더보기 →</Button>
```
→ Story의 `Primary`, `Secondary`, `Ghost` story의 `args.children` 값으로 채용.

---

## 11. Story 파일 위치 전략

### 옵션 A — MODULAR 경로에 Story 배치 (권장)

```
jam-web/design-system/components/buttons/Button.stories.tsx
jam-web/design-system/components/cards/Card.stories.tsx
...
```

**main.ts 경로 추가 필요:**
```typescript
stories: [
  "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  "../design-system/**/*.stories.@(js|jsx|mjs|ts|tsx)",  // 추가
  "../design-system/**/*.mdx",                            // 추가
]
```

**장점:**
- MODULAR 컴포넌트와 Story가 같은 폴더에 위치 → 유지보수 편의
- 컴포넌트 삭제 시 Story 자동 연동

**단점:**
- design-system/ 폴더가 커짐

### 옵션 B — src/stories에 통합 배치

```
jam-web/src/stories/modular/Button.stories.tsx
jam-web/src/stories/foundations/Colors.stories.tsx
...
```

**장점:** design-system/ 폴더 변경 없음

**단점:** 컴포넌트와 Story 분리 → 경로 관리 복잡

### 결론

**옵션 A 권장.** MODULAR가 참조 구현체이고 Story는 그 탐색 레이어이므로 물리적 위치를 일치시키는 것이 명확하다.

---

## 12. 구현 순서 (STEP 참조)

| STEP | 내용 | 선행 조건 |
|------|------|-----------|
| STEP 4-2 | preview.tsx 토큰 연결 + main.ts 경로 추가 | 없음 |
| STEP 5 | Button, BadgeGridCard, TabBar Story (1순위 3개) | STEP 4-2 |
| STEP 6 | Toast, ModalToast, CollectionGridCard, ListRowCard (2순위) | STEP 5 |
| STEP 7 | Foundations MDX (Colors, Typography, Spacing, Radius, Motion) | STEP 4-2 |
| STEP 8 | BadgeFrame, ShapeTag, RarityBadge | STEP 5 |
| STEP 9 | TopNav, BottomSheet, SlidingTabs, Accordion | STEP 5 |
| STEP 10 | Forms (Input, Checkbox, Select, Textarea) | STEP 5 |
| STEP 11 | EmptyState, Skeleton, WanderingEyesLoader | STEP 5 |
| STEP 12 | Icons Foundations + 서비스 전용 UI | STEP 5 |
| STEP 13 | 기존 src/stories/ 예시 파일 삭제 | STEP 5 완료 후 |
