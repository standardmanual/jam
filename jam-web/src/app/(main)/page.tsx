import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BadgeRow, StravaConnectionRow, UserActivityBadgeRow, UserRow } from '@/types/database'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { Card } from '@ds/components/cards/Card'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import TopNav from '@/components/ui/TopNav'
import LocalDate from '@/components/LocalDate'
import TodayCardStack from './TodayCardStack'
import TodayStatusStrip from './TodayStatusStrip'
import { getTodayCards } from '@/lib/today/cards'
import { getTodayLeftStatus, getTodayRightStatus } from '@/lib/today/status'
import { getDisplayName } from '@/lib/utils'
import { d, t } from '@/lib/i18n'
import { MedalIcon, SearchIcon } from '@/components/ui/icons'

interface BadgeWithEarned {
  badge: BadgeRow
  earned: UserActivityBadgeRow
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const userId = user.id

  // getTodayLeftStatus(userId, true)의 결과는 stravaConnected=true를 가정한 "진행 중
  // 컬렉션/미션 유무"만 계산한다(내부적으로 strava_connections를 다시 조회하지 않는 순수
  // 조회라 인자값이 최종 결과에 영향을 주지 않는다). 실제 stravaConnection 여부는 같은
  // Promise.all 안의 strava_connections 쿼리 결과로만 확정되므로, 병렬 조회 후 아래에서
  // 최종 leftStatus를 조합한다 — 순차 대기 없이 모든 쿼리를 한 번에 병렬화하기 위함.
  const [{ data: profile }, { data: stravaConn }, { data: recentBadges }, progressStatus, rightStatus] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    supabase.from('strava_connections').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('user_activity_badges')
      .select('*, badge:badges(*)')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false })
      .limit(4),
    getTodayLeftStatus(userId, true),
    getTodayRightStatus(userId),
  ])

  const userProfile = profile as UserRow | null
  const stravaConnection = stravaConn as StravaConnectionRow | null
  const leftStatus = stravaConnection
    ? progressStatus
    : { kind: 'strava_disconnected' as const, href: '/api/strava/auth' }
  // 소프트 삭제된 배지(badges.deleted_at)는 "최근 획득 배지"에서 제외한다(20260824_007) —
  // 다른 화면들과 동일하게 조인 결과를 badge.deleted_at으로 사후 필터한다.
  const badgeWithEarned: BadgeWithEarned[] = ((recentBadges ?? []) as Array<{badge: BadgeRow} & UserActivityBadgeRow>)
    .filter((r) => r.badge && !r.badge.deleted_at)
    .map((r) => ({ badge: r.badge, earned: r }))

  const displayName = (userProfile && getDisplayName(userProfile)) || user.email?.split('@')[0] || '러너'

  // ─── 투데이 카드 스택 (Phase 15) ─────────────────────────────────────
  const todayCards = await getTodayCards(userId, userProfile?.created_at)

  return (
    <div className="min-h-full bg-surface text-text">
      {/* 20260824_010: 탭 최상위 공통 Topnavi(좌:로고/중:동기화/우:아바타) — 기존 자체
          로고 헤더 블록을 대체한다 */}
      <TopNav logo headerStyle={{ background: 'var(--color-surface)' }} />

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
      <TodayCardStack cards={todayCards} />

      {/* 최근 획득 배지 */}
      <section>
        <div className="flex items-center justify-between mb-[var(--spacing-16)]">
          <h2 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)]">{d.today.recentBadgesTitle}</h2>
          <Link href="/badges" className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] font-bold underline underline-offset-2">
            {d.today.recentBadgesViewAll} &gt;
          </Link>
        </div>

        {badgeWithEarned.length > 0 ? (
          <div className="grid grid-cols-2 gap-[var(--spacing-16)]">
            {badgeWithEarned.map(({ badge, earned }) => (
              <Link key={earned.id} href={`/badges/${badge.id}`}>
                <Card tone="inverse" className="aspect-square flex flex-col justify-between active:scale-[0.98] transition-transform duration-100">
                  <div className="flex-1 flex items-center justify-center">
                    {badge.image_url ? (
                      <Image src={badge.image_url} alt={badge.name} width={80} height={80} className="w-20 h-20 object-contain" />
                    ) : (
                      <MedalIcon className="w-14 h-14 text-text-inverse/40" />
                    )}
                  </div>
                  <div>
                    <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate">{badge.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <RarityBadge rarity={badge.rarity} />
                      <p className="text-[length:var(--text-caption)] text-text-inverse/50"><LocalDate iso={earned.earned_at} options={{ month: 'long', day: 'numeric' }} /></p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<MedalIcon className="w-8 h-8" />}
            title={d.today.recentBadgesEmptyTitle}
            description={d.today.recentBadgesEmptyBody}
          />
        )}
      </section>

      {/* 바로가기 */}
      <section>
        <h2 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] mb-[var(--spacing-16)]">{d.today.shortcutsTitle}</h2>
        <div className="grid grid-cols-2 gap-[var(--spacing-16)]">
          <Link href="/missions">
            <Card tone="inverse" className="flex flex-col gap-2 active:scale-[0.98] transition-transform duration-100">
              <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] font-bold">{d.today.shortcutMissionTitle}</p>
              <p className="text-[length:var(--text-caption)] text-text-inverse/50">{d.today.shortcutMissionBody}</p>
            </Card>
          </Link>
          <Link href="/inventory">
            <Card tone="inverse" className="flex flex-col gap-2 active:scale-[0.98] transition-transform duration-100">
              <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] font-bold">{d.today.shortcutInventoryTitle}</p>
              <p className="text-[length:var(--text-caption)] text-text-inverse/50">{d.today.shortcutInventoryBody}</p>
            </Card>
          </Link>
          <Link href="/drops">
            <Card tone="inverse" className="flex flex-col gap-2 active:scale-[0.98] transition-transform duration-100">
              <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] font-bold">{d.today.shortcutDropsTitle}</p>
              <p className="text-[length:var(--text-caption)] text-text-inverse/50">{d.today.shortcutDropsBody}</p>
            </Card>
          </Link>
          <Link href="/combine">
            <Card tone="inverse" className="flex flex-col gap-2 active:scale-[0.98] transition-transform duration-100">
              <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] font-bold">{d.today.shortcutCombineTitle}</p>
              <p className="text-[length:var(--text-caption)] text-text-inverse/50">{d.today.shortcutCombineBody}</p>
            </Card>
          </Link>
        </div>
      </section>
      </div>
    </div>
  )
}
