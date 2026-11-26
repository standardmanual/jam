---
type: prd
status: active
description: "서비스 화면이 조합해 쓰는 정본 UI 컴포넌트(jam-web/src/components/ui)의 파일·export·설명·스토리 목록이다. 생성기가 만든다."
related:
  - "20261126_0947"
code:
  - "jam-web/src/components/ui"
---

# 정본 UI 컴포넌트 목록

서비스 화면은 아래 정본 컴포넌트만 조합한다. 규칙(정본만 조합한다, 새 컴포넌트는 승인 등)은 상위 티켓 `20261125_1923`의 «사용자 결정»이 원천이다.

이 목록의 표는 `node scripts/gen-component-list.mjs`가 만든다. 표는 손으로 고치지 않는다. 설명은 컴포넌트 파일 JSDoc의 `@summary`(없으면 JSDoc 첫 문장)에서 가져온다.
스토리가 없는 정본 파일은 `scripts/stories-baseline.json`에 적힌 것만 허용하며(`verify`의 `component-list` 단계와 pre-commit이 검사), 새 정본 컴포넌트는 스토리 파일과 함께 들어와야 한다.

<!-- BEGIN generated: component-list -->
정본 컴포넌트 파일 46개 · 스토리 있음 24개 · 없음 22개

| 파일 | export | 설명 | 스토리 (제목·개수) |
|---|---|---|---|
| `Accordion.tsx` | Accordion | Accordion — single-open collapsible list. | UI/Navigation/Accordion (4개) |
| `Avatar.tsx` | Avatar | 공용 유저 아바타 (티켓 20261125_1444). | 없음 |
| `BadgeGridCard.tsx` | BadgeGridCard, BadgeGridCardPlaceholder | 인벤토리 빈 슬롯 플레이스홀더 — 일반 `BadgeGridCard`와 동일한 썸네일(`w-[calc(100%+0.75rem)] aspect-square`)· | 없음 |
| `BadgeHeroSection.tsx` | BadgeHeroSection | BadgeHeroSection — «배지 한 장의 대표 카드»: 이미지 · 등급/레벨 칩 · 이름 · 설명. | UI/Cards/BadgeHeroSection (9개) |
| `BadgeLevelChip.tsx` | BadgeLevelChip | BadgeLevelChip — 무한레벨형 배지의 «Lv.N» 칩. | UI/Cards/BadgeLevelChip (6개) |
| `BadgeRevealCarousel.tsx` | BadgeRevealCarousel | 이미지 정사각 한 변 = 카드 폭 × 이 비율. | UI/Patterns/BadgeRevealCarousel (24개) |
| `BottomSheet.tsx` | BottomSheet | 포커스 트랩이 순환 대상으로 삼는 요소 셀렉터 — 비활성 상태는 제외한다. | 없음 |
| `Button.tsx` | — | SuperHi Plus Button | 없음 |
| `Card.tsx` | Card | Card — surface container. | UI/Cards/Card (8개) |
| `Carousel.tsx` | Carousel | Carousel — 센터 포커스 카드 캐러셀 (무한 루프). | UI/Navigation/Carousel (3개) |
| `CategorySticker.tsx` | 8개 (PEBBLE_SIZE, WAVE_SIZE, MIN_FONT_SIZE 외) | 조약돌 글자 선의 반지름을 이동평균하는 이웃 수(앞뒤 각각). | UI/Cards/CategorySticker (5개) |
| `Checkbox.tsx` | Checkbox | Checkbox — label-wrapped checkbox with custom indicator. | UI/Forms/Checkbox (9개) |
| `CollectionGridCard.tsx` | CollectionGridCard | — | 없음 |
| `EmptyState.tsx` | EmptyState | EmptyState — zero-content placeholder for lists, search results, errors, and onboarding. | UI/Feedback/EmptyState (6개) |
| `Footer.tsx` | Footer | 전역 하단 푸터. | 없음 |
| `FooterLogo.tsx` | FooterLogo | 푸터 맨 아래 JAM! 로고 (티켓 20261104_1642) — 화면에 나타날 때 아래에서 위로 Ease In으로 올라온다. | 없음 |
| `IconButton.tsx` | IconButton | IconButton — 44×44 circular icon-only touch target. | UI/Buttons/IconButton (11개) |
| `InlineNotice.tsx` | InlineNotice | 인라인 안내 블록 (티켓 20261018_1817, 채원 사전 판정 2026-10-19) — 서비스 전용, MODULAR 승격은 하지 않는다. | 없음 |
| `Input.tsx` | Input | Input — text field (캡슐형). | UI/Forms/Input (11개) |
| `ItemSerialCode.tsx` | ItemSerialCode | ItemSerialCode — 아이템 배지 일련번호 스탬프 패턴. | UI/Patterns/ItemSerialCode (10개) |
| `LabelChip.tsx` | LabelChip | LabelChip — 카드 좌상단에 놓는 «라벨 필». | UI/Cards/LabelChip (6개) |
| `ListCard.tsx` | ListCard | ListCard — 큰 이미지 위에 제목을 얹는 세로 목록 카드의 정본 (티켓 20261114_1543). | 없음 |
| `ListRow.tsx` | LIST_ROW_STATIC_CSS, ListRowEm, ListRowChip, ListRow | 1줄은 말줄임, 2줄 이상은 줄 수로 자른다. | 없음 |
| `LoadMoreButton.tsx` | LoadMoreButton | 더보기 버튼 — 알림·포인트 내역·친구 피드가 함께 쓴다. | 없음 |
| `LockedTile.tsx` | LockedTile | LockedTile — 잠긴 아이템 배지의 «잠금 타일». | UI/Cards/LockedTile (3개) |
| `MixerSlot.tsx` | ActionCircle, MixerSlot | ActionCircle — 믹서·컬렉션 칸의 «+»·«−» 원. | UI/Patterns/MixerSlot (4개) |
| `NotificationBell.tsx` | NotificationBell | TopNav 알림함 진입점 (20260824_021) | 없음 |
| `PointText.tsx` | PointText | 포인트 값+단위를 `--point-text` 오렌지로 그리는 표시 전용 컴포넌트. | UI/Patterns/PointText (11개) |
| `PopInNumber.tsx` | PopInNumber | PopInNumber — 숫자가 갱신될 때 각 자리가 블러와 함께 아래에서 들어오는 전환. | 없음 |
| `ProgressBar.tsx` | PROGRESS_TRACK_GRADIENT, ProgressBar | [20260906_2140] 그라데이션 정의를 `--progress-sweep` 토큰 하나로 모았다. | UI/Feedback/ProgressBar (11개) |
| `ProgressCountBar.tsx` | ProgressCountBar | 진행도 바 + 오른쪽 «n/n» 수치 한 줄 — 컬렉션 상세의 진행도 바(`collections/[id]/page.tsx`)와 인벤토리의 칸 사용량 바가 같은 … | 없음 |
| `RarityBadge.tsx` | RarityBadge | RarityBadge — badge rarity pill. | UI/Cards/RarityBadge (12개) |
| `Select.tsx` | Select | Select — styled native <select>. | UI/Forms/Select (7개) |
| `Skeleton.tsx` | Skeleton | Skeleton — inline loading placeholder with shimmer animation. | UI/Feedback/Skeleton (6개) |
| `SlidingTabs.tsx` | SlidingTabs | SlidingTabs — 활성 pill이 탭 사이를 미끄러지는 세그먼트 컨트롤. | 없음 |
| `SlotCircleButton.tsx` | SlotCircleButton | 컬렉션 칸의 «빼기»·«추가» 버튼 — 칸의 우측 상단 안쪽에 놓이는 검은 원 안의 «−»·«+» 아이콘이다(2026-11-09 사용자 지시). | 없음 |
| `SlotOutline.tsx` | SlotOutline | SlotOutline — 슬롯 칸의 «점선 외곽선». | UI/Cards/SlotOutline (4개) |
| `SwapText.tsx` | SwapText | SwapText — 같은 자리에서 텍스트가 바뀔 때 위로 빠지고 아래에서 들어오는 전환. | 없음 |
| `SyncIconButton.tsx` | SyncIconButton | TopNav 동기화 서클 (티켓 20261114_1349) | 없음 |
| `TabBar.tsx` | FOOTER_SELECTOR, FOOTER_RELEASE_GAP, TabBar | 뷰포트 하단에서 탭바 세로 중간선까지의 거리(px, 반올림). | 없음 |
| `Toast.tsx` | ToastRow, ToastScrim, ToastProvider | 토스트 한 줄. | 없음 |
| `TopNav.tsx` | TopNav | SuperHi Plus 상단 네비게이션 (iOS HIG Navigation Bar 패턴) | 없음 |
| `TopNavBar.tsx` | TopNavBar | TopNav — sticky top bar with back button, title, optional right slot. | UI/Navigation/TopNavBar (13개) |
| `VisitCountChip.tsx` | VisitCountChip | 방문 횟수 칩 «×N» — 체크인 배지의 목록 카드(`BadgeGridCard`)와 상세 히어로 카드(`BadgeHeroSection`)가 같은 칩을 쓴다(20… | 없음 |
| `WanderingEyesLoader.tsx` | WanderingEyesLoader | WanderingEyesLoader — 눈 안에서 눈동자가 돌아다니다가 주기적으로 깜빡이는 대기 표시. | UI/Feedback/WanderingEyesLoader (5개) |
| `icons.tsx` | 42개 (HomeIcon, MedalIcon, CheckinIcon 외) | 투데이 | UI/Icons/IconCatalog (5개) |
<!-- END generated: component-list -->
