import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ActivityFeedRow, BadgeRow, StravaConnectionRow, UserActivityBadgeRow, UserRow } from '@/types/database'
import RarityBadge from '@/components/ui/Badge'
import SyncButton from './SyncButton'
import LocalDate from '@/components/LocalDate'
import HomeFeedSection from './HomeFeedSection'
import UserSearchBar from './UserSearchBar'

interface BadgeWithEarned {
  badge: BadgeRow
  earned: UserActivityBadgeRow
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFeedItem(id: string, event_type: ActivityFeedRow['event_type'], event_at: string, metadata: Record<string, any>): ActivityFeedRow {
  return { id, user_id: '', event_type, event_at, metadata }
}


const rarityCardBg: Record<string, string> = {
  common: 'bg-white',
  rare: 'bg-jam-teal/30',
  legendary: 'bg-jam-purple/20',
  mythic: 'bg-jam-yellow/40',
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const service = createServiceClient()
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

  // ─── 피드 데이터 ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [feedResult, invResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('user_activity_feed').select('*').eq('user_id', userId).order('event_at', { ascending: false }).limit(150),
    service.from('inventory').select('id').eq('user_id', userId).maybeSingle(),
  ])

  const inventoryId = (invResult.data as { id: string } | null)?.id

  const [
    badgesHistoryResult,
    actDropsResult,
    poiDropsResult,
    pickupsResult,
    completionsResult,
    participationsResult,
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_activity_badges')
      .select('badge_id, earned_at, badges(id, name, image_url, rarity)')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false })
      .limit(100),

    inventoryId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (service as any)
          .from('inventory_items')
          .select('id, badge_id, obtained_at, badges(id, name, image_url, rarity)')
          .eq('inventory_id', inventoryId)
          .eq('obtained_by', 'drop')
          .order('obtained_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('poi_drops')
      .select('id, badge_id, dropped_at, poi(name), badges(id, name, image_url, rarity)')
      .eq('dropper_user_id', userId)
      .order('dropped_at', { ascending: false })
      .limit(50),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('poi_drops')
      .select('id, badge_id, picked_up_at, dropper_user_id, poi(name), badges(id, name, image_url, rarity)')
      .eq('picked_up_by', userId)
      .not('picked_up_at', 'is', null)
      .order('picked_up_at', { ascending: false })
      .limit(50),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_mission_completions')
      .select('id, mission_id, completed_at, missions(title, reward_type, reward_points)')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(50),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_mission_participations')
      .select('mission_id, joined_at, missions(title)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false })
      .limit(50),
  ])

  const feedItems = (feedResult.data ?? []) as ActivityFeedRow[]
  const feedBadgeIds = new Set(feedItems.filter(f => f.event_type === 'badge_earned').map(f => (f.metadata as Record<string, string>).badge_id))
  const feedActivityDropIds = new Set(feedItems.filter(f => f.event_type === 'item_dropped').map(f => (f.metadata as Record<string, string>).badge_id))
  const feedMissionCompleted = new Set(feedItems.filter(f => f.event_type === 'mission_completed').map(f => (f.metadata as Record<string, string>).mission_id))
  const feedMissionJoined = new Set(feedItems.filter(f => f.event_type === 'mission_joined').map(f => (f.metadata as Record<string, string>).mission_id))

  const legacyItems: ActivityFeedRow[] = []

  for (const row of badgesHistoryResult.data ?? []) {
    if (feedBadgeIds.has(row.badge_id)) continue
    const b = row.badges as { id: string; name: string; image_url: string; rarity: string } | null
    if (!b) continue
    legacyItems.push(makeFeedItem(`legacy_badge_${row.badge_id}`, 'badge_earned', row.earned_at, { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity }))
  }

  const feedDropItemIds = new Set(feedItems.filter(f => f.event_type === 'item_dropped').map(f => String((f.metadata as Record<string, unknown>).inventory_item_id ?? '')))
  for (const row of actDropsResult.data ?? []) {
    if (feedDropItemIds.has(row.id)) continue
    const b = row.badges as { id: string; name: string; image_url: string; rarity: string } | null
    if (!b) continue
    legacyItems.push(makeFeedItem(`legacy_actdrop_${row.id}`, 'item_dropped', row.obtained_at, { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity, poi_name: '' }))
  }

  for (const row of poiDropsResult.data ?? []) {
    if (feedActivityDropIds.has(row.badge_id)) { /* POI드랍은 별도 이벤트 */ }
    const b = row.badges as { id: string; name: string; image_url: string; rarity: string } | null
    const poiName = (row.poi as { name: string } | null)?.name ?? ''
    if (!b) continue
    legacyItems.push(makeFeedItem(`legacy_poidrop_${row.id}`, 'item_dropped', row.dropped_at, { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity, poi_name: poiName }))
  }

  const feedPickupDropIds = new Set(feedItems.filter(f => f.event_type === 'item_picked_up').map(f => String((f.metadata as Record<string, unknown>).poi_drop_id ?? '')))
  for (const row of pickupsResult.data ?? []) {
    if (feedPickupDropIds.has(row.id)) continue
    const b = row.badges as { id: string; name: string; image_url: string; rarity: string } | null
    const poiName = (row.poi as { name: string } | null)?.name ?? ''
    if (!b) continue
    legacyItems.push(makeFeedItem(`legacy_pickup_${row.id}`, 'item_picked_up', row.picked_up_at, { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity, poi_name: poiName, dropper_user_id: row.dropper_user_id }))
  }

  for (const row of completionsResult.data ?? []) {
    if (feedMissionCompleted.has(row.mission_id)) continue
    const m = row.missions as { title: string; reward_type: string; reward_points: number | null } | null
    if (!m) continue
    legacyItems.push(makeFeedItem(`legacy_complete_${row.id}`, 'mission_completed', row.completed_at, { mission_id: row.mission_id, mission_title: m.title, reward_type: m.reward_type, reward_points: m.reward_points }))
  }

  for (const row of participationsResult.data ?? []) {
    if (feedMissionJoined.has(row.mission_id)) continue
    const m = row.missions as { title: string } | null
    if (!m) continue
    legacyItems.push(makeFeedItem(`legacy_join_${row.mission_id}`, 'mission_joined', row.joined_at, { mission_id: row.mission_id, mission_title: m.title }))
  }

  const allFeedItems = [...feedItems, ...legacyItems]
  allFeedItems.sort((a, b) => new Date(b.event_at).getTime() - new Date(a.event_at).getTime())

  const displayName = userProfile?.username ?? user.email?.split('@')[0] ?? '러너'

  return (
    <div className="min-h-full bg-jam-lime px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 flex flex-col gap-6">
      {/* 헤더 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-jam-ink font-black text-2xl tracking-tighter">JAM!</span>
        </div>
        <p className="text-jam-ink/60 text-sm font-bold">안녕하세요</p>
        <h1 className="text-4xl font-black leading-tight mt-0.5 text-jam-ink">
          {displayName}
        </h1>
      </div>

      {/* Strava 상태 */}
      {stravaConnection ? (
        <div className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FC4C02] border border-jam-ink" />
              <span className="text-sm font-black text-jam-ink">Strava</span>
              {stravaConnection.last_synced_at && (
                <span className="text-xs text-jam-ink/50 font-semibold">
                  <LocalDate iso={stravaConnection.last_synced_at} options={{ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }} />
                </span>
              )}
            </div>
            <SyncButton />
          </div>
        </div>
      ) : (
        <div className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-5">
          <p className="font-black text-lg text-jam-ink mb-1">Strava 미연동</p>
          <p className="text-jam-ink/60 text-sm mb-4 font-semibold">연동하면 활동 기반 배지를 자동 획득해요</p>
          <Link
            href="/profile"
            className="inline-block bg-jam-ink text-white font-black px-5 py-2.5 rounded-xl text-sm border-[3px] border-jam-ink"
          >
            지금 연동하기 →
          </Link>
        </div>
      )}

      {/* 유저 검색 */}
      <UserSearchBar />

      {/* 최근 획득 배지 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-lg text-jam-ink">최근 배지</h2>
          <Link href="/badges" className="text-sm font-bold text-jam-ink underline">
            모두 보기 →
          </Link>
        </div>

        {badgeWithEarned.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {badgeWithEarned.map(({ badge, earned }) => (
              <Link key={earned.id} href={`/badges/${badge.id}`}>
                <div
                  className={`rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-4 aspect-square flex flex-col justify-between ${rarityCardBg[badge.rarity] ?? 'bg-white'}`}
                >
                  <div className="flex-1 flex items-center justify-center">
                    {badge.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={badge.image_url} alt={badge.name} className="w-20 h-20 object-contain" />
                    ) : (
                      <span className="text-5xl">🏅</span>
                    )}
                  </div>
                  <div>
                    <p className="font-black text-sm text-jam-ink leading-tight truncate">{badge.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <RarityBadge rarity={badge.rarity} />
                      <p className="text-[10px] text-jam-ink/50 font-semibold"><LocalDate iso={earned.earned_at} options={{ month: 'long', day: 'numeric' }} /></p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-8 text-center">
            <p className="text-jam-ink/60 text-sm font-bold">아직 획득한 배지가 없어요</p>
            <p className="text-jam-ink/40 text-xs mt-1 font-semibold">Strava 연동 후 활동하면 배지가 생겨요</p>
          </div>
        )}
      </section>

      {/* 바로가기 */}
      <section>
        <h2 className="font-black text-lg text-jam-ink mb-3">바로가기</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/missions" className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-4 flex flex-col gap-2">
            <span className="text-2xl">🎯</span>
            <p className="font-black text-jam-ink">미션</p>
            <p className="text-xs text-jam-ink/50 font-semibold">달성하고 보상 받기</p>
          </Link>
          <Link href="/inventory" className="bg-jam-ink rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_rgba(0,0,0,0.3)] p-4 flex flex-col gap-2">
            <span className="text-2xl">📦</span>
            <p className="font-black text-white">인벤토리</p>
            <p className="text-xs text-white/50 font-semibold">아이템 관리</p>
          </Link>
          <Link href="/drops" className="bg-jam-cream rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-4 flex flex-col gap-2">
            <span className="text-2xl">📍</span>
            <p className="font-black text-jam-ink">드랍</p>
            <p className="text-xs text-jam-ink/50 font-semibold">장소에서 드랍·픽업</p>
          </Link>
          <Link href="/combine" className="bg-jam-orange rounded-2xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-4 flex flex-col gap-2">
            <span className="text-2xl">⚗️</span>
            <p className="font-black text-jam-ink">조합</p>
            <p className="text-xs text-jam-ink/60 font-semibold">아이템 합성하기</p>
          </Link>
        </div>
      </section>

      {/* 피드 */}
      <HomeFeedSection feedItems={allFeedItems.slice(0, 200)} />
    </div>
  )
}
