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
    networkError: '네트워크 오류가 발생했습니다',
  },

  /** 바텀 탭바(글로벌 네비게이션) 라벨 */
  nav: {
    today: '투데이',
    badges: '배지',
    drops: '드랍',
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
    pointBalance: '{count}P',
    pointBadgeLabel: 'P',
    pointsAriaLabel: '포인트 내역 보기',
    editButton: '편집',
    followButton: '팔로우',
    followingButton: '팔로잉',
    logoutButton: '로그아웃',

    // Strava 연동
    stravaTitle: 'Strava 연동',
    stravaConnected: '연동됨',
    stravaDisconnected: '연동 안됨',
    stravaConnectButton: 'Strava 연동',

    // 빈 상태
    emptyBadges: '아직 획득한 배지가 없어요',
    emptyItembooks: '아직 발견한 아이템북이 없어요',
    emptyFollowers: '아직 팔로워가 없어요',
    emptyFollowing: '아직 팔로잉이 없어요',

    // 아이템북 카드
    itembookCompleted: '완성',
    itembookProgress: '{done}/{total}',
  },

  /** 프로필 통계바 탭 */
  tabs: {
    badge: '뱃지',
    itembooks: '아이템북',
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
    eventBadgeEarned: '배지 획득',
    eventItemDropped: '아이템 드랍',
    eventItemPickedUp: '아이템 픽업',
    eventMissionJoined: '미션 참가',
    eventMissionCompleted: '미션 완료',
    eventMissionCancelled: '미션 취소',

    // 희귀도 라벨 (색상 매핑은 상태 팔레트 — Phase 2에서 DB 이관)
    rarityCommon: 'Common',
    rarityRare: 'Rare',
    rarityLegendary: 'Legend',
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
    wordmark: 'JAM!',

    // Strava 상태 카드
    stravaLabel: 'Strava',
    stravaNotConnectedTitle: 'Strava 미연동',
    stravaNotConnectedBody: '연동하면 활동 기반 배지를 자동 획득해요',
    stravaConnectButton: '지금 연동하기',
    syncButton: '동기화',
    syncDone: '동기화 완료',
    syncFailed: '동기화 실패. 잠시 후 다시 시도해주세요',
    syncBadgeDone: '배지 {count}개 획득',
    syncMissionDone: '미션 {count}개 달성',
    syncItembookDone: '아이템북 {count}개 완성',

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
    recentBadgesEmptyBody: 'Strava 연동 후 활동하면 배지가 생겨요',

    // 바로가기
    shortcutsTitle: '바로가기',
    shortcutMissionTitle: '미션',
    shortcutMissionBody: '달성하고 보상 받기',
    shortcutInventoryTitle: '인벤토리',
    shortcutInventoryBody: '아이템 관리',
    shortcutDropsTitle: '드랍',
    shortcutDropsBody: '장소에서 드랍·픽업',
    shortcutCombineTitle: '조합',
    shortcutCombineBody: '아이템 합성하기',
  },

  /** 투데이 카드 스택 콘텐츠 유형 (template_type) 라벨 — 색상 구분 없이 아이콘+라벨로만 식별 */
  todayCard: {
    badgeSpotlight: '배지 소개',
    progressNudge: '진행 알림',
    missionSpotlight: '미션',
    itembookMilestone: '아이템북',
    locationTrend: '지역 트렌드',
    dropAlert: '드랍',
    editorialArticle: '기사',
    backToToday: '투데이로',
    noBody: '본문이 없습니다',
  },

  /** 배지 목록/상세 화면 */
  badges: {
    listTitle: '나의 배지',
    tabActivity: '액티비티',
    tabItem: '아이템',
    tabItembook: '아이템북',

    emptyActivityTitle: '아직 획득한 배지가 없어요',
    emptyActivityBody: 'Strava를 연동하고 활동하면 배지를 획득할 수 있어요',
    emptyItemTitle: '아직 아이템 배지가 없어요',
    emptyItemBody: '활동을 완료하면 확률로 아이템 배지가 드랍됩니다',
    emptyItembookTitle: '아직 아이템북이 없어요',
    emptyItembookBody: '관리자가 아이템북을 등록하면 이 곳에 표시됩니다',

    expiringSoon: '곧 만료',
    itembookCompleted: '완성',

    // 상세 페이지
    pointRewardEarned: '이 배지는 {points} 포인트를 함께 드렸어요',
    pointRewardPending: '이 배지를 획득하면 {points} 포인트를 함께 드려요',

    prerequisiteTitle: '선행 배지 필요',
    prerequisiteBody: '아래 배지 중 하나를 먼저 획득해야 이 배지를 받을 수 있어요.',
    prerequisiteOwned: '보유',

    conditionTitle: '획득 조건',
    conditionPoiBody: '연결된 장소(POI)를 지나가는 활동을 기록하면 자동으로 획득돼요. 방문할 때마다 이력이 쌓여요.',

    earnHistoryTitle: '획득 이력',
    earnHistoryCount: '총 {count}회',
    earnHistoryUnknownPlace: '알 수 없는 장소',

    earnInfoTitle: '획득 정보',
    earnedAt: '획득 일시',
    triggerActivity: '트리거 활동',
    triggerDistance: '활동 거리',
    triggerDistanceValue: '{km} km',
    triggerDate: '활동 일자',
    viewOnStrava: 'Strava에서 보기',

    connectedLocationTitle: '연결 위치',
    viewOnMap: '{name} 지도에서 보기',

    shareCardButton: '공유 카드 만들기',
    shareCardTitle: '공유 카드',
    shareCardAlt: '공유 카드 미리보기',
    shareCardClose: '닫기',
    shareCardShare: '공유 / 저장',
    shareCardGenerateFailed: '카드 생성에 실패했습니다',
    physicalPatchButton: '실물 패치 보기',

    notEarnedTitle: '아직 획득하지 못한 배지예요',
    notEarnedBody: '조건을 달성하면 자동으로 획득됩니다',
  },
} as const

export type Dictionary = typeof ko
