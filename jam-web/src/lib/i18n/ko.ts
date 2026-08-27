/**
 * 한국어(ko) UI 문구 딕셔너리
 *
 * 규칙 (PRD/DesignRenewal/Design_Phase01_04_PROJECT_SPEC.md "i18n 규칙")
 * - 모든 UI 텍스트는 JSX에 직접 쓰지 않고 이 딕셔너리 키로 참조한다.
 * - 새 문구가 필요하면 반드시 여기에 키를 먼저 추가한 뒤 컴포넌트에서 참조한다.
 * - 동적 값은 `{변수}` 보간 패턴을 사용한다. 예) "{count} 포인트" → t(ko.profile.pointBalance, { count })
 * - Phase 1 범위는 ko 로케일만 채운다 (en 등 실제 번역은 별도 작업).
 *
 * namespace 규칙: common / nav / profile / tabs / feed / today / todayCard
 */
export const ko = {
  /** 여러 화면에서 공통으로 쓰는 짧은 문구 */
  common: {
    close: '닫기',
    detail: '상세보기',
    loadMore: '더 불러오기',
    back: '뒤로',
    countItems: '{count}개',
    networkError: '네트워크 오류가 발생했어요',
    footerSlogan: 'JAM은 삐끗할 때도 있습니다. 하지만 곧 바로 잡습니다.',
    footerCopyright: '© 2026 Standard Manual All Rights Reserved.',
  },

  /** 바텀 탭바(글로벌 네비게이션) 라벨 */
  nav: {
    today: '투데이',
    badges: '배지',
    drops: 'JAM',
    missions: '미션',
    inventory: '인벤토리',
    profile: '프로필',
  },

  /** 마이페이지(프로필) */
  profile: {
    title: '프로필',
    anonymous: '익명',
    avatarAlt: '프로필',
    /** 잼 포인트 잔액. count는 toLocaleString('ko-KR') 처리된 문자열 */
    pointBalance: '{count} 포인트',
    pointBadgeLabel: '포인트',
    pointsAriaLabel: '포인트 내역 보기',
    editButton: '편집',
    followButton: '팔로우',
    followingButton: '팔로잉',
    logoutButton: '로그아웃',

    // Strava 동기화
    stravaTitle: 'Strava 동기화',
    stravaConnected: '동기화됨',
    stravaDisconnected: '동기화 안됨',
    stravaConnectButton: 'Strava 동기화',

    // Strava 콜백 도착 피드백 토스트 (20260824_008) — 배지 연출이 뜨지 않는 경우
    // (배지 0개 성공 / 실패)에 연동 결과를 알려준다
    stravaConnectSuccessToast: 'Strava 동기화를 완료했어요. 앞으로 활동하면 배지를 자동 획득해요',
    stravaConnectCancelledToast: 'Strava 동기화를 취소했어요. 다시 시도하려면 동기화 버튼을 눌러주세요',
    stravaConnectFailedToast: 'Strava 동기화에 실패했어요. 네트워크가 불안정했거나 일시적인 오류일 수 있어요. 잠시 후 다시 시도해주세요',

    // 빈 상태
    emptyBadges: '아직 획득한 배지가 없어요',
    emptyBadgesBody: 'Strava를 동기화하고 활동하면 배지를 획득할 수 있어요',
    emptyItembooks: '아직 발견한 컬렉션이 없어요',
    emptyItembooksBody: '아이템 배지를 모아 컬렉션을 발견해보세요',
    emptyFollowers: '아직 팔로워가 없어요',
    emptyFollowersBody: '활동을 공유하면 팔로워가 늘어나요',
    emptyFollowing: '아직 팔로잉이 없어요',
    emptyFollowingBody: '관심있는 유저를 팔로우해보세요',

    // 아이템북 카드
    itembookCompleted: '완성',
    itembookProgress: '{done}/{total}',
  },

  /** 프로필 통계바 탭 */
  tabs: {
    badge: '배지',
    itembooks: '컬렉션',
    followers: '팔로워',
    following: '팔로잉',
  },

  /** 활동 피드 (Feed 섹션 + 상세 시트) */
  feed: {
    title: '최근 활동',
    emptyTitle: '아직 기록이 없어요',
    emptyBody: '활동하면 여기에 기록이 쌓여요',

    // 필터 탭
    filterAll: '전체',
    filterItem: '아이템',
    filterMission: '미션',
    filterActivityBadge: '배지',

    // 이벤트 라벨
    eventBadgeEarned: '배지 획득',
    /** 체크인 배지 획득(20260826_004) — 피드에서 유일하게 라벨이 아니라 문장으로 표시된다.
     *  나머지 5개 타입은 짧은 라벨을 그대로 유지한다(사용자 확정 범위). */
    eventCheckin: '체크인 했어요',
    /** 같은 체크인 배지를 두 번째 이상 획득했을 때 eventCheckin 대신 쓴다 */
    eventCheckinRepeat: '{visitCount}번째 체크인 했어요',
    // 활동 Strava 동기화 후 배지엔진을 통해 지급된 경우("아이템 획득")와 POI에 직접 드랍된 경우("아이템 드랍")는
    // 같은 item_dropped 이벤트지만 출처가 다르므로 문구를 분리해서 표기한다 (FeedSection.tsx의 eventLabel 참고)
    eventItemEarned: '아이템 획득',
    eventItemDropped: '아이템 드랍',
    eventItemPickedUp: '아이템 픽업',
    eventMissionJoined: '미션 참가',
    eventMissionCompleted: '미션 완료',
    eventMissionCancelled: '미션 취소',

    // 희귀도 라벨 (색상 매핑은 상태 팔레트 — Phase 2에서 DB 이관)
    rarityCommon: 'Common',
    rarityRare: 'Rare',
    rarityLegend: 'Legend',
    rarityMythic: 'Mythic',

    // 카드 보조 문구
    fragmentOf: '{faction}의 파편',
    lastPiece: '마지막 파편!',
    rewardPoints: '+{points} 포인트',

    // 상세 시트 라벨
    /** 드랍/픽업이 일어난 지점 — '체크인'이 아니라 지점 정보다(20260826_004 경계 규칙 3) */
    rowPlace: '지점',
    /** 체크인 배지 획득 이벤트에서 체크인한 지점 */
    rowCheckinPlace: '체크인 지점',
    rowResult: '결과',
    rowRewardBadges: '보상 배지',
    rowRewardPoints: '보상 포인트',
    rowPoints: '포인트',
    rowDate: '일시',
    resultValue: '{current} / 목표 {target}',
    pointsValue: '{points} 포인트',
    pointsGained: '+{points} 포인트',

    // ─── 활동 묶음 카드 (20260827_018) ───────────────────────────────────
    // 같은 활동에서 나온 이벤트 2건 이상을 한 카드로 접을 때 쓰는 문구.
    // RECAP_CASEBOOK 확정 규칙을 그대로 따른다 —
    //   R1 「이번 활동으로」 접두 금지 / R2 고유명사에 작은따옴표 금지 /
    //   R3 화폐 단위는 「포인트」(「P」·「JAM 포인트」 금지) /
    //   R5 2종 이상이면 나열하지 않고 총량으로 말한다.
    /** 활동 묶음 헤드라인 — 보상이 배지뿐일 때 */
    groupBadges: '배지 {count}개를 획득했어요',
    /** 활동 묶음 헤드라인 — 포인트가 섞였을 때 */
    groupBadgesWithPoints: '배지 {count}개와 {points} 포인트를 획득했어요',
    /**
     * 배지가 아닌 이벤트가 섞인 예외 상황 폴백 — 총량을 「배지」라고 부를 수 없을 때.
     * 가이드 §2 고정 용어표에 없는 명사(「기록」 등)를 쓰지 않고, 고정 용어인
     * 「획득」만으로 문장을 세운다.
     */
    groupRecords: '{count}개를 획득했어요',
    // 활동 이름을 못 가져온 경우(조회 실패·이름 없음)엔 이름 줄 없이 헤드라인만 그린다.
    // 묶음 자체는 유지한다 — 이름이 없다고 다시 평면으로 펴지 않는다.
    /** 대표 썸네일 줄이 GROUP_THUMB_MAX에서 잘렸을 때 남은 **썸네일** 개수.
     *  이벤트 총량이 아니다 — 총량은 헤드라인이 이미 말한다. */
    groupMoreCount: '+{count}',
  },

  /** 투데이(홈) 화면 */
  today: {
    greeting: '안녕하세요',

    // Strava 동기화 상태 카드
    stravaLabel: 'Strava',
    stravaNotConnectedTitle: 'Strava 미동기화',
    stravaNotConnectedBody: 'Strava 동기화하면 활동 기반 배지를 자동 획득해요',
    stravaConnectButton: '지금 동기화하기',
    syncButton: '동기화',
    syncDone: '동기화 완료',
    syncFailed: '동기화 실패. 잠시 후 다시 시도해주세요',

    // 유저 검색
    searchPlaceholder: '아이디 또는 이메일로 유저 검색',
    searchAriaLabel: '유저 검색',
    searchButton: '검색',

    // 투데이 카드 스택
    cardStackTitle: '투데이',
    cardStackSubtitle: '오늘의 소식',
    cardReadArticle: '기사 읽기',
    cardReadMore: '자세히 보기',
    cardViewAll: '전체 보기',

    // 최근 배지
    recentBadgesTitle: '최근 배지',
    recentBadgesViewAll: '더보기',
    recentBadgesEmptyTitle: '아직 획득한 배지가 없어요',
    recentBadgesEmptyBody: 'Strava 동기화 후 활동하면 배지가 생겨요',

    // 바로가기
    shortcutsTitle: '바로가기',
    shortcutMissionTitle: '미션',
    shortcutMissionBody: '달성하고 보상 받기',
    shortcutInventoryTitle: '인벤토리',
    shortcutInventoryBody: '아이템 관리',
    shortcutDropsTitle: '드랍',
    shortcutDropsBody: '가까운 지점에서 드랍·픽업',
    shortcutCombineTitle: '믹스',
    shortcutCombineBody: '아이템 믹스하기',
  },

  /**
   * 배지 획득 연출 오버레이 — 동기화 직후 / 최초 Strava 연동 직후 공통.
   * 컴포넌트(patterns/BadgeRevealCarousel)에 기본 한국어 문구가 있지만, 주입을 빠뜨려도
   * 화면이 정상으로 보여 누락을 놓치기 쉬우므로 노출 문구는 전부 여기서 주입한다.
   */
  badgeReveal: {
    /** 오버레이 자체의 이름 (스크린리더) */
    ariaLabel: '획득한 배지',
    /** 상세를 다 싣지 못했을 때 마지막 카드 본문 */
    moreMessage: '배지 {count}개를 더 획득했어요',
    /** 마지막 카드 CTA — 프로필로 이동 */
    moreLabel: '배지 전부 보기',
    /** 오버레이가 열릴 때 스크린리더에 알리는 획득 개수 */
    opened: '배지 {count}개를 획득했어요',
    /** 최초 연동 직후 획득 배지를 되읽는 동안의 대기 안내 */
    loading: '방금 획득한 배지를 확인하고 있어요',
  },

  /** 투데이 카드 스택 콘텐츠 유형 (template_type) 라벨 — 색상 구분 없이 아이콘+라벨로만 식별 */
  todayCard: {
    badgeSpotlight: '배지 소개',
    progressNudge: '진행 알림',
    missionSpotlight: '미션',
    itembookMilestone: '컬렉션',
    locationTrend: '지역 트렌드',
    dropAlert: '드랍',
    editorialArticle: '기사',
    backToToday: '투데이로',
    noBody: '본문이 없어요',
  },

  /** 배지 목록/상세 화면 */
  badges: {
    title: '배지',
    tabActivity: '액티비티',
    tabItem: '아이템',
    tabCheckin: '체크인',
    tabItembook: '컬렉션',

    emptyActivityTitle: '아직 획득한 배지가 없어요',
    emptyActivityBody: 'Strava를 동기화하고 활동하면 배지를 획득할 수 있어요',
    emptyItemTitle: '아직 아이템 배지가 없어요',
    emptyItemBody: '활동을 완료하면 확률로 아이템 배지가 드랍돼요',
    emptyCheckinTitle: '아직 획득한 체크인 배지가 없어요',
    emptyCheckinBody: '산, 지하철역 같은 지점을 지나는 활동이 기록되면 자동으로 획득돼요',
    emptyItembookTitle: '아직 컬렉션이 없어요',
    emptyItembookBody: '관리자가 컬렉션을 등록하면 이 곳에 표시돼요',

    expiringSoon: '곧 만료',
    itembookCompleted: '완성',

    // 상세 페이지
    pointRewardEarned: '이 배지는 {points} 포인트를 함께 드렸어요',
    pointRewardPending: '이 배지를 획득하면 {points} 포인트를 함께 드려요',

    prerequisiteTitle: '선행 배지',
    prerequisiteBody: '아래 배지 중 하나를 먼저 획득해야 이 배지를 받을 수 있어요.',
    prerequisiteOwned: '보유',

    conditionTitle: '획득 조건',
    /** 체크인 배지 획득 조건 — 이 한 문장이 유일한 정본이다(20260826_004).
     *  이전에는 배지 상세·컬렉션 힌트·빈 상태에 6가지 버전이 흩어져 있었다. */
    conditionCheckinBody: '연결된 지점을 지나는 활동이 기록되면 자동으로 획득돼요. 체크인할 때마다 이력이 쌓여요.',

    earnHistoryTitle: '획득 이력',
    earnHistoryCount: '총 {count}회',
    earnHistoryUnknownPlace: '알 수 없는 지점',

    earnInfoTitle: '획득 정보',
    earnedAt: '획득 일시',
    triggerActivity: '트리거 활동',
    triggerDistance: '활동 거리',
    triggerDistanceValue: '{km} km',
    triggerDate: '활동 일자',
    viewOnStrava: 'Strava에서 보기',

    connectedLocationTitle: '연결 위치',
    viewOnMap: '{name} 지도에서 보기',
    viewOnMapButton: '지도에서 보기',

    physicalPatchButton: '실물 패치 보기',

    shareButtonLabel: '공유',
    shareActionShare: '공유하기',
    shareActionDownload: '저장하기',
    shareErrorStravaDisconnectedTitle: 'Strava 동기화가 끊겼어요',
    shareErrorStravaDisconnectedBody: '페이스·시간 데이터를 다시 가져오려면 Strava를 다시 동기화해야 해요',
    shareErrorNoTriggerTitle: '이 배지는 공유 이미지를 만들 수 없어요',
    shareErrorNoTriggerBody: '연결된 Strava 활동 기록이 없어 거리·페이스 정보를 채울 수 없어요',
    shareErrorFetchFailedTitle: '지금은 이미지를 만들 수 없어요',
    shareErrorFetchFailedBody: '잠시 후 다시 시도해주세요',
    shareErrorUnknownTitle: '이미지를 만들지 못했어요',
    shareErrorUnknownBody: '잠시 후 다시 시도해주세요',

    notEarnedTitle: '아직 획득하지 못한 배지예요',
    notEarnedBody: '조건을 달성하면 자동으로 획득돼요',

    checkinSafetyNotice: '이 배지는 표시된 위치 반경 {radius}m 안을 지나기만 해도 체크인돼요. 위험한 곳까지 굳이 들어갈 필요 없어요. 접근이 까다로운 곳이라면 알려주세요. 도와드릴게요.',

    earnedTag: '획득',
    notEarnedTag: '미획득',
    filterActivityLabel: '액티비티',
    filterActivityAll: '전체',
    filterRarityLabel: '등급',
    filterRarityAll: '전체',
    filterCheckinCategoryAll: '전체',
    sortCheckinLatest: '최신순',
    sortCheckinName: '이름순',
  },

  /** 인벤토리 목록/상세 */
  inventory: {
    eyebrow: '내 아이템',
    title: '인벤토리',
    combineButton: '믹스하기',
    slotsRemaining: '{count}개 슬롯 남음',
    slotsDetail: '{used} / {max} 슬롯 사용중 · {remaining}개 남음',
    emptyTitle: '아직 아이템이 없어요',
    emptyBody: '활동을 완료하면 아이템 배지가 드랍돼요',

    backToInventory: '인벤토리',
    infoSectionTitle: '아이템 정보',
    descSectionTitle: '이 아이템 정보',
    serialNumber: '일련번호',
    obtainMethod: '획득 방법',
    obtainedAt: '획득일',
    expiresAt: '만료일',
    expiresNone: '없음',
    expiringSuffix: ' 만료',
    rarity: '희귀도',
    noDescription: '설명이 없어요',
    belongsToItembook: '속한 컬렉션',
    expiringSoonTitle: '만료 임박',
    expiringSoonBody: '7일 이내에 이 아이템이 만료돼요',

    historyTitle: '획득 이력',
    historyLoading: '불러오는 중',
    historyError: '이력을 불러올 수 없어요',
    historyEmpty: '이력이 없어요',
    historyEmptyBody: '아직 이 아이템에 대한 기록이 없어요',
    historyUnknownUser: '알 수 없는 유저',
    obtainByDrop: '활동 드랍',
    obtainByDropEvent: '이벤트 드랍',
    obtainByPickup: '지점 픽업',
    obtainBySystem: '시스템 지급',
    eventDropped: '지점 드랍',
    eventPickedUp: '지점 픽업',

    backToInventoryLong: '인벤토리로 돌아가기',
  },

  /** 드랍/픽업 (지도) */
  drops: {
    locationUnsupported: '이 브라우저는 위치 기능을 지원하지 않아요',
    locationDenied: '위치 권한을 허용해 주세요',
    retry: '다시 시도',
    locating: '위치 확인 중',
    loadPoiFailed: '주변 지점을 불러오지 못했어요. 잠시 후 다시 시도해 주세요',
    // 20260826_002: '드랍 목록 로드 실패'·'인벤토리 로드 실패'는 개발자용 축약 문구였다.
    // 가이드의 [현상]→[원인/해결책] 구조 + 해요체로 다시 썼다.
    loadDropsFailed: '드랍된 아이템을 불러오지 못했어요. 잠시 후 다시 시도해 주세요',
    loadInventoryFailed: '인벤토리를 불러오지 못했어요. 잠시 후 다시 시도해 주세요',
    // 20260826_002 후속: unauthorized(401)가 매핑에 없어 "잠시 후 다시 시도해 주세요"로 흘렀다.
    // 세션이 풀린 상태라 다시 시도해도 영원히 실패한다 — 해결책이 원인과 어긋나 있었다.
    sessionExpired: '로그인이 풀렸어요. 다시 로그인하고 시도해 주세요',
    // 20260826_002 후속: 반경을 '50m'로 하드코딩하고 있었으나 실제 DROP_RADIUS_METERS는 500이다.
    // 바로 아래 noNearbyPlaces가 이미 '500m'라 같은 블록 안에서 값이 어긋나 있었다.
    // 문구에 숫자를 박지 말고 상수를 주입한다({m}).
    outOfRange: '{name}까지 {distance}m — {m}m 이내로 이동하면 드랍/픽업할 수 있어요',
    exploring: '주변 탐색 중',
    noNearbyPlaces: '주변 {m}m에 드랍/픽업할 수 있는 지점이 없어요',
    moveCloser: '지점에서 {m}m 이내로 가면 드랍/픽업할 수 있어요',
    checking: '확인 중',
    pickupItemsTitle: '픽업할 아이템',
    thisPlaceTitle: '이 지점',
    droppedBy: '{name}이(가) 드랍',
    anonymous: '익명',
    confirmDrop: "'{name}'을(를)\n여기에 드랍할까요?",
    cancel: '취소',
    dropButton: '드랍하기',
    dropSuccess: '드랍 완료',
    // 20260826_002: 드랍 실패 코드별 사용자 문구. 서버(api/drops)는 snake_case 코드만
    // 돌려주고, 이 문구들이 유일한 사용자 노출 경로다(PoiCarouselModal에서 코드로 매핑).
    dropFailed: '지금은 드랍할 수 없어요. 잠시 후 다시 시도해 주세요',
    // 반경은 pickupOutOfRange와 같은 이유로 DROP_RADIUS_METERS 상수를 주입한다.
    dropOutOfRange: '조금 더 가까이 가야 해요. 지점에서 {m}m 안에 있어야 드랍할 수 있어요',
    dropPoiNotFound: '이 지점 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요',
    dropItemNotFound: '이 아이템을 찾을 수 없어요. 인벤토리를 새로고침하고 다시 시도해 주세요',
    dropAlreadyDropped: '이미 드랍한 아이템이에요. 다른 아이템을 골라주세요',
    dropItemSlotted: '컬렉션에 넣은 아이템은 드랍할 수 없어요. 컬렉션에서 빼고 다시 시도해 주세요',
    dropEmptyTitle: '아직 아이템이 없어요',
    dropEmptyBody: '여기에 아이템을 드랍하면 다른 사람이 발견할 수 있어요',
    dropHereButton: '여기에 드랍하기',
    dropNoItems: '드랍할 아이템이 없어요',
    dropNoItemsBody: '인벤토리에 아이템이 생기면 여기서 드랍할 수 있어요',
    pickupButton: '픽업하기',
    pickupSuccess: '픽업 완료! 인벤토리를 확인해보세요',
    // 20260825_039: 바텀시트 포털화로 그동안 시트에 가려져 있던 픽업 실패 토스트가
    // 실제로 노출되기 시작했다. 서버 원문(개발자용 축약 문구)이 새어 나가지 않도록
    // 실패 코드를 전부 여기서 사용자 문구로 옮기고, 가이드의 [현상]→[원인/해결책] 구조로 다시 썼다.
    pickupFailed: '지금은 픽업할 수 없어요. 잠시 후 다시 시도해 주세요',
    pickupAlreadyDone: '이미 픽업된 아이템이에요. 다른 아이템을 찾아보세요',
    pickupInventoryFull: '인벤토리가 꽉 찼어요. 아이템을 정리하고 다시 시도해 주세요',
    // 반경은 DROP_RADIUS_METERS 상수를 주입한다 — 문구에 숫자를 직접 박아두면
    // 상수가 바뀔 때 조용히 어긋난다(실제로 서버 에러 문구가 500m를 '50m'로 잘못 적고 있었다).
    pickupOutOfRange: '조금 더 가까이 가야 해요. 드랍 지점에서 {m}m 안에 있어야 픽업할 수 있어요',
    pickupOwnDrop: '내가 드랍한 아이템이에요. 다른 러너가 픽업할 수 있게 그대로 두세요',
    // 20260826_002: 서버 원문으로 남아 있던 나머지 픽업 실패 경로를 코드화하면서 옮긴 문구.
    pickupDropNotFound: '이 아이템은 더 이상 여기에 없어요. 목록을 새로고침하고 다시 확인해 주세요',
    pickupPoiNotFound: '이 지점 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요',
    pickupPoiBlocked: '이 지점에서는 잠시 이용이 제한됐어요. 시간이 지난 뒤 다시 시도해 주세요',
    pickupLocationUnverified: '위치 정보를 확인할 수 없어요. 잠시 후 다시 시도해 주세요',
    // 좌표 없이 요청이 나간 경우 — 드랍·픽업 양쪽에서 함께 쓴다.
    locationMissing: '위치를 확인하지 못했어요. 위치 권한을 허용하고 다시 시도해 주세요',
    droppedAtPlace: '이 지점에 드랍됨',
    droppedAtPlaceBody: '{place}에 놓여 있는 아이템이에요',
    back: '뒤로',
  },

  /** 미션 목록/상세/현황 */
  missions: {
    eyebrow: '단기 목표',
    title: '미션',
    tabOngoing: '진행중',
    tabJoined: '참가중',
    // 20260825_028: 상시 미션은 종료일이 없어 '종료' 조건에 영원히 안 걸린다 —
    // 완료한 미션의 성취 이력을 볼 수 있도록 탭 범위를 확장 (완료 + 참여했던 종료 미션)
    tabEnded: '종료',
    filterButton: '필터',
    filterReset: '필터 초기화',
    sortLabel: '정렬',
    sortNewest: '최신순',
    sortOldest: '오래된순',
    sortEndingSoon: '종료임박순',
    activityTypeLabel: '활동 종류',
    activityTypeAll: '전체',
    missionTypeLabel: '미션 유형',
    missionTypeAll: '전체',
    missionTypeDistance: '거리',
    missionTypeActivityCount: '횟수',
    missionTypeCheckin: '체크인',
    missionTypeItemCollect: '아이템 픽업',
    missionTypeStreakDays: '연속 일수',
    missionTypeDurationMinutes: '단일 활동 시간',
    missionTypeElevationGainM: '단일 활동 고도',
    emptyFiltered: '조건에 맞는 미션이 없어요',
    emptyFilteredBody: '다른 조건으로 다시 찾아보세요',
    emptyOngoing: '진행 중인 미션이 없어요',
    emptyOngoingBody: '새로운 미션이 곧 열릴 예정이에요',
    emptyJoined: '참가 중인 미션이 없어요',
    emptyJoinedBody: '관심있는 미션에 참가해보세요',
    emptyEnded: '완료했거나 지난 미션이 없어요',
    emptyEndedBody: '미션을 완료하면 여기에 기록으로 남아요',
    tagNew: 'NEW',
    tagDone: '완료',
    tagJoined: '참가중',
    tagUpcoming: '시작전',
    tagEnded: '종료됨',
    tagPermanent: '상시',
    /** 20260825_028: 잠긴 레벨업 미션 + 완료 미션 표시 */
    tagLocked: '잠김',
    lockedHint: '{badge} {rarity} 배지를 획득하면 열려요',
    lockedTitle: '아직 열리지 않은 미션이에요',
    lockedBody: '{badge} {rarity} 배지를 먼저 획득하면 참가할 수 있어요.',
    lockedBodyGeneric: '앞 단계 배지를 먼저 획득하면 참가할 수 있어요.',
    joinErrorCompleted: '이미 완료한 미션이에요. 종료 탭에서 다시 볼 수 있어요.',
    joinErrorLocked: '아직 참가할 수 없는 미션이에요. {badge} {rarity} 배지를 먼저 획득하면 열려요.',
    joinErrorLockedGeneric: '아직 참가할 수 없는 미션이에요. 앞 단계 배지를 먼저 획득하면 열려요.',
    timeLeftSuffix: '남음',
    limitedSlots: '선착순 {count}명',
    rewardLabel: '보상',
    rewardNone: '없음',
    rewardBadgeCount: '배지 {count}개',
    rewardPoints: '{points} 포인트',

    backToList: '뒤로',
    backToDetail: '미션',
    goalDistance: '달성 거리',
    goalActivityCount: '활동 횟수',
    goalCheckin: '체크인',
    goalItemCollect: '아이템 픽업',
    goalStreakDays: '연속 활동 일수',
    goalDurationMinutes: '단일 활동 시간',
    goalElevationGainM: '단일 활동 고도 상승',
    goalDefault: '목표',
    conditionTitle: '달성 조건',
    myProgressTitle: '나의 진행 상황',
    achieved: '달성',
    notAchieved: '미달성',
    progressDone: '달성 완료',
    progressPct: '{pct}% 달성',
    rewardSectionTitle: '보상',
    /** 20260827_014 — 「JAM 포인트」·「1200P」 표기는 UX 가이드 §3 Bad. 「1,200 포인트」로 통일 */
    rewardPointsLine: '{points} 포인트',
    statusViewButton: '미션 상황 보기',
    joinConfirmBody: '한번 참가하면 취소할 수 없어요. 참가할까요?',
    joinConfirming: '처리 중',
    joinConfirmButton: '참가 확정',
    joinButton: '미션 참가하기',
    joinNote: '참가 후에는 취소할 수 없어요',
    joinSuccess: '미션에 참가했어요',
    joinError: '오류가 발생했어요',
    joinNetworkError: '네트워크 오류가 발생했어요. 다시 시도해주세요',
    completedBanner: '달성 완료!',

    statusEyebrow: '미션 상황',
    statusAchievementLabel: '달성 현황',
    statusIndividualLabel: '나의 현황',
    statusParticipants: '참가자 {count}명',
    statusAllRanks: '전체 순위',
    statusLoadError: '불러오지 못했어요',
    statusMeRanking: '— 내 순위 —',
    statusMeAchievement: '— 나 —',
    statusNoParticipants: '아직 참가자가 없어요',
    statusNoParticipantsBody: '가장 먼저 도전해보세요',
    statusMeSuffix: ' (나)',
  },

  /** 로그인 */
  auth: {
    wordmark: 'JAM!',
    googleLogin: '구글로 시작하기',
    errorFailed: '로그인에 실패했어요. 다시 시도해주세요.',
    errorGeneric: '오류가 발생했어요. 잠시 후 다시 시도해주세요.',
    terms: '계속하면 JAM!의 이용약관 및 개인정보처리방침에 동의하는 것으로 간주돼요.',
    devLogin: '테스트 로그인 (개발 전용)',
  },

  /** 온보딩(아이디 설정) */
  onboarding: {
    avatarAlt: '프로필',
    title: 'JAM! 아이디를\n만들어 주세요',
    subtitle: '아이디는 나중에 변경할 수 있어요',
    usernamePlaceholder: 'username',
    submitButton: '생성하기',
    submitting: '저장 중',
    errorEmpty: '아이디를 입력해 주세요',
    errorTooLong: '30자 이하로 입력해 주세요',
    errorFormat: '영문, 숫자, ., _ 만 사용할 수 있어요',
    errorDot: '점(.)으로 시작하거나 끝날 수 없어요',
    errorDoubleDot: '점(.)을 연속으로 사용할 수 없어요',
    available: '사용 가능한 아이디예요',
    taken: '이미 사용 중인 아이디예요',
    genericError: '오류가 발생했어요. 다시 시도해 주세요.',
    networkError: '네트워크 오류가 발생했어요.',
  },

  /** 프로필 편집 */
  profileEdit: {
    title: '프로필 편집',
    changePhoto: '탭하여 사진 변경',
    changePhotoAlt: '프로필 사진 변경',
    fileTypeError: 'JPEG, PNG, WebP 파일만 업로드할 수 있어요',
    fileSizeError: '파일 크기가 5MB를 초과해요',
    uploadError: '업로드에 실패했어요. 다시 시도해 주세요.',
    usernameLabel: '아이디',
    saveButton: '저장',
    saving: '저장 중',
    cancelButton: '취소',
    saveError: '저장에 실패했어요. 다시 시도해 주세요.',
  },

  /** JAM 포인트 내역 */
  points: {
    balanceLabel: '현재 잔액',
    historyTitle: '최근 내역',
    loading: '불러오는 중',
    loadError: '내역을 불러오지 못했어요.',
    retry: '다시 시도',
    emptyTitle: '아직 쌓인 포인트가 없어요.',
    emptyBody: 'Strava를 동기화하면 배지와 함께 포인트를 받을 수 있어요.',
    loadMore: '더 보기',
    loadingMore: '불러오는 중',

    /** 잔액 카드의 단위 — 숫자 팝인 애니메이션 대상에서 분리해 정적으로 렌더한다 */
    unitSuffix: '포인트',
    /** 잔액 카드 스크린리더 문구 */
    balanceAria: '{amount} 포인트',
    /** 내역 행 금액. amount는 부호(+/−)와 천단위 구분을 포함한 문자열 */
    amountValue: '{amount} 포인트',

    /**
     * 어드민 포인트 변동 사유 — **유저 노출용** 라벨 (20260824_021 2차).
     *
     * `points/reasons.ts`의 `ADMIN_REASONS` 라벨은 어드민 원장 전용이라
     * 「이벤트·프로모션 **지급**」·「어뷰징 적발 **회수**」처럼 UX 가이드 §1-3이
     * 유저 노출 화면에서 금지한 용어가 그대로 들어 있다. 소식 #44 본문을
     * "들어왔어요/빠져나갔어요"로 고친 취지가 괄호에서 무너지므로 매핑을 분리한다.
     * (`other`는 유저에게 알려줄 정보가 없어 라벨 자체를 두지 않는다 — 괄호째 뺀다)
     */
    reasonCsCompensation: '불편 보상',
    reasonErrorCorrection: '오류 정정',
    reasonEventPromotion: '이벤트·프로모션',
    reasonAbuseReclaim: '이용 정책 위반',
    reasonRetroactiveAdjustment: '과거 활동 반영',
  },

  /** 유저 검색 결과 */
  search: {
    promptTitle: '아이디 또는 이메일로 유저를 검색해보세요',
    promptBody: '두 글자 이상 입력해주세요',
    emptyTitle: '검색 결과가 없어요',
    emptyBody: '다른 아이디나 이메일로 다시 검색해보세요',
    resultCount: '{count}명의 유저',
  },

  /** 팔로워/팔로잉 목록 */
  social: {
    followersCount: '팔로워 {count}명',
    followingCount: '팔로잉 {count}명',
    emptyFollowers: '팔로워가 없어요',
    emptyFollowersBody: '누군가 팔로우하면 여기에 표시돼요',
    emptyFollowing: '아직 팔로우한 사람이 없어요',
    emptyFollowingBody: '유저가 팔로우를 시작하면 여기에 표시돼요',
    followButton: '팔로우',
    followingButton: '팔로잉',
  },

  /** 아이템북 목록/상세 */
  itembooks: {
    eyebrow: '컬렉션',
    title: '컬렉션',
    subtitle: '아이템 배지를 모아 컬렉션을 완성해보세요',
    emptyTitle: '아직 발견한 컬렉션이 없어요.',
    emptyBody: '아이템 배지를 모아봐요!',
    userEyebrowPrefix: '님이 발견한 컬렉션',
    completed: '완성',
    discoveredCount: '{discovered} / {total} 발견',
    discoveredCountSimple: '{count}개 발견',
    backToDetail: '배지 상세',
    backToList: '뒤로',
    slotHint: '보유한 아이템 배지를 슬롯에 장착해 컬렉션을 완성해요',
    slotsTitle: '아이템배지 슬롯',
    noBadgesTitle: '아직 이 컬렉션에 등록된 배지가 없어요.',
    noBadgesBody: '관리자가 배지를 등록하면 여기에 표시돼요',
    checkinSectionTitle: '체크인 배지',
    checkinHint: '체크인 배지는 연결된 지점을 지나는 활동이 기록되면 자동으로 채워져요',
    checkinEarned: '획득',
    checkinNotEarned: '미획득',
    completedTitle: '컬렉션 완성!',
    completedBody: '모든 아이템 배지를 슬롯에 장착했어요',
    unknownBadge: '???',
    slotLoginRequired: '로그인이 필요해요.',
    slotFailed: '슬롯에 실패했어요.',
    unslotFailed: '슬롯 해제에 실패했어요.',
    networkError: '네트워크 오류가 발생했어요.',
    unslotButton: '해제',
    slotButton: '추가',
    processing: '처리 중',
    ownedPrefix: '보유 ',
  },

  /**
   * 알림(소식)함 — 20260824_021
   * 문구 규칙: Specs/PRD/Notification/PRD.md §3(20종 표) · §5(강조 규칙)
   *
   * `{슬롯}`은 payload에서 채워지는 변수이며 **렌더러가 자동으로 볼드 처리**한다.
   * 고정 텍스트는 일반체, 컬러 강조는 쓰지 않는다. 소식마다 강조 지점을 따로 정의하지 않는다.
   *
   * `{을/를}`·`{이/가}` 같은 조사 마커는 **바로 앞 슬롯 값의 받침**에 따라 렌더러가
   * 치환하며 볼드가 아니다(조사는 변수가 아니라 문법이다).
   */
  notifications: {
    title: '알림',
    bellLabel: '알림',
    unreadDotLabel: '새 소식이 있어요',
    /**
     * 진입 직전 seen_at 스냅샷 기준으로 그리는 구분선.
     * 선은 **새 소식과 이전 소식의 실제 경계**에 놓인다(위쪽이 새 소식) — 목록 맨 위에
     * 두면 나눌 대상이 없어 헤더가 되고, 정작 경계에는 라벨이 없어진다(iOS Mail·Slack 방식).
     */
    newDivider: '여기까지 새 소식 {count}개',
    sectionToday: '오늘',
    sectionWeek: '이번 주',
    sectionMonth: '이번 달',
    sectionEarlier: '이전',
    emptyTitle: '아직 도착한 소식이 없어요',
    emptyBody: '배지를 획득하거나 누군가 내 드랍을 픽업하면 여기에 쌓여요',
    loadError: '소식을 불러오지 못했어요. 잠시 후 다시 시도해주세요',
    /** 첫 페이지 조회 자체가 실패했을 때 — "소식 0건"과 반드시 구분해서 보여준다 */
    errorTitle: '소식을 불러오지 못했어요',
    errorBody: '연결 상태를 확인하고 다시 시도해주세요',
    retry: '다시 시도',
    loadingMore: '불러오는 중',
    /** ⑧ 계정·시스템 경고 아이콘의 스크린리더 라벨 */
    warningLabel: '확인이 필요해요',
    /** 2단 타겟 행의 아바타 링크 — 이미지뿐이라 접근 가능한 이름이 없다 */
    avatarLinkLabel: '{name}님 프로필',
    /** 아직 화면이 모르는 type(신규 소식 추가 후 배포 시차)이 들어왔을 때의 안전망 */
    unknown: '새로운 소식이 도착했어요',

    // ── 슬롯 값 조각 (payload에서 만들어 볼드로 들어간다) ──
    slotBadgeCount: '배지 {count}개',
    slotItemBadgeCount: '아이템 배지 {count}개',
    slotCount: '{count}개',
    slotPeopleCount: '{count}명',
    /** #18 묶음 — 「드랍한 3곳에 …」 */
    slotPlaceCount: '{count}곳',
    /** ⑥ 사람 단위 묶음 — 「소식이 1건 더 있어요」 (R15) */
    slotNewsCount: '{count}건',
    /** 결산 F2 — 「활동 5건에서 …」 */
    slotActivityCount: '활동 {count}건',
    slotPlaceMore: '{name} 외 {count}곳',
    /** R3 — 유저 노출 문구의 화폐 단위는 「포인트」다(「JAM 포인트」·「P」 금지) */
    slotPoints: '{amount} 포인트',
    slotRank: '{rank}위',
    slotDaysOrdinal: '{days}일째',
    slotFirstBadge: '첫 배지',
    slotDay1: '하루',
    slotDay2: '이틀',
    slotDay3: '사흘',
    slotDayN: '{days}일',

    // ── ① 활동 결산 (RECAP_CASEBOOK A~F / 20260827_014) ──
    //
    // 문장을 [머리] + [꼬리] 두 조각으로 조립한다. 포인트는 「종류」가 아니라 문장 꼬리에
    // 붙는 부속이라(티켓 §A), 머리마다 포인트 있는 판·없는 판을 따로 쓰면 문구가 두 배로
    // 늘고 서로 어긋난다. 꼬리 하나만 갈아 끼운다.
    //
    //   recapHeadActivityOne + recapTail       → 한강 러너 배지를 획득했어요            (A1)
    //   recapHeadActivityOne + recapTailPoints → 한강 러너 배지와 50 포인트를 획득했어요 (A2)
    recapHeadActivityOne: '{badgeName} 배지',
    recapHeadActivityMany: '{badgeName} 외 {badgeCount}',
    recapHeadRareOne: '{rarity} 배지 {badgeName}',
    recapHeadRareMany: '{rarity} 배지 {badgeName} 외 {badgeCount}',
    recapHeadItemOne: '{itemName}',
    recapHeadItemMany: '{itemName} 외 {itemCount}',
    recapHeadCheckin: '{poiName}에서 체크인 배지',
    recapHeadTotal: '{badgeCount}',
    /** C1 — 숫자만으로는 뭘 받았는지 몰라 보러 가게 한다 */
    recapHeadTotalConfirm: '획득한 {badgeCount}',
    recapHeadActivities: '{activityCount}에서 {badgeCount}',
    /** 활동 밖 적립(믹스 위로 포인트 등)만 남은 결산 */
    recapHeadPointsOnly: '{points}',
    recapTail: '{을/를} 획득했어요',
    recapTailPoints: '{와/과} {points}{을/를} 획득했어요',
    recapTailConfirm: '{을/를} 확인해보세요',
    /** A5 — 「~에서 배지를 획득하다」와 서술어가 달라 조사도 「에」다 */
    msgRecapCheckinRepeated: '{poiName}에 {visitCount}번째 체크인 했어요',
    msgRecapFirstBadge: '{firstBadge}가 도착했어요',
    msgRecapFirstBadgeMore: '{firstBadge}가 도착했어요. 프로필을 확인해보세요',

    // ── ② 컬렉션 ──
    msgCollectionSlottable: '{bookName}에 넣을 수 있는 아이템 배지가 {count} 있어요',
    /** R11 묶음 — 컬렉션이 아니라 **배지를 센다.** 착지도 배지가 있는 곳(인벤토리)이다 */
    msgCollectionSlottableGrouped: '컬렉션에 넣을 수 있는 {itemCount}{이/가} 있어요',
    /** R12 — 부족한 것을 이름으로 부른다. 묶음에서는 성립하지 않는다 */
    msgCollectionNearComplete: '{badgeName}{을/를} 찾아 {bookName}{을/를} 완성해보세요',
    msgCollectionNearCompleteGrouped: '한 칸만 남은 컬렉션이 {count} 있어요',
    /** R13 — 컬렉션의 목표는 「완성」이다(「추가」·「장착」 금지) */
    msgCollectionCompletable: '{bookName}{을/를} 다 모았어요. 컬렉션을 완성해보세요',
    msgCollectionCompletableGrouped: '다 모은 컬렉션 {count}{을/를} 완성해보세요',

    // ── ③ 내가 드랍한 아이템 배지 ──
    msgDropPickedUpOne: '{actor}님이 {badgeName}{을/를} 픽업했어요',
    /** 묶음은 착지가 없다 — 픽업된 아이템은 소프트 삭제 상태라 갈 곳이 없다 */
    msgDropPickedUpMany: '드랍한 {itemCount}{이/가} 픽업됐어요',
    /** R14 — 본인 닉네임을 부르지 않는다. 「자리」→「곳」 */
    msgDropSpotActive: '드랍한 곳에 {visitors}{이/가} 다녀갔어요',
    msgDropSpotActiveGrouped: '드랍한 {placeCount}에 {visitors}{이/가} 다녀갔어요',

    // ── ④ 미션 ──
    msgMissionMilestone50: '{missionTitle}, 절반을 넘었어요',
    msgMissionMilestone80: '{missionTitle}, 80%를 넘었어요',
    /** 50%·80% 구간이 섞일 수 있어 구간을 말하지 않는다 */
    msgMissionMilestoneGrouped: '미션 {count}{이/가} 목표에 가까워졌어요',
    msgMissionDeadline: '{missionTitle}{이/가} {days} 뒤 끝나요. {remaining} 남았어요',
    msgMissionDeadlineGrouped: '미션 {count}{이/가} {days} 뒤 끝나요',
    /** R4 — 미션 소식은 「완료했다」만 말한다. 보상은 착지한 미션 상세에서 본다 */
    msgMissionCompleted: '{missionTitle}{을/를} 완료했어요',
    msgMissionCompletedGrouped: '{missionTitle} 외 미션 {count}{을/를} 완료했어요',
    msgMissionRankUp: '{missionTitle}에서 {rank}로 올라섰어요',
    msgMissionRankUpGrouped: '미션 {count}에서 순위가 올랐어요',
    /** #24는 완료자에게만 축하한다 — 못 끝낸 사람에게 「축하해요!」는 조롱이 된다 */
    msgMissionEndedDone: '축하해요! {missionTitle}{을/를} 끝냈어요. 결과를 확인해보세요',
    msgMissionEnded: '{missionTitle}{이/가} 끝났어요. 결과를 확인해보세요',
    msgMissionEndedDoneGrouped: '축하해요! 미션 {count}{을/를} 끝냈어요. 결과를 확인해보세요',
    msgMissionEndedGrouped: '미션 {count}{이/가} 끝났어요. 결과를 확인해보세요',

    // ── ⑤ 소셜 — 나에게 ──
    /** R14 — 내 알림함이라 대상은 나로 확정돼 있다. 「시현님을」을 부르지 않는다 */
    msgFollowedOne: '{actor}님이 팔로우해요',
    msgFollowedTwo: '{actor}님과 {actor2}님이 팔로우해요',
    msgFollowedMany: '{actor}님 외 {others}이 팔로우해요',

    // ── ⑥ 소셜 — 팔로우한 사람의 활동 ──
    /** 뒤에 msgRareBadgeEarned가 이어 붙는다 (등급 라벨은 그 안의 {rarity} 슬롯) */
    msgFollowingActorPrefix: '{actor}님이 ',
    /**
     * #29 팔로잉 희귀 배지 전용 — `msgFollowingActorPrefix`와 합성해 쓴다.
     * 원래 ① 레거시 #2(`rare_badge_earned`)의 문구였고, 20260827_016에서 레거시 경로가
     * 제거된 뒤로는 이 조합에서만 쓰인다.
     */
    msgRareBadgeEarned: '{rarity} 배지 {badgeName}{을/를} 획득했어요',
    msgFollowingCollectionComplete: '{actor}님이 {bookName}{을/를} 다 모았어요',
    msgFollowingMissionCompleteOne: '{actor}님이 {missionTitle}{을/를} 완료했어요',
    msgFollowingMissionCompleteMany: '{actor}님 외 {others}이 {missionTitle}{을/를} 완료했어요',
    /** R15 — 한 사람의 소식이 하루 2건 이상이면 대표 하나 + 나머지는 개수로 접는다 */
    msgFollowingMoreSuffix: '. 소식이 {moreCount} 더 있어요',

    // ── ⑧ 계정·시스템 (경고 스타일 — 렌더 시점에 현재 상태로 재평가) ──
    msgStravaDisconnected: 'Strava 동기화가 끊겼어요. 다시 동기화해야 배지를 획득할 수 있어요',
    /** #40(끊김)과 원인이 달라 해결책도 다르다 — 토큰은 멀쩡한데 새 활동이 안 들어오는 경우 */
    msgSyncStalled: '{days} 새 활동이 없어요. Strava에 활동이 기록됐는지 확인해보세요',
    msgInventoryFull: '인벤토리가 꽉 찼어요. {maxSlots}까지만 보관할 수 있어서 픽업이 안 될 수 있어요',
    msgPointsIn: '{points}가 들어왔어요 ({reason})',
    msgPointsInNoReason: '{points}가 들어왔어요',
    msgPointsOut: '{points}가 빠져나갔어요 ({reason})',
    msgPointsOutNoReason: '{points}가 빠져나갔어요',
  },

  /** 아이템 믹스 */
  combine: {
    eyebrow: '아이템 믹스',
    title: '믹스',
    selectedCount: '선택한 아이템 ({count}/{max})',
    slotOnboarding: '인벤토리에서 아이템을 골라 믹스해 보세요',
    combineButton: '믹스하기',
    hintsTitle: '힌트',
    hintUnknown: '???',
    recipesTitle: '공개 레시피',
    recipeLine: '재료 {count}개 → 결과 배지 · 성공률 {pct}%',
    myItemsTitle: '내 아이템',
    emptyInventory: '인벤토리가 비어 있어요.',
    emptyInventoryBody: '활동을 완료하면 믹스할 아이템이 드랍돼요',
    successResult: '{names} 획득!',
    selectRangeError: '아이템 2~10개를 선택해주세요.',
    itemsNotFound: '아이템을 찾을 수 없어요.',
    recipeFail: '믹스에 실패했어요. 아이템이 소각됐어요.',
    consolationPoints: ' (위로 포인트 +{points})',
    genericError: '오류가 발생했어요.',
    genericFail: '믹스 실패',
  },
} as const

export type Dictionary = typeof ko
