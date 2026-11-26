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
디자인 토큰(층·이름·값·클래스·사용 수)의 카탈로그는 [tokens.md](tokens.md)에 있다. 이 문서도 `node scripts/gen-token-catalog.mjs`가 만든다.
스토리가 없는 정본 파일은 허용하지 않는다(`verify`의 `component-list` 단계와 pre-commit이 검사). 새 정본 컴포넌트는 같은 이름의 스토리 파일과 함께 들어와야 한다.

<!-- BEGIN generated: component-list -->
정본 컴포넌트 파일 49개 · 스토리 있음 49개 · 없음 0개

| 파일 | export | 설명 | 스토리 (제목·개수) |
|---|---|---|---|
| `Accordion.tsx` | Accordion | 한 번에 하나만 펼쳐지는 접이식 목록이다. 철학 화면의 자주 묻는 질문에서 쓴다. | UI/Navigation/Accordion (1개) |
| `Avatar.tsx` | Avatar | 프로필 사진을 원이나 둥근 사각형 안에 그리고 사진이 없으면 사용자 아이콘을 보여 주는 아바타다. 사진이 없을 때 흰 면을 칠할지는 face로 고르며, 목록 줄… | UI/Cards/Avatar (5개) |
| `AvatarPickButton.tsx` | AvatarPickButton | 아바타를 감싼 «사진 고르기» 버튼이다. 올리는 중에는 덮개가 씌워진다. 프로필 편집·온보딩에서 쓴다. | UI/Buttons/AvatarPickButton (2개) |
| `BadgeGridCard.tsx` | BadgeGridCard, BadgeGridCardPlaceholder | 배지 한 장을 정사각 썸네일과 이름·칩으로 보여 주는 격자 카드다. 배지 목록·컬렉션 상세·믹스 재료 칸에서 쓴다. | UI/Cards/BadgeGridCard (18개) |
| `BadgeHeroSection.tsx` | BadgeHeroSection | 배지 한 장의 이미지·등급 칩·이름·설명을 가운데로 쌓은 대표 카드다. 배지 상세 페이지와 드랍 바텀시트, 잠긴 아이템 배지 상세에서 쓴다. | UI/Cards/BadgeHeroSection (7개) |
| `BadgeLevelChip.tsx` | BadgeLevelChip | 무한레벨형 배지의 «Lv.N» 칩이다. 등급 칩 대신 홈 피드·미션 목록·배지 상세·획득 연출에서 쓴다. | UI/Cards/BadgeLevelChip (3개) |
| `BadgeRevealCarousel.tsx` | BadgeRevealCarousel | 배지를 얻은 순간 카드를 3D로 넘겨 보는 전체 화면 캐러셀이다. 배지 획득 연출과 보류 아이템 배지 고르기에서 쓴다. | UI/Patterns/BadgeRevealCarousel (12개) |
| `BottomSheet.tsx` | BottomSheet | 화면 아래에서 올라와 끌어 내려 닫는 시트다. 배지 공유·합성·컬렉션 등 여러 화면에서 쓴다. | UI/Feedback/BottomSheet (4개) |
| `Button.tsx` | Button | 변형·크기·면을 고르는 기본 버튼이다. 로그인·팔로우·배지 상세 등 거의 모든 화면에서 쓴다. | UI/Buttons/Button (18개) |
| `Card.tsx` | Card | 흰 면의 둥근 카드 틀이다. 서비스 화면 대부분의 묶음 면이며 tint는 카드 안 구획, inverse는 선택·안내 신호에 쓴다. | UI/Cards/Card (3개) |
| `Carousel.tsx` | Carousel | 가운데 카드가 선택되는 무한 순환 가로 캐러셀이다. 지도의 장소 카드 모달에서 쓴다. | UI/Navigation/Carousel (3개) |
| `CategorySticker.tsx` | CategorySticker | 홈 피드 카드 모서리에 붙는 분류 스티커다. 조약돌·물결 모양 바탕에 분류 문구와 JAM 로고 글자를 얹는다. | UI/Cards/CategorySticker (3개) |
| `Checkbox.tsx` | Checkbox | 라벨이 붙은 체크박스다. 온보딩의 만 14세 이상 확인에서 쓴다. | UI/Forms/Checkbox (2개) |
| `CollectionGridCard.tsx` | CollectionGridCard | 컬렉션 한 개를 수집 진행도와 함께 보여 주는 격자 카드다. 배지 목록의 컬렉션 탭에서 쓴다. | UI/Cards/CollectionGridCard (4개) |
| `CountLabelButton.tsx` | CountLabelButton | 숫자 위·이름 아래로 쌓은 누르는 칸이다. 프로필의 팔로워·팔로잉·포인트 칸에서 쓴다. | UI/Buttons/CountLabelButton (3개) |
| `EmptyState.tsx` | EmptyState | 내용이 없을 때 제목·설명·버튼을 보여 주는 안내 블록이다. 배지·친구·컬렉션 등 목록 화면에서 쓴다. | UI/Feedback/EmptyState (3개) |
| `Footer.tsx` | Footer | 전역 하단 푸터다. 메인·온보딩 레이아웃에서 쓴다. | UI/Navigation/Footer (1개) |
| `FooterLogo.tsx` | FooterLogo | 푸터 맨 아래에서 올라오는 JAM! 로고다. Footer가 쓴다. | UI/Navigation/FooterLogo (1개) |
| `IconButton.tsx` | IconButton | 아이콘만 담은 44px 원형 버튼이다. 배지 획득 연출·장소 카드 모달·지도 내 위치에서 쓴다. | UI/Buttons/IconButton (3개) |
| `IconLabelButton.tsx` | IconLabelButton | 동그라미 아이콘 아래에 글자를 둔 세로 버튼이다. 배지 공유 시트의 복사하기·저장하기·더보기에서 쓴다. | UI/Buttons/IconLabelButton (4개) |
| `InlineNotice.tsx` | InlineNotice | 지금은 안 되는 까닭을 한두 문장으로 알리는 안내 블록이다. 로그인·컬렉션·조합·드랍 시트에서 쓴다. | UI/Feedback/InlineNotice (3개) |
| `Input.tsx` | Input | 캡슐 모양의 글자 입력칸이다. 프로필 편집·사용자 검색·온보딩·탈퇴 시트에서 쓴다. | UI/Forms/Input (6개) |
| `ItemSerialCode.tsx` | ItemSerialCode | 아이템 배지의 일련번호를 앞 4자 카드와 숫자 상자로 그리는 스탬프다. 배지 상세와 드랍 바텀시트, 잠긴 배지 상세에서 쓴다. | UI/Patterns/ItemSerialCode (2개) |
| `LabelChip.tsx` | LabelChip | 카드 좌상단에 붙는 작은 라벨 칩이다. 오늘 현황 줄·정지 안내·획득 이력의 «처음 받은 날»·기사 화면에서 쓴다. | UI/Cards/LabelChip (3개) |
| `ListCard.tsx` | ListCard | 이미지·제목·칩·값·푸터를 한 장에 쌓아 보여 주는 목록 카드다. 미션 목록에서 미션 한 건을 그릴 때 쓴다. | UI/Cards/ListCard (3개) |
| `ListRow.tsx` | ListRowEm, ListRowChip, ListRow | 왼쪽 이미지·제목·보조 문구·오른쪽 값을 슬롯으로 조합하는 목록 행이다. 홈 피드·팔로우 목록·획득 이력·레시피 보상 등 여러 목록에서 쓴다. | UI/Cards/ListRow (15개) |
| `LoadMoreButton.tsx` | LoadMoreButton | 목록 끝에서 더 불러오는 전체 폭 버튼이다. 친구 피드·알림·포인트 내역에서 쓴다. | UI/Buttons/LoadMoreButton (3개) |
| `LockedTile.tsx` | LockedTile | 잠긴 아이템 배지를 자물쇠 하나로 대신 보여 주는 정사각 타일이다. 잠긴 배지 상세·배지 격자·드랍 시트·미션 보상에서 쓴다. | UI/Cards/LockedTile (3개) |
| `MixerSlot.tsx` | ActionCircle, MixerSlot | 믹스·등급 올리기에서 재료 배지를 담는 슬롯 카드다. 빈 칸·잠긴 칸·채운 칸 세 상태를 그린다. | UI/Patterns/MixerSlot (4개) |
| `NotificationBell.tsx` | NotificationBell | 읽지 않은 알림이 있으면 빨간 점이 뜨는 종 버튼이다. 상단 바 오른쪽에서 쓴다. | UI/Navigation/NotificationBell (2개) |
| `PointText.tsx` | PointText | 포인트 값과 «포인트» 단위를 주황색 한 덩어리로 보여 준다. 미션·레시피 보상, 포인트 내역, 문장 속 포인트에서 쓴다. | UI/Patterns/PointText (3개) |
| `PopInNumber.tsx` | PopInNumber | 숫자가 바뀔 때 각 자리가 블러와 함께 아래에서 들어오는 숫자 전환이다. 프로필의 팔로워 수와 캡슐 게이지의 채운 양에서 쓴다. | UI/Patterns/PopInNumber (2개) |
| `ProgressBar.tsx` | ProgressBar | 진행률을 가로 막대로 보여 주는 바다. 미션 상세·오늘 상태 띠·랭킹 줄에서 쓴다. | UI/Feedback/ProgressBar (4개) |
| `ProgressCountBar.tsx` | ProgressCountBar | 진행 막대와 오른쪽 «n/n» 수치를 한 줄로 보여 준다. 컬렉션 상세와 인벤토리에서 쓴다. | UI/Feedback/ProgressCountBar (2개) |
| `RarityBadge.tsx` | RarityBadge | 배지 등급(Rare·Epic·Mystic 등)을 보여 주는 칩이다. 홈 피드·미션 목록·배지 상세·컬렉션·등급 올리기에서 쓴다. | UI/Cards/RarityBadge (7개) |
| `Select.tsx` | Select | 캡슐 모양의 선택 상자다. 배지 목록의 필터·정렬과 미션 목록의 정렬에서 쓴다. | UI/Forms/Select (1개) |
| `Skeleton.tsx` | Skeleton | 불러오는 동안 자리를 채우는 반짝이는 막대다. 프로필·캡슐 위젯·합성 결과 시트에서 쓴다. | UI/Feedback/Skeleton (3개) |
| `SlidingTabs.tsx` | SlidingTabs | 활성 알약이 탭 사이를 미끄러지는 탭 전환이다. 배지·미션 목록, 홈 피드, 문의 화면에서 쓴다. | UI/Navigation/SlidingTabs (3개) |
| `SlotCircleButton.tsx` | SlotCircleButton | 컬렉션 칸 모서리의 «빼기»·«추가» 원형 버튼이다. 컬렉션 상세 칸 격자와 조합 레시피 칸에서 쓴다. | UI/Buttons/SlotCircleButton (5개) |
| `SlotOutline.tsx` | SlotOutline | 컬렉션 슬롯에서 아직 없는 배지의 윤곽을 점선으로만 그리는 외곽선이다. 배지 격자 카드의 빈 칸에서 쓴다. | UI/Cards/SlotOutline (3개) |
| `SwapText.tsx` | SwapText | 같은 자리에서 문구가 바뀔 때 위로 빠지고 아래에서 들어오는 문구 전환이다. 프로필 버튼·잠긴 아이템 배지 상세·믹스 결과 시트에서 쓴다. | UI/Patterns/SwapText (2개) |
| `SyncIconButton.tsx` | SyncIconButton | 동기화를 누르는 아이콘 원형 버튼이다. 홈을 뺀 화면의 상단 바에서 쓴다. | UI/Buttons/SyncIconButton (3개) |
| `TabBar.tsx` | TabBar | 화면 아래에 고정된 다섯 칸 탭 바다. 메인 레이아웃에서 쓴다. | UI/Navigation/TabBar (5개) |
| `Toast.tsx` | ToastRow, ToastScrim, ToastProvider | 화면 아래에 잠깐 뜨는 알림 한 줄과 그 공급자다. 팔로우·공유·합성 등 결과 알림에서 쓴다. | UI/Feedback/Toast (3개) |
| `TopNav.tsx` | TopNav | 서비스의 상단 바다. 뒤로가기·제목·동기화·알림 종·아바타를 얹고 메인 화면 대부분에서 쓴다. | UI/Navigation/TopNav (6개) |
| `TopNavBar.tsx` | TopNavBar | 뒤로가기·제목·오른쪽 칸을 가진 상단 바 본체다. 서비스 TopNav와 약관 화면 LegalTopNav가 감싸 쓴다. | UI/Navigation/TopNavBar (1개) |
| `VisitCountChip.tsx` | VisitCountChip | 체크인 배지를 방문한 횟수를 «×N» 칩으로 보여 준다. 배지 목록 카드와 배지 상세에서 2회 이상 방문했을 때만 쓴다. | UI/Cards/VisitCountChip (2개) |
| `WanderingEyesLoader.tsx` | WanderingEyesLoader | 눈동자가 돌아다니다 깜빡이는 대기 표시다. 화면 전환·배지 획득 연출·공유 버튼 등 로딩에서 쓴다. | UI/Feedback/WanderingEyesLoader (2개) |
| `icons.tsx` | 42개 (HomeIcon, MedalIcon, CheckinIcon 외) | 라인·채움 두 벌의 JAM! 아이콘 세트다. 서비스 대부분의 화면이 가져다 쓴다. | UI/Icons/IconCatalog (1개) |
<!-- END generated: component-list -->
