import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserRow, StravaConnectionRow, ActivityFeedRow } from '@/types/database'
import ProfileClient from '../profile/ProfileClient'
import { hydrateFeedBadgeInfo } from '@/lib/activity-feed/hydrate'
import { getWallet } from '@/lib/points'

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
    .select('*')
    .eq('username', username.toLowerCase())
    .maybeSingle()

  if (!targetRaw) notFound()
  const target = targetRaw as UserRow
  const subjectId = target.id
  const isOwnProfile = target.id === user.id

  // 잼 포인트 잔액 — 본인 프로필에서만 노출(이메일과 같은 급의 비공개 정보).
  // 타인 프로필 조회 시엔 조회조차 하지 않는다.
  const pointBalance = isOwnProfile ? await getWallet(user.id) : null

  // ─── 통계 (팔로워/팔로잉/뱃지 + isFollowing) ──────────────────
  const [
    followerCountResult,
    followingCountResult,
    badgeCountResult,
    isFollowingResult,
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', subjectId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', subjectId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('user_activity_badges').select('*', { count: 'exact', head: true }).eq('user_id', subjectId),
    isOwnProfile
      ? Promise.resolve({ data: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : (service as any).from('user_follows').select('id').eq('follower_id', user.id).eq('following_id', subjectId).maybeSingle(),
  ])

  const followerCount = followerCountResult.count ?? 0
  const followingCount = followingCountResult.count ?? 0
  const badgeCount = badgeCountResult.count ?? 0
  const isFollowing = !!isFollowingResult.data

  // ─── 프로필 / Strava / 피드 (대상 유저 기준) ──────────────────────────
  const [stravaResult, feedResult, invResult] = await Promise.all([
    service.from('strava_connections').select('*').eq('user_id', subjectId).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('user_activity_feed').select('*').eq('user_id', subjectId).order('event_at', { ascending: false }).limit(150),
    service.from('inventory').select('id').eq('user_id', subjectId).maybeSingle(),
  ])

  const inventoryId = (invResult.data as { id: string } | null)?.id

  // 발견한 아이템북 수 = 인벤에 "현재 보유 중인"(드랍하지 않은) 아이템 배지가 연결된, 활성 상태인 아이템북 수
  // (/api/users/[username]/itembooks의 목록 필터와 반드시 일치시켜야 함 — 안 그러면 숫자와 목록이 어긋남)
  let itemBookCount = 0
  if (inventoryId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invItemsForCount } = await (service as any)
      .from('inventory_items')
      .select('badge_id')
      .eq('inventory_id', inventoryId)
      .is('dropped_at', null)
    const ownedBadgeIds = [...new Set(((invItemsForCount ?? []) as { badge_id: string }[]).map((i) => i.badge_id))]
    if (ownedBadgeIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: booksForCount } = await (service as any)
        .from('badges')
        .select('item_book_id')
        .in('id', ownedBadgeIds)
        .eq('type', 'item')
        .not('item_book_id', 'is', null)
      const bookIdsForCount = [...new Set(((booksForCount ?? []) as { item_book_id: string }[]).map((b) => b.item_book_id))]
      if (bookIdsForCount.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count } = await (service as any)
          .from('item_books')
          .select('*', { count: 'exact', head: true })
          .in('id', bookIdsForCount)
          .eq('is_active', true)
        itemBookCount = count ?? 0
      }
    }
  }

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
      .eq('user_id', subjectId)
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
      .eq('dropper_user_id', subjectId)
      .order('dropped_at', { ascending: false })
      .limit(50),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('poi_drops')
      .select('id, badge_id, picked_up_at, dropper_user_id, poi(name), badges(id, name, image_url, rarity)')
      .eq('picked_up_by', subjectId)
      .not('picked_up_at', 'is', null)
      .order('picked_up_at', { ascending: false })
      .limit(50),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_mission_completions')
      .select('id, mission_id, completed_at, missions(title, reward_type, reward_points)')
      .eq('user_id', subjectId)
      .order('completed_at', { ascending: false })
      .limit(50),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_mission_participations')
      .select('mission_id, joined_at, missions(title)')
      .eq('user_id', subjectId)
      .order('joined_at', { ascending: false })
      .limit(50),
  ])

  // 기록 시점 스냅샷(이름·이미지·등급)을 최신 배지 정보로 리프레시 — 피드가 항상
  // 옛 데이터를 보여주는 문제의 근본 해결 (src/lib/activity-feed/hydrate.ts 참고)
  const feedItems = await hydrateFeedBadgeInfo((feedResult.data ?? []) as ActivityFeedRow[])
  const feedBadgeIds = new Set(feedItems.filter(f => f.event_type === 'badge_earned').map(f => (f.metadata as Record<string, string>).badge_id))
  const feedActivityDropIds = new Set(feedItems.filter(f => f.event_type === 'item_dropped').map(f => (f.metadata as Record<string, string>).badge_id))
  const feedPickupDropIds = new Set(feedItems.filter(f => f.event_type === 'item_picked_up').map(f => String((f.metadata as Record<string, unknown>).poi_drop_id ?? '')))
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

  const allItems = [...feedItems, ...legacyItems]
  allItems.sort((a, b) => new Date(b.event_at).getTime() - new Date(a.event_at).getTime())

  return (
    <ProfileClient
      profile={target as UserRow}
      strava={stravaResult.data as StravaConnectionRow | null}
      feedItems={allItems.slice(0, 200)}
      isOwnProfile={isOwnProfile}
      isFollowing={isFollowing}
      targetUserId={target.id}
      followerCount={followerCount}
      followingCount={followingCount}
      badgeCount={badgeCount}
      itemBookCount={itemBookCount}
      username={target.username ?? username}
      currentUserId={user.id}
      pointBalance={pointBalance}
    />
  )
}
