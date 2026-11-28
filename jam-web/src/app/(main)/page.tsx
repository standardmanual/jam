import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UserRow } from '@/types/database'
import TopNav from '@/components/ui/TopNav'
import TodayCardStack from './TodayCardStack'
import TodayStatusStrip from './TodayStatusStrip'
import StravaDisconnectedCard from '@/components/strava/StravaDisconnectedCard'
import SuspensionBanner from './SuspensionBanner'
import { loadHomeSuspensionBanner } from '@/lib/suspension/home-banner'
import { settleAfterSlotsFreed } from '@/lib/capsule/settle-pending'
import HomeViewTracker from './HomeViewTracker'
import ChapterGaugeSection from '@/components/chapter/ChapterGaugeSection'
import { getMyChapter, type MyChapterResult } from '@/lib/chapter/read'
import { readCapsuleReceiveBlocked } from '@/lib/capsule/receive-block'
import { getTodayCards } from '@/lib/today/cards'
import { getTodayLeftStatus, getTodayRightStatus, type TodayLeftStatus } from '@/lib/today/status'
import { getDisplayName } from '@/lib/utils'
import {
  resolveStravaUiState,
  showsStravaDisconnectedCard,
  showsStravaSyncCta,
  type StravaHomeView,
} from '@/lib/strava/connection-state'
import { d, t } from '@/lib/i18n'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const userId = user.id

  // strava_connections 조회를 먼저 시작해두고(다른 쿼리들도 동시에 시작), 그 결과로
  // 미연동이면 getTodayLeftStatus 자체를 호출하지 않는다 — 미연동 유저에게 bestProgress()의
  // 무의미한 DB 조회 4건이 실행되던 문제를 제거한다(티켓 20260830_2104). 나머지 쿼리는
  // stravaConn과 무관하게 이미 병렬로 실행 중이므로 병렬화 이점은 그대로 유지된다.
  // 연결 상태 판정에 필요한 두 칸만 읽는다 — 행 전체를 읽지 않는다(토큰 칸을 가져오지 않는다).
  const stravaConnPromise = supabase
    .from('strava_connections')
    .select('disconnected_at, disconnect_reason')
    .eq('user_id', userId)
    .maybeSingle()
  const profilePromise = supabase.from('users').select('*').eq('id', userId).single()
  const rightStatusPromise = getTodayRightStatus(userId)
  // 이용 정지 배너 값(티켓 20261017_1426). 다른 조회와 함께 시작해 홈 응답을 늦추지 않는다.
  // user_suspensions는 service_role 전용이라 서비스 클라이언트로 읽는다. 조회가 실패하면 배너만 생략한다(던지지 않는다).
  const suspensionPromise = loadHomeSuspensionBanner(createServiceClient(), userId)
  // 따라잡기(티켓 20261105_1438 R2): 어떤 경로로 칸이 비었든 빈칸이 대기 보상 개수 이상이면 여기서 대기 보상을 자동으로 지급하고 남은 잼을 채운 뒤,
  // 그 결과를 챕터·막힘 조회가 읽게 한다(막힘이 바로 풀리도록 순서를 지킨다). 던지지 않고, 대기 보상이 없으면 확인 한 번으로 끝난다.
  const settlePromise = settleAfterSlotsFreed(createServiceClient(), userId)
  // 챕터 게이지 카드 값(티켓 20261127_1735). 조회가 실패하면 던지지 않고 null로 접는다 — 카드 자리에 «다시 시도» 오류 블록이 뜬다.
  const chapterPromise: Promise<MyChapterResult | null> = settlePromise
    .then(() => getMyChapter(createServiceClient(), userId))
    .catch((err: unknown) => {
      console.error('[home/page] 챕터 조회 실패 — 카드 자리에 오류 블록을 그린다', err)
      return null
    })
  // 막힘 판정(대기 보상으로 받지 못한 아이템 배지가 있는가). 실패하면 던지지 않고 안내만 생략한다.
  const blockedPromise = settlePromise
    .then(() => readCapsuleReceiveBlocked(createServiceClient(), userId))
    .catch((err: unknown) => {
      console.error('[home/page] 막힘 조회 실패 — 막힘 안내만 생략한다', err)
      return null
    })

  const { data: stravaConn, error: stravaConnError } = await stravaConnPromise
  if (stravaConnError) console.error('[home/page] strava_connections 조회 실패', stravaConnError)
  // 판정은 connection-state.ts 한 곳. 조회가 실패하면 연결됨·끊김·미연동 어느 쪽도 단정하지 않는다
  // (알람 카드와 CTA를 그리지 않고 로그만 남긴다). 예전에는 실패가 null로 접혀 «Strava 동기화하면 시작해요»가
  // 거짓으로 떴다.
  const stravaView: StravaHomeView = stravaConnError ? 'unknown' : resolveStravaUiState(stravaConn)
  const leftStatusPromise: Promise<TodayLeftStatus> = showsStravaSyncCta(stravaView)
    ? Promise.resolve({ kind: 'strava_not_connected', href: '/api/strava/auth' })
    : getTodayLeftStatus(userId)

  const [
    { data: profile, error: profileError },
    rightStatus,
    leftStatus,
    suspension,
    chapter,
    receiveBlocked,
  ] = await Promise.all([
    profilePromise,
    rightStatusPromise,
    leftStatusPromise,
    suspensionPromise,
    chapterPromise,
    blockedPromise,
  ])
  if (profileError) console.error('[home/page] users 프로필 조회 실패', profileError)

  const userProfile = profile as UserRow | null
  // 막힘 안내는 이용 정지 중이면 없다(정지 배너가 이미 알린다). 홈이 읽은 정지 값을 그대로 쓴다.
  const blocked = receiveBlocked?.blocked && !suspension ? { pendingItemCount: receiveBlocked.pending } : null

  const displayName = (userProfile && getDisplayName(userProfile)) || user.email?.split('@')[0] || '러너'

  // ─── 투데이 카드 스택 (Phase 15) ─────────────────────────────────────
  // 프로필을 읽었으면 소속 트라이브(tribe_id)를 넘겨 태그 계산이 users를 다시 읽지 않게 한다. 프로필 조회가 실패했으면 생략(undefined)해 거기서 읽는다.
  const todayCards = await getTodayCards(userId, userProfile?.created_at, undefined, userProfile ? userProfile.tribe_id : undefined)

  return (
    <div className="min-h-full text-foreground">
      <HomeViewTracker />
      {/* 20260824_010: 탭 최상위 공통 Topnavi(좌:로고/중:동기화/우:아바타) — 기존 자체
          로고 헤더 블록을 대체한다. */}
      <TopNav logo syncStyle="pill" />

      <div className="px-4 pt-4 pb-6 flex flex-col gap-5">
      {/* 이용 정지 배너 (티켓 20261017_1426) — 정지 중인 유저에게만 렌더, 아니면 DOM에 없다.
          정지는 홈의 다른 모든 것보다 먼저 읽혀야 해서 인사말 줄 위, 컨테이너의 첫 자식이다. */}
      {suspension && <SuspensionBanner reason={suspension.reason} suspendedAt={suspension.suspendedAt} />}

      {/* 인사말 두 줄 (티켓 20261128_0900) — 첫 줄 «{이름}님», 둘째 줄 «오늘도 좋은 하루예요», 글자 크기는 이전 text-base의 2배 눈금(text-3xl).
          검색 아이콘은 내 프로필의 팔로워·팔로잉 목록 위로 옮겼다. 검색 폼(UserSearchBar)은 `/search` 페이지에서 계속 쓰인다. */}
      <p className="text-3xl font-bold">
        <span className="block truncate">{t(d.todayStatus.greetingName, { name: displayName })}</span>
        <span className="block">{d.todayStatus.greetingBody}</span>
      </p>

      {/* 챕터 게이지·동기화 끊김·오늘의 현황·피드 묶음 (티켓 20261128_1824) — 묶음 안 영역 사이 간격은 12px(gap-3)로 둔다. 이전 20px의 절반(10px)에 가장 가까운 눈금이다(눈금은 8·12px).
          인사말·정지 배너와 이 묶음 사이는 바깥 컨테이너의 gap-5(20px) 그대로다. 묶음에는 항상 오늘의 현황 스트립이 있어 빈 묶음이 없다. */}
      <div className="flex flex-col gap-3">
        {/* 챕터 게이지 카드 (티켓 20261127_1735 C5b) — 인사말 줄 바로 아래, 오늘의 현황 위. 챕터가 없는 유저는 아무것도 그리지 않아 빈 간격도 없다.
            막힘이면 카드 아래에 안내 카드가 이어 붙는다(정지 중에는 없음). 감싸는 곳에 z-index를 주지 않는다(시트가 탭바에 가려진 2026-08-25 사고). */}
        <ChapterGaugeSection chapter={chapter} blocked={blocked} />

        {/* Strava 동기화 끊김 카드 (티켓 20261017_1422) — 오류로 끊긴 유저에게만 렌더, 그 외엔 DOM에 없다.
            유저가 직접 끊은 경우는 알람 없이 미연동처럼 보인다(사용자 승인). */}
        {showsStravaDisconnectedCard(stravaView) && <StravaDisconnectedCard />}

        {/* "오늘의 현황" 스트립 (신규) — 좌: 진행상황 / 우: 팔로잉. 큐레이션 없음(today_cards
            CMS와 역할 분리, 완료 기록 참고). */}
        <TodayStatusStrip left={leftStatus} right={rightStatus} />

        {/* 투데이 카드 스택 (Phase 15) — 조건 매칭 카드 0개면 자동 미노출 */}
        <TodayCardStack cards={todayCards} />
      </div>

      </div>
    </div>
  )
}
