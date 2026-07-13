import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BadgeRow, StravaConnectionRow, UserActivityBadgeRow, UserRow } from '@/types/database'
import RarityBadge from '@/components/ui/Badge'
import SyncButton from './SyncButton'

interface BadgeWithEarned {
  badge: BadgeRow
  earned: UserActivityBadgeRow
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
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

const rarityCardBg: Record<string, string> = {
  common: 'bg-[#E8E8E0]',
  rare: 'bg-[#C8E8F4]',
  legendary: 'bg-[#E8D4F8]',
  mythic: 'bg-[#F8F0C0]',
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
      .limit(4),
  ])

  const userProfile = profile as UserRow | null
  const stravaConnection = stravaConn as StravaConnectionRow | null
  const badgeWithEarned: BadgeWithEarned[] = ((recentBadges ?? []) as Array<{badge: BadgeRow} & UserActivityBadgeRow>).map(
    (r) => ({ badge: r.badge, earned: r })
  )

  const displayName = userProfile?.display_name ?? user.email?.split('@')[0] ?? '러너'

  return (
    <div className="px-5 py-4 flex flex-col gap-6">
      {/* 헤더 */}
      <div className="pt-1">
        <p className="text-[#AAAAAA] text-sm font-medium">안녕하세요</p>
        <h1 className="text-4xl font-black leading-tight mt-0.5 text-[#111111]">
          {displayName}
        </h1>
      </div>

      {/* Strava 상태 */}
      {stravaConnection ? (
        <div className="bg-white rounded-2xl border border-black/6 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#FC4C02]" />
              <span className="text-sm font-bold text-[#111111]">Strava</span>
              {stravaConnection.last_synced_at && (
                <span className="text-xs text-[#AAAAAA]">
                  {formatDateTime(stravaConnection.last_synced_at)}
                </span>
              )}
            </div>
            <SyncButton />
          </div>
        </div>
      ) : (
        <div className="bg-[#AEEA00] rounded-2xl p-5">
          <p className="font-black text-lg text-[#111111] mb-1">Strava 미연동</p>
          <p className="text-[#333333] text-sm mb-4">연동하면 활동 기반 배지를 자동 획득해요</p>
          <Link
            href="/profile"
            className="inline-block bg-[#111111] text-white font-bold px-5 py-2.5 rounded-xl text-sm"
          >
            지금 연동하기 →
          </Link>
        </div>
      )}

      {/* 최근 획득 배지 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-lg text-[#111111]">최근 배지</h2>
          <Link href="/badges" className="text-sm font-bold text-[#AAAAAA]">
            모두 보기 →
          </Link>
        </div>

        {badgeWithEarned.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {badgeWithEarned.map(({ badge, earned }) => (
              <Link key={earned.id} href={`/badges/${badge.id}`}>
                <div className={`rounded-2xl p-4 aspect-square flex flex-col justify-between ${rarityCardBg[badge.rarity] ?? 'bg-[#E8E8E0]'}`}>
                  <div className="flex-1 flex items-center justify-center">
                    {badge.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={badge.image_url} alt={badge.name} className="w-20 h-20 object-cover rounded-xl" />
                    ) : (
                      <span className="text-5xl">🏅</span>
                    )}
                  </div>
                  <div>
                    <p className="font-black text-sm text-[#111111] leading-tight truncate">{badge.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <RarityBadge rarity={badge.rarity} />
                      <p className="text-[10px] text-[#888888]">{formatDate(earned.earned_at)}</p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-black/6 p-8 text-center">
            <p className="text-[#AAAAAA] text-sm">아직 획득한 배지가 없어요</p>
            <p className="text-[#CCCCCC] text-xs mt-1">Strava 연동 후 활동하면 배지가 생겨요</p>
          </div>
        )}
      </section>

      {/* 바로가기 */}
      <section>
        <h2 className="font-black text-lg text-[#111111] mb-3">바로가기</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/missions" className="bg-white rounded-2xl border border-black/6 p-4 flex flex-col gap-2">
            <span className="text-2xl">🎯</span>
            <p className="font-black text-[#111111]">미션</p>
            <p className="text-xs text-[#AAAAAA]">달성하고 보상 받기</p>
          </Link>
          <Link href="/inventory" className="bg-[#111111] rounded-2xl p-4 flex flex-col gap-2">
            <span className="text-2xl">📦</span>
            <p className="font-black text-white">인벤토리</p>
            <p className="text-xs text-white/50">아이템 관리</p>
          </Link>
          <Link href="/drops" className="bg-white rounded-2xl border border-black/6 p-4 flex flex-col gap-2">
            <span className="text-2xl">📍</span>
            <p className="font-black text-[#111111]">드랍</p>
            <p className="text-xs text-[#AAAAAA]">장소에서 드랍·픽업</p>
          </Link>
          <Link href="/combine" className="bg-[#AEEA00] rounded-2xl p-4 flex flex-col gap-2">
            <span className="text-2xl">⚗️</span>
            <p className="font-black text-[#111111]">조합</p>
            <p className="text-xs text-[#444444]">아이템 합성하기</p>
          </Link>
        </div>
      </section>
    </div>
  )
}
