import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UserRow } from '@/types/database'
import TopNav from '@/components/ui/TopNav'
import TodayCardStack from './TodayCardStack'
import TodayStatusStrip from './TodayStatusStrip'
import OnboardingQuestCard from './OnboardingQuestCard'
import OnboardingSyncButton from './OnboardingSyncButton'
import StravaDisconnectedCard from '@/components/strava/StravaDisconnectedCard'
import SuspensionBanner from './SuspensionBanner'
import { loadHomeSuspensionBanner } from '@/lib/suspension/home-banner'
import HomeViewTracker from './HomeViewTracker'
import CapsuleWidget from '@/components/capsule/CapsuleWidget'
import { getCapsuleStatus } from '@/lib/capsule/capsule'
import { getTodayCards } from '@/lib/today/cards'
import { getTodayLeftStatus, getTodayRightStatus, type TodayLeftStatus } from '@/lib/today/status'
import { getOnboardingQuestCard } from '@/lib/onboarding-quest/status'
import { getOnboardingQuestGate } from '@/lib/onboarding-quest/screen-gate'
import { getDisplayName } from '@/lib/utils'
import {
  resolveStravaUiState,
  showsStravaDisconnectedCard,
  showsStravaSyncCta,
  type StravaHomeView,
} from '@/lib/strava/connection-state'
import { d, t } from '@/lib/i18n'
import { SearchIcon } from '@/components/ui/icons'

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
  // 캡슐 초기값(티켓 20261018_0054). 조회가 실패하면 null로 접고 던지지 않는다 — 위젯이 클라이언트에서 다시 가져오고 오류 상태를 보여 준다.
  // 캡슐이 없으면 서버가 이때 만든다(`capsule_get_or_create`).
  const capsulePromise = getCapsuleStatus(createServiceClient(), userId).catch((err: unknown) => {
    console.error('[home/page] 캡슐 조회 실패 — 위젯이 클라이언트에서 다시 가져온다', err)
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
  // «JAM! 시작하기» 카드는 실제 2단계를 읽어 그린다(티켓 20261021_1248 2회). 캡슐 열기는 단계가 아니라 캡슐 상태를 넘기지 않는다(티켓 20261028_1738).
  // 캡슐 위젯용 조회(capsulePromise)는 그대로 위젯이 쓴다.
  const onboardingQuestPromise = getOnboardingQuestCard(userId, {
    stravaConnected: stravaView === 'connected' || stravaView === 'unknown',
  })
  const onboardingQuestGatePromise = getOnboardingQuestGate(userId, 'home')

  const [
    { data: profile, error: profileError },
    rightStatus,
    leftStatus,
    onboardingQuestCard,
    onboardingQuestGate,
    suspension,
    capsuleInitial,
  ] = await Promise.all([
    profilePromise,
    rightStatusPromise,
    leftStatusPromise,
    onboardingQuestPromise,
    onboardingQuestGatePromise,
    suspensionPromise,
    capsulePromise,
  ])
  if (profileError) console.error('[home/page] users 프로필 조회 실패', profileError)

  const userProfile = profile as UserRow | null

  const displayName = (userProfile && getDisplayName(userProfile)) || user.email?.split('@')[0] || '러너'

  // ─── 투데이 카드 스택 (Phase 15) ─────────────────────────────────────
  // 프로필을 읽었으면 소속 트라이브(tribe_id)를 넘겨 태그 계산이 users를 다시 읽지 않게 한다. 프로필 조회가 실패했으면 생략(undefined)해 거기서 읽는다.
  const todayCards = await getTodayCards(userId, userProfile?.created_at, undefined, userProfile ? userProfile.tribe_id : undefined)

  return (
    <div className="min-h-full text-foreground">
      <HomeViewTracker />
      {/* 20260824_010: 탭 최상위 공통 Topnavi(좌:로고/중:동기화/우:아바타) — 기존 자체
          로고 헤더 블록을 대체한다. sync 차례(온보딩 퀘스트 T2c)면 중앙 슬롯을 연출
          동기화 버튼으로 교체한다(티켓 20260927_2331). */}
      {onboardingQuestGate === 'sync' ? (
        <TopNav logo centerSlotOverride={<OnboardingSyncButton />} />
      ) : (
        <TopNav logo />
      )}

      <div className="px-4 pt-6 pb-8 flex flex-col gap-6">
      {/* 이용 정지 배너 (티켓 20261017_1426) — 정지 중인 유저에게만 렌더, 아니면 DOM에 없다.
          정지는 홈의 다른 모든 것보다 먼저 읽혀야 해서 인사말 줄 위, 컨테이너의 첫 자식이다. */}
      {suspension && <SuspensionBanner reason={suspension.reason} suspendedAt={suspension.suspendedAt} />}

      {/* 압축 인사말 + 검색 아이콘화 (티켓 20260830_2030) — 기존 큰 인사말(h1)·상시 노출
          전체 폭 검색바를 대체한다. 검색 폼 자체는 UserSearchBar가 그대로 유지하고
          `/search` 페이지에서 계속 쓰인다. */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-base font-bold truncate">
          {t(d.todayStatus.greeting, { name: displayName })}
        </p>
        <Link
          href="/search"
          aria-label={d.today.searchAriaLabel}
          className="w-11 h-11 -mr-1 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform duration-100"
        >
          <span className="w-9 h-9 rounded-full bg-surface text-foreground flex items-center justify-center">
            <SearchIcon className="w-4 h-4" />
          </span>
        </Link>
      </div>

      {/* «JAM! 시작하기» 카드 (티켓 20260927_2133, 실제 2단계 20261021_1248·20261028_1738) — 대상 유저에게만 렌더, 그 외엔 null */}
      <OnboardingQuestCard state={onboardingQuestCard} username={userProfile?.username ?? null} />

      {/* Strava 동기화 끊김 카드 (티켓 20261017_1422) — 오류로 끊긴 유저에게만 렌더, 그 외엔 DOM에 없다.
          유저가 직접 끊은 경우는 알람 없이 미연동처럼 보인다(사용자 승인). */}
      {showsStravaDisconnectedCard(stravaView) && <StravaDisconnectedCard />}

      {/* "오늘의 현황" 스트립 (신규) — 좌: 내 진행도 / 우: 친구 활동. 큐레이션 없음(today_cards
          CMS와 역할 분리, 완료 기록 참고). */}
      <TodayStatusStrip left={leftStatus} right={rightStatus} />

      {/* 캡슐 위젯 (티켓 20261018_0054, 20261028_1739, 20261031_1806) — 현황 스트립 아래라 퀘스트 중에도 퀘스트 카드가 먼저 읽힌다.
          홈에는 챕터 번호를 그리지 않는다. 감싸는 곳에 z-index를 주지 않는다(시트가 탭바에 가려진 2026-08-25 사고).
          조회가 실패했으면 위젯이 직접 가져온다. 확률 안내 링크는 이 묶음에 두지 않는다(푸터의 «확률 안내»로 통합). */}
      <CapsuleWidget initial={capsuleInitial} />

      {/* 투데이 카드 스택 (Phase 15) — 조건 매칭 카드 0개면 자동 미노출 */}
      <TodayCardStack cards={todayCards} currentUserId={userId} />

      </div>
    </div>
  )
}
