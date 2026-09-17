import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StravaConnectionRow, UserRow } from '@/types/database'
import TopNav from '@/components/ui/TopNav'
import TodayCardStack from './TodayCardStack'
import TodayStatusStrip from './TodayStatusStrip'
import HomeViewTracker from './HomeViewTracker'
import { getTodayCards } from '@/lib/today/cards'
import { getTodayLeftStatus, getTodayRightStatus, type TodayLeftStatus } from '@/lib/today/status'
import { getDisplayName } from '@/lib/utils'
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
  const stravaConnPromise = supabase.from('strava_connections').select('*').eq('user_id', userId).maybeSingle()
  const profilePromise = supabase.from('users').select('*').eq('id', userId).single()
  const rightStatusPromise = getTodayRightStatus(userId)

  const { data: stravaConn, error: stravaConnError } = await stravaConnPromise
  if (stravaConnError) console.error('[home/page] strava_connections 조회 실패', stravaConnError)
  const stravaConnection = stravaConn as StravaConnectionRow | null
  const leftStatusPromise: Promise<TodayLeftStatus> = stravaConnection
    ? getTodayLeftStatus(userId)
    : Promise.resolve({ kind: 'strava_disconnected', href: '/api/strava/auth' })

  const [
    { data: profile, error: profileError },
    rightStatus,
    leftStatus,
  ] = await Promise.all([profilePromise, rightStatusPromise, leftStatusPromise])
  if (profileError) console.error('[home/page] users 프로필 조회 실패', profileError)

  const userProfile = profile as UserRow | null

  const displayName = (userProfile && getDisplayName(userProfile)) || user.email?.split('@')[0] || '러너'

  // ─── 투데이 카드 스택 (Phase 15) ─────────────────────────────────────
  const todayCards = await getTodayCards(userId, userProfile?.created_at)

  return (
    <div className="min-h-full text-text">
      <HomeViewTracker />
      {/* 20260824_010: 탭 최상위 공통 Topnavi(좌:로고/중:동기화/우:아바타) — 기존 자체
          로고 헤더 블록을 대체한다 */}
      <TopNav logo />

      <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)] pb-[var(--spacing-32)] flex flex-col gap-[var(--spacing-24)]">
      {/* 압축 인사말 + 검색 아이콘화 (티켓 20260830_2030) — 기존 큰 인사말(h1)·상시 노출
          전체 폭 검색바를 대체한다. 검색 폼 자체는 UserSearchBar가 그대로 유지하고
          `/search` 페이지에서 계속 쓰인다. */}
      <div className="flex items-center justify-between gap-[var(--spacing-16)]">
        <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] font-bold truncate">
          {t(d.todayStatus.greeting, { name: displayName })}
        </p>
        <Link
          href="/search"
          aria-label={d.today.searchAriaLabel}
          className="w-11 h-11 -mr-1 rounded-[var(--radius-pill)] flex items-center justify-center shrink-0 active:scale-95 transition-transform duration-100"
        >
          <span className="w-9 h-9 rounded-[var(--radius-pill)] bg-surface-elevated text-text flex items-center justify-center">
            <SearchIcon className="w-4 h-4" />
          </span>
        </Link>
      </div>

      {/* "오늘의 현황" 스트립 (신규) — 좌: 내 진행도 / 우: 친구 활동. 큐레이션 없음(today_cards
          CMS와 역할 분리, 완료 기록 참고). */}
      <TodayStatusStrip left={leftStatus} right={rightStatus} />

      {/* 투데이 카드 스택 (Phase 15) — 조건 매칭 카드 0개면 자동 미노출 */}
      <TodayCardStack cards={todayCards} currentUserId={userId} />

      </div>
    </div>
  )
}
