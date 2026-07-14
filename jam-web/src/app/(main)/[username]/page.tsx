import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserRow, StravaConnectionRow, ActivityFeedRow } from '@/types/database'
import ProfileClient from '../profile/ProfileClient'

interface Props {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params
  return { title: `${username} — JAM!` }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFeedItem(id: string, event_type: ActivityFeedRow['event_type'], event_at: string, metadata: Record<string, any>): ActivityFeedRow {
  return { id, user_id: '', event_type, event_at, metadata }
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  // URL username으로 대상 유저 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: targetRaw } = await (service as any)
    .from('users')
    .select('id, username, avatar_url, created_at')
    .eq('username', username.toLowerCase())
    .maybeSingle()

  if (!targetRaw) notFound()
  const target = targetRaw as { id: string; username: string | null; avatar_url: string | null; created_at: string }

  // ─── 타인 프로필: 간소 뷰 ───────────────────────────────────────────
  if (target.id !== user.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: badgesRaw } = await (service as any)
      .from('user_activity_badges')
      .select('earned_at, badges(id, name, image_url, rarity)')
      .eq('user_id', target.id)
      .order('earned_at', { ascending: false })
      .limit(60)

    type BadgeRef = { id: string; name: string; image_url: string | null; rarity: string }
    type BadgeRow = { earned_at: string; badges: BadgeRef | null }

    const badges = ((badgesRaw ?? []) as BadgeRow[])
      .map((row) => ({ earned_at: row.earned_at, badge: row.badges }))
      .filter((r): r is { earned_at: string; badge: BadgeRef } => r.badge !== null)

    return (
      <div className="min-h-full bg-jam-cream px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-24">
        <div className="flex flex-col items-center text-center mb-8 pt-4">
          <div className="w-24 h-24 rounded-full overflow-hidden border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616] mb-4 bg-white flex items-center justify-center">
            {target.avatar_url ? (
              <Image src={target.avatar_url} alt={target.username ?? username} width={96} height={96} className="object-cover w-full h-full" />
            ) : (
              <span className="text-4xl">👤</span>
            )}
          </div>
          <h1 className="text-2xl font-black text-jam-ink">{target.username}</h1>
          <p className="text-jam-ink/40 text-xs font-semibold mt-1">
            {new Date(target.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })} 가입
          </p>
          <div className="flex gap-6 mt-4">
            <div className="text-center">
              <p className="text-2xl font-black text-jam-ink">{badges.length}</p>
              <p className="text-xs text-jam-ink/50 font-bold">획득 배지</p>
            </div>
          </div>
        </div>

        <div className="border-t-[2px] border-jam-ink/10 mb-6" />

        {badges.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-3">🏅</span>
            <p className="text-jam-ink/50 font-bold text-sm">아직 획득한 배지가 없어요</p>
          </div>
        ) : (
          <>
            <p className="text-[10px] font-black text-jam-ink/40 uppercase tracking-widest mb-3">획득 배지</p>
            <div className="grid grid-cols-3 gap-3">
              {badges.map((r: { earned_at: string; badge: BadgeRef }, i: number) => {
                const b = r.badge
                return (
                  <Link
                    key={`${b.id}-${i}`}
                    href={`/badges/${b.id}`}
                    className="flex flex-col items-center bg-white border-[2px] border-jam-ink/20 rounded-2xl p-3 gap-2 active:scale-95 transition-transform"
                  >
                    <div className="w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center bg-jam-cream">
                      {b.image_url ? (
                        <Image src={b.image_url} alt={b.name} width={80} height={80} className="object-contain w-full h-full p-1" />
                      ) : (
                        <span className="text-3xl">🏅</span>
                      )}
                    </div>
                    <p className="text-[11px] text-jam-ink text-center leading-tight line-clamp-2 font-bold w-full">{b.name}</p>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  // ─── 본인 프로필: 기존 ProfileClient 전체 ────────────────────────────
  const [profileResult, stravaResult, feedResult, invResult] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase.from('strava_connections').select('*').eq('user_id', user.id).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('user_activity_feed').select('*').eq('user_id', user.id).order('event_at', { ascending: false }).limit(150),
    service.from('inventory').select('id').eq('user_id', user.id).maybeSingle(),
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
      .eq('user_id', user.id)
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
      .eq('dropper_user_id', user.id)
      .order('dropped_at', { ascending: false })
      .limit(50),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('poi_drops')
      .select('id, badge_id, picked_up_at, dropper_user_id, poi(name), badges(id, name, image_url, rarity)')
      .eq('picked_up_by', user.id)
      .not('picked_up_at', 'is', null)
      .order('picked_up_at', { ascending: false })
      .limit(50),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_mission_completions')
      .select('id, mission_id, completed_at, missions(title, reward_type, reward_points)')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(50),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_mission_participations')
      .select('mission_id, joined_at, missions(title)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })
      .limit(50),
  ])

  const feedItems = (feedResult.data ?? []) as ActivityFeedRow[]
  const feedBadgeIds = new Set(feedItems.filter(f => f.event_type === 'badge_earned').map(f => (f.metadata as Record<string, string>).badge_id))
  const feedActivityDropIds = new Set(feedItems.filter(f => f.event_type === 'item_dropped').map(f => (f.metadata as Record<string, string>).badge_id))
  const feedPickupDropIds = new Set<string>()
  const feedMissionCompleted = new Set(feedItems.filter(f => f.event_type === 'mission_completed').map(f => (f.metadata as Record<string, string>).mission_id))
  const feedMissionJoined = new Set(feedItems.filter(f => f.event_type === 'mission_joined').map(f => (f.metadata as Record<string, string>).mission_id))

  const legacyItems: ActivityFeedRow[] = []

  for (const row of badgesHistoryResult.data ?? []) {
    if (feedBadgeIds.has(row.badge_id)) continue
    const b = row.badges as { id: string; name: string; image_url: string; rarity: string } | null
    if (!b) continue
    legacyItems.push(makeFeedItem(`legacy_badge_${row.badge_id}`, 'badge_earned', row.earned_at, { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity }))
  }

  const feedDropItemIds = new Set(feedItems.filter(f => f.event_type === 'item_dropped').map(f => String((f.metadata as Record<string, unknown>).__legacy_item_id ?? '')))
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

  for (const row of pickupsResult.data ?? []) {
    feedPickupDropIds.add(`legacy_pickup_${row.id}`)
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

  const allItems = [...feedItems, ...legacyItems]
  allItems.sort((a, b) => new Date(b.event_at).getTime() - new Date(a.event_at).getTime())

  return (
    <ProfileClient
      profile={profileResult.data as UserRow | null}
      strava={stravaResult.data as StravaConnectionRow | null}
      feedItems={allItems.slice(0, 200)}
    />
  )
}
