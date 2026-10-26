/**
 * 한국어(ko) UI 문구 딕셔너리
 *
 * 규칙 (PRD/DesignRenewal/Design_Phase01_04_PROJECT_SPEC.md "i18n 규칙")
 * - 모든 UI 텍스트는 JSX에 직접 쓰지 않고 이 딕셔너리 키로 참조한다.
 * - 새 문구가 필요하면 반드시 여기에 키를 먼저 추가한 뒤 컴포넌트에서 참조한다.
 * - 동적 값은 `{변수}` 보간 패턴을 사용한다. 예) "{count} 포인트" → t(ko.profile.pointBalance, { count })
 * - Phase 1 범위는 ko 로케일만 채운다 (en 등 실제 번역은 별도 작업).
 *
 * namespace 규칙: common / nav / profile / tabs / feed / today / todayCard (그 외 화면별
 * 네임스페이스는 아래 딕셔너리 본문의 섹션 주석을 참고)
 */

/**
 * 타인 시점(3인칭) 빈 상태 문구 — profile·social 두 네임스페이스가 공유한다
 * (티켓 20260905_2050). 두 네임스페이스의 "본인 시점" 문구는 화면 톤이 달라 의도적으로
 * 분리돼 있지만, 타인 시점 문구는 우연히 동일해서 여기서만 묶는다.
 */
const EMPTY_FOLLOWERS_OTHER = '{name}님에게 아직 팔로워가 없어요'
const EMPTY_FOLLOWING_OTHER = '{name}님이 아직 아무도 팔로우하지 않았어요'

