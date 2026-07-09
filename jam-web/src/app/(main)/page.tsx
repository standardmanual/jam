import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BadgeRow, StravaConnectionRow, UserActivityBadgeRow, UserRow } from '@/types/database'
import Card from '@/components/ui/Card'
import RarityBadge from '@/components/ui/Badge'
import SyncButton from './SyncButton'

interface BadgeWithEarned {
  badge: BadgeRow
  earned: UserActivityBadgeRow
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: stravaConn }, { data: recentBadges }] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase.from('strava_connections').select('*').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('user_activity_badges')
      .select('*, badge:badges(*)')
      .eq('user_id', user.id)
      .order('earned_at', { ascending: false })
      .limit(3),
  ])

  const userProfile = profile as UserRow | null
  const stravaConnection = stravaConn as StravaConnectionRow | null
  const badgeWithEarned: BadgeWithEarned[] = ((recentBadges ?? []) as Array<{badge: BadgeRow} & UserActivityBadgeRow>).map(
    (r) => ({ badge: r.badge, earned: r })
  )

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })

  return (
    <div className="px-5 py-6 flex flex-col gap-6">
      {/* 인사 헤더 */}
      <div>
        <p className="text-white/50 text-sm">{today}</p>
        <h1 className="text-2xl font-bold mt-1">
          안녕하세요,{' '}
          <span className="text-[#AEEA00]">
            {userProfile?.display_name ?? user.email?.split('@')[0]}
          </span>{' '}
          님!
        </h1>
      </div>

      {/* Strava 상태 카드 */}
      {stravaConnection ? (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#FC4C02]" />
              <span className="text-sm font-semibold">Strava 연결됨</span>
            </div>
            <SyncButton />
          </div>
          {stravaConnection.last_synced_at ? (
            <p className="text-white/40 text-xs">
              마지막 동기화: {formatDateTime(stravaConnection.last_synced_at)}
            </p>
          ) : (
            <p className="text-white/40 text-xs">아직 동기화된 데이터가 없습니다</p>
          )}
        </Card>
      ) : (
        <Card glow>
          <div className="text-center py-2">
            <p className="text-[#AEEA00] font-bold text-base mb-1">Strava 미연동 상태</p>
            <p className="text-white/50 text-sm mb-4">
              Strava를 연동하면 활동 기반 배지를 자동으로 획득할 수 있어요
            </p>
            <Link
              href="/profile"
              className="inline-block bg-[#FC4C02] text-white font-bold px-6 py-2.5 rounded-xl text-sm"
            >
              Strava 연동하기
            </Link>
          </div>
        </Card>
      )}

      {/* 최근 획득 배지 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-base">최근 획득 배지</h2>
          <Link href="/badges" className="text-[#AEEA00] text-sm">
            모두 보기
          </Link>
        </div>

        {badgeWithEarned.length > 0 ? (
          <div className="flex flex-col gap-3">
            {badgeWithEarned.map(({ badge, earned }) => (
              <Link key={earned.id} href={`/badges/${badge.id}`}>
                <Card className="flex items-center gap-4 hover:border-white/20 transition-colors">
                  <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {badge.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={badge.image_url} alt={badge.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">🏅</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{badge.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <RarityBadge rarity={badge.rarity} />
                    </div>
                    <p className="text-white/40 text-xs mt-1">{formatDate(earned.earned_at)}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="text-center py-6">
            <p className="text-white/40 text-sm">아직 획득한 배지가 없어요</p>
            <p className="text-white/30 text-xs mt-1">Strava 연동 후 활동하면 배지를 획득할 수 있어요</p>
          </Card>
        )}
      </section>
    </div>
  )
}
