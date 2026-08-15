/**
 * 한국어(ko) UI 문구 딕셔너리
 *
 * 규칙 (PRD/DesignRenewal/Design_Phase01_04_PROJECT_SPEC.md "i18n 규칙")
 * - 모든 UI 텍스트는 JSX에 직접 쓰지 않고 이 딕셔너리 키로 참조한다.
 * - 새 문구가 필요하면 반드시 여기에 키를 먼저 추가한 뒤 컴포넌트에서 참조한다.
 * - 동적 값은 `{변수}` 보간 패턴을 사용한다. 예) "{count}P" → t(ko.profile.pointBalance, { count })
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
    inventory: '인벤',
    profile: '프로필',
  },

  /** 마이페이지(프로필) */
  profile: {
    title: '프로필',
    anonymous: '익명',
    avatarAlt: '프로필',
    /** 잼 포인트 잔액. count는 toLocaleString('ko-KR') 처리된 문자열 */
    pointBalance: '{count}P',
    pointBadgeLabel: 'P',
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

    // 빈 상태
    emptyBadges: '아직 겟한 배지가 없어요',
    emptyItembooks: '아직 발견한 컬렉션이 없어요',
    emptyFollowers: '아직 팔로워가 없어요',
    emptyFollowing: '아직 팔로잉이 없어요',

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

    // 필터 탭
    filterAll: '전체',
    filterItem: '아이템',
    filterMission: '미션',
    filterActivityBadge: '배지',

    // 이벤트 라벨
    eventBadgeEarned: '배지 겟',
    // 활동 Strava 동기화 후 배지엔진을 통해 지급된 경우("아이템 겟")와 POI에 직접 드랍된 경우("아이템 드랍")는
    // 같은 item_dropped 이벤트지만 출처가 다르므로 문구를 분리해서 표기한다 (FeedSection.tsx의 eventLabel 참고)
    eventItemEarned: '아이템 겟',
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
    rewardPoints: '+{points}P',

    // 상세 시트 라벨
    rowPlace: '장소',
    rowResult: '결과',
    rowRewardBadges: '보상 배지',
    rowRewardPoints: '보상 포인트',
    rowPoints: '포인트',
    rowDate: '일시',
    resultValue: '{current} / 목표 {target}',
    pointsValue: '{points}P',
    pointsGained: '+{points}P',
  },

  /** 투데이(홈) 화면 */
  today: {
    greeting: '안녕하세요',

    // Strava 동기화 상태 카드
    stravaLabel: 'Strava',
    stravaNotConnectedTitle: 'Strava 미동기화',
    stravaNotConnectedBody: 'Strava 동기화하면 활동 기반 배지를 자동 겟해요',
    stravaConnectButton: '지금 동기화하기',
    syncButton: '동기화',
    syncDone: '동기화 완료',
    syncFailed: '동기화 실패. 잠시 후 다시 시도해주세요',
    syncBadgeDone: '배지 {count}개 겟',
    syncMissionDone: '미션 {count}개 달성',
    syncItembookDone: '컬렉션 {count}개 완성',

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
    recentBadgesEmptyTitle: '아직 겟한 배지가 없어요',
    recentBadgesEmptyBody: 'Strava 동기화 후 활동하면 배지가 생겨요',

    // 바로가기
    shortcutsTitle: '바로가기',
    shortcutMissionTitle: '미션',
    shortcutMissionBody: '달성하고 보상 받기',
    shortcutInventoryTitle: '인벤',
    shortcutInventoryBody: '아이템 관리',
    shortcutDropsTitle: '드랍',
    shortcutDropsBody: '장소에서 드랍·픽업',
    shortcutCombineTitle: '믹스',
    shortcutCombineBody: '아이템 믹스하기',
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
    tabPoi: '장소',
    tabItembook: '컬렉션',

    emptyActivityTitle: '아직 겟한 배지가 없어요',
    emptyActivityBody: 'Strava를 동기화하고 활동하면 배지를 겟할 수 있어요',
    emptyItemTitle: '아직 아이템 배지가 없어요',
    emptyItemBody: '활동을 완료하면 확률로 아이템 배지가 드랍돼요',
    emptyPoiTitle: '아직 겟한 장소 배지가 없어요',
    emptyPoiBody: '산, 지하철역 등을 지나는 활동을 기록하면 배지를 겟할 수 있어요',
    emptyItembookTitle: '아직 컬렉션이 없어요',
    emptyItembookBody: '관리자가 컬렉션을 등록하면 이 곳에 표시돼요',

    expiringSoon: '곧 만료',
    itembookCompleted: '완성',

    // 상세 페이지
    pointRewardEarned: '이 배지는 {points} 포인트를 함께 드렸어요',
    pointRewardPending: '이 배지를 겟하면 {points} 포인트를 함께 드려요',

    prerequisiteTitle: '선행 배지 필요',
    prerequisiteBody: '아래 배지 중 하나를 먼저 겟해야 이 배지를 받을 수 있어요.',
    prerequisiteOwned: '보유',

    conditionTitle: '겟 조건',
    conditionPoiBody: '연결된 장소(POI)를 지나가는 활동을 기록하면 자동으로 겟돼요. 체크인할 때마다 이력이 쌓여요.',

    earnHistoryTitle: '겟 이력',
    earnHistoryCount: '총 {count}회',
    earnHistoryUnknownPlace: '알 수 없는 장소',

    earnInfoTitle: '겟 정보',
    earnedAt: '겟 일시',
    triggerActivity: '트리거 활동',
    triggerDistance: '활동 거리',
    triggerDistanceValue: '{km} km',
    triggerDate: '활동 일자',
    viewOnStrava: 'Strava에서 보기',

    connectedLocationTitle: '연결 위치',
    viewOnMap: '{name} 지도에서 보기',
    viewOnMapButton: '지도에서 보기',

    physicalPatchButton: '실물 패치 보기',

    notEarnedTitle: '아직 겟하지 못한 배지예요',
    notEarnedBody: '조건을 달성하면 자동으로 겟돼요',

    poiSafetyNotice: '이 배지는 표시된 위치 반경 {radius}m 안을 스쳐 지나가기만 해도 찾아내요. 위험한 곳까지 굳이 들어갈 필요 없어요. 접근이 까다로운 곳이라면 알려주세요. 도와드릴게요.',

    earnedTag: '겟',
    notEarnedTag: '미겟',
    filterActivityLabel: '액티비티',
    filterActivityAll: '전체 액티비티',
    filterRarityLabel: '등급',
    filterRarityAll: '전체 등급',
    filterPoiCategoryAll: '전체',
    sortPoiLatest: '최신순',
    sortPoiName: '이름순',
  },

  /** 인벤 목록/상세 */
  inventory: {
    eyebrow: '내 아이템',
    title: '인벤',
    combineButton: '믹스하기',
    slotsRemaining: '{count}개 슬롯 남음',
    slotsDetail: '{used} / {max} 슬롯 사용중 · {remaining}개 남음',
    emptyTitle: '아직 아이템이 없어요',
    emptyBody: '활동을 완료하면 아이템 배지가 드랍돼요',

    backToInventory: '인벤',
    infoSectionTitle: '아이템 정보',
    descSectionTitle: '이 아이템 정보',
    serialNumber: '일련번호',
    obtainMethod: '겟 방법',
    obtainedAt: '겟일',
    expiresAt: '만료일',
    expiresNone: '없음',
    expiringSuffix: ' 만료',
    rarity: '희귀도',
    noDescription: '설명이 없어요',
    belongsToItembook: '속한 컬렉션',
    expiringSoonTitle: '만료 임박',
    expiringSoonBody: '7일 이내에 이 아이템이 만료돼요',

    historyTitle: '겟 이력',
    historyLoading: '불러오는 중',
    historyError: '이력을 불러올 수 없어요',
    historyEmpty: '이력이 없어요',
    historyUnknownUser: '알 수 없는 유저',
    obtainByDrop: '활동 드랍',
    obtainByDropEvent: '이벤트 드랍',
    obtainByPickup: 'POI 픽업',
    obtainBySystem: '시스템 지급',
    eventDropped: 'POI 드랍',
    eventPickedUp: 'POI 픽업',

    backToInventoryLong: '인벤으로 돌아가기',
  },

  /** 드랍/픽업 (지도) */
  drops: {
    locationUnsupported: '이 브라우저는 위치 기능을 지원하지 않아요',
    locationDenied: '위치 권한을 허용해 주세요',
    retry: '다시 시도',
    locating: '위치 확인 중',
    loadPoiFailed: 'POI 로드 실패',
    loadDropsFailed: '드랍 목록 로드 실패',
    loadInventoryFailed: '인벤 로드 실패',
    outOfRange: '{name}까지 {distance}m — 50m 이내로 이동하면 드랍/픽업할 수 있어요',
    exploring: '주변 탐색 중',
    noNearbyPlaces: '주변 500m에 드랍/픽업 가능한 장소가 없어요',
    moveCloser: '장소로 50m 이내에 가면 드랍/픽업할 수 있어요',
    checking: '확인 중',
    pickupItemsTitle: '픽업할 아이템',
    thisPlaceTitle: '이 장소',
    foundNearby: '이 근처에서 발견됨',
    droppedBy: '{name}이(가) 드랍',
    anonymous: '익명',
    confirmDrop: "'{name}'을(를)\n여기에 드랍할까요?",
    cancel: '취소',
    dropButton: '드랍하기',
    dropSuccess: '드랍 완료',
    dropFailed: '드랍 실패',
    dropEmptyTitle: '아직 아이템이 없어요',
    dropHereButton: '여기에 드랍하기',
    dropNoItems: '드랍할 아이템이 없어요',
    pickupButton: '픽업하기',
    pickupSuccess: '픽업 완료! 인벤을 확인해보세요',
    pickupFailed: '픽업 실패',
    pickupAlreadyDone: '이미 픽업된 아이템이에요',
    pickupInventoryFull: '인벤이 꽉 찼어요',
    droppedAtPlace: '이 장소에 드랍됨',
    droppedAtPlaceBody: '{place}에 놓여 있는 아이템이에요',
    back: '뒤로',
  },

  /** 미션 목록/상세/현황 */
  missions: {
    eyebrow: '단기 목표',
    title: '미션',
    tabOngoing: '진행중',
    tabJoined: '참가중',
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
    missionTypePoiVisit: '장소 체크인',
    missionTypeItemCollect: '아이템 픽업',
    missionTypeStreakDays: '연속 일수',
    missionTypeDurationMinutes: '단일 활동 시간',
    missionTypeElevationGainM: '단일 활동 고도',
    emptyFiltered: '조건에 맞는 미션이 없어요',
    emptyOngoing: '진행 중인 미션이 없어요',
    emptyJoined: '참가 중인 미션이 없어요',
    emptyEnded: '종료된 참가 미션이 없어요',
    tagNew: 'NEW',
    tagDone: '완료',
    tagJoined: '참가중',
    tagUpcoming: '예정',
    tagEnded: '종료됨',
    tagPermanent: '상시',
    timeLeftSuffix: '남음',
    limitedSlots: '선착순 {count}명',
    rewardLabel: '보상',
    rewardNone: '없음',
    rewardBadgeCount: '배지 {count}개',
    rewardPoints: '{points}P',

    backToList: '뒤로',
    backToDetail: '미션',
    goalDistance: '달성 거리',
    goalActivityCount: '활동 횟수',
    goalPoiVisit: 'POI 체크인',
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
    rewardPointsLine: 'JAM 포인트 {points}P',
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
    statusRankingLabel: '랭킹',
    statusIndividualLabel: '나의 현황',
    statusParticipants: '참가자 {count}명',
    statusLoading: '불러오는 중',
    statusLoadError: '불러오지 못했어요',
    statusMeRanking: '— 내 순위 —',
    statusMeAchievement: '— 나 —',
    statusNoParticipants: '아직 참가자가 없어요',
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
    title: 'JAM 포인트',
    balanceLabel: '현재 잔액',
    historyTitle: '최근 내역',
    loading: '불러오는 중',
    loadError: '내역을 불러오지 못했어요.',
    retry: '다시 시도',
    emptyTitle: '아직 쌓인 포인트가 없어요.',
    emptyBody: 'Strava를 동기화하면 배지와 함께 포인트를 받을 수 있어요.',
    loadMore: '더 보기',
    loadingMore: '불러오는 중',
  },

  /** 유저 검색 결과 */
  search: {
    title: '유저 검색',
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
    emptyFollowing: '아직 팔로우한 사람이 없어요',
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
    noBadgesTitle: '아직 이 컬렉션에 등록된 배지가 없어요.',
    poiHint: 'POI 배지는 해당 장소를 지나가면 자동으로 채워져요',
    poiEarned: '겟',
    poiNotEarned: '미겟',
    completedTitle: '컬렉션 완성!',
    completedBody: '모든 아이템 배지를 슬롯에 장착했어요',
    unknownBadge: '???',
    slotLoginRequired: '로그인이 필요해요.',
    slotFailed: '슬롯에 실패했어요.',
    unslotFailed: '슬롯 해제에 실패했어요.',
    networkError: '네트워크 오류가 발생했어요.',
    unslotButton: '슬롯 해제',
    slotButton: '슬롯',
    processing: '처리 중',
    ownedPrefix: '보유 ',
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
    emptyInventory: '인벤이 비어 있어요.',
    successResult: '{names} 겟!',
    selectRangeError: '아이템 2~10개를 선택해주세요.',
    itemsNotFound: '아이템을 찾을 수 없어요.',
    recipeFail: '믹스에 실패했어요. 아이템이 소각됐어요.',
    consolationPoints: ' (위로 JAM 포인트 +{points})',
    genericError: '오류가 발생했어요.',
    genericFail: '믹스 실패',
  },
} as const

export type Dictionary = typeof ko