export const ko = {
  /** 여러 화면에서 공통으로 쓰는 짧은 문구 */
  common: {
    close: '닫기',
    detail: '상세보기',
    loadMore: '더 불러오기',
    back: '뒤로',
    countItems: '{count}개',
    networkError: '네트워크 오류가 발생했어요',
    /** 서버 API의 401 인증 필요 응답 — ADR 0001, 티켓 20260915_2238에서 badges 라우트가 먼저 참조한다.
     * 배지·컬렉션/아이템북·조합·알림·인벤토리·미션·포인트·프로필·검색·VOC 등 여러 도메인 route가 공유하는
     * 단일 진실 소스 — 값 교정은 이 키만 고치면 전체에 반영된다 (티켓 20260916_0904) */
    authRequired: '로그인이 풀렸어요. 다시 로그인해 주세요.',
    footerSlogan: 'JAM!은 삐끗할 때도 있습니다.\n하지만 곧 바로 잡습니다.',
    footerPhilosophy: 'Philosophy',
    footerPrivacy: '개인정보처리방침',
    footerLocationTerms: '위치기반서비스 이용약관',
    /** 확률 안내 페이지(`/probability`)로 가는 푸터 링크. 페이지 제목·캡슐 시트 링크와 같은 말이다 (티켓 20261021_1250) */
    footerProbability: '확률 안내',
    footerCopyright: '© 2026 Standard Manual',
    /** 여러 화면이 공유하는 범용 로딩 스피너(`LoadingSpinner`)의 보조기술 라벨 (티켓 20260915_2237) */
    loading: '불러오는 중',
    /** `app/layout.tsx` SEO 메타데이터 — §2.5 예외로 명사형·합쇼체(-습니다) 종결 허용 (티켓 20260915_2237, 20260915_2315) */
    seoTitle: 'JAM!',
    seoDescription: '운동 기록이 배지가 되는 곳. Strava 동기화로 오늘의 배지와 아이템을 획득합니다.',
    /** `app/error.tsx` 루트 에러 바운더리 — 렌더 도중 발생한 미처리 예외 공통 화면 (티켓 20260915_2252) */
    rootErrorTitle: '페이지를 불러오지 못했어요',
    /** 환경변수 누락으로 추정될 때(SUPABASE 관련 메시지 포함)의 안내 */
    rootErrorEnvDescription: '환경변수 설정이 빠져 있어요',
    /** 그 외 일반 예외 — §4.0에 따라 원본 error.message(로그성 문자열)를 화면에 노출하지 않는다.
     * 개발 환경에서는 화면 하단 디버그 패널에 원문을 별도로 보여준다(티켓 20260916 한국어 리뷰 B3) */
    rootErrorDescription: '다시 시도하면 정상적으로 열릴 수 있어요',
    rootErrorRetry: '다시 시도',
  },

  /**
   * 탈퇴한 유저의 행위자 표기 (운영 로직 17.2절, 티켓 20261021_1249 2회).
   * 사용자가 정한 고정 텍스트다. 이름 자리에는 `name`을 쓰고, `notice`는 이름 요소의 title·aria-label에만 쓴다.
   * 누를 곳이 없으므로 링크와 팝업은 만들지 않는다. 한 곳에서만 정의하고 어드민·소식·드랍·이력 시트가 같이 쓴다.
   */
  withdrawnUser: {
    name: '₩*&%#@',
    notice: '₩*&%#@님은 탈퇴한 사용자입니다',
  },

  /**
   * 유저용 탈퇴 API 응답 문구 (운영 로직 17장, 티켓 20261021_1249 3회).
   * `POST /api/account/delete`가 이 키를 직접 참조해 최종 문구를 완성하고, 화면은 그대로 보인다(ADR 0001, 가이드 4.0).
   * 401은 `common.authRequired`를 그대로 쓴다. 확인 문구 글자는 여기에 적지 않는다: `{phrase}`로 받아
   * `lib/account/withdraw-contract.ts`의 `WITHDRAW_CONFIRM_PHRASE` 한 곳에서 끌어온다.
   * 실패 문구는 DB·Auth 오류 원문을 싣지 않는 고정 문장이고, 계정이나 데이터가 그대로라고 단정하지 않는다(준비 뒤 삭제 실패 구간이 있다).
   */
  account: {
    /** 500과 네트워크 — [현상, 원인, 해결책] */
    deleteFailed: '탈퇴하지 못했어요. 연결이 불안정했거나 서버에 문제가 생겼을 수 있어요. 잠시 후 다시 시도해 주세요.',
    /** 403 — 관리자 계정 */
    deleteAdminForbidden: '관리자 계정은 앱에서 탈퇴할 수 없어요. 운영자에게 요청해 주세요.',
    /** 400 — 서버가 확인 문구를 다시 검사해 어긋났을 때 */
    deleteConfirmMismatch: '확인 문구가 맞지 않아요. "{phrase}"를 다시 입력해 주세요.',
  },

  /**
   * 탈퇴 확인 시트 (프로필 편집의 «탈퇴하기», 티켓 20261021_1249 3회, 채원 사전 판정 2026-10-21).
   * 제목·버튼·라벨은 마침표가 없고, 여러 문장인 본문은 문장마다 마침표가 있다(가이드 3절). 인라인 불일치 문구는 한 문장이라 마침표가 없다.
   * «탈퇴»는 행위(제목·버튼), «지워져요»는 데이터에만 쓴다. 숫자는 글자를 박지 않고 보간으로 받는다:
   * `{confirmMonths}`·`{abuseMonths}`는 `lib/account/retention.ts`, `{phrase}`는 `lib/account/withdraw-contract.ts`에서 온다.
   * 행 값은 `common.countItems`(개수)와 `points.amountValue`(포인트)를 쓴다.
   */
  withdrawSheet: {
    title: 'JAM!에서 탈퇴할까요?',
    intro: '탈퇴하면 계정이 바로 지워지고 되돌릴 수 없어요.',
    removedLabel: '지워지는 것',
    rowActivityBadges: '액티비티 배지',
    rowCheckinBadges: '체크인 배지',
    rowItemBadges: '아이템 배지',
    rowJam: '잼',
    rowPoints: '포인트',
    /** Strava 동기화가 연결돼 있을 때만 */
    stravaSync: 'Strava 동기화도 함께 끊겨요.',
    /** 요약을 읽지 못했을 때 행 다섯 줄과 위 문장 대신 보이는 한 문장. 오류 문구가 아니라 사실만 말한다 */
    removedFallback: '액티비티 배지, 체크인 배지, 아이템 배지, 잼, 포인트가 지워지고 Strava 동기화도 끊겨요.',
    keptLabel: '남는 것',
    keptRecords:
      '체크인, 드랍, 픽업 같은 장소 기록은 법에 따라 {confirmMonths}개월, 부정 이용 탐지 기록은 {abuseMonths}개월 동안 따로 보관하고 기간이 지나면 지워요.',
    keptDrops: '드랍해 둔 아이템 배지는 장소에 남아 다른 유저가 픽업할 수 있어요.',
    confirmLabel: '계속하려면 "{phrase}"를 입력해 주세요.',
    /** 입력칸을 벗어났을 때만 보이는 한 문장 */
    confirmMismatch: '"{phrase}"와 똑같이 입력해 주세요',
    cancel: '취소',
    confirm: '탈퇴하기',
    confirming: '탈퇴하는 중',
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

    // Strava 콜백 도착 피드백 토스트 (20260824_008) — 배지 연출이 뜨지 않는 경우
    // (배지 0개 성공 / 실패)에 연동 결과를 알려준다
    stravaConnectSuccessToast: 'Strava 동기화를 완료했어요. 앞으로 활동하면 배지를 자동 획득해요',
    stravaConnectCancelledToast: 'Strava 동기화를 취소했어요. 다시 시도하려면 동기화 버튼을 눌러주세요',
    stravaConnectFailedToast: 'Strava 동기화에 실패했어요. 네트워크가 불안정했거나 일시적인 오류일 수 있어요. 잠시 후 다시 시도해 주세요.',

    // 빈 상태 (본인 시점 — 2인칭 행동 유도)
    emptyBadges: '아직 획득한 배지가 없어요',
    emptyBadgesBody: 'Strava를 동기화하고 활동하면 배지를 획득할 수 있어요',
    emptyItembooks: '아직 발견한 컬렉션이 없어요',
    emptyItembooksBody: '아이템 배지를 모아 컬렉션을 발견해보세요',
    emptyFollowers: '아직 팔로워가 없어요',
    emptyFollowersBody: '활동을 공유하면 팔로워가 늘어나요',
    emptyFollowing: '아직 팔로잉이 없어요',
    emptyFollowingBody: '관심있는 유저를 팔로우해보세요',

    // 빈 상태 (타인 시점 — 3인칭, {name} 보간. 20260903_2022)
    // 타인 프로필에서는 본인 시점 행동 유도가 성립하지 않아 body를 생략한다.
    emptyBadgesOther: '{name}님이 아직 획득한 배지가 없어요',
    emptyItembooksOther: '{name}님이 아직 발견한 컬렉션이 없어요',
    emptyFollowersOther: EMPTY_FOLLOWERS_OTHER,
    emptyFollowingOther: EMPTY_FOLLOWING_OTHER,
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

    /** 팔로잉 통합 활동 피드(/feed, 티켓 20260830_2030) — 투데이 홈 "친구 활동" 셀의 목적지 */
    friendFeedTitle: '친구 활동',
    friendFeedEmptyBody: '팔로우한 친구가 활동하면 여기에 모여요',

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
    /**
     * 반복 획득이 가능한 활동 배지를 두 번째 이상 획득했을 때 eventBadgeEarned 대신 쓴다
     * (티켓 20260905_0038 B). 체크인의 `eventCheckinRepeat`와 같은 「N번째」 패턴을 쓴다 —
     * 회차를 말하는 문장은 서비스 안에서 한 가지 형태만 유지한다.
     */
    eventBadgeEarnedRepeat: '{count}번째 획득했어요',
    // 활동 Strava 동기화 후 배지엔진을 통해 지급된 경우("아이템 획득")와 POI에 직접 드랍된 경우("아이템 드랍")는
    // 같은 item_dropped 이벤트지만 출처가 다르므로 문구를 분리해서 표기한다 (FeedSection.tsx의 eventLabel 참고)
    eventItemEarned: '아이템 획득',
    eventItemDropped: '아이템 드랍',
    eventItemPickedUp: '아이템 픽업',
    eventMissionJoined: '미션 참가',
    eventMissionCompleted: '미션 완료',
    eventMissionCancelled: '미션 취소',
    /**
     * 챕터 오름·컬렉션 완성(티켓 20261021_1249 6-3 5회, 채원 판정). 기존 완료형 라벨(«배지 획득»·«미션 완료»)과 같은 짧은 라벨 문법이다.
     * 피드는 남도 보는 화면이라 «축하해요!»는 두지 않는다(본인에게 하는 말은 소식 `d.notifications.msgChapterUp`과 오름 카드가 맡는다).
     * 챕터 번호 줄은 `d.chapter.line.chapter`를 쓰고 새 문구를 만들지 않는다
     */
    eventChapterUp: '챕터 오름',
    eventCollectionTierCompleted: '컬렉션 완성',

    // 희귀도 라벨 (색상 매핑은 상태 팔레트 — Phase 2에서 DB 이관)
    rarityCommon: 'Common',
    rarityRare: 'Rare',
    rarityEpic: 'Epic',
    rarityMystic: 'Mystic',

    // 카드 보조 문구
    fragmentOf: '{tribe}의 파편',
    lastPiece: '마지막 파편!',
    rewardPoints: '+{points} 포인트',

    // 상세 시트 라벨
    /** 드랍/픽업이 일어난 지점 — '체크인'이 아니라 지점 정보다(20260826_004 경계 규칙 3) */
    rowPlace: '장소',
    /** 체크인 배지 획득 이벤트에서 체크인한 지점 */
    rowCheckinPlace: '체크인 장소',
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
    // Strava 동기화 상태 카드
    syncButton: '동기화',
    syncDone: '동기화 완료',
    /** 이번 동기화로 받은 잼의 합계 한 줄(티켓 20261025_2050). `{n}`은 toLocaleString('ko-KR') 문자열. 합계가 0이면 이 줄을 그리지 않는다 */
    syncJamEarned: '이번에 잼 {n}만큼 받았어요',
    syncFailed: 'Strava 동기화에 실패했어요. 잠시 후 다시 시도해 주세요.',

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
  },

  /**
   * 온보딩 퀘스트 홈 카드 (티켓 20260927_2133, 상위 20260927_2123) — 확정 문구를
   * 글자 단위로 그대로 옮긴다. `steps`는 단계 키별로 T2~T5 퀘스트 화면이 재사용한다.
   *
   * 티켓 20261021_1248 2회: 카드 이름은 «JAM! 시작하기», 구역 라벨은 연출 «미리 해보기»와 실제 «내 활동으로»다(사용자 결정).
   * 유저 화면에는 «퀘스트»·«연습»·«과제»·«가이드»·«튜토리얼»·«온보딩»을 쓰지 않는다(관리자 미리보기 띠 `preview`만 예외 — 관리자 전용).
   * 칩 이름이 완료 배지 이름 「JAM!」과 겹치므로 카드 안의 버튼 문구에는 «시작하기»를 쓰지 않는다.
   * 새 문구는 한 문장이면 마침표가 없고 두 문장 이상이면 마침표가 있다(UX 라이팅 가이드 §3). 받침이 갈리는 조사는 «잼 {n}만큼»처럼 «만큼»으로 피한다.
   * 연출 7단계의 단계 문구(`steps`)는 그대로 둔다.
   */
  onboardingQuest: {
    chipLabel: 'JAM! 시작하기',
    /** 카드(role=group)의 스크린리더 이름 — 칩 글자와 같다 */
    cardLabel: 'JAM! 시작하기',
    continueButton: '다음 단계',
    /** 진행 분수. 보이는 글자(`demo`·`real`)는 스크린리더에 숫자와 빗금으로 읽히므로 같은 뜻의 문장(`demoSr`·`realSr`)을 따로 둔다 */
    progress: {
      demo: '미리 해보기 {done}/{total}',
      demoSr: '미리 해보기 {total}단계 중 {done}단계',
      real: '내 활동으로 {done}/{total}',
      realSr: '내 활동으로 {total}단계 중 {done}단계',
    },
    /** 단계 키 → 타이틀/설명. `OnboardingQuestStepKey`와 순서·개수가 같다. */
    steps: {
      sync: {
        title: '첫 동기화',
        description: '내 운동 기록 하나가 배지 한 장이 되어 돌아와요.',
      },
      /** locationHint: 2단계 위치 안내 한 줄(2026-09-28 확정) — 기능 위치만 알리고
       * 연출 배지를 나중에 다시 볼 수 있다고 읽히지 않게 한다(티켓 20260927_2125 T2b). */
      bag: {
        title: '인벤토리',
        description: '방금 획득한 배지가 인벤토리 첫 칸을 채웠어요.',
        locationHint: '인벤토리는 아래 탭에 있어요',
      },
      pickup: { title: '픽업', description: '근처에 누군가 흘리고 간 아이템이 있어요. 먼저 픽업하는 사람이 임자예요.' },
      mix_fail: { title: '믹스', description: '재료 두 개를 믹스하면 무엇이 나올지 아무도 몰라요.' },
      mix_success: { title: '레시피', description: '레시피를 알면 결과가 달라져요. 이번엔 제대로 믹스해 봐요.' },
      drop: { title: '드랍', description: '내가 만든 아이템을 장소에 드랍하면, 지나가던 누군가가 픽업해 가요.' },
      browse: { title: '둘러보기', description: '다음에 도전할 미션과 내 트라이브의 이야기를 미리 살펴봐요.' },
    },
    /** 2단계 그리드 아래 연출 표시 한 줄(2026-09-28 확정, 티켓 20260927_2125 T2b) —
     * 연출용 배지가 실제 인벤토리에는 남지 않는다는 사실만 담담하게 알린다. */
    demoBadgeNotice: '이 배지는 실제 인벤토리에는 남지 않아요.',
    /** 1단계 단계 기록(`POST /api/onboarding-quest/step`) 실패 토스트 — 멱등 API라
     * 버튼을 다시 누르면 안전하게 재시도된다(`SyncButton.tsx`와 같은 클라이언트 고정 문구 패턴). */
    syncStepSaveFailed: '저장에 실패했어요. 동기화를 다시 눌러 주세요.',
    /** 2단계 단계 기록 실패 토스트 — 위와 같은 이유로 배지를 다시 누르면 재시도된다. */
    bagStepSaveFailed: '저장에 실패했어요. 배지를 다시 눌러 주세요.',
    /** 3단계 가상 지도 POI 마커 이름(신규 문구, 2026-09-28 확정, 티켓 20260927_2126). */
    pickupMarkerLabel: '근처 드랍 장소',
    /** 3단계 단계 기록 실패 토스트 — 위와 같은 이유로 다시 누르면 재시도된다. */
    pickupStepSaveFailed: '저장에 실패했어요. 다시 눌러 주세요.',
    /** 4~5단계(mix_fail·mix_success) 단계 기록 실패 토스트 — 위와 같은 이유로 다시 누르면
     * 재시도된다(티켓 20260927_2127). */
    mixStepSaveFailed: '저장에 실패했어요. 다시 눌러 주세요.',
    /** 6단계(drop) 단계 기록 실패 토스트 — 위와 같은 이유로 다시 누르면 재시도된다
     * (티켓 20260927_2128). */
    dropStepSaveFailed: '저장에 실패했어요. 다시 눌러 주세요.',
    /**
     * 내 활동으로 3단계 (티켓 20261021_1248 2회, 채원 사전 판정) — 연출 7단계가 끝났거나 건너뛴 뒤의 카드, 그리고 연출 중 카드 아래의 체크 목록.
     * 지금 할 차례 행만 설명과 버튼이 있다. 잼 모자람은 실제로 모자랄 때만 안내한다(여유가 0이어도 미리 경고하지 않는다).
     * 열기를 부추기는 말(«한 번만 더», «곧 좋은 게»)은 쓰지 않는다. «획득»은 가이드 고정 용어다.
     */
    real: {
      /** 체크 목록(<ol>)의 스크린리더 이름 */
      listLabel: '내 활동으로 3단계',
      /** 단계 이름 — 목록 행의 제목 */
      steps: {
        sync: 'Strava 동기화',
        capsule: '캡슐 열기',
        locked: '잠긴 아이템 배지 열기',
      },
      /** 행 상태 글자(스크린리더 전용) — 색과 아이콘에만 기대지 않는다 */
      rowState: {
        done: '마쳤어요',
        current: '지금 할 차례예요',
        pending: '아직이에요',
      },
      /** ① Strava 동기화. 연동 전에는 연결 길(버튼), 연동됨에는 동기화 버튼(`SyncButton`, 글자는 `today.syncButton`)이다 */
      sync: {
        description: '가장 최근 활동 하나가 잼과 배지가 되어 돌아와요',
        descriptionConnected: 'Strava에 활동이 올라오면 동기화해서 잼과 배지를 받아요',
        connectCta: 'Strava 동기화하기',
      },
      /** ② 캡슐 열기. `{n}`은 가진 잼이 아니라 캡슐에 더 채울 잼이다 */
      capsule: {
        description: '캡슐을 채워 열어요. 필요한 잼은 {n}만큼이에요. 남은 잼은 잠긴 아이템 배지를 여는 데 써요.',
        /** 캡슐 상태를 읽지 못했을 때 — 잼 숫자를 생략한다 */
        descriptionGeneral: '캡슐을 채워 열어요. 남은 잼은 잠긴 아이템 배지를 여는 데 써요.',
        descriptionReady: '캡슐이 가득 찼어요. 열어서 아이템 배지를 획득해요.',
        fillCta: '캡슐 채우기',
        openCta: '캡슐 열기',
      },
      /** ③ 잠긴 아이템 배지 열기. `{n}`은 그 개체에 더 채울 잼이다 */
      locked: {
        description: '잠긴 아이템 배지에 잼 {n}만큼 채우면 열 수 있어요',
        /** 개체를 읽지 못했거나 가진 잠긴 개체를 찾지 못했을 때 */
        descriptionGeneral: '잠긴 아이템 배지에 잼을 채우면 열 수 있어요',
        /** 이미 다 채워 둔 개체 */
        descriptionReady: '다 채워 둔 잠긴 아이템 배지를 열 수 있어요',
        cta: '열러 가기',
      },
      /** 잼 모자람 안내(`InlineNotice`) — 실제로 모자랄 때만. 이때 primary 버튼은 동기화로 바뀐다 */
      shortage: {
        capsule: '잼이 모자라요. 가진 잼은 {have}만큼, 필요한 잼은 {need}만큼이에요. 새 활동을 동기화하면 잼을 더 받아요.',
        locked: '잠긴 아이템 배지를 열 잼이 모자라요. 새 활동을 동기화하면 잼을 더 받아요.',
      },
    },
    /** 홈 카드 「건너뛰기」 확인 시트 문구 (2026-09-28 확정, 티켓 20260927_2131 T8) —
     * 지금 넘기면 다시 받을 수 없는 것이 있다는 뉘앙스를 담는다. */
    skip: {
      entryLabel: '미리 해보기 건너뛰기',
      confirmBody:
        '미리 해보기를 건너뛰면 JAM! 배지와 100 포인트를 받을 수 없어요. 챕터 1은 내 활동으로 3단계를 마치면 시작해요. 이대로 건너뛸까요?',
      keepGoingButton: '계속하기',
      skipButton: '건너뛰기',
      saveFailed: '저장에 실패했어요. 건너뛰기를 다시 눌러 주세요.',
    },
    /** 관리자 미리보기 띠(`QuestPreviewBanner.tsx`) 문구(2026-09-28 확정, 티켓 20260928_0138
     * N5b) — 서비스 화면에 노출되는 유일한 문구라 유저 노출 규칙(「퀘스트」)을 따른다.
     * 내부 용어 「온보딩」은 쓰지 않는다. */
    preview: {
      /** 단계 키일 때. n은 1~7(`ONBOARDING_QUEST_STEPS.indexOf(value) + 1`), `t()`로 치환. */
      stepLabel: '퀘스트 미리보기 중 · {n}/7단계',
      doneLabel: '퀘스트 미리보기 중 · 연동 단계',
      finishButton: '끝내기',
      finishFailed: '미리보기를 끝내지 못했어요. 다시 눌러 주세요.',
    },
  },

  /**
   * 투데이 홈 상단 "오늘의 현황" 스트립 (티켓 20260830_2030) — 인사말 압축 + 좌/우 2셀.
   * today_cards CMS와 기능이 겹치지 않도록 큐레이션 없이 정적 안내만 담는다.
   */
  todayStatus: {
    /** 압축 인사말. name은 표시 이름(닉네임/아이디) */
    greeting: '{name}님, 오늘도 좋은 하루예요',

    // 좌: 내 진행도
    /** 좌측 슬롯 카드 타이틀 레이블 — 3분기(strava_not_connected/progress/suggestion) 공통 (티켓 20260830_2121) */
    myProgressLabel: '내 진행도',
    // UX_WRITING_GUIDELINE.md 고정 용어 — "Strava 동기화"(X: Strava 연동). 티켓 원문 문구의
    // "연동"을 가이드 고정 용어로 교정했다.
    stravaCta: 'Strava 동기화하면 시작해요',
    /** 진행 이력 없음 — 정적 후보 풀(랜덤 1개 노출), 어드민 편집 대상 아님 */
    suggestionDrops: '드랍 아이템 찾아보기',
    suggestionMissions: '미션 참가해보기',

    // 우: 팔로잉 소식
    /** 우측 슬롯 카드 타이틀 레이블 — 2분기(friend_activity/no_following) 공통 (티켓 20260830_2121).
     * "팔로워"가 아니라 "팔로잉"(내가 팔로우하는 사람)의 활동을 집계하는 카드다 — 티켓 20260901_1308 */
    friendActivityLabel: '팔로잉 소식',
    /** count는 오늘 배지를 받은 팔로잉 유저 수 */
    // UX_WRITING_GUIDELINE.md 고정 용어 — 배지·아이템을 얻는 행위는 "획득"으로 통일
    // (X: 받다·겟·수령). 티켓 원문 문구의 "받았어요"를 고정 용어로 교정했다.
    friendActivity: '친구 {count}명이 오늘 배지를 획득했어요',
    /** 오늘 배지를 획득한 팔로잉이 정확히 1명일 때. name은 표시 이름(display_name 우선, 없으면 username) */
    friendActivitySingle: '{name}님이 오늘 배지를 획득했어요!',
    noFollowing: '아직 팔로우한 친구가 없어요',
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
    /** 헤더에 요약 줄이 함께 있을 때 라이브 리전이 읽는 문구. 개수 뒤에 요약을 잇는다(티켓 20261025_2050) */
    openedWithSummary: '배지 {count}개를 획득했어요. {summary}',
    /** 최초 연동 직후 획득 배지를 되읽는 동안의 대기 안내 */
    loading: '방금 획득한 배지를 확인하고 있어요',
  },

  /**
   * 챕터 줄과 오름 축하 카드 (티켓 20261019_1317 1회, 운영 로직 12.3절).
   * 점수 숫자는 어느 문구에도 넣지 않는다. 용어는 UX Writing 가이드 1.3절의 «챕터»다(레벨·랭크·티어 금지).
   */
  chapter: {
    line: {
      /** 챕터 번호 — «챕터 3». 챕터는 숫자로만 표기한다(2026-10-21 결정) */
      chapter: '챕터 {chapterNo}',
      /** 트라이브와 챕터 사이 구분자 — 다른 유저 프로필의 «트라이브 · 챕터 3» */
      separator: ' · ',
      /** 내 프로필 챕터 줄 오른쪽 라벨. 게이지가 «다음 챕터까지»의 진행임을 알린다(마지막 챕터에서는 줄과 게이지를 함께 뺀다) */
      untilNext: '다음 챕터까지',
    },
    rise: {
      /** 축하 카드 대화상자의 이름 (스크린리더) */
      ariaLabel: '챕터 오름',
      /** 카드 맨 위 한 줄 — 신남·축하 톤 */
      cheer: '축하해요!',
      /** 카드 제목 — «챕터 3에 올랐어요» (알림 문구 `d.notifications`의 chapter_up과 같은 표현) */
      title: '챕터 {chapterNo}에 올랐어요',
      /** 카드가 열릴 때 스크린리더에 읽어 주는 문장 */
      announce: '축하해요! 챕터 {chapterNo}에 올랐어요',
    },
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
    rankingBoard: '랭킹',
    /** 레시피 공개 카드의 칩 줄 라벨(티켓 20261006_1217) — 어드민 템플릿 선택지 라벨과 같다 */
    recipeReveal: '레시피 공개',
    noBody: '본문이 없어요',
    rankingEmpty: '아직 랭킹이 없어요',
    /** 기사 본문 CTA 버튼 라벨 — 대상 종류별 고정 문구(티켓 20260924_0107) */
    ctaViewCollection: '컬렉션 보기',
    ctaViewMission: '미션 보기',
    ctaViewDetails: '자세히 보기',
    /** 카드 필수 정보 줄(티켓 20261001_1357, 1453 확정 설계 2절) — 아이콘 없이 글자로 쓰고, 값이 없는 줄은 만들지 않는다 */
    factPeriod: '기간 {range}',
    factPeriodRange: '{start}~{end}',
    factPeriodOngoing: '기간 상시',
    factMonthDay: '{month}월 {day}일',
    factReward: '보상 {items}',
    factRewardPoints: '{points} 포인트',
    factRewardBadges: '배지 {count}개',
    factPlace: '지역 {place}',
    factItemCount: '아이템 {count}개',
    /** 레시피 공개 카드(티켓 20261006_1217) — 재료 수는 슬롯 수이고, 공개일은 공개 전 카드에만 있다 */
    factIngredientCount: '재료 {count}개',
    factRevealDate: '공개 {date}',
    /** 남은 시간 — 종료 7일 이내에만 기간 줄 대신 쓴다. 초·분 단위와 카운트다운은 쓰지 않는다 */
    remainingDays: '{count}일 남음',
    remainingHours: '{count}시간 남음',
  },

  /** 배지 목록/상세 화면 */
  badges: {
    title: '배지',
    /**
     * 반복 획득 배지의 «×N» 필을 보조기술이 읽을 문장 (티켓 20260905_0038 B).
     * 필 자체는 aria-hidden이라 이 문장이 없으면 횟수가 스크린리더에 전달되지 않는다.
     */
    earnCountAria: '{count}번 획득했어요',
    tabActivity: '액티비티',
    tabCheckin: '체크인',
    tabItembook: '컬렉션',

    emptyActivityTitle: '아직 획득한 배지가 없어요',
    emptyActivityBody: 'Strava를 동기화하고 활동하면 배지를 획득할 수 있어요',
    emptyCheckinTitle: '아직 획득한 체크인 배지가 없어요',
    emptyCheckinBody: '산, 지하철역 같은 장소를 지나는 활동이 기록되면 자동으로 획득돼요',
    emptyItembookTitle: '아직 컬렉션이 없어요',
    emptyItembookBody: '아이템배지를 획득하면 컬렉션이 나타납니다',

    // 상세 페이지
    pointRewardEarned: '이 배지는 {points} 포인트를 함께 드렸어요',
    pointRewardPending: '이 배지를 획득하면 {points} 포인트를 함께 드려요',

    prerequisiteTitle: '선행 배지',

    conditionTitle: '획득 조건',
    /** 체크인 배지 획득 조건 — 이 한 문장이 유일한 정본이다(20260826_004).
     *  이전에는 배지 상세·컬렉션 힌트·빈 상태에 6가지 버전이 흩어져 있었다. */
    conditionCheckinBody: '연결된 장소를 지나는 활동이 기록되면 자동으로 획득돼요. 체크인할 때마다 이력이 쌓여요.',

    earnHistoryTitle: '획득 이력',
    earnHistoryCount: '총 {count}회',
    /** 체크인 배지 상세 — 같은 장소를 다시 지날 때마다 쌓이는 기록. 아이템 배지의 «획득 이력»과 제목이 다르다(티켓 20261018_1817) */
    visitHistoryTitle: '방문 기록',
    /** 방문 기록에서 가장 오래된 행에 붙는 칩 */
    firstEarnedChip: '처음 받은 날',

    earnInfoTitle: '획득 정보',
    earnedAt: '획득 일시',
    triggerActivity: '트리거 활동',
    triggerDistance: '활동 거리',
    triggerDistanceValue: '{km} km',
    triggerDate: '활동 일자',
    viewOnStrava: 'Strava에서 보기',

    connectedLocationTitle: '연결 위치',
    viewOnMapButton: '지도에서 보기',

    physicalPatchButton: '실물 패치 보기',

    shareButtonLabel: '공유',
    shareActionShare: '공유하기',
    shareActionDownload: '저장하기',
    shareImageLoading: '공유 이미지를 준비하고 있어요',
    shareSaveSuccess: '이미지를 저장했어요',
    shareSaveError: '이미지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
    shareSaveIOSHint: '곧 열리는 공유 시트에서 \'저장\'을 눌러주세요',
    shareErrorStravaDisconnectedTitle: 'Strava 동기화가 끊겼어요',
    shareErrorStravaDisconnectedBody: '페이스·시간 데이터를 다시 가져오려면 Strava를 다시 동기화해야 해요',
    shareErrorNoTriggerTitle: '이 배지는 공유 이미지를 만들 수 없어요',
    shareErrorNoTriggerBody: '연결된 Strava 활동 기록이 없어 거리·페이스 정보를 채울 수 없어요',
    shareErrorFetchFailedTitle: '지금은 이미지를 만들 수 없어요',
    shareErrorFetchFailedBody: '잠시 후 다시 시도해 주세요',
    shareErrorActivityNotFoundTitle: 'Strava에서\n기록을 확인할 수 없어요.',
    shareErrorActivityNotFoundBody: '활동이 삭제되지 않았는지\n확인해보세요.',
    shareErrorUnknownTitle: '이미지를 만들지 못했어요',
    shareErrorUnknownBody: '잠시 후 다시 시도해 주세요',

    notEarnedTitle: '아직 획득하지 못한 배지예요',
    notEarnedBody: '조건을 달성하면 자동으로 획득돼요',

    checkinSafetyNotice: '이 배지는 표시된 위치 반경 {radius}m 안을 지나기만 해도 체크인돼요. 위험한 곳까지 굳이 들어갈 필요 없어요. 접근이 까다로운 곳이라면 알려주세요. 도와드릴게요.',

    filterActivityAll: '전체',
    filterRarityAll: '전체',
    filterCheckinCategoryAll: '전체',
    sortCheckinLatest: '최신순',
    sortCheckinName: '이름순',

    // 공유 시트 캐러셀(20260911_1102) — 스크린리더 전용 aria-label
    shareCarouselAriaLabel: '공유 이미지 선택',
    /** '통계'는 배지 트리의 '지표'/'축'과 갈라지는 미등록 용어라 이미 쓰는 '기록'으로 통일 (티켓 20260916_0734) */
    shareCardGroupLabel: '기록이 담긴 공유 카드',
    shareBadgeGroupLabel: '배지 이미지만',

    // 체크인 배지 지도 마커 API(/api/checkin-badges) — 서버 에러 메시지 단일 소스(ADR 0001)
    /**
     * bounds·zoom 누락은 사용자가 구분할 수 없고 해결책도 "지도를 다시 불러와 주세요"로
     * 동일해 하나로 통합했다 — 내부 상태명(범위·확대 정보)을 그대로 노출하지 않는다
     * (티켓 20260916_0734). API route가 두 에러 코드 모두 이 키를 참조한다.
     */
    checkinMapViewportError: '지도를 아직 다 불러오지 못했어요.',
    checkinMapPoiLoadError: '주변 체크인 배지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    checkinMapBadgeLoadError: '체크인 배지 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
  },

  /** 인벤토리 목록/상세 */
  inventory: {
    title: '인벤토리',
    combineButton: '믹스하기',
    // §1.3 "인벤토리" 항목 — 내부 명칭 「슬롯」은 사용자 노출 화면에 쓰지 않는다 (티켓 20260915_2243)
    // 20260916_0844: 슬래시 앞뒤 공백 제거(§3 표기 규칙, "Lv.3" 등과 통일)
    slotsDetail: '{used}/{max}개 사용 중 · {remaining}개 남음',
    /**
     * 남은 칸 1~3개일 때(티켓 20261018_0056). `{used}/{max}개 사용 중 · ` 뒤의 `{remaining}개만 남았어요` 구간만 굵게 보여 주려고
     * 앞부분과 강조 구간을 나눠 둔다. 색은 더하지 않고 대비와 굵기로만 구분한다.
     */
    slotsDetailLowLead: '{used}/{max}개 사용 중 · ',
    slotsDetailLowEmphasis: '{remaining}개만 남았어요',
    emptyTitle: '아직 아이템이 없어요',
    emptyBody: '활동을 완료하면 아이템 배지가 드랍돼요',

    // 포화 안내 (20260912_1940): 인벤토리가 가득 찬 동안 드랍이 스킵되는 상황을
    // [현상 → 원인 → 해결책] 구조로 즉시 안내한다.
    // 20260916_0844: "가득 찼어요"는 §1.3 고정 용어 "꽉 찼어요"와 어긋났다 → 통일.
    // [원인] 자리에 [결과]가 들어가 있던 것을 실제 보관 한도({max})로 교체하고, 시스템 동작을
    // 가리키는 자리에서 "드랍"의 이중 의미(시스템 드랍 vs 유저 드랍 행위)를 제거했다.
    // 20261018_0056: 꽉 차도 동기화는 된다. 새 아이템 배지는 보류로 남고 인벤토리를 비운 뒤에 고를 수 있어서(`syncPending.pick.fullBody`)
    // «받을 수 없어요»가 아니라 «바로 받을 수 없어요»로 쓴다. 해결 경로 세 가지(장착·믹스·드랍)를 모두 넣는다.
    fullNoticeBody:
      '인벤토리가 꽉 찼어요. {max}개까지만 보관할 수 있어서 새 아이템 배지를 바로 받을 수 없어요. 컬렉션에 장착하거나, 믹스하거나, 드랍해서 자리를 비워 주세요.',
    fullNoticeCta: '드랍하기',

    obtainMethod: '획득 방법',
    obtainedAt: '획득일',
    expiresAt: '만료일',
    expiresNone: '없음',
    expiringSuffix: ' 만료',
    rarity: '희귀도',
    expiringSoonTitle: '만료 임박',
    expiringSoonBody: '7일 이내에 이 아이템이 만료돼요',

    historyTitle: '획득 이력',
    historyError: '이력을 불러올 수 없어요',
    historyEmpty: '이력이 없어요',
    // §7.1 "~에 대한" 번역투 제거 (티켓 20260915_2243)
    historyEmptyBody: '아직 이 아이템의 기록이 없어요',
    historyUnknownUser: '알 수 없는 유저',
    obtainByDrop: '활동 드랍',
    obtainByDropEvent: '이벤트 드랍',
    obtainByPickup: '장소 픽업',
    obtainBySystem: '시스템 지급',
    eventDropped: '장소 드랍',
    eventPickedUp: '장소 픽업',

    /**
     * ADR 0001 — /api/inventory/items GET 500 응답 (티켓 20260915_2243)
     * 20260916_0844: [원인]이 빠져 있던 것을 보완 + 마침표 추가(§3 표기 규칙)
     */
    fetchFailed: '인벤토리를 불러오지 못했어요. 연결이 잠깐 끊겼을 수 있어요.',
    /**
     * ADR 0001 — /api/inventory/items/[itemId]/history GET 404 응답(아이템·소유 인벤토리 없음)
     * 20260916_0844: [원인]이 빠져 있던 것을 보완
     */
    historyItemNotFound: '이 아이템을 더 이상 볼 수 없어요. 만료됐거나 다른 유저에게 갔을 수 있어요.',
    /**
     * ADR 0001 — /api/inventory/items/[itemId]/history GET 403 응답(다른 사용자의 아이템)
     * 20260916_0844: "이력"→"기록"으로 용어 통일(historyEmptyBody와 일치)
     */
    historyForbidden: '이 아이템의 기록은 주인만 볼 수 있어요',
  },

  /**
   * 드랍/픽업 (지도)
   *
   * 20260915_2241 — ADR 0001(서버-클라이언트 단일 진실 소스)에 맞춰 `api/drops/**` 라우트가
   * 이 네임스페이스를 직접 import해 `error` 필드에 완성된 문구를 담아 돌려준다. 클라이언트
   * (`PoiCarouselModal.tsx`·`DropsClient.tsx`)는 응답의 `error` 문구를 그대로 신뢰해 토스트에
   * 노출할 뿐, 코드를 문구로 다시 매핑하지 않는다. 아래 문구들의 주석에 남은 "코드"·"매핑"
   * 표현은 이 개편 이전(20260826_002) 이력이다 — 지금은 서버가 이 상수를 직접 반환한다.
   */
  drops: {
    // 20260908_1754: PoiCarouselModal의 dialog aria-label — 화면에 노출되지 않고
    // 스크린리더에만 전달된다.
    poiCarouselAriaLabel: '장소 드랍·픽업',
    /** 캐러셀 내부 지점 목록 자체의 aria-label(티켓 20260915_2237) — 위 다이얼로그 라벨과는
     *  별개로, 목록을 순회하는 캐러셀 요소에 붙는다. */
    poiCarouselListAriaLabel: '근처 장소 목록',
    locationUnsupported: '이 브라우저는 위치 기능을 지원하지 않아요',
    locationDenied: '위치 권한을 허용해 주세요',
    retry: '다시 시도',
    locating: '위치 확인 중',
    loadPoiFailed: '주변 장소를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    // 20260826_002: '드랍 목록 로드 실패'·'인벤토리 로드 실패'는 개발자용 축약 문구였다.
    // 가이드의 [현상]→[원인/해결책] 구조 + 해요체로 다시 썼다.
    // 20260916_0825: "드랍된 아이템"은 §1.1 사용자 언어 원칙과 어긋나는 시스템 시점 표현이라
    // "근처에 떨어진 아이템"으로 교정(한국어 리뷰 지적).
    loadDropsFailed: '근처에 떨어진 아이템을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    loadInventoryFailed: '인벤토리를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    // 20260826_002 후속: unauthorized(401)가 매핑에 없어 "잠시 후 다시 시도해 주세요"로 흘렀다.
    // 세션이 풀린 상태라 다시 시도해도 영원히 실패한다 — 해결책이 원인과 어긋나 있었다.
    // 20260916_0825: "다시 로그인하고 시도해 주세요"는 로그인 이후 뭘 시도하라는 건지
    // 불명확한 군더더기였다 — 로그인만 다시 하면 되는 상황이라 문장을 그 행동으로 끝맺는다.
    sessionExpired: '로그인이 풀렸어요. 다시 로그인해 주세요.',
    // 20260826_002 후속: 반경을 '50m'로 하드코딩하고 있었으나 실제 DROP_RADIUS_METERS는 500이다.
    // 바로 아래 noNearbyPlaces가 이미 '500m'라 같은 블록 안에서 값이 어긋나 있었다.
    // 문구에 숫자를 박지 말고 상수를 주입한다({m}).
    outOfRange: '{name}까지 {distance}m 남았어요. {m}m 이내로 이동하면 드랍하거나 픽업할 수 있어요.',
    exploring: '주변 탐색 중',
    noNearbyPlaces: '주변 {m}m에 드랍/픽업할 수 있는 장소가 없어요',
    moveCloser: '장소에서 {m}m 이내로 가면 드랍/픽업할 수 있어요',
    checking: '확인 중',
    droppedBy: '{name}이(가) 드랍',
    anonymous: '익명',
    // 20260829_2101: 유저 드랍은 기한·회수 액션 없이 픽업될 때까지 무기한 대기하는 정책이
    // 확정됐다 — 아무도 안 주워가면 영구히 못 쓴다는 리스크를 확인 문구에 명시한다
    // (되돌릴 수 없는 행동 → 단호 톤, [현상]→[결과]→[확인] 구조, UX_WRITING_GUIDELINE §2).
    confirmDrop: "'{name}'을(를) 여기에 드랍하면\n다른 사람이 주워갈 때까지 되돌릴 수 없어요.\n그래도 드랍할까요?",
    cancel: '취소',
    dropButton: '드랍',
    dropSuccess: '드랍 완료',
    // 20260826_002: 드랍 실패 코드별 사용자 문구. 서버(api/drops)는 snake_case 코드만
    // 돌려주고, 이 문구들이 유일한 사용자 노출 경로다(PoiCarouselModal에서 코드로 매핑).
    dropFailed: '지금은 드랍할 수 없어요. 잠시 후 다시 시도해 주세요.',
    // 반경은 pickupOutOfRange와 같은 이유로 DROP_RADIUS_METERS 상수를 주입한다.
    // 20260916_0825: pickupOutOfRange와 표현이 어긋나 있던 것을 같은 문형으로 통일.
    dropOutOfRange: '여기서는 아직 드랍할 수 없어요. 장소에서 {m}m 안에 들어와야 해요.',
    dropPoiNotFound: '이 장소 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    // 20260916_0825: "찾을 수 없어요"는 원인을 말하지 않는 직역 반복이었다 — 실제로는
    // 인벤토리에서 이미 빠진 상태라는 뜻이라 그 사실을 그대로 말한다.
    dropItemNotFound: '이 아이템이 인벤토리에 없어요. 인벤토리를 새로고침해 주세요.',
    dropAlreadyDropped: '이미 드랍한 아이템이에요. 다른 아이템을 골라 주세요.',
    // 20260916_0825: "빼고"를 §1.3에 새로 등재한 고정 용어 "해제"로 교체. "넣은"도
    // 장착/해제 용어쌍에 맞춰 "장착한"으로 통일.
    dropItemSlotted: '컬렉션에 장착한 아이템은 드랍할 수 없어요. 컬렉션에서 해제하고 다시 시도해 주세요.',
    dropEmptyTitle: '아직 아이템이 없어요',
    dropEmptyBody: '여기에 아이템을 드랍하면 다른 사람이 발견할 수 있어요',
    dropHereButton: '드랍',
    dropNoItems: '드랍할 아이템이 없어요',
    dropNoItemsBody: '인벤토리에 아이템이 생기면 여기서 드랍할 수 있어요',
    /**
     * 같은 배지를 여러 개 보유했을 때 뜨는 드랍 개체 선택 시트 — 20260908_0040.
     * 20260907_2059의 장착 시트 문구("장착할 수 있는 배지가...")와 어간만 다르다 — "장착"은
     * 이 화면 맥락에 맞지 않아 새로 짓는다. 제목은 배지 이름 그대로(20260907_2221과 동일 규칙).
     */
    selectDropItemBody: '드랍할 수 있는 배지가 {count}개예요. 일련번호를 확인하고 골라 주세요.',
    /**
     * 픽업 목록에서 같은 배지를 여러 명이 드랍해 2개 이상 쌓였을 때 뜨는 개체 선택 시트
     * — 20260908_0223. selectDropItemBody와 어간만 다르다("드랍" → "픽업").
     */
    selectPickupItemBody: '픽업할 수 있는 배지가 {count}개예요. 일련번호를 확인하고 골라 주세요.',
    /**
     * 드랍 그리드에서 같은 배지를 2개 이상 보유했을 때 «×N» 필이 뜨는데, 이 필은
     * aria-hidden이라 이 문장이 없으면 보조기술에 개수가 전달되지 않는다(`BadgeGridCard`).
     * `d.badges.earnCountAria`("N번 획득했어요")를 그대로 쓰지 않는 이유: 그 문구는 "획득
     * 이력" 맥락이고, 여기는 "지금 보유한 것 중 하나를 고르는" 맥락이라 횟수가 아니라
     * 개수를 읽어야 뜻이 맞는다(20260908_0040).
     */
    dropOwnedCountAria: '이 배지를 {count}개 보유했어요',
    /**
     * 픽업 목록에서 같은 배지가 2개 이상 드랍돼 있을 때 «×N» 필의 sr-only 보조문 — 위
     * dropOwnedCountAria와 같은 이유(aria-hidden 필)이지만 "보유"가 아니라 "여기 놓여있음"
     * 맥락이라 어간을 다르게 짓는다(20260908_0223).
     */
    pickupAvailableCountAria: '이 배지가 여기 {count}개 있어요',
    /**
     * 잠긴 아이템 배지가 같은 등급끼리 2개 이상 쌓였을 때의 개체 선택 시트 안내 — 티켓 20261018_1817 (채원 판정 2026-10-19).
     * 잠긴 개체는 일련번호를 보이지 않으므로 행의 구분 기준은 «필요한 잼의 양»이다(`d.lockedItem.card.requiredChip`).
     */
    selectPickupLockedBody: '픽업할 수 있는 배지가 {count}개예요. 필요한 양을 확인하고 골라 주세요.',
    /** 내가 가진 잠긴 개체를 드랍하려고 같은 등급끼리 2개 이상일 때의 개체 선택 시트 안내. 위 `selectPickupLockedBody`와 어간만 다르다 */
    selectDropLockedBody: '드랍할 수 있는 배지가 {count}개예요. 필요한 양을 확인하고 골라 주세요.',
    /** 픽업 시트의 잠긴 변형 — 필요한 양 줄(`d.lockedItem.card.description`) 아래에 muted로 둔다. 픽업한 뒤의 일을 말한다 */
    pickupLockedHint: '픽업한 뒤에 잼을 채우면 열 수 있어요',
    /**
     * 잠긴 개체 드랍 확인 단계의 «사라질 양» 블록 — 티켓 20261018_1817 (운영 로직 7.2절). `{n}`은 서버가 알려 준 채운 양이다.
     * 조사 {은/는} 마커는 `t()`가 아니라 `lib/drop/drop-loss-text.ts`가 숫자 받침으로 치환한다(`t()`는 `{\w+}`만 바꾼다).
     */
    dropLossBody: '채운 잼 {n}{은/는} 사라져요. 돌려받을 수 없어요.',
    /** 사라질 양을 읽지 못했을 때 — 이 상태에서는 잠긴 개체를 드랍할 수 없다 */
    dropLossFailed: '사라질 잼의 양을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
    dropLossRetry: '다시 확인',
    /** 조회 중 스크린리더 안내 — 한 줄 Skeleton이 글자 없이 자리만 잡으므로 상태를 글자로 알린다 */
    dropLossChecking: '사라질 잼의 양을 확인하고 있어요',
    pickupButton: '픽업',
    pickupSuccess: '픽업 완료! 인벤토리를 확인해보세요',
    // 20260825_039: 바텀시트 포털화로 그동안 시트에 가려져 있던 픽업 실패 토스트가
    // 실제로 노출되기 시작했다. 서버 원문(개발자용 축약 문구)이 새어 나가지 않도록
    // 실패 코드를 전부 여기서 사용자 문구로 옮기고, 가이드의 [현상]→[원인/해결책] 구조로 다시 썼다.
    pickupFailed: '지금은 픽업할 수 없어요. 잠시 후 다시 시도해 주세요.',
    // 20260916_0825: "이미 픽업된 아이템이에요"는 시스템 시점 피동문이었다 — 누가 한 일인지
    // 사용자 시점으로 드러낸다(§1.1).
    pickupAlreadyDone: '누군가 먼저 픽업했어요. 근처의 다른 아이템을 찾아보세요.',
    pickupInventoryFull: '인벤토리가 꽉 찼어요. 아이템을 정리하고 다시 시도해 주세요.',
    // 반경은 DROP_RADIUS_METERS 상수를 주입한다 — 문구에 숫자를 직접 박아두면
    // 상수가 바뀔 때 조용히 어긋난다(실제로 서버 에러 문구가 500m를 '50m'로 잘못 적고 있었다).
    // 20260916_0825: "드랍 지점"은 §1.3에 없는 조어라 "지점"으로 통일하고, dropOutOfRange와
    // 같은 문형으로 맞췄다.
    pickupOutOfRange: '여기서는 아직 픽업할 수 없어요. 장소에서 {m}m 안에 들어와야 해요.',
    // 20260826_002 후속: 서버 원문으로 남아 있던 나머지 픽업 실패 경로를 코드화하면서 옮긴 문구.
    // 20260916_0825: "찾을 수 없어요"/"확인해 주세요" 직역 반복을 정리하고, §1.3에서 확정한
    // "새로고침" 표기로 고정했다(재요청인 "다시 시도"와는 구분되는 동작이라 뒤에 붙이지 않는다).
    pickupDropNotFound: '이 아이템은 벌써 사라졌어요. 목록을 새로고침해 주세요.',
    pickupPoiNotFound: '이 장소 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    // 20260830_1424: GPS 조작 감지 시 뜨는 문구지만 오탐(실내·터널 등 GPS 불안정) 가능성이
    // 낮지 않아 비난조를 피한다. 다만 "다른 지점 이용 가능" 같은 무마성 문구 대신, 실제
    // 상황([현상]: 비정상적으로 빠른 이동이 감지됨 — 이동속도 기준 노출은 UX_WRITING_GUIDELINE.md
    // 4절 어뷰징 사례와 동일 수준)과 실제 해결 경로([해결책]: 문의 → 어드민이 오탐이면 수동
    // 해제)를 담백하게 안내한다. 정확한 해제 시간(72시간)은 노출하지 않는다 — 어뷰저가 재시도
    // 타이밍을 계산할 수 있어서다.
    // 20260916_0825: 원인을 "비정상적으로 빠른 이동이 확인돼"로만 뭉뚱그리지 않고 실제
    // 판정 기준(이동 속도)을 그대로 드러내 [현상]→[원인]→[해결책] 구조를 갖춘다.
    pickupPoiBlocked: '이 장소 근처에서 이동 속도가 너무 빨라 픽업을 인정하지 않았어요. 확인이 필요하면 문의해 주세요.',
    // 20260916_0825: locationMissing과 "위치를 확인하지 못했어요/확인할 수 없어요" 직역이
    // 반복돼 표현을 통일했다.
    pickupLocationUnverified: '위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
    // 좌표 없이 요청이 나간 경우 — 드랍·픽업 양쪽에서 함께 쓴다.
    locationMissing: '위치를 확인하지 못했어요. 위치 권한을 허용하고 다시 시도해 주세요.',
    back: '뒤로',
  },

  /** 미션 목록/상세/현황 */
  missions: {
    title: '미션',
    tabOngoing: '진행중',
    tabJoined: '참가중',
    // 20260825_028: 상시 미션은 종료일이 없어 '종료' 조건에 영원히 안 걸린다 —
    // 완료한 미션의 성취 이력을 볼 수 있도록 탭 범위를 확장 (완료 + 참여했던 종료 미션)
    tabEnded: '종료',
    sortNewest: '최신순',
    sortOldest: '오래된순',
    sortEndingSoon: '종료임박순',
    activityTypeAll: '전체',
    missionTypeLabel: '미션 유형',
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
    /** ADR 0001 — /api/missions/[id]/join POST 404 응답(미션 없음·비노출 공통, 티켓 20260915_2244)
     * 20260916_0856: 에러 3단계([현상]→[원인]→[해결책], §4.1) 구조로 재작성. CTA "미션 목록
     * 보기"는 이 응답을 띄우는 토스트가 액션 버튼을 지원하지 않아 문구만 완성 — 잔여 이슈. */
    missionNotFound: '이 미션은 사라졌어요. 삭제됐거나 링크가 잘못됐을 수 있어요.',
    /** ADR 0001 — /api/missions/[id]/join POST 400 응답(이미 종료된 미션)
     * 20260916_0856: §1.3 미션 상태 행에 맞춰 "끝난"으로 통일 + 3단계 구조. CTA "미션 목록 보기"는
     * missionNotFound와 동일하게 토스트 액션 버튼 미지원으로 문구만 완성 — 잔여 이슈. */
    alreadyEndedError: '이미 끝난 미션이에요. 지금 참가할 수 있는 미션을 볼까요?',
    /** ADR 0001 — /api/missions/[id]/join POST 409 응답(참가 레코드 중복) */
    alreadyJoinedError: '이미 참가 중인 미션이에요',
    /** ADR 0001 — /api/missions/[id]/join POST 500 응답(참가 처리 실패)
     * 20260916_0856: §1.1 공급자 언어("처리") 제거 + 3단계 구조 */
    joinProcessError: '미션에 참가하지 못했어요. 잠시 뒤 다시 참가해 주세요.',
    /** ADR 0001 — /api/missions/[id]/status GET 403 응답(미참가자의 상황 조회)
     * 20260916_0856: §1.2 위반("유저") 제거, 1인칭 시점 재작성 + 3단계 구조. CTA "참가하기"는
     * 이 응답이 페이지 본문에 텍스트로만 노출되고 버튼이 없어 문구만 완성 — 잔여 이슈. */
    statusForbidden: '참가하면 미션 상황을 볼 수 있어요',
    timeLeftSuffix: '남음',
    limitedSlots: '선착순 {count}명',
    rewardNone: '없음',
    rewardBadgeCount: '배지 {count}개',
    rewardPoints: '{points} 포인트',
    /** 목록 카드의 보상 배지 표기(티켓 20260915_2244) */
    rewardBadgeName: '{name} 배지',
    /** 목록 카드 "조건" 행 라벨(티켓 20260923_1353). 보상 행의 "획득" 라벨은 제거했다(티켓 20260927_0139) */
    cardConditionLabel: '조건',

    backToDetail: '미션',
    /** 대표 이미지 alt 텍스트(티켓 20260915_2244) — 20260916_0856: 개발 용어 "썸네일" 제거 */
    thumbnailAlt: '{title} 대표 이미지',
    goalDistance: '달성 거리',
    goalActivityCount: '활동 횟수',
    goalCheckin: '체크인',
    goalItemCollect: '아이템 픽업',
    goalStreakDays: '연속 활동 일수',
    goalDurationMinutes: '단일 활동 시간',
    goalElevationGainM: '누적 고도 상승',
    goalEngineCondition: '미션 완료',
    goalDefault: '목표',
    conditionTitle: '달성 조건',
    /** 대표 이미지가 없을 때 보여주는 자리표시 문구(티켓 20260915_2244)
     * 20260916_0856: 개발 용어 "영역" 제거 */
    imagePlaceholder: '이미지 준비 중',
    /** 달성 조건 카드의 활동 종류 항목(티켓 20260915_2244)
     * 20260916_0856: 라벨-값 콜론 표기(개발 문자열 관습) 제거 */
    conditionActivityType: '{type} 활동',
    /** 달성 조건 카드 안내 — §1.3 "충족" 금지어를 피해 서술(티켓 20260915_2244)
     * 20260916_0856: 수동태·문어체("완료돼요") 정리, 능동형으로 재작성
     * 20260927_0026: 「조건을 다 채우면」→「조건을 달성하면」. §1.3의 「조건 달성」 금지 표기와 겹치지만
     * 사용자가 알고 확정한 예외다(가이드 §1.3 「조건을 다 채웠어요」 행에 기록). 이 카드 밖으로 넓히지 않는다 */
    conditionAutoCompleteHint: '참가한 뒤 조건을 달성하면 미션이 자동으로 끝나요',
    myProgressTitle: '나의 진행 상황',
    achieved: '달성',
    notAchieved: '미달성',
    /** 20260927_0119: 복합 조건(engine_condition) 미션의 「나의 진행 상황」은 상태만 한 문장으로 알린다.
     * 조건은 위의 「달성 조건」 카드가 이미 보여 주므로 라벨·칩으로 되풀이하지 않는다 */
    engineConditionNotAchieved: '아직 미션을 달성하지 못했어요',
    engineConditionAchieved: '미션을 달성했어요',
    progressPct: '{pct}% 달성',
    rewardSectionTitle: '보상',
    /** 20260827_014 — 「JAM 포인트」·「1200P」 표기는 UX 가이드 §3 Bad. 「1,200 포인트」로 통일 */
    rewardPointsLine: '{points} 포인트',
    /** 보상 배지 행 캡션(티켓 20260915_2244)
     * 20260916_0856: rewardPointsCaption과 문형을 맞춰 "완료하면 ~해요"로 통일 */
    rewardBadgeCaption: '완료하면 획득해요',
    /** 보상 포인트 행 캡션 — §1.3 "지급"은 어드민 전용이라 유저 화면에 쓰지 않는다(티켓 20260915_2244)
     * 20260916_0856: rewardBadgeCaption과 문형을 맞춰 "완료하면 ~해요"로 통일 */
    rewardPointsCaption: '완료하면 바로 받아요',
    statusViewButton: '미션 상황 보기',
    joinConfirmBody: '한번 참가하면 취소할 수 없어요. 참가할까요?',
    joinConfirmButton: '참가 확정',
    joinNote: '참가 후에는 취소할 수 없어요',
    joinSuccess: '미션에 참가했어요',
    joinError: '오류가 발생했어요',
    joinNetworkError: '네트워크 오류가 발생했어요. 다시 시도해 주세요.',
    /** 참가 전 CTA 버튼(티켓 20260915_2244) */
    joinButton: '참가하기',
    /** joinButton 클릭 후 참가 처리 중(비동기 대기) 라벨 — §5.3 기본형(티켓 20260916_0856 신설) */
    joinButtonPending: '참가하는 중',
    /** 완료 후 종료된 미션의 비활성 CTA 버튼(티켓 20260915_2244)
     * 20260916_0856: §5.1 단독 명사 CTA 금지 + §1.3 미션 상태 행("끝난")에 맞춰 재작성 */
    ctaEnded: '종료',

    statusAchievementLabel: '달성 현황',
    statusIndividualLabel: '나의 현황',
    statusParticipants: '참가자 {count}명',
    statusAllRanks: '전체 랭킹',
    statusLoadError: '불러오지 못했어요',
    statusMeAchievement: '— 나 —',
    statusNoParticipants: '아직 참가자가 없어요',
    statusNoParticipantsBody: '가장 먼저 도전해보세요',
    statusMeSuffix: ' (나)',
    /** 받지 않은 미션 보상 받기 API 오류 문구(티켓 20261019_1313). 화면은 5-7이 만든다 */
    claim: {
      /** 받기 409 `no_pending` — 이미 받았다(중복 클릭, 다른 기기) */
      noPending: '받을 미션 보상이 더 없어요. 이미 받았을 수 있으니 인벤토리에서 확인해 주세요.',
      /** 받기 409 `insufficient_slots` — 빈칸 수와 필요한 빈칸 수는 응답 필드(`free`·`needed`)로 싣는다 */
      insufficientSlots: '인벤토리 빈칸이 모자라서 미션 보상을 받지 못했어요. 빈칸을 만든 뒤 다시 받아 주세요.',
      /** 받기 404 `inventory_not_found` */
      inventoryNotFound: '인벤토리를 찾지 못해 미션 보상을 받지 못했어요. 잠시 후 다시 시도해 주세요.',
      /** 받기 POST 500 */
      failed: '미션 보상을 받지 못했어요. 잠시 후 다시 시도해 주세요.',
    },
    /**
     * 미션 상세의 «받을 보상» 카드 문구(티켓 20261019_1317 2회, 운영 로직 6.4절·7.3절). 인벤토리 빈칸이 모자라 받지 못한 보상을
     * 완료한 뒤에 받는다. 용어와 문형은 믹스의 받기 시트(`d.combine.pendingSheet`)를 따른다. 서버가 돌려주는 오류 문구는 위 `claim`이다.
     */
    pendingCard: {
      title: '받을 보상',
      /** 한 번에 모두 받는다(일부만 받기 없음). `{count}`는 받을 보상 개수 */
      intro: '보상 {count}개를 한 번에 받아요',
      claim: '받기',
      /** 제출 중 버튼 라벨(진행형, UX 라이팅 §5.3) */
      claiming: '받는 중',
      /** 받기 409 `insufficient_slots`의 안내. `{free}`는 지금 빈칸 수, `{needed}`는 받으려면 필요한 빈칸 수 */
      shortNotice: '지금 빈칸 {free}개, 받으려면 {needed}개가 필요해요. 받지 못한 보상은 그대로 남아 있어요.',
      inventoryLink: '인벤토리 보기',
      /** 받을 보상을 읽지 못했을 때(완료한 미션에서만). «받을 보상 없음»과 다르다 */
      loadFailed: '받을 보상을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
      retry: '다시 시도',
      /** 받기 성공 토스트. `{count}`는 받은 보상 개수 */
      claimedToast: '미션 보상 {count}개를 받았어요',
    },
    /** 밤 조건(22:00~05:00 KST와 겹치는 시간대) 미션의 안전 안내. 닫을 수 없이 늘 보인다(운영 로직 13.2절) */
    nightNotice: '어두울 때는 무리하지 마세요',
  },

  /** 로그인 / Strava 동기화(OAuth) — 티켓 20260915_2246 */
  auth: {
    wordmark: 'JAM!',
    googleLogin: '구글로 시작하기',
    errorFailed: '로그인에 실패했어요. 다시 시도해 주세요.',
    errorGeneric: '오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
    terms: '계속하면 JAM!의 이용약관 및 개인정보처리방침에 동의하는 것으로 간주돼요.',
    devLogin: '테스트 로그인 (개발 전용)',
    /** `/api/strava/sync` 수동 동기화 500 오류 (ADR 0001 — API route가 직접 참조).
     *  §4.1 [현상]→[원인]→[해결책] 3단계로 교정 (티켓 20260916_0917).
     *  CTA는 이 API를 호출하는 화면(`SyncButton.tsx`)이 별도 토스트(`today.syncFailed`)를
     *  쓰고 이 값을 읽지 않아 실제로 노출되지 않는다 — 잔여 이슈로 기록. */
    stravaSyncError: 'Strava 동기화가 끊겼어요. 동기화 권한이 해제됐거나 Strava 연결이 잠시 불안정했을 수 있어요.',
    /** `/api/strava/disconnect` 404(연결 없음) 응답 본문 — 톤 교정은 20260916_0917.
     *  고아 컴포넌트 `StravaStatusCard`와 그 문구 키는 티켓 20261017_1422에서 지웠고 이 키만 API가 쓴다. */
    stravaNotConnectedTitle: '아직 Strava를 동기화하지 않았어요',
    stravaLastSyncedLabel: '마지막 동기화',
    /** 탈퇴를 마친 뒤 `/login?withdrawn=1`에서 로고 아래에 한 번 보이는 안내 (티켓 20261021_1249 3회) */
    withdrawnNotice: '탈퇴가 끝났어요. 계정을 지웠어요.',
  },

  /**
   * 이용 정지로 막힌 API 응답의 `error` 문구 — 티켓 20261017_1426 1회 (운영 로직 16.4절).
   * `/api/strava/sync`와 `/api/strava/pending-items` POST의 403(`code: 'user_suspended'`)이 이 키를 직접 참조한다(ADR 0001).
   * «전문 · 직접» 톤(UX 라이팅 §2.3)으로 현상, 해결책 순(§4.1)이다. 정지 까닭은 문구에 싣지 않는다(홈 배너가 보여 준다).
   * 해결 경로는 문의 하나다. 화면 문구(홈 상단 배너)는 2회 채원 판정 뒤에 같은 묶음에 더한다.
   */
  suspension: {
    /** 동기화 403 — 정지 중이라 새 활동을 가져오지 않았다 */
    syncBlocked: '이용이 정지된 계정이라 지금은 동기화할 수 없어요. 정지 사유와 해제 방법은 문의로 알려 드려요.',
    /** 보류 받기 403 — 정지 중이라 아이템 배지를 인벤토리에 담지 못했다 */
    pendingBlocked: '이용이 정지된 계정이라 지금은 아이템 배지를 획득할 수 없어요. 정지 사유와 해제 방법은 문의로 알려 드려요.',
    /** 캡슐 채우기 403 — 정지 중이라 잼을 채우지 않았다(티켓 20261018_0052) */
    capsuleBlocked: '이용이 정지된 계정이라 지금은 캡슐을 채울 수 없어요. 정지 사유와 해제 방법은 문의로 알려 드려요.',
    /** 캡슐 열기 403 — 정지 중이라 추첨하지 않았고 채운 잼은 그대로다(티켓 20261018_0052 2회) */
    capsuleOpenBlocked: '이용이 정지된 계정이라 지금은 캡슐을 열 수 없어요. 정지 사유와 해제 방법은 문의로 알려 드려요.',
    /** 잠긴 아이템 배지 채우기 403 — 정지 중이라 잼을 채우지 않았다(티켓 20261018_0053) */
    lockedItemFillBlocked: '이용이 정지된 계정이라 지금은 아이템 배지를 채울 수 없어요. 정지 사유와 해제 방법은 문의로 알려 드려요.',
    /** 잠긴 아이템 배지 열기 403 — 정지 중이라 열지 않았고 채운 잼은 그대로다(티켓 20261018_0053) */
    lockedItemOpenBlocked: '이용이 정지된 계정이라 지금은 아이템 배지를 열 수 없어요. 정지 사유와 해제 방법은 문의로 알려 드려요.',
    /** 믹스 403 — 정지 중이라 재료를 쓰지 않았다(티켓 20261018_0055) */
    combineBlocked: '이용이 정지된 계정이라 지금은 믹스할 수 없어요. 정지 사유와 해제 방법은 문의로 알려 드려요.',
    /** 받지 않은 믹스 결과 받기 403 — 정지 중이라 받지 않았다(티켓 20261018_0055) */
    combineClaimBlocked: '이용이 정지된 계정이라 지금은 믹스 결과를 받을 수 없어요. 정지 사유와 해제 방법은 문의로 알려 드려요.',
    /** 드랍 403 — 정지 중이라 드랍하지 않았고 아이템 배지는 인벤토리에 그대로 있다(티켓 20261018_1812) */
    dropBlocked: '이용이 정지된 계정이라 지금은 아이템 배지를 드랍할 수 없어요. 정지 사유와 해제 방법은 문의로 알려 드려요.',
    /** 픽업 403 — 정지 중이라 줍지 않았고 아이템 배지는 그 자리에 그대로 있다(티켓 20261018_1812) */
    pickupBlocked: '이용이 정지된 계정이라 지금은 아이템 배지를 픽업할 수 없어요. 정지 사유와 해제 방법은 문의로 알려 드려요.',
    /** 미션 참가 403 — 정지 중이라 참가하지 않았다(티켓 20261019_1311) */
    missionJoinBlocked: '이용이 정지된 계정이라 지금은 미션에 참가할 수 없어요. 정지 사유와 해제 방법은 문의로 알려 드려요.',
    /** 받지 않은 미션 보상 받기 403 — 정지 중이라 받지 않았다(티켓 20261019_1313) */
    missionClaimBlocked: '이용이 정지된 계정이라 지금은 미션 보상을 받을 수 없어요. 정지 사유와 해제 방법은 문의로 알려 드려요.',
    /** 컬렉션 장착 403 — 정지 중이라 장착하지 않았고 아이템 배지는 인벤토리에 그대로 있다(티켓 20261019_1315 3회, 장착으로 컬렉션을 완성하면 챕터 점수가 생기기 때문) */
    itemBookSlotBlocked: '이용이 정지된 계정이라 지금은 컬렉션에 아이템 배지를 장착할 수 없어요. 정지 사유와 해제 방법은 문의로 알려 드려요.',
    /** 홈 상단 배너(티켓 20261017_1426 2회, 채원 판정). 문의 버튼 문구는 `d.voc.inquireCta`를 쓴다 */
    bannerChip: '이용 정지',
    bannerTitle: '이용이 정지된 계정이에요',
    bannerReasonLabel: '정지 사유',
    bannerSuspendedOnLabel: '정지일',
    bannerBody:
      '정지 중에는 동기화와 아이템 배지 획득이 멈추고, 이 기간에 시작한 활동은 해제된 뒤에도 반영되지 않아요. 지금까지의 기록, 배지, 잼, 포인트는 그대로 남아 있어요. 해제 방법은 문의로 알려 드려요.',
  },

  /**
   * 트라이브를 고르기 전에 막힌 API 응답의 `error` 문구 — 티켓 20261021_1247 1회 (운영 로직 2장).
   * `/api/strava/sync`와 `/api/strava/auth`의 403(`code: 'tribe_required'`)이 이 키를 직접 참조한다(ADR 0001).
   * 현상, 해결책 순(§4.1)으로 «현상(트라이브를 고르지 않아 할 수 없어요) → 해결책(트라이브를 먼저 골라 주세요)» 두 문장이다. 앱 화면은 레이아웃이 먼저 고르기 화면으로 보내므로,
   * 이 문구는 화면을 거치지 않은 직접 호출이나 고르기 도중 계정이 바뀐 경우에만 보인다.
   */
  tribeGate: {
    /** 동기화 403 — 트라이브를 고르지 않아 새 활동을 가져오지 않았다 */
    syncBlocked: '아직 트라이브를 고르지 않아 동기화할 수 없어요. 트라이브를 먼저 골라 주세요.',
    /** Strava 동기화 시작(연결) 403 — 트라이브를 고르지 않아 Strava 인증으로 보내지 않았다 */
    connectBlocked: '아직 트라이브를 고르지 않아 Strava 동기화를 시작할 수 없어요. 트라이브를 먼저 골라 주세요.',
  },

  /**
   * 캡슐 API 오류 — 티켓 20261018_0052 (운영 로직 5.2절).
   * `/api/capsule`·`/api/capsule/fill`·`/api/capsule/open`이 이 키를 직접 참조한다(ADR 0001). 이용 정지 403은 `d.suspension.capsuleBlocked`(채우기)와
   * `d.suspension.capsuleOpenBlocked`(열기)다. 열기 문구는 «다시 열기를 부추기는 말, 낮은 등급을 꽝으로 보는 말, 다음 결과를 미리 기대하게 하는 말»을 쓰지 않는다.
   * 현상, 원인, 해결책 순(§4.1). 열기를 부추기는 말과 낮은 등급을 낮추어 보는 말은 쓰지 않는다(5.2절 연출 규칙).
   * 화면 문구(3-4)는 채원 판정 뒤에 같은 묶음에 더한다.
   */
  capsule: {
    /** 채우기 400 `already_full` — 필요한 양을 이미 다 채웠다 */
    alreadyFull: '캡슐이 이미 가득 차서 더 채울 수 없어요.',
    /** 채우기 400 `exceeds_remaining` — 남은 양보다 많은 양을 요청했다 */
    exceedsRemaining: '남은 양보다 많이는 채울 수 없어요. 남은 양 이하로 정해 주세요.',
    /** 채우기 400 `invalid_amount` — 양이 1 이상의 정수가 아니거나 요청 본문이 형식에 맞지 않다 */
    invalidAmount: '채울 양은 1 이상의 정수여야 해요. 양을 확인해 주세요.',
    /** 채우기 409 `insufficient_jam` — 가진 잼이 없다 */
    insufficientJam: '가진 잼이 없어서 캡슐을 채우지 못했어요. 잼이 생기면 다시 채워 주세요.',
    /** 채우기 409·열기 409 `capsule_changed` — 채우거나 여는 사이 캡슐이 바뀌었다. 다시 시도하면 된다(티켓 20261026_1031) */
    changed: '캡슐이 방금 바뀌었어요. 다시 시도해 주세요.',
    /** 채우기 POST 500 */
    fillFailed: '캡슐을 채우지 못했어요. 잠시 후 다시 시도해 주세요.',
    /** 캡슐 조회 GET 500 */
    loadFailed: '캡슐 상태를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    /** 열기 409 `not_full` — 필요한 양을 다 채우지 못했다 */
    openNotFull: '캡슐이 아직 다 차지 않아서 열 수 없어요. 필요한 양을 채운 뒤에 열어 주세요.',
    /** 열기 409 `insufficient_slots` — 인벤토리 빈칸이 나올 수 있는 최대 개수보다 적다. 지금 빈칸 수와 필요한 빈칸 수는 응답 필드(`freeSlots`·`neededSlots`)로 싣는다 */
    openInsufficientSlots: '인벤토리 빈칸이 모자라요. 빈칸을 만든 뒤에 열어 주세요. 채운 잼은 그대로 남아 있어요.',
    /** 열기 409 `no_tribe` — 소속 트라이브가 없어 추첨할 수 없다 */
    openNoTribe: '소속 트라이브가 없어서 캡슐을 열 수 없어요. 트라이브를 정한 뒤에 열어 주세요. 채운 잼은 그대로 남아 있어요.',
    /** 열기 POST 500 — 내부 오류 원문은 싣지 않는다 */
    openFailed: '캡슐을 열지 못했어요. 채운 잼은 그대로 남아 있어요. 잠시 후 다시 시도해 주세요.',
    /** 열기 결과 문구. `{n}`은 나온 아이템 배지 개수(화면 3-4가 쓴다) */
    openResult: '캡슐을 열었어요. 아이템 배지 {n}개를 얻었어요.',
    /**
     * 캡슐 화면 문구 — 티켓 20261018_0054 1회 (채원 판정 2026-10-18). 투데이와 내 프로필의 알약, 알약을 누르면 뜨는 시트다.
     * 고정 용어는 «채우기»·«열기»·«잼»이고, 받침이 갈리는 조사는 «잼 {n}만큼»처럼 «만큼»으로 피한다.
     * 게이지에는 숫자와 퍼센트를 쓰지 않는다(운영 로직 4.3절). 다시 열기를 부추기는 말과 낮은 등급을 낮추어 보는 말은 쓰지 않는다.
     */
    title: '캡슐',
    /** 알약 — 오른쪽 상태 문구 */
    pill: {
      filling: '채우기',
      ready: '열 수 있어요',
      noSlots: '빈칸이 모자라요',
      /** 오류 알약의 왼쪽 문구. 위의 `loadFailed`는 API 응답용 긴 문장이라 한 줄 알약에는 이 짧은 문구를 쓴다 */
      loadFailed: '캡슐을 불러오지 못했어요',
      retry: '다시 시도',
    },
    /** 알약 버튼의 스크린리더 이름 — 상태를 글자로도 알린다(색과 게이지에만 기대지 않는다) */
    aria: {
      filling: '캡슐, 채우는 중이에요',
      ready: '캡슐, 열 수 있어요',
      noSlots: '캡슐, 인벤토리 빈칸이 모자라요',
      loading: '캡슐을 불러오는 중이에요',
      error: '캡슐을 불러오지 못했어요. 누르면 다시 시도해요',
    },
    sheet: {
      /** 가진 잼 줄의 라벨. 숫자는 옆에 따로 그린다 */
      balanceLabel: '가진 잼',
      fillCta: '채우기',
      openCta: '열기',
      /** 제출 중 버튼 라벨(진행형, UX 라이팅 §5.3) */
      filling: '채우는 중',
      opening: '여는 중',
      /** 채우기 단계 */
      fillTitle: '잼 채우기',
      cancel: '취소',
      /** 가진 잼이 0일 때 «채우기» 아래 안내 */
      noJam: '가진 잼이 없어요. 동기화로 잼을 받으면 채울 수 있어요.',
      /** 인벤토리 빈칸이 모자랄 때 안내 블록 */
      noSlotsTitle: '인벤토리 빈칸이 모자라요',
      noSlotsCount: '지금 빈칸 {free}개, 열려면 {needed}개가 필요해요',
      noSlotsKept: '채운 잼은 그대로 남아 있어요',
      inventoryLink: '인벤토리 보기',
      /** 본문 맨 아래의 조용한 링크. 숫자·퍼센트·아이콘 없이 페이지 이름만 쓴다(시트는 게이지에도 숫자를 쓰지 않는다, 티켓 20261021_1250) */
      probabilityLink: '확률 안내',
    },
    /** 채우기 입력 — 캡슐과 잠긴 아이템 배지가 같은 문구를 쓴다(운영 로직 7.2절: 같은 동작이 두 곳에서 다르면 안 된다) */
    fill: {
      /** 숫자 입력창의 스크린리더 이름 */
      amountLabel: '채울 잼',
      /** 입력창 아래 한 줄. 입력값에 따라 바로 바뀐다 */
      hint: '잼 {n}만큼 채워요. 채운 잼은 다시 꺼낼 수 없어요.',
      /** 입력이 비었거나 숫자가 아니거나 0일 때 */
      hintInvalid: '채울 잼을 1 이상의 숫자로 입력해 주세요.',
      submit: '채우기',
      submitting: '채우는 중',
    },
  },

  /**
   * 동기화 보류와 고르기 API 오류 — 티켓 20261017_1425 1회 (운영 로직 6.4절).
   * `/api/strava/pending-items`와 `/api/strava/sync`의 409가 이 키를 직접 참조한다(ADR 0001).
   * 현상, 원인, 해결책 순(§4.1). 고정 용어는 «획득»과 «인벤토리»다. 화면 문구(2회)는 채원 판정 뒤에 같은 묶음에 더한다.
   */
  syncPending: {
    /** 동기화 409 — 보류가 남아 있어 새 활동을 가져오지 않았다 */
    syncBlocked: '아직 고르지 않은 아이템 배지가 있어요. 고르기를 마쳐야 새 활동을 동기화할 수 있어요.',
    /** 고르기 400 `wrong_count` — 빈칸 수와 다르게 골랐다 */
    wrongCount: '고른 개수가 인벤토리 빈칸 수와 달라서 확정하지 못했어요. 빈칸 수만큼 정확히 골라 주세요.',
    /** 고르기 400 `invalid_selection` — 이미 닫혔거나 내 것이 아닌 항목이 섞였다 */
    invalidSelection: '지금 고를 수 없는 아이템 배지가 섞여 있어요. 목록을 다시 불러와 골라 주세요.',
    /** 고르기 400 — 요청 본문이 형식에 맞지 않다 */
    invalidInput: '고른 내용을 확인하지 못했어요. 화면을 새로 열어 다시 골라 주세요.',
    /** 고르기 409 `no_pending` — 이미 고르기를 마쳤다(중복 클릭, 다른 기기) */
    noPending: '고를 아이템 배지가 더 없어요. 이미 고르기를 마쳤을 수 있으니 인벤토리에서 획득한 아이템 배지를 확인해 주세요.',
    /** 고르기 404 `inventory_not_found` */
    inventoryNotFound: '인벤토리를 찾지 못해 고르기를 확정하지 못했어요. 잠시 후 다시 시도해 주세요.',
    /** 고르기 POST 500 */
    resolveFailed: '고르기를 확정하지 못했어요. 잠시 후 다시 시도해 주세요.',
    /** 보류 목록 GET 500 */
    loadFailed: '고를 아이템 배지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    /**
     * 고르기 화면(티켓 20261017_1425 2회, 채원 판정 2026-10-17). 되돌릴 수 없는 결정이라 «단호 · 명확» 톤이다(UX 라이팅 §2.3) —
     * 축하·이모지 없이 현상 → 결과 순서로 쓴다. 고정 용어는 «인벤토리»·«획득»이고, 버튼은 동사형이며 «확인»을 쓰지 않는다.
     */
    pick: {
      /** 오버레이 이름 (스크린리더) */
      ariaLabel: '인벤토리에 담을 아이템 배지 고르기',
      /** 헤더 제목 — 마침표 없음 */
      title: '인벤토리에 담을 {n}개를 골라 주세요',
      /** 헤더 보조 문구 */
      subtitle: '이번에 {total}개가 나왔어요',
      /** 푸터 카운터(라이브 리전). 선택할 때마다 이 한 줄만 공지한다 */
      counter: '{k}/{n}개 골랐어요',
      /** 푸터 보조 문구. 안 고른 것이 0개이면 숨긴다 */
      unselectedNote: '고르지 않은 {count}개는 받을 수 없어요',
      /** 카드 토글 — 선택 전 */
      toggleSelect: '고르기',
      /** 카드 토글 — 선택 후 */
      toggleSelected: '골랐어요',
      /** 푸터 주 버튼. 확정 확인 단계의 확정 버튼도 같은 문구다 */
      confirmCta: '{n}개 담기',
      /** 확정 확인 제목 */
      confirmTitle: '이 {n}개만 담을까요?',
      /** 확정 확인 본문 — 고르지 않은 것이 있을 때만 보여 준다 */
      confirmBody: '고르지 않은 {m}개는 받을 수 없고, 다시 받을 수도 없어요.',
      /** 확정 확인 → 선택 화면으로 돌아가는 버튼(선택은 유지된다) */
      confirmBack: '다시 고르기',
      /** 제출 중 확정 버튼 라벨(진행형, UX 라이팅 §5.3) */
      submitting: '담는 중',
      /** 목록을 기다리는 동안 스크린리더가 읽는 문구 */
      loading: '고를 아이템 배지를 불러오고 있어요',
      /** 고르기를 마친 뒤 토스트 — 받은 개수(1 이상) */
      resolvedToast: '아이템 배지 {count}개를 인벤토리에 담았어요',
      /** 고르기를 마친 뒤 토스트 — 받은 것이 없을 때(인벤토리가 가득 차 받지 않고 닫은 경우) */
      resolvedNoneToast: '받지 않고 닫았어요',
      /** 인벤토리 빈칸이 0일 때 안내 제목 */
      fullTitle: '인벤토리가 가득 차서 받을 수 없어요',
      /** 인벤토리 빈칸이 0일 때 안내 본문 — «나중에»는 보류를 남기고 «받지 않고 닫기»만 보류를 닫는다 */
      fullBody:
        '이번에 나온 아이템 배지 {total}개를 지금은 받을 수 없어요. 인벤토리를 비운 뒤에 다시 열면 고를 수 있어요. 받지 않고 닫으면 이 {total}개는 다시 받을 수 없어요.',
      /** 빈칸 0 안내 — 보류를 남기고 닫는 버튼 */
      fullLater: '나중에',
      /** 빈칸 0 안내 — 빈 선택으로 확정해 보류를 닫는 버튼 */
      fullDiscard: '받지 않고 닫기',
    },
  },

  /**
   * 잠긴 아이템 배지의 사용 제한 응답 — 티켓 20261018_0051 1회 (운영 로직 7.2절).
   * 서버가 `locked_item_not_allowed`로 거절할 때 쓰는 문구다. `api/itembooks/[id]/slot`·`api/combine`·`api/drops`가 이 키를 직접 참조한다(ADR 0001).
   * 현상 → 원인 → 해결책 순(§4.1). 고정 용어는 «잠김»(§1.3)이고 «잠금»은 쓰지 않는다. «장착»·«믹스»·«드랍»도 고정 용어다.
   * `card`는 보류 고르기의 가림 카드(캐러셀 BadgeCard의 잠금 타일 아래)와 드랍 후보 목록의 가린 이름, `notice`는 결산 알림 문구다 — 티켓 20261018_0051 2회 (채원 판정 2026-10-18).
   * 조사 이/가가 숫자에 따라 갈리지 않게 «잼 {n}» 뒤에 «필요해요»를 둔다. 화면의 안내(3-6)는 같은 묶음에 따로 더한다.
   */
  lockedItem: {
    card: {
      /** 이름 줄. 어떤 아이템 배지인지 알 수 있는 값은 싣지 않는다 */
      name: '잠긴 아이템 배지',
      /** 설명 줄. `{n}`은 여는 데 필요한 잼. 필요한 양이 없는 비정상 응답이면 호출부가 이 줄을 생략한다 */
      description: '여는 데 잼 {n}만큼 채워야 해요',
      /** 개체 선택 시트 행의 구분 값(일련번호 자리). `{n}`은 여는 데 필요한 잼. 필요한 양이 없는 비정상 응답이면 호출부가 줄을 생략한다 */
      requiredChip: '잼 {n} 필요',
    },
    /**
     * 잠긴 아이템 배지 상세 화면 문구 — 티켓 20261018_0054 2회 (채원 판정 2026-10-18). `/inventory/[itemId]`가 잠긴 개체일 때 그리는 화면이다.
     * 고정 용어는 «잠김»(«잠금» 아님)·«채우기»·«열기»·«잼»이다. 채우기 입력 문구와 가진 잼 줄은 캡슐과 같은 `d.capsule`을 쓴다(운영 로직 7.2절).
     * 게이지에는 숫자와 퍼센트를 쓰지 않는다(운영 로직 4.3절). 다시 열기를 부추기는 말과 낮은 등급을 낮추어 보는 말은 쓰지 않는다.
     */
    detail: {
      /** 등급 칩 옆의 «잠김» 칩 */
      chip: '잠김',
      /** 게이지의 스크린리더 이름 — 상태를 글자로 알린다. 진행 숫자와 퍼센트는 어디에도 없다 */
      gaugeAria: {
        filling: '잠긴 아이템 배지, 채우는 중이에요',
        ready: '잠긴 아이템 배지, 열 수 있어요',
      },
      fillCta: '채우기',
      openCta: '열기',
      /** 제출 중 버튼 라벨(진행형, UX 라이팅 §5.3) */
      opening: '여는 중',
      /** 채우기 시트 */
      fillTitle: '잼 채우기',
      cancel: '취소',
      /** 열기 성공 토스트 */
      openedToast: '아이템 배지를 열었어요',
      /** 열린 뒤 화면 */
      opened: {
        /** 컬렉션 줄 — `{name}`은 컬렉션 이름 */
        collection: '컬렉션 {name}',
        /** 트라이브 줄 — `{name}`은 트라이브 이름 */
        tribe: '트라이브 {name}',
        /** 열기로 포인트를 받았을 때 한 줄. `{points}`는 받은 포인트 */
        points: '{points} 포인트를 받았어요',
        /** 배지 상세로 가는 링크 */
        badgeLink: '배지 상세 보기',
      },
    },
    notice: {
      /** 결산 알림 — 잠긴 채 받은 개체만 있을 때. 이름·그림·등급을 싣지 않는다(7.3절 가림 원칙) */
      one: '잠긴 아이템 배지를 받았어요',
      /** `{count}`는 개수 슬롯 값(볼드). 조사는 슬롯 뒤 {을/를} 마커가 맡는다 */
      countSlot: '잠긴 아이템 배지 {count}개',
      many: '{lockedItemCount}{을/를} 받았어요',
    },
    /** 장착·교체 409 */
    slot: '잠긴 아이템 배지는 컬렉션에 장착할 수 없어요. 열린 아이템 배지를 골라 주세요.',
    /** 믹스 409 — 재료가 소각되기 전에 거절한다 */
    combine: '잠긴 아이템 배지는 믹스 재료로 쓸 수 없어요. 열린 아이템 배지를 골라 주세요.',
    /** 드랍 409 */
    drop: '잠긴 아이템 배지는 드랍할 수 없어요. 열린 아이템 배지를 골라 주세요.',
    /**
     * 채우기·열기 API 문구 — 티켓 20261018_0053 (운영 로직 7.2절). `/api/inventory/items/[itemId]/fill`·`open`·`lock`이 이 키를 직접 참조한다(ADR 0001).
     * 규칙은 캡슐과 같아서 채우기 문구도 `d.capsule`과 같은 짜임이다. 화면 문구(3-4)는 채원 판정 뒤에 같은 묶음에 더한다.
     * 이름·그림 등 아이템 배지를 알 수 있는 값은 어떤 거절 문구에도 싣지 않는다(7.3절 가림 원칙).
     */
    fill: {
      /** 채우기 400 `already_full` */
      alreadyFull: '이미 필요한 양을 다 채워서 더 채울 수 없어요. 아이템 배지를 열어 주세요.',
      /** 채우기 400 `exceeds_remaining` */
      exceedsRemaining: '남은 양보다 많이는 채울 수 없어요. 남은 양 이하로 정해 주세요.',
      /** 채우기 400 `invalid_amount` — 양이 1 이상의 정수가 아니거나 요청 본문이 형식에 맞지 않다 */
      invalidAmount: '채울 양은 1 이상의 정수여야 해요. 양을 확인해 주세요.',
      /** 채우기 409 `insufficient_jam` */
      insufficientJam: '가진 잼이 없어서 아이템 배지를 채우지 못했어요. 잼이 생기면 다시 채워 주세요.',
      /** 채우기 POST 500 */
      failed: '아이템 배지를 채우지 못했어요. 잠시 후 다시 시도해 주세요.',
    },
    open: {
      /** 열기 409 `not_full` — 필요한 양을 다 채우지 못했다. 채운 양과 필요한 양은 응답 필드(`filled`·`required`)로 싣는다 */
      notFull: '아직 필요한 양을 다 채우지 못해서 열 수 없어요. 필요한 양을 채운 뒤에 열어 주세요.',
      /** 열기 POST 500 — 내부 오류 원문은 싣지 않는다 */
      failed: '아이템 배지를 열지 못했어요. 채운 잼은 그대로 남아 있어요. 잠시 후 다시 시도해 주세요.',
      /** 열기 결과 문구. 화면 3-4가 쓴다 */
      result: '아이템 배지가 열렸어요.',
    },
    /** 채우기·열기 409 `not_locked` — 이미 열린 개체다 */
    notLocked: '이미 열린 아이템 배지예요. 인벤토리에서 확인해 주세요.',
    /** 채우기·열기·조회 404 `item_not_found` — 내 인벤토리에 없는 개체다 */
    itemNotFound: '이 아이템 배지를 찾지 못했어요. 인벤토리에서 다시 골라 주세요.',
    /** 조회 GET 500 */
    loadFailed: '채운 양을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
  },

  /**
   * Strava 동기화 끊김·끊기·중복 안내 — 티켓 20261017_1422 2회 (채원 판정 2026-10-17).
   * 고정 용어는 «Strava 동기화»다(UX_WRITING_GUIDELINE §1.3). 동작은 «끊기»와 «끊겼어요»를 짝으로 쓴다.
   */
  stravaConnection: {
    /** 홈 끊김 카드 좌상단 라벨 */
    chipLabel: 'Strava 동기화',
    /** 홈 끊김 카드 — 사유가 토큰 갱신 실패·Strava 철회일 때만 보인다. 현상, 원인, 해결책 순(§4.1) */
    card: {
      title: 'Strava 동기화가 끊겼어요',
      body: '비밀번호를 바꿨거나 동기화 권한이 해제됐을 수 있어요. 다시 동기화해야 배지를 획득할 수 있어요.',
      cta: 'Strava 다시 동기화하기',
    },
    /** 상단 메뉴 가운데 버튼 — 끊김(오류 사유)일 때. 라벨은 5자로 한정한다 */
    topNavReconnect: '다시 동기화',
    /** 프로필 설정 «Strava 동기화» 구획 */
    settings: {
      label: 'Strava 동기화',
      connected: '동기화하고 있어요',
      disconnectedError: '동기화가 끊겼어요. 비밀번호를 바꿨거나 동기화 권한이 해제됐을 수 있어요.',
      disconnectedByUser: '동기화를 끊었어요. 지금까지의 기록, 배지, 잼, 포인트는 그대로 남아 있어요.',
      disconnectButton: '동기화 끊기',
      reconnectButton: 'Strava 다시 동기화하기',
    },
    /** 끊기 확인 시트 */
    disconnectSheet: {
      title: 'Strava 동기화를 끊을까요?',
      body: [
        '끊으면 새 활동이 배지에 반영되지 않아요.',
        '지금까지의 활동 기록, 배지, 잼, 포인트는 그대로 남아요.',
        // 위치정보 수집 동의 철회(운영 로직 3.2절): 좌표만 지우고 좌표 없는 기록은 남는다 (티켓 20261021_1249 4회, 마이그레이션 265)
        '다만 마지막 위치와 활동에 담긴 좌표는 지워져요.',
        'Strava의 앱 목록에서도 JAM!이 빠져요. 다시 동기화하면 마지막 동기화 뒤의 활동부터 이어서 가져와요.',
      ],
      cancel: '취소',
      confirm: '동기화 끊기',
      confirming: '동기화 끊는 중',
      successToast: 'Strava 동기화를 끊었어요',
      /** 현상과 해결을 한 문장씩 */
      errorToast: '동기화를 끊지 못했어요. 잠시 후 다시 시도해 주세요.',
    },
    /**
     * 중복 안내 시트 — 이미 다른 JAM! 계정에 연결된 Strava 계정을 만났을 때 (티켓 20261021_1249 4회, 채원 사전 판정 2026-10-22).
     * 한 시트가 두 모양이다. offer(`?strava=duplicate`): 기존 계정이 일반·정상이라 «취소»와 «그래도 연결하기»를 같은 무게로 준다.
     * blocked(`?strava=duplicate_blocked`): 기존 계정이 어드민이거나 이용 정지 중이라 «닫기»와 «문의하기»만 준다. 막힌 까닭은 문구에 쓰지 않는다
     * (정지 우회와 계정 종류 노출을 막는다). 기존 계정의 이름·사진·수치는 보이지 않는다.
     * 용어: 두 JAM! 계정이 한 Strava 계정에 이어지는 일이라 이 시트만 «연결»을 쓴다(UX_WRITING_GUIDELINE §1.3 «Strava 동기화» 행의 예외).
     */
    duplicateSheet: {
      title: '이미 쓰고 있는 Strava 계정이에요',
      /** 현상, 결과, 시작 순. 세 번째 문장은 지금 계정이 초기화되는 뜻이 아니다 — 기존 계정만 지워지고 새 연결만 첫 동기화를 기다린다 */
      offerBody: [
        '이 Strava 계정은 이미 다른 JAM! 계정에 연결돼 있어요.',
        '그래도 연결하면 그 계정은 삭제되고 복구할 수 없어요. 그 계정의 배지, 잼, 포인트는 이 계정으로 옮겨지지 않아요.',
        '연결한 뒤 첫 동기화는 가장 최근 활동 1건부터 시작해요. 지금 계정의 기록은 그대로예요.',
      ],
      blockedBody: [
        '이 Strava 계정은 이미 다른 JAM! 계정에 연결돼 있어요.',
        '지금은 이 계정으로 연결할 수 없어요. 확인이 필요하면 문의해 주세요.',
      ],
      cancel: '취소',
      /** blocked 모양의 닫기 버튼. 문의 버튼은 `d.voc.inquireCta`를 쓴다 */
      close: '닫기',
      confirm: '그래도 연결하기',
      confirming: '연결하는 중',
    },
    /**
     * «그래도 연결하기» API(`POST /api/strava/replace`) 실패 문구. 라우트가 이 키를 직접 참조해 최종 문장을 완성하고 화면은 그대로 보인다
     * (ADR 0001, 가이드 4.0). DB·Auth·Strava 오류 원문과 토큰은 싣지 않는다. 문장마다 `next`('retry'·'restart'·'blocked')가 짝이다.
     */
    replaceResult: {
      /** next: retry — 쿠키가 살아 있어 같은 버튼을 다시 누르면 된다 */
      retry: '연결하지 못했어요. 일시적인 문제일 수 있어요. 잠시 후 다시 눌러 주세요.',
      /** next: restart — 쿠키 만료·변조·없음, 로그인 풀림. 처음부터 다시 해야 한다 */
      restart: '시간이 지나 연결 요청이 닫혔어요. Strava 동기화를 처음부터 다시 진행해 주세요.',
      /** next: restart — 기존 계정은 이미 지워졌고 새 연결 저장만 실패했다 */
      afterDeleteFailed: '기존 계정은 삭제됐지만 이 계정에 연결하지 못했어요. Strava 동기화를 다시 진행해 주세요.',
      /** next: blocked — 시트를 연 뒤 기존 계정이 어드민이 되었거나 정지된 경우. 까닭은 쓰지 않는다 */
      blocked: '지금은 이 Strava 계정으로 연결할 수 없어요. 확인이 필요하면 문의해 주세요.',
    },
  },

  /**
   * 온보딩 — 티켓 20260909_2119: 2단계 카드형 온보딩으로 재설계.
   * 1단계(아이디·이름) → 2단계(트라이브 선택 + 프로필이미지).
   */
  onboarding: {
    avatarAlt: '프로필',
    step1Title: '환영합니다!',
    usernamePlaceholder: '예: jam_runner',
    nameCounter: '{count}/30',
    step1NextButton: '다음',
    step1Saving: '저장하는 중',
    errorEmpty: '아이디를 입력해 주세요',
    errorTooLong: '아이디는 30자까지 쓸 수 있어요',
    errorFormat: '영문 소문자·숫자·점(.)·밑줄(_)만 쓸 수 있어요',
    errorDot: '점(.)은 아이디 가운데에만 쓸 수 있어요',
    errorDoubleDot: '점(.)은 연달아 쓸 수 없어요',
    available: '쓸 수 있는 아이디예요',
    taken: '이미 다른 사람이 쓰고 있어요. 다른 아이디를 지어볼까요?',
    genericError: '오류가 발생했어요. 다시 시도해 주세요.',
    networkError: '네트워크 오류가 발생했어요.',
    ageConfirmLabel: '만 14세 이상이에요',

    // 2단계 — 트라이브 선택 (티켓 20261021_1247, 운영 로직 2.2절)
    step2Title: '당신의 트라이브를\n선택해 주세요',
    /** 제목 아래 첫 안내(foreground, text-base). 바꾸는 방법(운영자가 바꿔 주는 길)은 화면에 알리지 않는다 */
    step2Subtitle: '한 번 고르면 바꿀 수 없어요',
    /** 제목 아래 둘째 안내(muted, text-sm) */
    step2ItemBadgeNotice: '동기화로 받는 아이템 배지는 고른 트라이브의 것이에요',
    /** 아이디를 이미 정해 곧장 이 단계로 온 유저(트라이브 게이트로 돌아온 유저)에게만 제목 아래에 한 줄(muted) */
    step2GateHint: '트라이브를 고르면 JAM!을 시작할 수 있어요',
    tribesLoadError: '트라이브 목록을 불러오지 못했어요. 다시 시도해 주세요.',
    tribesEmptyError: '지금은 고를 수 있는 트라이브가 없어요. 잠시 후 다시 시도해 주세요.',
    retryButton: '다시 시도',
    invalidTribeError: '이 트라이브는 지금 선택할 수 없어요. 다른 트라이브를 선택해 주세요.',
    finishButton: '이 트라이브로 시작하기',
    finishing: '시작하는 중',
  },

  /** 프로필 편집 */
  profileEdit: {
    title: '프로필 편집',
    changePhoto: '탭하여 사진 변경',
    changePhotoAlt: '프로필 사진 변경',
    fileTypeError: 'JPEG·PNG·WebP 사진만 올릴 수 있어요',
    fileSizeError: '5MB 이하 사진만 올릴 수 있어요',
    uploadError: '사진을 올리지 못했어요. 연결이 불안정했을 수 있어요. 다시 시도해 주세요.',
    usernameLabel: '아이디',
    nameLabel: '이름',
    namePlaceholder: '이름을 입력해 주세요',
    saveButton: '저장',
    saving: '저장 중',
    cancelButton: '취소',
    saveError: '프로필을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
    /** 탈퇴 확인 시트를 여는 작은 밑줄 버튼. 설명은 시트가 하므로 캡션은 두지 않는다 (티켓 20261021_1249 3회) */
    withdrawButton: '탈퇴하기',
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

    /**
     * 내역 행 기본 제목 — `reason` 값별 일반 라벨 (20260915_2247, `api/points/route.ts`
     * `REASON_KIND`가 참조). 배지/미션 보상은 이름 조회가 실패했을 때의 폴백으로도 쓴다.
     */
    reasonKindBadgeReward: '배지 보상',
    reasonKindMissionReward: '미션 보상',
    /**
     * admin_grant/admin_deduct의 기본 제목. `userFacingReasonLabel()`이 구체적인 사유
     * 라벨을 못 찾았을 때만 쓰는 최종 폴백이라, 어드민 원장 용어 「지급」·「회수」(유저
     * 노출 금지, §1.3)를 쓰지 않고 방향과 무관한 중립 표현으로 통일한다.
     */
    reasonKindAdminAdjustment: '포인트 조정',
    reasonKindCombineFailReward: '믹스 실패 보상',
    reasonKindCombineRecipeReward: '믹스 보상',
    reasonKindItemBookCompletionReward: '컬렉션 완성 보상',
  },

  /**
   * 지도(`MapView`) — 드랍/픽업(`/drops`)과 미션(`/missions`) 화면이 함께 쓰는
   * 서비스 공용 지도 컴포넌트의 고정 문구 (티켓 20260915_2237).
   */
  map: {
    /** 지도 위 내 위치 마커의 네이티브 title(마커 호버 시 노출) */
    myLocationMarkerLabel: '내 위치',
    /** 현재 위치로 지도를 이동시키는 버튼의 aria-label */
    myLocationButtonAriaLabel: '내 위치로 돌아가기',
  },

  /** 유저 검색 결과 */
  search: {
    promptTitle: '아이디 또는 이메일로 유저를 검색해보세요',
    promptBody: '2자 이상 입력해 주세요',
    /**
     * §4.3 빈 상태 가이드 예시(`"{검색어}" 검색 결과가 없어요`)를 그대로 따른다.
     * 검색어는 원본(전처리 전) 값을 그대로 인용한다.
     * 보간 키 이름(`query`)은 영문이다 — `t()`가 ASCII 단어문자(`\w`)만 치환 대상으로
     * 인식해 한글 키(`{검색어}`)는 매칭되지 않는다. 문서 표기(§4.3)는 사용자에게 보이는
     * 최종 문구 형태를 설명하는 것이고, 코드 보간 키 이름은 별개로 영문을 쓴다
     * (티켓 20260916_1020, UX_WRITING_GUIDELINE.md §4.3 단서 참고).
     */
    emptyTitle: '"{query}" 검색 결과가 없어요',
    emptyBody: '다른 아이디나 이메일로 다시 검색해보세요',
    resultCount: '{count}명의 유저',
    /**
     * ADR 0001 — API route(`api/users/search/route.ts`)가 직접 참조해 완성한 문구를 그대로
     * 반환한다. 조회 실패의 구체적 원인(DB 오류 등)은 서버 로그에만 남기고 사용자에게는
     * 노출하지 않는다(티켓 20260915_2250). 문구 자체는 티켓 20260916_1020에서 톤 정비
     * (인라인 재시도 버튼이 없어 CTA는 추가하지 않음).
     */
    searchFailed: '유저 검색이 안 됐어요. 잠시 후 다시 시도해 주세요.',
  },

  /** 팔로워/팔로잉 목록 */
  social: {
    followingCount: '팔로잉 {count}명',
    emptyFollowers: '팔로워가 없어요',
    emptyFollowersBody: '누군가 팔로우하면 여기에 표시돼요',
    emptyFollowing: '아직 팔로우한 사람이 없어요',
    emptyFollowingBody: '유저가 팔로우를 시작하면 여기에 표시돼요',
    emptyFollowersOther: EMPTY_FOLLOWERS_OTHER,
    emptyFollowingOther: EMPTY_FOLLOWING_OTHER,
    followButton: '팔로우',
    followingButton: '팔로잉',
    /**
     * 유저 프로필(`[username]/page.tsx`) SEO 메타데이터 title 템플릿 (티켓 20260915_2249,
     * 20260916_1010에서 구분자 정정). §7.3 엠대시 금지는 유저가 읽는 화면 문구 대상이고
     * SEO 메타데이터(§2.5)는 예외라, 같은 자리를 쓰는 `notifications/page.tsx`의
     * `— JAM!` 관례를 그대로 따른다 — 화면마다 구분자가 갈라지지 않도록 통일.
     */
    profileTitle: '{username} — JAM!',
    /**
     * ADR 0001 — API route(`api/follows/route.ts`)가 직접 참조해 완성한 문구를 그대로
     * 반환한다. §2.4 "소셜 액션 vs 되돌릴 수 없는 확정" 원칙대로 팔로우/언팔로우 실패는
     * 담담한 톤으로 짧게 재시도를 안내한다(티켓 20260915_2249, 20260916_1010에서 톤 정정).
     */
    followError: '팔로우가 안 됐어요. 잠시 뒤에 다시 눌러 주세요.',
    unfollowError: '언팔로우가 안 됐어요. 잠시 뒤에 다시 눌러 주세요.',
    /** 자기 자신 팔로우 방지 — DB CHECK와 이중 검증된 방어적 케이스 */
    selfFollowError: '나를 팔로우할 수는 없어요',
    /** `api/users/[username]/followers|following` — 대상 유저를 찾지 못한 경우 */
    userNotFound: '찾는 프로필이 없어요',
  },

  /** 아이템북 목록/상세 */
  itembooks: {
    title: '컬렉션',
    subtitle: '아이템 배지를 모아 컬렉션을 완성해보세요',
    emptyTitle: '아직 발견한 컬렉션이 없어요.',
    emptyBody: '아이템 배지를 모아봐요!',
    completed: '완성',
    backToDetail: '배지 상세',
    noBadgesTitle: '아직 이 컬렉션에 등록된 배지가 없어요.',
    noBadgesBody: '관리자가 배지를 등록하면 여기에 표시돼요',
    checkinSectionTitle: '체크인 배지',
    checkinHint: '체크인 배지는 연결된 장소를 지나는 활동이 기록되면 자동으로 채워져요',
    checkinEarned: '획득',
    checkinNotEarned: '미획득',
    completedTitle: '컬렉션 완성!',
    completedBody: '모든 아이템 배지를 장착했어요',
    slotLoginRequired: '로그인이 필요해요.',
    slotFailed: '장착에 실패했어요.',
    unslotFailed: '장착 해제에 실패했어요.',
    swapFailed: '교체에 실패했어요.',
    networkError: '네트워크 오류가 발생했어요.',
    /** 요청이 15초 안에 끝나지 않아 끊었을 때(티켓 20260908_0055 #2). 응답이 하염없이
     *  오지 않아 시트가 갇히는 상황을 막기 위한 타임아웃이라, 원인과 재시도 유도를 함께 담는다. */
    slotTimeout: '요청이 너무 오래 걸려서 중단했어요. 잠시 후 다시 시도해 주세요.',
    unslotButton: '해제',
    slotButton: '추가',
    /** 이미 장착된 배지를 다른 미장착 개체로 바꿀 때 쓰는 버튼 — 20260910_0015 */
    swapButton: '교체',
    /**
     * 같은 배지를 여러 개 보유했을 때 뜨는 개체 선택 시트 — 20260907_2059.
     * 제목은 20260907_2221부터 배지 이름을 그대로 쓴다(후보가 전부 같은 배지라, 어느 배지인지를
     * 상단에서 한 번만 알린다). 그래서 고정 문구 제목 키(`selectItemTitle`)는 없다.
     */
    selectItemBody: '장착할 수 있는 배지가 {count}개예요. 일련번호로 구분해서 골라주세요.',
    /**
     * 교체 시트 안내문 — 20260910_0015. `selectItemBody`와 문구를 분리한 이유는 이미
     * 장착된 개체가 있는 상태에서 여는 시트라 "장착할 수 있는"이라는 표현이 어색하기
     * 때문이다. 후보가 1개뿐이어도 항상 이 시트를 거치므로(아래 SlotGrid 참고) {count}는
     * 넣지 않는다 — "1개예요"라는 문구가 오히려 "왜 굳이 골라야 하지"라는 의문을 만든다.
     */
    swapItemBody: '지금 장착된 개체를 다른 개체로 바꿀 수 있어요. 일련번호로 구분해서 골라주세요.',
    /** 교체 시트 하단의 보조 액션 — 20260910_0025 인터페이스 리뷰 지적(교체가 해제 자리를
     *  완전히 대체해 순수 해제 경로가 사라진 회귀)을 반영해 시트 안에 해제 경로를 되살린다. */
    swapSheetUnslotButton: '해제하기',
    processing: '처리 중',

    // ── API 에러 메시지 — src/app/api/itembooks/[id]/slot/route.ts, itembooks/route.ts
    // (ADR 0001 서버-클라이언트 단일 진실 소스, 티켓 20260915_2239)
    // §1.3 "장착" 고정 용어 — 데이터 모델 내부 명칭 「슬롯」은 이 메시지들에도 쓰지 않는다.
    // [티켓 20260916_0750] 한국어 리뷰 반영 — "찾을 수 없어요" 직역 반복을 원인별로
    // 구체화하고, 내부어("개체"·서버 파라미터명)를 제거하고, 뭉개진 에러 쌍을 구분했다.
    /** 필수 값 누락 3종(slot/unslot/swap) — 정상 UI 흐름에서는 도달하지 않는 방어용 문구라
     *  하나의 문구로 통합한다. 서버 내부 파라미터명(`slot_id` 등)은 노출하지 않는다. */
    slotMissingInventoryItemId: '요청이 제대로 전달되지 않았어요. 화면을 새로고침한 뒤 다시 골라 주세요.',
    unslotMissingSlotId: '요청이 제대로 전달되지 않았어요. 화면을 새로고침한 뒤 다시 골라 주세요.',
    swapMissingParams: '요청이 제대로 전달되지 않았어요. 화면을 새로고침한 뒤 다시 골라 주세요.',
    inventoryNotFound: '인벤토리를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    itemNotFound: '인벤토리에 없는 아이템이에요. 목록을 새로고침해 주세요.',
    alreadyDropped: '장착할 수 없어요. 장소에 드랍해 둔 아이템이라, 픽업한 뒤에 장착할 수 있어요.',
    notOwner: '내 아이템만 장착할 수 있어요',
    /** 다른 자리에 이미 장착 — 같은 자리에 이미 장착된 경우(`sameItem`)와 뜻이 뭉개지지
     *  않도록 "그 자리"를 명시해 구분한다 */
    alreadySlotted: '이미 다른 자리에 장착한 아이템이에요. 그 자리를 해제한 뒤 다시 장착해 주세요.',
    badgeNotFound: '배지 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    /** 컬렉션이 없거나 아직 공개되지 않은 경우(비활성·시작 전) — 공개 여부는 알리지 않는다 (티켓 20260930_1516) */
    itemBookNotFound: '이 컬렉션에는 장착할 수 없어요. 컬렉션 목록을 새로고침해 주세요.',
    wrongItemBook: '이 컬렉션에 들어가는 배지가 아니에요',
    /** 등급별 컬렉션(`tier_mode`)에서 이미 장착한 배지와 등급이 다른 배지를 장착하거나 교체할 때(티켓 20261016_2340).
     *  해결책으로 지금 장착한 배지와 같은 등급의 배지를 고르도록 알린다. 등급명은 쓰지 않는다. */
    tierMismatch: '이 컬렉션에는 같은 등급의 아이템 배지만 장착할 수 있어요. 지금 장착한 배지와 등급이 같은 배지를 골라 주세요.',
    /** 등급별 장착 함수가 «등급 구조가 꺼진 컬렉션»이라고 돌려준 경우. 라우트가 컬렉션 설정을 읽고 함수를 고르므로
     *  읽은 직후에 설정이 바뀐 드문 경우에만 닿는다(티켓 20261016_2340). */
    tierModeOff: '컬렉션 설정이 방금 바뀌었어요. 화면을 새로고침한 뒤 다시 시도해 주세요.',
    /** 해제 대상 자리가 이미 사라진 경우 */
    slotNotFound: '이미 해제된 자리예요. 컬렉션을 새로고침해 주세요.',
    /**
     * [20260915_2239] 개인 인벤토리 확장 기능은 없다 — max_slots는 어드민이 전체 유저에게
     * 일괄 적용하는 전역 정책(`inventory-policy`)이다. 기존 하드코딩 문구 "인벤토리를
     * 늘려보세요"는 유저가 할 수 없는 행동을 해결책으로 제시하고 있었다. 같은 상황의 다른
     * 문구(`inventory.fullNoticeBody`, `drops.pickupInventoryFull`)와 같은 "정리하고 다시
     * 시도" 해결책으로 통일한다. [20260916_0750] §4.1 3단계 구조([현상]→[원인]→[해결책])로
     * 보완했다. 보관 한도 숫자는 어드민 정책값이라 어긋날 수 있어 문구에 쓰지 않는다(티켓 20261018_0056). CTA 버튼 추가는 이 티켓 범위(딕셔너리 값만 수정)
     * 밖이라 다음 UI 작업으로 남긴다.
     */
    inventoryFullForUnslot: '인벤토리가 꽉 차서 해제할 수 없어요. 인벤토리에서 드랍하거나 믹스해 자리를 만든 뒤 다시 해제해 주세요.',
    wrongBadge: '같은 배지끼리만 교체할 수 있어요. 일련번호가 다른 같은 배지를 골라 주세요.',
    /** 지금 장착 중인 그 자리에 같은 개체를 다시 고른 경우 — §1.3 '일련번호'로 개체를
     *  가리킨다("개체" 내부어 금지) */
    sameItem: '이미 이 자리에 장착한 아이템이에요. 다른 일련번호를 골라 주세요.',
  },

  /**
   * 알림(소식)함 — 20260824_021
   * 문구 규칙: docs/service/prd/notification/PRD.md §3(20종 표) · §5(강조 규칙)
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
    loadError: '소식을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    /** 첫 페이지 조회 자체가 실패했을 때 — "소식 0건"과 반드시 구분해서 보여준다 */
    errorTitle: '소식을 불러오지 못했어요',
    errorBody: '연결 상태를 확인하고 다시 시도해 주세요',
    /** GET /api/notifications(더 불러오기) 실패 응답 — 서버가 완성 문구로 내려보낸다.
     *  화면 제목용 errorTitle/errorBody와는 역할이 달라 별도 키로 둔다(티켓 20260916_0905) */
    fetchFailed: '소식을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    /** POST /api/notifications/seen 실패 응답 — 클라이언트는 이 값을 화면에 노출하지 않고
     *  조용히 재시도 대상으로만 삼는다(NotificationsClient). ADR 0001에 따라 서버가
     *  완성된 문구로 내려보낸다 */
    markSeenError: '읽음 표시를 저장하지 못했어요',
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
    /** 챕터 오름 소식 — 「챕터 3에 올랐어요」 */
    slotChapter: '챕터 {chapterNo}',
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
    /** 잠긴 채 픽업된 단건 — 이름을 싣지 않는다(운영 로직 7.3절). 묶음은 아래 `msgDropPickedUpMany`를 쓴다 */
    msgDropPickedUpLocked: '{actor}님이 잠긴 아이템 배지를 픽업했어요',
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
    /** 트라이브 변경에 따른 참가 취소(운영 로직 13.2절 문구). 이미 받은 보상은 그대로라 보상은 말하지 않는다. 착지는 목록이다(상세는 대상이 아니면 404) */
    msgMissionParticipationCancelled: '트라이브가 바뀌어 「{missionTitle}」 미션 참가가 취소됐어요',
    msgMissionParticipationCancelledGrouped: '트라이브가 바뀌어 미션 {count} 참가가 취소됐어요',
    /** 챕터 오름(티켓 20261019_1316, 운영 로직 12.3절). 챕터는 숫자로만 표기한다(2026-10-21 결정). 착지는 내 프로필이다 */
    msgChapterUp: '축하해요! {chapter}에 올랐어요',
    /** 챕터 1을 받은 소식(티켓 20261021_1248). 챕터 1은 «오른» 것이 아니라 «시작»이다. 건너뛴 유저도 받는다. 착지는 `msgChapterUp`과 같은 내 프로필이다 */
    msgChapterStart: '{chapter}{을/를} 시작했어요',
    /** payload의 챕터 번호가 비었거나 손상됐을 때 — 「챕터 0에」 같은 문장을 만들지 않는다 */
    msgChapterUpNoNumber: '축하해요! 챕터가 올랐어요',
    /**
     * 어드민이 트라이브를 바꿨을 때(티켓 20261021_1247, 운영 로직 2.4절). 사유는 싣지 않는다. 받침이 갈리는 조사를 피해 «{이름} 소속» 꼴로 쓴다.
     * 이미 번 것은 그대로라는 안심 문장을 함께 둔다(바뀐 뒤 참가가 취소된 미션은 따로 오는 `msgMissionParticipationCancelled`가 알린다). 착지는 내 프로필이다
     */
    msgTribeChanged: '트라이브가 바뀌었어요. 이제 {tribeName} 소속이에요. 이미 가진 배지와 잼, 챕터는 그대로예요',
    /** payload의 트라이브 이름이 비었거나 손상됐을 때 — 「이제  소속이에요」 같은 문장을 만들지 않는다 */
    msgTribeChangedNoName: '트라이브가 바뀌었어요. 이미 가진 배지와 잼, 챕터는 그대로예요',
    /**
     * 이용 정지가 걸렸을 때(티켓 20261021_1249 6-3 5회, 운영 로직 15.4절 «차분 · 공감»). 사유·어드민·상담 메모는 소식에 싣지 않는다.
     * 사유와 정지일과 문의 버튼은 홈 정지 안내 배너(`d.suspension.banner*`)에 있어서 착지가 홈이다. «해제»는 `d.suspension` 12곳과 맞춘다
     */
    msgSuspensionStarted: '이용이 정지됐어요. 정지 사유와 해제 방법은 문의로 알려 드려요',
    /** 이용 정지가 풀렸을 때. 정지 기간에 시작한 활동이 반영되지 않는다는 문장은 홈 배너 본문이 이미 알리므로 넣지 않는다 */
    msgSuspensionLifted: '이용 정지가 해제됐어요. 이제 동기화하고 아이템 배지를 획득할 수 있어요',
    /**
     * 인벤토리 빈칸이 모자라 미션 보상을 아직 받지 못했을 때(티켓 20261021_1249 6-3 5회, 마이그레이션 250: 보류는 빈칸 부족일 때만 생긴다).
     * 정지 중인 유저는 받을 수 없으므로 «받을 보상이 있어요» 꼴로 쓴다. 착지는 그 미션 상세의 «받을 보상» 카드다
     */
    msgRewardPending: '{missionTitle}에서 받을 보상이 있어요. 인벤토리 빈칸이 모자라 아직 받지 못했어요',
    /** payload의 미션 제목이 비었거나 손상됐을 때 — 「에서 받을 보상이」 같은 문장을 만들지 않는다 */
    msgRewardPendingNoTitle: '받을 보상이 있어요. 인벤토리 빈칸이 모자라 아직 받지 못했어요',

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
    /**
     * #29의 **무한레벨형** 변형 — 등급이 없는 배지(`badges.rarity IS NULL`)라
     * 「{rarity} 배지」를 부를 수 없다(티켓 20260905_0038). 레벨 표기는 「Lv.N」 고정
     * (UX Writing 가이드 용어표). `msgFollowingActorPrefix`와 합성해 쓴다.
     *
     * 레벨은 **배지 이름과 한 슬롯**이다(`{badgeName}`에 「걸어온 거리 Lv.6」이 들어온다) —
     * 슬롯을 나누면 레벨이 비었을 때 「걸어온 거리 를 획득했어요」처럼 조사만 남는다
     * (토크나이저가 빈 슬롯을 통째로 버린다).
     */
    msgLeveledBadgeEarned: '{badgeName}{을/를} 획득했어요',
    msgFollowingCollectionComplete: '{actor}님이 {bookName}{을/를} 다 모았어요',
    msgFollowingMissionCompleteOne: '{actor}님이 {missionTitle}{을/를} 완료했어요',
    msgFollowingMissionCompleteMany: '{actor}님 외 {others}이 {missionTitle}{을/를} 완료했어요',
    /** R15 — 한 사람의 소식이 하루 2건 이상이면 대표 하나 + 나머지는 개수로 접는다 */
    msgFollowingMoreSuffix: '. 소식이 {moreCount} 더 있어요',

    // ── ⑧ 계정·시스템 (경고 스타일 — 렌더 시점에 현재 상태로 재평가) ──
    msgStravaDisconnected: 'Strava 동기화가 끊겼어요. 다시 동기화해야 배지를 획득할 수 있어요',
    /** #40(끊김)과 원인이 달라 해결책도 다르다 — 토큰은 멀쩡한데 새 활동이 안 들어오는 경우 */
    msgSyncStalled: '{days} 새 활동이 없어요. Strava에 활동이 기록됐는지 확인해보세요',
    /** 남은 칸이 0개일 때만 보낸다(배치). 꽉 차도 동기화는 되고, 새 아이템 배지는 보류로 남아 인벤토리를 비운 뒤에 고를 수 있다(`syncPending`) */
    msgInventoryFull: '인벤토리가 꽉 찼어요. {maxSlots}까지만 보관할 수 있어서 새 아이템 배지를 바로 받을 수 없어요',
    /**
     * 남은 칸이 3개 이하 단계에 들어선 순간 한 번(티켓 20261018_0056). `{remaining}`는 실제 남은 칸(1~3)이다. 사건을 말하는 과거형이라 시간이 지나도 거짓이 되지 않는다.
     * 단위는 인벤토리 화면의 «개»(`slotCount`)와 맞춘다.
     */
    msgInventorySlotsLowThree: '인벤토리 남은 칸이 {remaining}로 줄었어요. 다 차기 전에 장착·믹스·드랍으로 자리를 만들어 보세요',
    msgInventorySlotsLowOne: '인벤토리 남은 칸이 {remaining}로 줄었어요. 다 차면 새 아이템 배지를 바로 받을 수 없어요',
    msgPointsIn: '{points}가 들어왔어요 ({reason})',
    msgPointsInNoReason: '{points}가 들어왔어요',
    msgPointsOut: '{points}가 빠져나갔어요 ({reason})',
    msgPointsOutNoReason: '{points}가 빠져나갔어요',
  },

  /**
   * 아이템 믹스. 에러 문구는 ADR 0001(서버-클라이언트 단일 진실 소스)에 따라
   * `api/combine/route.ts`가 이 딕셔너리로 최종 메시지를 완성해 내려주고,
   * `CombineClient.tsx`는 그 메시지를 그대로 신뢰해 노출한다(티켓 20260915_2240).
   */
  combine: {
    title: '믹스하기',
    /** 레시피 탐색(초기 화면) 검색 입력 placeholder(티켓 20260917_1655) */
    searchPlaceholder: '레시피 검색',
    combineButton: '믹스하기',
    /** §5.3 처리 중 상태 — 문장·버튼 모두 기본형(동사형)을 쓴다 */
    combineButtonLoading: '믹스하는 중',
    /** 레시피 행·요약 바에 쓰는 슬롯 개수 표시(티켓 20260917_1655) */
    slotCountLabel: '슬롯 {count}개',
    /** 레시피 표시용 이름이 없을 때(비정상 상태 대비) 쓰는 폴백(티켓 20260917_1828) */
    unnamedRecipe: '이름 없는 레시피',
    /** 레시피 목록이 비어 있을 때(티켓 20260917_1655) */
    noRecipes: '아직 공개된 레시피가 없어요',
    /** 검색 결과가 없을 때(티켓 20260917_1655) */
    searchNoResult: '검색 결과가 없어요',
    /** 가방 바텀시트 제목 — "가방"에서 "내 배지"로 변경(티켓 20260917_1828) */
    bagTitle: '내 배지',
    /** 가방에서 지금 지정된 슬롯에 이미 다른 슬롯에 쓰인 배지를 보여줄 때(티켓 20260917_1655) */
    bagUsedLabel: '사용 중',
    /** 가방에 지금 지정된 슬롯의 후보 배지가 하나도 없을 때(비정상 상태 대비, 티켓 20260917_1655) */
    bagEmpty: '보여줄 배지가 없어요',
    /**
     * 조건별 보상 블록(믹서 요약 영역·레시피 목록 행 공유, 티켓 20260917_1828)의 포인트
     * 표기. 실제 확인 화면 기준 "xxx,xxx,xxx Point" 형식을 그대로 따른다(포인트 아이콘 없음).
     */
    rewardPointsLabel: '{points} Point',
    myItemsTitle: '내 아이템',
    emptyInventory: '아직 가진 아이템이 없어요',
    emptyInventoryBody: '활동을 완료하면 믹스할 아이템이 드랍돼요',
    successResult: '{names} 획득!',
    /** 20260910_1408: 레시피 보상이 포인트만인 경우 */
    successPointsOnly: '{points} 포인트 획득!',
    /** 배지와 포인트를 함께 받은 경우 successResult 뒤에 붙는다 */
    successPointsSuffix: ' (+{points} 포인트)',
    /** §4.2 인라인 검증 축약 — [현상+해결책] 한 문장, CTA 없음 */
    selectRangeError: '아이템은 2개에서 5개까지 선택할 수 있어요',
    /** §4.1 [현상 → 원인 → 해결책] 3단계 구조(티켓 20260916_0809) */
    itemsNotFound:
      '선택한 아이템이 인벤토리에 없어요. 믹스하는 사이에 다른 곳에서 쓰였을 수 있어요. 목록을 다시 불러온 뒤 골라 주세요.',
    /** §1.2 "드랍/아이템 계열은 트라이브 속 사건처럼" 예시 문구를 그대로 채택. "재료"는 §1.3 용어표 등재어 */
    recipeFail: '재료가 뒤섞이더니 흔적도 없이 사라졌어요',
    /**
     * 믹스 실행 전 소각 안내 — 아이템 슬롯이 있는 레시피에서 믹스하기 버튼 아래 상시 노출
     * (티켓 20260924_0813, 사용자 승인 2026-09-24). "재료"는 §1.3 용어표 등재어.
     */
    burnNotice: '넣은 재료는 성공·실패와 관계없이 사라져요',
    /**
     * 운영자 전용(티켓 20261001_1159) — 공개 전 레시피를 운영자에게만 보여 줄 때 쓰는 문구라
     * UX_WRITING_GUIDELINE §1.3 용어표에는 올리지 않는다. 「시험 믹스」는 운영자에게만 보이는 표현이다.
     * 화면에는 `공개 예정 ·`과 날짜(`formatKoreanDateTime`) 두 조각으로 나눠 쓴다.
     */
    releaseScheduled: '공개 예정',
    /** 믹서 CTA 아래 사전 안내 — 공개 시각이 지난 뒤에도 거짓이 되지 않게 조건형으로 쓴다(단일 문장, 마침표 없음) */
    testMixPreNotice: '공개 시각 전에 믹스하면 보상은 그대로 받고, 믹스 기록에는 남지 않아요',
    /** 시험 믹스 결과 오버레이를 닫는 순간 info 토스트로 안내(서버 응답의 testMix가 참일 때만) */
    testMixNotice: '공개 전 시험 믹스라 기록에 남지 않아요',
    /**
     * 티켓 20260917_1427(유저 화면 레시피 선택형 전환) — 선택한 recipe_id가 더 이상
     * 존재하지 않을 때(다른 기기에서 목록을 불러온 사이 어드민이 삭제한 경우 등).
     * §4.1 [현상 → 해결책] 구조.
     */
    recipeNotFound: '선택한 레시피를 더 이상 찾을 수 없어요. 목록을 다시 불러온 뒤 골라 주세요.',
    /**
     * 실패해도 남은 포인트를 안내하는 문장(티켓 20260916_0809 — "실패 보상" 같은 공급자
     * 언어 제거). route.ts가 앞 문장에 마침표를 채운 뒤 이 문장을 이어 붙이고 points는
     * toLocaleString()으로 천 단위 콤마를 적용해 넘긴다(§3 표기 규칙).
     */
    consolationPoints: '그래도 {points} 포인트가 남았어요.',
    /** 네트워크 예외(fetch 실패) 등 응답 자체를 못 받았을 때만 클라이언트가 직접 쓴다 — 재시도는 "조금 뒤에" */
    genericError: '지금은 믹스할 수 없어요. 조금 뒤에 다시 해주세요.',
    /** 서버가 보낸 reason이 알려진 값이 아닐 때의 방어적 폴백 — genericError와 달리 서버는 응답했으므로 즉시 재시도를 안내 */
    genericFail: '믹스가 안 됐어요. 다시 한 번 눌러 주세요.',
    /**
     * 받지 않은 믹스 결과 API 문구 — 티켓 20261018_0055 (운영 로직 8.4·6.4절). `/api/combine`·`/api/combine/pending`이 이 키를 직접 참조한다(ADR 0001).
     * 화면 문구는 2회에서 채원 판정 뒤에 더한다. 이름·그림 등 아이템 배지를 알 수 있는 값은 어떤 문구에도 싣지 않는다(7.3절).
     */
    /** 믹스 409 `pending_results_exist` — 받지 않은 결과가 있어 새 믹스를 시작하지 않았고 재료는 그대로다 */
    pendingResultsExist: '아직 받지 않은 믹스 결과가 있어요. 결과를 받은 뒤에 새로 믹스할 수 있어요.',
    /** 믹스 성공 응답 — 인벤토리 빈칸이 모자라 결과를 받지 않은 상태로 남겼다. 재료는 이미 사용됐다 */
    resultPending: '인벤토리 빈칸이 모자라서 믹스 결과를 아직 받지 못했어요. 인벤토리를 비운 뒤 믹스 화면에서 받아 주세요.',
    /**
     * 믹스 화면 문구 — 티켓 20261018_0055 2회 (채원 판정 2026-10-18). 결과에는 기한이 없으므로 «기한»·«만료»·재촉하는 말을 쓰지 않는다.
     * 빈칸 모자람은 오류가 아니라 할 일이라 경고 어조를 쓰지 않는다. 빈칸 줄은 캡슐(`d.capsule.sheet.noSlotsCount`)과 같은 어휘다.
     */
    /** 받지 않은 결과 배너 — 믹스 화면(탐색·믹서) 맨 위. `{count}`는 받지 않은 결과 개수 */
    pendingBanner: {
      title: '받지 않은 믹스 결과가 {count}개 있어요',
      body: '받은 뒤에 새로 믹스할 수 있어요',
      action: '받기',
    },
    /** 새 믹스가 막힌 이유 — 믹스하기 버튼 바로 아래 */
    pendingBlockedNote: '받지 않은 믹스 결과를 받으면 믹스할 수 있어요',
    /** 받기 시트 */
    pendingSheet: {
      title: '받지 않은 믹스 결과',
      /** `{count}`는 받을 결과 개수 */
      intro: '결과 {count}개를 한 번에 받아요',
      /** 빈칸이 충분할 때 푸터 한 줄 */
      slots: '인벤토리 빈칸 {free}개 · 필요한 빈칸 {needed}개',
      shortTitle: '인벤토리 빈칸이 모자라요',
      shortCount: '지금 빈칸 {free}개, 받으려면 {needed}개가 필요해요',
      shortKept: '믹스 결과는 그대로 남아 있어요',
      inventoryLink: '인벤토리 보기',
      claim: '받기',
      /** 제출 중 버튼 라벨(진행형, UX 라이팅 §5.3) */
      claiming: '받는 중',
      retry: '다시 불러오기',
      close: '닫기',
    },
    /** 받기 성공 연출 문구. `{count}`는 받은 결과 개수 */
    claimedToast: '믹스 결과 {count}개를 받았어요',
    /** 믹스 직후 빈칸이 모자라 결과가 받지 않은 상태로 남았을 때 오버레이 문구. `{count}`는 결과 개수, `{free}`는 지금 빈칸 수 */
    resultPendingCounts:
      '믹스 결과 {count}개를 아직 받지 못했어요. 지금 빈칸 {free}개, 받으려면 {count}개가 필요해요. 빈칸을 만든 뒤 믹스 화면에서 받아 주세요.',
    /** 위 문구에 이어 붙이는 한 문장 — 포인트는 결과와 별개로 먼저 지급된다. `{points}`는 천 단위 콤마가 든 숫자 */
    resultPendingPoints: '{points} 포인트는 먼저 받았어요.',
    /** 보상 없음으로 정한 레시피의 믹스 성공 문구 */
    noRewardResult: '믹스를 마쳤어요. 이 레시피는 받는 보상이 없어요',
    /** 레시피 행 부제 — 보상 없음으로 정한 레시피 */
    noRewardLabel: '보상 없음',
    /** 레시피 설명이 길 때 접고 펴는 버튼 */
    descriptionMore: '더 보기',
    descriptionLess: '접기',
    claim: {
      /** 받기 409 `no_pending` — 이미 받았다(중복 클릭, 다른 기기) */
      noPending: '받을 믹스 결과가 더 없어요. 이미 받았을 수 있으니 인벤토리에서 확인해 주세요.',
      /** 받기 409 `insufficient_slots` — 빈칸 수와 필요한 빈칸 수는 응답 필드(`free`·`needed`)로 싣는다 */
      insufficientSlots: '인벤토리 빈칸이 모자라서 믹스 결과를 받지 못했어요. 빈칸을 만든 뒤 다시 받아 주세요.',
      /** 받기 404 `inventory_not_found` */
      inventoryNotFound: '인벤토리를 찾지 못해 믹스 결과를 받지 못했어요. 잠시 후 다시 시도해 주세요.',
      /** 받기 POST 500 */
      failed: '믹스 결과를 받지 못했어요. 잠시 후 다시 시도해 주세요.',
      /** 목록 GET 500 */
      loadFailed: '받지 않은 믹스 결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    },
    /**
     * 등급 올리기 — 티켓 20261022_2119 3회 (채원 사전 판정 2026-10-23, 사용자 승인). 레시피 없이 규칙으로 처리하는 믹스 화면의 별도 기능이다(운영 로직 8.4절).
     * 확률 숫자·퍼센트는 어떤 문구에도 쓰지 않는다(UX 라이팅 §3.3). 윗등급이 나올 수도 같은 등급이 나올 수도 있다는 사실은 숨기지 않되 «항상 올라간다»로 읽히는 제목(「등급이 올랐어요」)은 쓰지 않는다. «운이 좋으면»처럼 확률을 말투로 꾸미지 않는다(윗등급이 70%로 흔해져 과소 표현이 된다, 티켓 20261023_1648 사용자 결정 2026-10-25).
     * 소각 전 거절 문구(`noCandidate`·`invalidMaterials`·`invalidCount`·`invalidCollection`)는 `/api/combine/tier-up`(2회)도 같은 키를 참조한다(ADR 0001).
     * 재료 소모·받지 않은 결과·이용 정지·잠긴 개체 안내는 믹스 문구(`itemsNotFound`·`pendingResultsExist` 등)를 그대로 쓴다.
     */
    tierUp: {
      /** 입구 행 제목, 화면 TopNav 제목, 제출 버튼이 같은 이름이다 */
      title: '등급 올리기',
      /** 입구 행 부제 — 레시피 탐색 화면 맨 위 */
      entrySubtitle: '같은 등급 5개를 넣고 새 아이템 배지 1개를 받아요',
      /** 화면 맨 위 설명 문단 — 접지 않는다 */
      description:
        '같은 등급 아이템 배지 5개를 넣고 컬렉션을 고르면, 그 컬렉션의 새 아이템 배지 1개를 받아요. 윗등급이 나오거나 같은 등급이 나와요. Mystic은 넣을 수 없어요.',
      /** 첫 재료를 담은 뒤 슬롯 아래 한 줄과 재료 시트 맨 위 한 줄. `{rarity}`는 Common·Rare·Epic */
      rarityOnly: '지금은 {rarity} 아이템 배지만 넣을 수 있어요',
      /** 5개 이상 가진 등급이 하나도 없을 때 — «지금은 못 하는 까닭» 한 곳에만 쓰는 안내 */
      noEnoughNotice: '같은 등급 아이템 배지가 5개 모여야 올릴 수 있어요. 지금은 5개 이상 가진 등급이 없어요.',
      submit: '등급 올리기',
      /** §5.3 처리 중 상태 */
      submitLoading: '등급을 올리는 중',
      /** 제출이 막힌 이유 — 제출 버튼 바로 아래 */
      pendingBlockedNote: '받지 않은 믹스 결과를 받으면 등급을 올릴 수 있어요',
      /** 제출 버튼 아래 상시 안내 — 믹스의 `burnNotice`와 달리 성공·실패 갈래가 없어 짧게 쓴다 */
      burnNotice: '넣은 재료는 사라져요',
      /** 재료 시트 등급 묶음 제목. `{rarity}`는 Common·Rare·Epic, `{count}`는 내가 가진 개수(진행률이 아니다) */
      groupTitle: '{rarity} · {count}개',
      /** 5개 미만인 묶음의 이유 줄 */
      groupShort: '5개부터 넣을 수 있어요',
      /** 재료 시트에 넣을 수 있는 아이템 배지가 하나도 없을 때 */
      sheetEmpty: '등급을 올릴 수 있는 아이템 배지가 없어요',
      /** 결과 오버레이 한 줄 — 윗등급이 나왔을 때. `{rarity}`는 받은 아이템 배지의 등급 */
      resultUpgraded: '윗등급이 나왔어요! {rarity} 아이템 배지를 받았어요',
      /** 결과 오버레이 한 줄 — 같은 등급이 나왔을 때 */
      resultSame: '{rarity} 아이템 배지를 받았어요',
      /** 결과 오버레이 한 줄 — 응답에 등급이 없어 비교할 수 없을 때. 등급을 지어내지 않는다 */
      resultUnknown: '아이템 배지를 받았어요',
      /** 소각 전 거절 `no_candidate` — 다른 컬렉션을 고르라는 안내다. 「후보」는 유저 화면에 쓰지 않는 말이다(§3.3) */
      noCandidate: '고른 컬렉션에서는 지금 받을 수 있는 아이템 배지가 없어요. 넣은 재료는 그대로 있어요. 다른 컬렉션을 골라 주세요.',
      /** 소각 전 거절 `invalid_collection` — 고른 컬렉션이 소속 트라이브의 열린 컬렉션이 아니거나, 재료 등급·바로 윗등급 아이템 배지 가운데 한쪽이 없다 */
      invalidCollection: '지금은 고를 수 없는 컬렉션이에요. 넣은 재료는 그대로 있어요. 다른 컬렉션을 골라 주세요.',
      /** 소각 전 거절 `invalid_materials` — 등급이 섞였거나 Mystic·등급 없는 배지가 들어 있다 */
      invalidMaterials:
        '같은 등급의 Common, Rare, Epic 아이템 배지 5개만 넣을 수 있어요. 넣은 재료는 그대로 있어요. 다시 골라 주세요.',
      /** 소각 전 거절 `invalid_count` — 재료가 5개가 아니다 */
      invalidCount: '아이템 배지 5개를 넣어야 해요. 넣은 재료는 그대로 있어요. 다시 골라 주세요.',
      /**
       * 받을 컬렉션 고르기 (티켓 20261023_1648 3회, 채원 사전 판정 2026-10-23). 소각 전 거절 문구 키와 섞이지 않게 한 묶음으로 둔다.
       * 아이템북·후보·소각·슬롯은 유저 화면에 쓰지 않는다(§1.3 용어표).
       */
      collectionPicker: {
        /** 행 라벨 — 값 위에 작게 */
        label: '받을 컬렉션',
        /** 고를 수 있는데 아직 고르지 않았을 때 행의 값 */
        unselected: '컬렉션을 골라 주세요',
        /** 재료를 넣기 전 정적 행의 값 */
        needMaterial: '재료를 넣으면 컬렉션을 고를 수 있어요',
        /** 이 재료 등급으로 고를 컬렉션이 없을 때 정적 행의 값. `{rarity}`는 넣은 재료의 등급(Common·Rare·Epic) */
        none: '지금은 {rarity} 아이템 배지로 받을 수 있는 컬렉션이 없어요. 다른 등급으로 해 보세요.',
        /** 시트 제목이자 시트 안 선택 묶음의 이름 */
        sheetTitle: '컬렉션 고르기',
        /** 시트 맨 위 한 줄 */
        sheetNote: '지금 넣은 재료로 받을 수 있는 컬렉션만 보여요',
        /** 목록을 읽지 못했을 때 — «없다»고 말하지 않는다 */
        loadFailed: '컬렉션 목록을 지금 불러오지 못했어요. 잠시 뒤 다시 불러와 주세요.',
        /** 읽기 실패 안내의 보조 동작 */
        retry: '다시 불러오기',
      },
    },
  },

  /**
   * VOC CS 게시판 (티켓 20260828_1921 — 20260828_1548의 Notion 임베드 임시 채널을
   * 대체하는 정식 버전). Google Sheets(Tally 연동)를 데이터 소스로 쓰는 문의/답변 피드.
   */
  voc: {
    inquiryButton: '문의',
    pageTitle: '문의',
    inquireCta: '문의하기',
    sortLatest: '최신글',
    sortAnswered: '최신 답변',
    sortAriaLabel: '정렬',
    severityLabel: '심각도 {severity}/5',
    answerLabel: '답변',
    loading: '불러오는 중',
    // ADR 0001 — API route(api/voc/route.ts)가 이 문구를 그대로 응답에 담아 완성하고,
    // 클라이언트는 서버 메시지가 없을 때(네트워크 단절 등)의 최종 폴백으로만 재사용한다
    // (티켓 20260915_2251).
    loadFailed: '문의 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    /**
     * loadFailed 발생 시 재조회를 트리거하는 CTA 버튼 라벨 (티켓 20260916_1031).
     * "다시 불러오기"는 UX_WRITING_GUIDELINE.md §1.3 「새로고침」 항목의 금지어라 채택하지
     * 않았다 — 이 버튼은 방금 실패한 조회 자체를 재실행하는 동작이라 같은 절이 구분한
     * "다시 시도"(코드베이스 기존 관용구, points.retry·notifications.retry와 동일)를 썼다.
     */
    retry: '다시 시도',
    emptyTitle: '아직 남긴 문의가 없어요',
    emptyBody: '궁금한 점이 생기면 언제든 문의해 주세요',
    paginationAriaLabel: '페이지 이동',
    paginationPrev: '이전',
    paginationNext: '다음',
    /**
     * 문의 상태 표시 라벨 (티켓 20260915_2252) — api/voc/route.ts가 이 값을 참조해
     * 화면에 노출할 status 필드를 완성한다. Google Sheets 원본 데이터값(ANSWERED_STATUS
     * 매칭 로직)과는 별개이며, 이 라벨은 표시 전용이다.
     */
    statusAnswered: '답변완료',
    statusPending: '문의중',
  },
} as const

export type Dictionary = typeof ko
