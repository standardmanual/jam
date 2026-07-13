import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserRow, StravaConnectionRow, ActivityFeedRow } from '@/types/database'
import ProfileClient from './ProfileClient'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFeedItem(id: string, event_type: ActivityFeedRow['event_type'], event_at: string, metadata: Record<string, any>): ActivityFeedRow {
  return { id, user_id: '', event_type, event_at, metadata }
}

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  // 기본 정보 + feed + inventory id 병렬 조회
  const [profileResult, stravaResult, feedResult, invResult] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase.from('strava_connections').select('*').eq('user_id', user.id).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('user_activity_feed').select('*').eq('user_id', user.id).order('event_at', { ascending: false }).limit(150),
    service.from('inventory').select('id').eq('user_id', user.id).maybeSingle(),
  ])

  const inventoryId = (invResult.data as { id: string } | null)?.id

  // 과거 데이터 병렬 조회 (레거시 테이블)
  const [
    badgesHistoryResult,
    actDropsResult,
    poiDropsResult,
    pickupsResult,
    completionsResult,
    participationsResult,
  ] = await Promise.all([
    // 배지 획득 이력
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_activity_badges')
      .select('badge_id, earned_at, badges(id, name, image_url, rarity)')
      .eq('user_id', user.id)
      .order('earned_at', { ascending: false })
      .limit(100),

    // 활동 기반 아이템 드랍 (인벤토리 obtained_by=drop)
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

    // POI 드랍 (유저가 POI에 드랍한 것)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('poi_drops')
      .select('id, badge_id, dropped_at, poi(name), badges(id, name, image_url, rarity)')
      .eq('dropper_user_id', user.id)
      .order('dropped_at', { ascending: false })
      .limit(50),

    // POI 픽업 (유저가 픽업한 것)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('poi_drops')
      .select('id, badge_id, picked_up_at, dropper_user_id, poi(name), badges(id, name, image_url, rarity)')
      .eq('picked_up_by', user.id)
      .not('picked_up_at', 'is', null)
      .order('picked_up_at', { ascending: false })
      .limit(50),

    // 미션 완료 이력
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_mission_completions')
      .select('id, mission_id, completed_at, missions(title, reward_type, reward_points)')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(50),

    // 미션 참가 이력
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_mission_participations')
      .select('mission_id, joined_at, missions(title)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })
      .limit(50),
  ])

  // feed 테이블에 이미 있는 badge_id / mission_id 집합 (중복 방지)
  const feedItems = (feedResult.data ?? []) as ActivityFeedRow[]
  const feedBadgeIds = new Set(
    feedItems.filter(f => f.event_type === 'badge_earned').map(f => (f.metadata as Record<string, string>).badge_id)
  )
  const feedActivityDropIds = new Set(
    feedItems.filter(f => f.event_type === 'item_dropped').map(f => (f.metadata as Record<string, string>).badge_id)
  )
  const feedPickupDropIds = new Set<string>() // drop_id 기준 dedup 불가 — 날짜로 처리
  const feedMissionCompleted = new Set(
    feedItems.filter(f => f.event_type === 'mission_completed').map(f => (f.metadata as Record<string, string>).mission_id)
  )
  const feedMissionJoined = new Set(
    feedItems.filter(f => f.event_type === 'mission_joined').map(f => (f.metadata as Record<string, string>).mission_id)
  )

  const legacyItems: ActivityFeedRow[] = []

  // 배지 획득 (feed에 없는 것만)
  for (const row of badgesHistoryResult.data ?? []) {
    if (feedBadgeIds.has(row.badge_id)) continue
    const b = row.badges as { id: string; name: string; image_url: string; rarity: string } | null
    if (!b) continue
    legacyItems.push(makeFeedItem(
      `legacy_badge_${row.badge_id}`,
      'badge_earned',
      row.earned_at,
      { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity }
    ))
  }

  // 활동 드랍 (아직 feed에 badge_id가 없는 것만 — 다수 드랍 가능하므로 id 기준)
  const feedDropItemIds = new Set(
    feedItems.filter(f => f.event_type === 'item_dropped').map(f => String((f.metadata as Record<string, unknown>).__legacy_item_id ?? ''))
  )
  for (const row of actDropsResult.data ?? []) {
    const legacyId = `legacy_actdrop_${row.id}`
    if (feedDropItemIds.has(row.id)) continue
    const b = row.badges as { id: string; name: string; image_url: string; rarity: string } | null
    if (!b) continue
    legacyItems.push(makeFeedItem(
      legacyId,
      'item_dropped',
      row.obtained_at,
      { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity, poi_name: '' }
    ))
  }

  // POI 드랍
  for (const row of poiDropsResult.data ?? []) {
    const legacyId = `legacy_poidrop_${row.id}`
    if (feedActivityDropIds.has(row.badge_id)) {
      // feed에 같은 badge_id로 item_dropped가 있으면 스킵하지 않음 (POI드랍은 별도)
    }
    const b = row.badges as { id: string; name: string; image_url: string; rarity: string } | null
    const poiName = (row.poi as { name: string } | null)?.name ?? ''
    if (!b) continue
    legacyItems.push(makeFeedItem(
      legacyId,
      'item_dropped',
      row.dropped_at,
      { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity, poi_name: poiName }
    ))
  }

  // POI 픽업
  for (const row of pickupsResult.data ?? []) {
    const legacyId = `legacy_pickup_${row.id}`
    feedPickupDropIds.add(legacyId)
    const b = row.badges as { id: string; name: string; image_url: string; rarity: string } | null
    const poiName = (row.poi as { name: string } | null)?.name ?? ''
    if (!b) continue
    legacyItems.push(makeFeedItem(
      legacyId,
      'item_picked_up',
      row.picked_up_at,
      { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity, poi_name: poiName, dropper_user_id: row.dropper_user_id }
    ))
  }

  // 미션 완료
  for (const row of completionsResult.data ?? []) {
    if (feedMissionCompleted.has(row.mission_id)) continue
    const m = row.missions as { title: string; reward_type: string; reward_points: number | null } | null
    if (!m) continue
    legacyItems.push(makeFeedItem(
      `legacy_complete_${row.id}`,
      'mission_completed',
      row.completed_at,
      { mission_id: row.mission_id, mission_title: m.title, reward_type: m.reward_type, reward_points: m.reward_points }
    ))
  }

  // 미션 참가
  for (const row of participationsResult.data ?? []) {
    if (feedMissionJoined.has(row.mission_id)) continue
    const m = row.missions as { title: string } | null
    if (!m) continue
    legacyItems.push(makeFeedItem(
      `legacy_join_${row.mission_id}`,
      'mission_joined',
      row.joined_at,
      { mission_id: row.mission_id, mission_title: m.title }
    ))
  }

  // 전체 병합 후 시간순 정렬
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
