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
스토리가 없는 정본 파일은 허용하지 않는다(`verify`의 `component-list` 단계와 pre-commit이 검사). 새 정본 컴포넌트는 같은 이름의 스토리 파일과 함께 들어와야 한다.

<!-- BEGIN generated: component-list -->
정본 컴포넌트 파일 46개 · 스토리 있음 46개 · 없음 0개

| 파일 | export | 설명 | 스토리 (제목·개수) |
|---|---|---|---|
| `Accordion.tsx` | Accordion | Accordion — single-open collapsible list. | UI/Navigation/Accordion (4개) |
| `Avatar.tsx` | Avatar | 프로필 사진을 원이나 둥근 사각형 안에 그리고 사진이 없으면 사용자 아이콘을 보여 주는 아바타다. 프로필·검색·팔로우 목록·상단 내비게이션에서 쓴다. | UI/Cards/Avatar (4개) |
| `BadgeGridCard.tsx` | BadgeGridCard, BadgeGridCardPlaceholder | 배지 한 장을 정사각 썸네일과 이름·칩으로 보여 주는 격자 카드다. 배지 목록·컬렉션 상세·믹스 재료 칸에서 쓴다. | UI/Cards/BadgeGridCard (18개) |
| `BadgeHeroSection.tsx` | BadgeHeroSection | 배지 한 장의 이미지·등급 칩·이름·설명을 가운데로 쌓은 대표 카드다. 배지 상세 페이지와 드랍 바텀시트, 잠긴 아이템 배지 상세에서 쓴다. | UI/Cards/BadgeHeroSection (7개) |
| `BadgeLevelChip.tsx` | BadgeLevelChip | 무한레벨형 배지의 «Lv.N» 칩이다. 등급 칩 대신 홈 피드·미션 목록·배지 상세·획득 연출에서 쓴다. | UI/Cards/BadgeLevelChip (3개) |
| `BadgeRevealCarousel.tsx` | BadgeRevealCarousel | 배지를 얻은 순간 카드를 3D로 넘겨 보는 전체 화면 캐러셀이다. 배지 획득 연출과 보류 아이템 배지 고르기에서 쓴다. | UI/Patterns/BadgeRevealCarousel (12개) |
| `BottomSheet.tsx` | BottomSheet | 포커스 트랩이 순환 대상으로 삼는 요소 셀렉터 — 비활성 상태는 제외한다. | UI/Feedback/BottomSheet (4개) |
| `Button.tsx` | Button | SuperHi Plus Button | UI/Buttons/Button (18개) |
| `Card.tsx` | Card | 흰 면의 둥근 카드 틀이다. 서비스 화면 대부분의 묶음 면이며 tint는 카드 안 구획, inverse는 선택·안내 신호에 쓴다. | UI/Cards/Card (3개) |
| `Carousel.tsx` | Carousel | Carousel — 센터 포커스 카드 캐러셀 (무한 루프). | UI/Navigation/Carousel (3개) |
| `CategorySticker.tsx` | CategorySticker | 홈 피드 카드 모서리에 붙는 분류 스티커다. 조약돌·물결 모양 바탕에 분류 문구와 JAM 로고 글자를 얹는다. | UI/Cards/CategorySticker (3개) |
| `Checkbox.tsx` | Checkbox | Checkbox — label-wrapped checkbox with custom indicator. | UI/Forms/Checkbox (9개) |
| `CollectionGridCard.tsx` | CollectionGridCard | 컬렉션 한 개를 수집 진행도와 함께 보여 주는 격자 카드다. 배지 목록의 컬렉션 탭에서 쓴다. | UI/Cards/CollectionGridCard (4개) |
| `EmptyState.tsx` | EmptyState | EmptyState — zero-content placeholder for lists, search results, errors, and onboarding. | UI/Feedback/EmptyState (6개) |
| `Footer.tsx` | Footer | 전역 하단 푸터. | UI/Navigation/Footer (1개) |
| `FooterLogo.tsx` | FooterLogo | 푸터 맨 아래 JAM! 로고 (티켓 20261104_1642) — 화면에 나타날 때 아래에서 위로 Ease In으로 올라온다. | UI/Navigation/FooterLogo (1개) |
| `IconButton.tsx` | IconButton | IconButton — 44×44 circular icon-only touch target. | UI/Buttons/IconButton (11개) |
| `InlineNotice.tsx` | InlineNotice | 인라인 안내 블록 (티켓 20261018_1817, 채원 사전 판정 2026-10-19) — 서비스 전용, MODULAR 승격은 하지 않는다. | UI/Feedback/InlineNotice (3개) |
| `Input.tsx` | Input | Input — text field (캡슐형). | UI/Forms/Input (11개) |
| `ItemSerialCode.tsx` | ItemSerialCode | 아이템 배지의 일련번호를 앞 4자 카드와 숫자 상자로 그리는 스탬프다. 배지 상세와 드랍 바텀시트, 잠긴 배지 상세에서 쓴다. | UI/Patterns/ItemSerialCode (2개) |
| `LabelChip.tsx` | LabelChip | 카드 좌상단에 붙는 작은 라벨 칩이다. 오늘 현황 줄·정지 안내·획득 이력의 «처음 받은 날»·기사 화면에서 쓴다. | UI/Cards/LabelChip (3개) |
| `ListCard.tsx` | ListCard | 이미지·제목·칩·값·푸터를 한 장에 쌓아 보여 주는 목록 카드다. 미션 목록에서 미션 한 건을 그릴 때 쓴다. | UI/Cards/ListCard (3개) |
| `ListRow.tsx` | ListRowEm, ListRowChip, ListRow | 왼쪽 이미지·제목·보조 문구·오른쪽 값을 슬롯으로 조합하는 목록 행이다. 홈 피드·팔로우 목록·획득 이력·레시피 보상 등 여러 목록에서 쓴다. | UI/Cards/ListRow (15개) |
| `LoadMoreButton.tsx` | LoadMoreButton | 더보기 버튼 — 알림·포인트 내역·친구 피드가 함께 쓴다. | UI/Buttons/LoadMoreButton (3개) |
| `LockedTile.tsx` | LockedTile | 잠긴 아이템 배지를 자물쇠 하나로 대신 보여 주는 정사각 타일이다. 잠긴 배지 상세·배지 격자·드랍 시트·미션 보상에서 쓴다. | UI/Cards/LockedTile (3개) |
| `MixerSlot.tsx` | ActionCircle, MixerSlot | 믹스·등급 올리기에서 재료 배지를 담는 슬롯 카드다. 빈 칸·잠긴 칸·채운 칸 세 상태를 그린다. | UI/Patterns/MixerSlot (4개) |
| `NotificationBell.tsx` | NotificationBell | TopNav 알림함 진입점 (20260824_021) | UI/Navigation/NotificationBell (2개) |
| `PointText.tsx` | PointText | 포인트 값과 «포인트» 단위를 주황색 한 덩어리로 보여 준다. 미션·레시피 보상, 포인트 내역, 문장 속 포인트에서 쓴다. | UI/Patterns/PointText (3개) |
| `PopInNumber.tsx` | PopInNumber | 숫자가 바뀔 때 각 자리가 블러와 함께 아래에서 들어오는 숫자 전환이다. 프로필의 팔로워 수와 캡슐 게이지의 채운 양에서 쓴다. | UI/Patterns/PopInNumber (2개) |
| `ProgressBar.tsx` | ProgressBar | [20260906_2140] 그라데이션 정의를 `--progress-sweep` 토큰 하나로 모았다. | UI/Feedback/ProgressBar (11개) |
| `ProgressCountBar.tsx` | ProgressCountBar | 진행도 바 + 오른쪽 «n/n» 수치 한 줄 — 컬렉션 상세의 진행도 바(`collections/[id]/page.tsx`)와 인벤토리의 칸 사용량 바가 같은 … | UI/Feedback/ProgressCountBar (2개) |
| `RarityBadge.tsx` | RarityBadge | 배지 등급(Rare·Epic·Mystic 등)을 보여 주는 칩이다. 홈 피드·미션 목록·배지 상세·컬렉션·등급 올리기에서 쓴다. | UI/Cards/RarityBadge (7개) |
| `Select.tsx` | Select | Select — styled native <select>. | UI/Forms/Select (7개) |
| `Skeleton.tsx` | Skeleton | Skeleton — inline loading placeholder with shimmer animation. | UI/Feedback/Skeleton (6개) |
| `SlidingTabs.tsx` | SlidingTabs | SlidingTabs — 활성 pill이 탭 사이를 미끄러지는 세그먼트 컨트롤. | UI/Navigation/SlidingTabs (3개) |
| `SlotCircleButton.tsx` | SlotCircleButton | 컬렉션 칸의 «빼기»·«추가» 버튼 — 칸의 우측 상단 안쪽에 놓이는 검은 원 안의 «−»·«+» 아이콘이다(2026-11-09 사용자 지시). | UI/Buttons/SlotCircleButton (5개) |
| `SlotOutline.tsx` | SlotOutline | 컬렉션 슬롯에서 아직 없는 배지의 윤곽을 점선으로만 그리는 외곽선이다. 배지 격자 카드의 빈 칸에서 쓴다. | UI/Cards/SlotOutline (3개) |
| `SwapText.tsx` | SwapText | 같은 자리에서 문구가 바뀔 때 위로 빠지고 아래에서 들어오는 문구 전환이다. 프로필 버튼·잠긴 아이템 배지 상세·믹스 결과 시트에서 쓴다. | UI/Patterns/SwapText (2개) |
| `SyncIconButton.tsx` | SyncIconButton | TopNav 동기화 서클 (티켓 20261114_1349) | UI/Buttons/SyncIconButton (3개) |
| `TabBar.tsx` | TabBar | 뷰포트 하단에서 탭바 세로 중간선까지의 거리(px, 반올림). | UI/Navigation/TabBar (5개) |
| `Toast.tsx` | ToastRow, ToastScrim, ToastProvider | 토스트 한 줄. | UI/Feedback/Toast (3개) |
| `TopNav.tsx` | TopNav | SuperHi Plus 상단 네비게이션 (iOS HIG Navigation Bar 패턴) | UI/Navigation/TopNav (6개) |
| `TopNavBar.tsx` | TopNavBar | TopNav — sticky top bar with back button, title, optional right slot. | UI/Navigation/TopNavBar (13개) |
| `VisitCountChip.tsx` | VisitCountChip | 체크인 배지를 방문한 횟수를 «×N» 칩으로 보여 준다. 배지 목록 카드와 배지 상세에서 2회 이상 방문했을 때만 쓴다. | UI/Cards/VisitCountChip (2개) |
| `WanderingEyesLoader.tsx` | WanderingEyesLoader | WanderingEyesLoader — 눈 안에서 눈동자가 돌아다니다가 주기적으로 깜빡이는 대기 표시. | UI/Feedback/WanderingEyesLoader (5개) |
| `icons.tsx` | 42개 (HomeIcon, MedalIcon, CheckinIcon 외) | 투데이 | UI/Icons/IconCatalog (5개) |
<!-- END generated: component-list -->
