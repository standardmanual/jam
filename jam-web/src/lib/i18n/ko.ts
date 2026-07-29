/**
 * 한국어(ko) UI 문구 딕셔너리
 *
 * 규칙 (PRD/DesignRenewal/Design_Phase01_04_PROJECT_SPEC.md "i18n 규칙")
 * - 모든 UI 텍스트는 JSX에 직접 쓰지 않고 이 딕셔너리 키로 참조한다.
 * - 새 문구가 필요하면 반드시 여기에 키를 먼저 추가한 뒤 컴포넌트에서 참조한다.
 * - 동적 값은 `{변수}` 보간 패턴을 사용한다. 예) "{count}P" → t(ko.profile.pointBalance, { count })
 * - Phase 1 범위는 ko 로케일만 채운다 (en 등 실제 번역은 별도 작업).
 *
 * namespace 규칙: common / nav / profile / tabs / feed
 */
export const ko = {
  /** 여러 화면에서 공통으로 쓰는 짧은 문구 */
  common: {
    close: '닫기',
    detail: '상세보기',
    loadMore: '더 불러오기',
    back: '뒤로',
    countItems: '{count}개',
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
} as const

export type Dictionary = typeof ko
