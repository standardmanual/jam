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
| `Accordion.tsx` | Accordion | 한 번에 하나만 펼쳐지는 접이식 목록이다. 철학 화면의 자주 묻는 질문에서 쓴다. | UI/Navigation/Accordion (1개) |
| `Avatar.tsx` | Avatar | 공용 유저 아바타 (티켓 20261125_1444). | UI/Cards/Avatar (4개) |
| `BadgeGridCard.tsx` | BadgeGridCard, BadgeGridCardPlaceholder | 인벤토리 빈 슬롯 플레이스홀더 — 일반 `BadgeGridCard`와 동일한 썸네일(`w-[calc(100%+0.75rem)] aspect-square`)· | UI/Cards/BadgeGridCard (18개) |
| `BadgeHeroSection.tsx` | BadgeHeroSection | BadgeHeroSection — «배지 한 장의 대표 카드»: 이미지 · 등급/레벨 칩 · 이름 · 설명. | UI/Cards/BadgeHeroSection (9개) |
| `BadgeLevelChip.tsx` | BadgeLevelChip | BadgeLevelChip — 무한레벨형 배지의 «Lv.N» 칩. | UI/Cards/BadgeLevelChip (6개) |
| `BadgeRevealCarousel.tsx` | BadgeRevealCarousel | 이미지 정사각 한 변 = 카드 폭 × 이 비율. | UI/Patterns/BadgeRevealCarousel (24개) |
| `BottomSheet.tsx` | BottomSheet | 화면 아래에서 올라와 끌어 내려 닫는 시트다. 배지 공유·합성·컬렉션 등 여러 화면에서 쓴다. | UI/Feedback/BottomSheet (4개) |
| `Button.tsx` | Button | 변형·크기·면을 고르는 기본 버튼이다. 로그인·팔로우·배지 상세 등 거의 모든 화면에서 쓴다. | UI/Buttons/Button (18개) |
| `Card.tsx` | Card | Card — surface container. | UI/Cards/Card (8개) |
| `Carousel.tsx` | Carousel | 가운데 카드가 선택되는 무한 순환 가로 캐러셀이다. 지도의 장소 카드 모달에서 쓴다. | UI/Navigation/Carousel (3개) |
| `CategorySticker.tsx` | CategorySticker | 조약돌 글자 선의 반지름을 이동평균하는 이웃 수(앞뒤 각각). | UI/Cards/CategorySticker (5개) |
| `Checkbox.tsx` | Checkbox | 라벨이 붙은 체크박스다. 온보딩의 만 14세 이상 확인에서 쓴다. | UI/Forms/Checkbox (2개) |
| `CollectionGridCard.tsx` | CollectionGridCard | — | UI/Cards/CollectionGridCard (4개) |
| `EmptyState.tsx` | EmptyState | 내용이 없을 때 제목·설명·버튼을 보여 주는 안내 블록이다. 배지·친구·컬렉션 등 목록 화면에서 쓴다. | UI/Feedback/EmptyState (3개) |
| `Footer.tsx` | Footer | 전역 하단 푸터다. 메인·온보딩 레이아웃에서 쓴다. | UI/Navigation/Footer (1개) |
| `FooterLogo.tsx` | FooterLogo | 푸터 맨 아래에서 올라오는 JAM! 로고다. Footer가 쓴다. | UI/Navigation/FooterLogo (1개) |
| `IconButton.tsx` | IconButton | 아이콘만 담은 44px 원형 버튼이다. 배지 획득 연출과 장소 카드 모달에서 쓴다. | UI/Buttons/IconButton (1개) |
| `InlineNotice.tsx` | InlineNotice | 지금은 안 되는 까닭을 한두 문장으로 알리는 안내 블록이다. 로그인·컬렉션·조합·드랍 시트에서 쓴다. | UI/Feedback/InlineNotice (3개) |
| `Input.tsx` | Input | 캡슐 모양의 글자 입력칸이다. 프로필 편집·사용자 검색·온보딩·탈퇴 시트에서 쓴다. | UI/Forms/Input (6개) |
| `ItemSerialCode.tsx` | ItemSerialCode | ItemSerialCode — 아이템 배지 일련번호 스탬프 패턴. | UI/Patterns/ItemSerialCode (10개) |
| `LabelChip.tsx` | LabelChip | LabelChip — 카드 좌상단에 놓는 «라벨 필». | UI/Cards/LabelChip (6개) |
| `ListCard.tsx` | ListCard | ListCard — 큰 이미지 위에 제목을 얹는 세로 목록 카드의 정본 (티켓 20261114_1543). | UI/Cards/ListCard (3개) |
| `ListRow.tsx` | ListRowEm, ListRowChip, ListRow | 1줄은 말줄임, 2줄 이상은 줄 수로 자른다. | UI/Cards/ListRow (15개) |
| `LoadMoreButton.tsx` | LoadMoreButton | 목록 끝에서 더 불러오는 전체 폭 버튼이다. 친구 피드·알림·포인트 내역에서 쓴다. | UI/Buttons/LoadMoreButton (3개) |
| `LockedTile.tsx` | LockedTile | LockedTile — 잠긴 아이템 배지의 «잠금 타일». | UI/Cards/LockedTile (3개) |
| `MixerSlot.tsx` | ActionCircle, MixerSlot | ActionCircle — 믹서·컬렉션 칸의 «+»·«−» 원. | UI/Patterns/MixerSlot (4개) |
| `NotificationBell.tsx` | NotificationBell | 읽지 않은 알림이 있으면 빨간 점이 뜨는 종 버튼이다. 상단 바 오른쪽에서 쓴다. | UI/Navigation/NotificationBell (2개) |
| `PointText.tsx` | PointText | 포인트 값+단위를 `--point-text` 오렌지로 그리는 표시 전용 컴포넌트. | UI/Patterns/PointText (11개) |
| `PopInNumber.tsx` | PopInNumber | PopInNumber — 숫자가 갱신될 때 각 자리가 블러와 함께 아래에서 들어오는 전환. | UI/Patterns/PopInNumber (2개) |
| `ProgressBar.tsx` | ProgressBar | 진행률을 가로 막대로 보여 주는 바다. 미션 상세·오늘 상태 띠·랭킹 줄에서 쓴다. | UI/Feedback/ProgressBar (4개) |
| `ProgressCountBar.tsx` | ProgressCountBar | 진행 막대와 오른쪽 «n/n» 수치를 한 줄로 보여 준다. 컬렉션 상세와 인벤토리에서 쓴다. | UI/Feedback/ProgressCountBar (2개) |
| `RarityBadge.tsx` | RarityBadge | RarityBadge — badge rarity pill. | UI/Cards/RarityBadge (12개) |
| `Select.tsx` | Select | 캡슐 모양의 선택 상자다. 배지 목록의 필터·정렬과 미션 목록의 정렬에서 쓴다. | UI/Forms/Select (1개) |
| `Skeleton.tsx` | Skeleton | 불러오는 동안 자리를 채우는 반짝이는 막대다. 프로필·캡슐 위젯·합성 결과 시트에서 쓴다. | UI/Feedback/Skeleton (3개) |
| `SlidingTabs.tsx` | SlidingTabs | 활성 알약이 탭 사이를 미끄러지는 탭 전환이다. 배지·미션 목록, 홈 피드, 문의 화면에서 쓴다. | UI/Navigation/SlidingTabs (3개) |
| `SlotCircleButton.tsx` | SlotCircleButton | 컬렉션 칸 모서리의 «빼기»·«추가» 원형 버튼이다. 컬렉션 상세 칸 격자와 조합 레시피 칸에서 쓴다. | UI/Buttons/SlotCircleButton (5개) |
| `SlotOutline.tsx` | SlotOutline | SlotOutline — 슬롯 칸의 «점선 외곽선». | UI/Cards/SlotOutline (4개) |
| `SwapText.tsx` | SwapText | SwapText — 같은 자리에서 텍스트가 바뀔 때 위로 빠지고 아래에서 들어오는 전환. | UI/Patterns/SwapText (2개) |
| `SyncIconButton.tsx` | SyncIconButton | 동기화를 누르는 아이콘 원형 버튼이다. 홈을 뺀 화면의 상단 바에서 쓴다. | UI/Buttons/SyncIconButton (3개) |
| `TabBar.tsx` | TabBar | 화면 아래에 고정된 다섯 칸 탭 바다. 메인 레이아웃에서 쓴다. | UI/Navigation/TabBar (5개) |
| `Toast.tsx` | ToastRow, ToastScrim, ToastProvider | 화면 아래에 잠깐 뜨는 알림 한 줄과 그 공급자다. 팔로우·공유·합성 등 결과 알림에서 쓴다. | UI/Feedback/Toast (3개) |
| `TopNav.tsx` | TopNav | 서비스의 상단 바다. 뒤로가기·제목·동기화·알림 종·아바타를 얹고 메인 화면 대부분에서 쓴다. | UI/Navigation/TopNav (6개) |
| `TopNavBar.tsx` | TopNavBar | 뒤로가기·제목·오른쪽 칸을 가진 상단 바 본체다. 서비스 TopNav와 약관 화면 LegalTopNav가 감싸 쓴다. | UI/Navigation/TopNavBar (1개) |
| `VisitCountChip.tsx` | VisitCountChip | 방문 횟수 칩 «×N» — 체크인 배지의 목록 카드(`BadgeGridCard`)와 상세 히어로 카드(`BadgeHeroSection`)가 같은 칩을 쓴다(20… | UI/Cards/VisitCountChip (2개) |
| `WanderingEyesLoader.tsx` | WanderingEyesLoader | 눈동자가 돌아다니다 깜빡이는 대기 표시다. 화면 전환·배지 획득 연출·공유 버튼 등 로딩에서 쓴다. | UI/Feedback/WanderingEyesLoader (2개) |
| `icons.tsx` | 42개 (HomeIcon, MedalIcon, CheckinIcon 외) | 라인·채움 두 벌의 JAM! 아이콘 세트다. 서비스 대부분의 화면이 가져다 쓴다. | UI/Icons/IconCatalog (1개) |
<!-- END generated: component-list -->
