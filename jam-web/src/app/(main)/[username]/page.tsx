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
  // 피드 테이블에 실기록이 없는 레거시 항목을 화면용으로 합성한 행이다. 실제 기록 시각이
  // 없으므로 created_at은 event_at으로 채운다 — 이 값을 읽는 화면은 없다(정렬·표시는 event_at).
  return { id, user_id: '', event_type, event_at, created_at: event_at, metadata }
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  // URL username으로 대상 유저 조회
  const { data: targetRaw } = await service
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
    service.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', subjectId),
    service.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', subjectId),
    // 소프트 삭제된 배지는 보유 개수에서 제외 (badges!inner + deleted_at 필터)
    service
      .from('user_activity_badges')
      .select('*, badges!inner(deleted_at)', { count: 'exact', head: true })
      .eq('user_id', subjectId)
      .is('badges.deleted_at', null),
    isOwnProfile
      ? Promise.resolve({ data: null })
      : service.from('user_follows').select('id').eq('follower_id', user.id).eq('following_id', subjectId).maybeSingle(),
  ])

  const followerCount = followerCountResult.count ?? 0
  const followingCount = followingCountResult.count ?? 0
  const isFollowing = !!isFollowingResult.data

  // ─── 프로필 / Strava / 피드 (대상 유저 기준) ──────────────────────────
  const [stravaResult, feedResult, invResult] = await Promise.all([
    service.from('strava_connections').select('*').eq('user_id', subjectId).maybeSingle(),
    service.from('user_activity_feed').select('*').eq('user_id', subjectId).order('event_at', { ascending: false }).limit(150),
    service.from('inventory').select('id').eq('user_id', subjectId).maybeSingle(),
  ])

  const inventoryId = (invResult.data as { id: string } | null)?.id

  // 발견한 아이템북 수 = 인벤토리에 "현재 보유 중인"(드랍하지 않은) 아이템 배지가 연결된, 활성 상태인 아이템북 수
  // (/api/users/[username]/itembooks의 목록 필터와 반드시 일치시켜야 함 — 안 그러면 숫자와 목록이 어긋남)
  let itemBookCount = 0
  if (inventoryId) {
    const { data: invItemsForCount } = await service
      .from('inventory_items')
      .select('badge_id')
      .eq('inventory_id', inventoryId)
      .is('dropped_at', null)
    const ownedBadgeIds = [...new Set(((invItemsForCount ?? []) as { badge_id: string }[]).map((i) => i.badge_id))]
    if (ownedBadgeIds.length > 0) {
      const { data: booksForCount } = await service
        .from('badges')
        .select('item_book_id')
        .in('id', ownedBadgeIds)
        .eq('type', 'item')
        .not('item_book_id', 'is', null)
      const bookIdsForCount = [...new Set(((booksForCount ?? []) as { item_book_id: string }[]).map((b) => b.item_book_id))]
      if (bookIdsForCount.length > 0) {
        const { count } = await service
          .from('item_books')
          .select('*', { count: 'exact', head: true })
          .in('id', bookIdsForCount)
          .eq('is_active', true)
        itemBookCount = count ?? 0
      }
    }
  }

  // 조건부 쿼리(inventoryId 유무)를 Promise.all 배열 안에 인라인 삼항식으로 두면
  // TS가 튜플 추론에 실패해 전체 결과 타입이 뒤섞이므로(never 오염), 변수로 분리한다.
  type LegacyActDropRow = {
    id: string
    badge_id: string
    obtained_at: string
    badges: { id: string; name: string; image_url: string; rarity: string; deleted_at: string | null } | null
  }
  const actDropsQuery: PromiseLike<{ data: LegacyActDropRow[] | null }> = inventoryId
    ? service
        .from('inventory_items')
        .select('id, badge_id, obtained_at, badges(id, name, image_url, rarity, deleted_at)')
        .eq('inventory_id', inventoryId)
        .eq('obtained_by', 'drop')
        .order('obtained_at', { ascending: false })
        .limit(100)
    : Promise.resolve({ data: [] as LegacyActDropRow[] })

  const [
    badgesHistoryResult,
    actDropsResult,
    poiDropsResult,
    pickupsResult,
    completionsResult,
    participationsResult,
    poiBadgeEarnsResult,
  ] = await Promise.all([
    service
      .from('user_activity_badges')
      .select('badge_id, earned_at, badges(id, name, image_url, rarity, deleted_at)')
      .eq('user_id', subjectId)
      .order('earned_at', { ascending: false })
      .limit(100),

    actDropsQuery,

    service
      .from('poi_drops')
      .select('id, badge_id, dropped_at, poi(name), badges(id, name, image_url, rarity, deleted_at)')
      .eq('dropper_user_id', subjectId)
      .order('dropped_at', { ascending: false })
      .limit(50),

    service
      .from('poi_drops')
      .select('id, badge_id, picked_up_at, dropper_user_id, poi(name), badges(id, name, image_url, rarity, deleted_at)')
      .eq('picked_up_by', subjectId)
      .not('picked_up_at', 'is', null)
      .order('picked_up_at', { ascending: false })
      .limit(50),

    service
      .from('user_mission_completions')
      .select('id, mission_id, completed_at, missions(title, reward_type, reward_points)')
      .eq('user_id', subjectId)
      .order('completed_at', { ascending: false })
      .limit(50),

    service
      .from('user_mission_participations')
      .select('mission_id, joined_at, missions(title)')
      .eq('user_id', subjectId)
      .order('joined_at', { ascending: false })
      .limit(50),

    // poi 타입 배지는 방문할 때마다 반복 획득되는 이력 테이블 — 오래된 것부터
    // 가져와서 아래에서 배지별 첫 등장(최초 획득 시각)만 남긴다.
    service
      .from('user_poi_badge_earns')
      .select('badge_id, earned_at, badges(id, name, image_url, rarity, deleted_at)')
      .eq('user_id', subjectId)
      .order('earned_at', { ascending: true })
      .limit(2000),
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

  // Database 타입에 이 테이블들의 Relationships가 비어 있어([] — src/types/database.ts)
  // supabase-js가 select() 내 embedded join(badges(...)/missions(...)/poi(...)) 반환 타입을
  // 추론하지 못하고 row 전체가 never로 무너진다. itembooks 페이지들과 동일하게
  // "unknown as 구체타입"으로 좁혀서 사용 (as any 대신 — 실제 필드는 select절과 일치).
  type BadgeJoin = { id: string; name: string; image_url: string; rarity: string; deleted_at: string | null } | null
  type BadgesHistoryRow = { badge_id: string; earned_at: string; badges: BadgeJoin }
  type ActDropRow = { id: string; badge_id: string; obtained_at: string; badges: BadgeJoin }
  type PoiDropRow = { id: string; badge_id: string; dropped_at: string; poi: { name: string } | null; badges: BadgeJoin }
  type PickupRow = { id: string; badge_id: string; picked_up_at: string; dropper_user_id: string; poi: { name: string } | null; badges: BadgeJoin }
  type CompletionRow = { id: string; mission_id: string; completed_at: string; missions: { title: string; reward_type: string; reward_points: number | null } | null }
  type ParticipationRow = { mission_id: string; joined_at: string; missions: { title: string } | null }
  type PoiBadgeEarnRow = { badge_id: string; earned_at: string; badges: BadgeJoin }

  // 소프트 삭제된 배지(badges.deleted_at)는 레거시 피드 재구성에서도 제외 — 서비스 화면에서 완전히 숨긴다.
  for (const row of (badgesHistoryResult.data ?? []) as unknown as BadgesHistoryRow[]) {
    if (feedBadgeIds.has(row.badge_id)) continue
    const b = row.badges
    if (!b || b.deleted_at) continue
    legacyItems.push(makeFeedItem(`legacy_badge_${row.badge_id}`, 'badge_earned', row.earned_at, { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity }))
  }

  const feedDropItemIds = new Set(feedItems.filter(f => f.event_type === 'item_dropped').map(f => String((f.metadata as Record<string, unknown>).inventory_item_id ?? '')))
  for (const row of (actDropsResult.data ?? []) as unknown as ActDropRow[]) {
    if (feedDropItemIds.has(row.id)) continue
    const b = row.badges
    if (!b || b.deleted_at) continue
    legacyItems.push(makeFeedItem(`legacy_actdrop_${row.id}`, 'item_dropped', row.obtained_at, { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity, poi_name: '' }))
  }

  for (const row of (poiDropsResult.data ?? []) as unknown as PoiDropRow[]) {
    if (feedActivityDropIds.has(row.badge_id)) { /* POI드랍은 별도 이벤트 */ }
    const b = row.badges
    const poiName = row.poi?.name ?? ''
    if (!b || b.deleted_at) continue
    legacyItems.push(makeFeedItem(`legacy_poidrop_${row.id}`, 'item_dropped', row.dropped_at, { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity, poi_name: poiName }))
  }

  for (const row of (pickupsResult.data ?? []) as unknown as PickupRow[]) {
    if (feedPickupDropIds.has(row.id)) continue
    const b = row.badges
    const poiName = row.poi?.name ?? ''
    if (!b || b.deleted_at) continue
    legacyItems.push(makeFeedItem(`legacy_pickup_${row.id}`, 'item_picked_up', row.picked_up_at, { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity, poi_name: poiName, dropper_user_id: row.dropper_user_id }))
  }

  for (const row of (completionsResult.data ?? []) as unknown as CompletionRow[]) {
    if (feedMissionCompleted.has(row.mission_id)) continue
    const m = row.missions
    if (!m) continue
    legacyItems.push(makeFeedItem(`legacy_complete_${row.id}`, 'mission_completed', row.completed_at, { mission_id: row.mission_id, mission_title: m.title, reward_type: m.reward_type, reward_points: m.reward_points }))
  }

  for (const row of (participationsResult.data ?? []) as unknown as ParticipationRow[]) {
    if (feedMissionJoined.has(row.mission_id)) continue
    const m = row.missions
    if (!m) continue
    legacyItems.push(makeFeedItem(`legacy_join_${row.mission_id}`, 'mission_joined', row.joined_at, { mission_id: row.mission_id, mission_title: m.title }))
  }

  // poi 배지 — 반복 획득 이력 중 배지별 "최초 획득"만 프로필 배지 갤러리에 노출.
  // (오래된 것부터 정렬해서 가져왔으므로, 배지당 처음 만나는 행이 최초 획득)
  const poiBadgeFirstEarn = new Map<string, { earned_at: string; badges: unknown }>()
  for (const row of (poiBadgeEarnsResult.data ?? []) as unknown as PoiBadgeEarnRow[]) {
    if (!poiBadgeFirstEarn.has(row.badge_id)) {
      poiBadgeFirstEarn.set(row.badge_id, row)
    }
  }
  for (const [badgeId, row] of poiBadgeFirstEarn) {
    // 이미 실시간 피드 이벤트로 기록된 배지(신규 로직 적용 이후 최초 획득분)는 중복 방지
    if (feedBadgeIds.has(badgeId)) continue
    const b = row.badges as { id: string; name: string; image_url: string; rarity: string; deleted_at: string | null } | null
    if (!b || b.deleted_at) continue
    legacyItems.push(makeFeedItem(`legacy_poibadge_${badgeId}`, 'badge_earned', row.earned_at, { badge_id: b.id, badge_name: b.name, badge_image_url: b.image_url, rarity: b.rarity }))
  }

  // "배지" 통계 수 = 활동 배지 보유 수 + POI 배지 고유 종류 수(반복 획득은 1개로 카운트)
  const poiBadgeCount = Array.from(poiBadgeFirstEarn.values()).filter((row) => {
    const b = row.badges as { deleted_at: string | null } | null
    return b && !b.deleted_at
  }).length
  const badgeCount = (badgeCountResult.count ?? 0) + poiBadgeCount

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
