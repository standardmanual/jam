import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BadgeRow, StravaConnectionRow, UserActivityBadgeRow, UserRow } from '@/types/database'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { Card } from '@ds/components/cards/Card'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import SyncButton from './SyncButton'
import LocalDate from '@/components/LocalDate'
import UserSearchBar from './UserSearchBar'
import TodayCardStack from './TodayCardStack'
import { getTodayCards } from '@/lib/today/cards'
import { d } from '@/lib/i18n'
import { ActivityIcon, MedalIcon } from '@/components/ui/icons'

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

  const [{ data: profile }, { data: stravaConn }, { data: recentBadges }] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    supabase.from('strava_connections').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('user_activity_badges')
      .select('*, badge:badges(*)')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false })
      .limit(4),
  ])

  const userProfile = profile as UserRow | null
  const stravaConnection = stravaConn as StravaConnectionRow | null
  const badgeWithEarned: BadgeWithEarned[] = ((recentBadges ?? []) as Array<{badge: BadgeRow} & UserActivityBadgeRow>).map(
    (r) => ({ badge: r.badge, earned: r })
  )

  const displayName = userProfile?.username ?? user.email?.split('@')[0] ?? '러너'

  // ─── 투데이 카드 스택 (Phase 15) ─────────────────────────────────────
  const todayCards = await getTodayCards(userId, userProfile?.created_at)

  return (
    <div className="min-h-full bg-surface text-text px-[var(--spacing-16)] pt-[calc(env(safe-area-inset-top)+var(--spacing-24))] pb-[var(--spacing-32)] flex flex-col gap-[var(--spacing-24)]">
      {/* 헤더 */}
      <div>
        <div className="flex items-center justify-between mb-[var(--spacing-16)]">
          <Image src="/jam-logo-white.png" alt="JAM!" width={2238} height={925} className="h-[30px] w-auto" priority />
        </div>
        <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60">{d.today.greeting}</p>
        <h1 className="text-[length:var(--text-heading)] leading-[var(--leading-heading)] mt-0.5">
          {displayName}
        </h1>
      </div>

      {/* Strava 상태 */}
      {stravaConnection ? (
        <Card tone="inverse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ActivityIcon className="w-5 h-5 text-text-inverse" />
              <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{d.today.stravaLabel}</span>
              {stravaConnection.last_synced_at && (
                <span className="text-[length:var(--text-caption)] text-text-inverse/50">
                  <LocalDate iso={stravaConnection.last_synced_at} options={{ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }} />
                </span>
              )}
            </div>
            <SyncButton />
          </div>
        </Card>
      ) : (
        <Card tone="inverse">
          <p className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] mb-1">{d.today.stravaNotConnectedTitle}</p>
          <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 mb-[var(--spacing-16)]">{d.today.stravaNotConnectedBody}</p>
          <Link
            href="/profile"
            className="inline-flex items-center justify-center min-h-11 rounded-[var(--radius-pill-buttons)] px-[var(--spacing-32)] py-[14px] bg-surface text-text text-[length:var(--text-body)] leading-[var(--leading-body)] active:scale-95 transition-transform duration-100"
          >
            {d.today.stravaConnectButton} &rarr;
          </Link>
        </Card>
      )}

      {/* 유저 검색 */}
      <UserSearchBar />

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
  )
}
