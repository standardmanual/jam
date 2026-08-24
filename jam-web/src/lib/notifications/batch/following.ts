/**
 * ⑥ 팔로우한 사람의 활동 — #29·#30·#31·#32 (티켓 20260825_002)
 * 스펙: PRD §3 ⑥, §4-2, §9
 *
 * ## 왜 배치인가
 *
 * 1. 인라인이면 팔로워 500명인 유저가 배지 하나 딸 때마다 500행이 즉시 생긴다.
 * 2. **하루 상한 2건을 구현할 수 없다.** 인라인은 이미 넣은 걸 취소해야 하지만, 배치는
 *    "지난 24시간 이벤트 중 상위 2건만 선별"이 자연스럽다.
 *
 * ## 상한 2건의 선별 기준 — 희귀도 단독 (PRD §9)
 *
 * 친밀도 지표가 아직 없어 **희귀도만** 쓴다. 다만 #30·#31·#32는 희귀도 축이 없으므로
 * "얻기 어려운 순"으로 고정 우선순위를 준다(컬렉션 완성 > 미션 완료 > 근처 드랍).
 * 동순위는 최근 이벤트 우선. 친밀도 지표가 생기면 PRD §9에 따라 재검토한다.
 */
import { scopedGroupKey } from '@/lib/notifications/groupKey'
import type { BadgeRarity } from '@/types/database'
import {
  FOLLOWING_WINDOW_MS,
  fetchAllRows,
  type BatchContext,
  type NotificationDraft,
} from './shared'

/** PRD §3 ⑥ — 이 카테고리 전체에 걸리는 하루 상한 */
export const FOLLOWING_DAILY_CAP = 2

/** ⑥ 안에서만 쓰는 정렬 우선순위 (낮을수록 먼저). PRD §9의 "희귀도 단독" 해석 */
const FOLLOWING_PRIORITY = {
  mythic: 0,
  legend: 1,
  collection: 2,
  mission: 3,
  drop: 4,
} as const

export type FollowingCandidate =
  | {
      kind: 'rare_badge'
      recipientId: string
      actorId: string
      at: string
      priority: number
      badgeId: string
      badgeName: string
      rarity: BadgeRarity
    }
  | {
      kind: 'collection'
      recipientId: string
      actorId: string
      at: string
      priority: number
      itemBookId: string
      bookName: string
    }
  | {
      kind: 'mission'
      recipientId: string
      actorId: string
      at: string
      priority: number
      missionId: string
      missionTitle: string
      /** 같은 미션을 완료한 팔로잉 전원 (묶음 — "예린님 외 2명") */
      actorIds: string[]
    }
  | {
      kind: 'drop'
      recipientId: string
      actorId: string
      at: string
      priority: number
      poiId: string
      region: string
    }

/**
 * 후보 → 초안. **수신자별 하루 상한 2건**을 여기서 자른다 (순수 함수 — 테스트 대상).
 */
export function selectFollowingDrafts(
  candidates: FollowingCandidate[],
  today: string
): NotificationDraft[] {
  const byRecipient = new Map<string, FollowingCandidate[]>()
  for (const c of candidates) {
    const list = byRecipient.get(c.recipientId) ?? []
    list.push(c)
    byRecipient.set(c.recipientId, list)
  }

  const drafts: NotificationDraft[] = []
  for (const [, list] of byRecipient) {
    list.sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : b.at.localeCompare(a.at)))
    for (const c of list.slice(0, FOLLOWING_DAILY_CAP)) {
      drafts.push(toDraft(c, today))
    }
  }
  return drafts
}

function toDraft(c: FollowingCandidate, today: string): NotificationDraft {
  switch (c.kind) {
    case 'rare_badge':
      return {
        userId: c.recipientId,
        type: 'following_rare_badge',
        actorUserId: c.actorId,
        payload: { badge_id: c.badgeId, badge_name: c.badgeName, rarity: c.rarity },
        groupKey: scopedGroupKey('following_rare_badge', c.badgeId, c.actorId),
        mode: 'once',
      }
    case 'collection':
      return {
        userId: c.recipientId,
        type: 'following_collection_complete',
        actorUserId: c.actorId,
        payload: { item_book_id: c.itemBookId, book_name: c.bookName },
        groupKey: scopedGroupKey('following_collection_complete', c.itemBookId, c.actorId),
        mode: 'once',
      }
    case 'mission':
      return {
        userId: c.recipientId,
        type: 'following_mission_complete',
        actorUserId: c.actorId,
        // actor_ids는 "예린님 외 2명"의 근거다 (DATA_MODEL §4-1). 배치가 24시간 창을 한 번에
        // 계산하므로 여기서 이미 완성된 목록을 넘긴다 — RPC의 append는 재실행 시 중복 제거용.
        payload: { mission_id: c.missionId, mission_title: c.missionTitle, actor_ids: c.actorIds },
        groupKey: scopedGroupKey('following_mission_complete', c.missionId, today),
        mode: 'once',
        appendKeys: ['actor_ids'],
      }
    case 'drop':
      return {
        userId: c.recipientId,
        type: 'following_nearby_drop',
        actorUserId: c.actorId,
        payload: { poi_id: c.poiId, region: c.region },
        groupKey: scopedGroupKey('following_nearby_drop', today),
        mode: 'once',
      }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB 로더
// ─────────────────────────────────────────────────────────────────────────────

export async function buildFollowingDrafts(ctx: BatchContext): Promise<NotificationDraft[]> {
  const { supabase, startedAt, today } = ctx
  const since = new Date(startedAt.getTime() - FOLLOWING_WINDOW_MS).toISOString()

  const follows = await fetchAllRows<{ follower_id: string; following_id: string }>(
    'user_follows',
    (from, to) => supabase.from('user_follows').select('follower_id, following_id').range(from, to)
  )
  if (follows.length === 0) return []

  /** 행위자 → 그 사람을 팔로우하는 사람들 */
  const followersOf = new Map<string, string[]>()
  for (const f of follows) {
    const list = followersOf.get(f.following_id) ?? []
    list.push(f.follower_id)
    followersOf.set(f.following_id, list)
  }

  // 지난 24시간 이벤트만 조회한다(배지 전체를 훑고 거르는 것보다 훨씬 싸다)
  const [activityBadges, invItems, bookCompletions, missionCompletions, userDrops] = await Promise.all([
    fetchAllRows<{ user_id: string; badge_id: string; earned_at: string }>(
      'user_activity_badges(24h)',
      (from, to) =>
        supabase
          .from('user_activity_badges')
          .select('user_id, badge_id, earned_at')
          .gte('earned_at', since)
          .range(from, to)
    ),
    fetchAllRows<{ inventory_id: string; badge_id: string; obtained_at: string }>(
      'inventory_items(24h)',
      (from, to) =>
        supabase
          .from('inventory_items')
          .select('inventory_id, badge_id, obtained_at')
          .gte('obtained_at', since)
          .is('dropped_at', null)
          .range(from, to)
    ),
    fetchAllRows<{ user_id: string; item_book_id: string; completed_at: string }>(
      'user_item_book_completions(24h)',
      (from, to) =>
        supabase
          .from('user_item_book_completions')
          .select('user_id, item_book_id, completed_at')
          .gte('completed_at', since)
          .range(from, to)
    ),
    fetchAllRows<{ user_id: string; mission_id: string; completed_at: string }>(
      'user_mission_completions(24h)',
      (from, to) =>
        supabase
          .from('user_mission_completions')
          .select('user_id, mission_id, completed_at')
          .gte('completed_at', since)
          .range(from, to)
    ),
    fetchAllRows<{ dropper_user_id: string | null; poi_id: string; dropped_at: string }>(
      'poi_drops(24h, user)',
      (from, to) =>
        supabase
          .from('poi_drops')
          .select('dropper_user_id, poi_id, dropped_at')
          .eq('source', 'user')
          .gte('dropped_at', since)
          .not('dropper_user_id', 'is', null)
          .range(from, to)
    ),
  ])

  const candidates: FollowingCandidate[] = []

  // ── #29 팔로잉 희귀 배지 — legend/mythic만 ─────────────────────────────────
  const badgeIds = [
    ...new Set([...activityBadges.map((b) => b.badge_id), ...invItems.map((i) => i.badge_id)]),
  ]
  if (badgeIds.length > 0) {
    const badges = await fetchAllRows<{ id: string; name: string; rarity: BadgeRarity }>(
      'badges(rare)',
      (from, to) =>
        supabase
          .from('badges')
          .select('id, name, rarity')
          .in('id', badgeIds)
          .in('rarity', ['legend', 'mythic'])
          .is('deleted_at', null)
          .range(from, to)
    )
    const rareById = new Map(badges.map((b) => [b.id, b]))

    // 아이템 배지는 inventory → user 매핑이 필요하다
    const invIds = [...new Set(invItems.map((i) => i.inventory_id))]
    const inventories =
      invIds.length > 0 && rareById.size > 0
        ? await fetchAllRows<{ id: string; user_id: string }>('inventory(owner)', (from, to) =>
            supabase.from('inventory').select('id, user_id').in('id', invIds).range(from, to)
          )
        : []
    const userByInventory = new Map(inventories.map((i) => [i.id, i.user_id]))

    const earned: { userId: string; badgeId: string; at: string }[] = [
      ...activityBadges.map((b) => ({ userId: b.user_id, badgeId: b.badge_id, at: b.earned_at })),
      ...invItems
        .map((i) => ({
          userId: userByInventory.get(i.inventory_id) ?? '',
          badgeId: i.badge_id,
          at: i.obtained_at,
        }))
        .filter((e) => e.userId !== ''),
    ]

    for (const e of earned) {
      const badge = rareById.get(e.badgeId)
      if (!badge) continue
      for (const recipientId of followersOf.get(e.userId) ?? []) {
        if (recipientId === e.userId) continue
        candidates.push({
          kind: 'rare_badge',
          recipientId,
          actorId: e.userId,
          at: e.at,
          priority: badge.rarity === 'mythic' ? FOLLOWING_PRIORITY.mythic : FOLLOWING_PRIORITY.legend,
          badgeId: badge.id,
          badgeName: badge.name,
          rarity: badge.rarity,
        })
      }
    }
  }

  // ── #30 팔로잉 컬렉션 완성 ────────────────────────────────────────────────
  if (bookCompletions.length > 0) {
    const bookIds = [...new Set(bookCompletions.map((c) => c.item_book_id))]
    const books = await fetchAllRows<{ id: string; name: string }>('item_books(complete)', (from, to) =>
      supabase.from('item_books').select('id, name').in('id', bookIds).range(from, to)
    )
    const nameById = new Map(books.map((b) => [b.id, b.name]))
    for (const c of bookCompletions) {
      const bookName = nameById.get(c.item_book_id)
      if (!bookName) continue
      for (const recipientId of followersOf.get(c.user_id) ?? []) {
        if (recipientId === c.user_id) continue
        candidates.push({
          kind: 'collection',
          recipientId,
          actorId: c.user_id,
          at: c.completed_at,
          priority: FOLLOWING_PRIORITY.collection,
          itemBookId: c.item_book_id,
          bookName,
        })
      }
    }
  }

  // ── #31 팔로잉 미션 완료 (묶음) ───────────────────────────────────────────
  if (missionCompletions.length > 0) {
    const missionIds = [...new Set(missionCompletions.map((c) => c.mission_id))]
    const missions = await fetchAllRows<{ id: string; title: string }>('missions(complete)', (from, to) =>
      supabase.from('missions').select('id, title').in('id', missionIds).range(from, to)
    )
    const titleById = new Map(missions.map((m) => [m.id, m.title]))

    /** `{recipient}:{mission}` → 완료한 팔로잉들 */
    const grouped = new Map<string, { recipientId: string; missionId: string; actors: { id: string; at: string }[] }>()
    for (const c of missionCompletions) {
      if (!titleById.has(c.mission_id)) continue
      for (const recipientId of followersOf.get(c.user_id) ?? []) {
        if (recipientId === c.user_id) continue
        const key = `${recipientId}:${c.mission_id}`
        const entry = grouped.get(key) ?? { recipientId, missionId: c.mission_id, actors: [] }
        entry.actors.push({ id: c.user_id, at: c.completed_at })
        grouped.set(key, entry)
      }
    }

    for (const entry of grouped.values()) {
      // 최근 완료자를 대표(아바타)로 — DATA_MODEL §4-2의 "가장 최근 행위자" 규칙과 같다
      const sorted = [...entry.actors].sort((a, b) => b.at.localeCompare(a.at))
      candidates.push({
        kind: 'mission',
        recipientId: entry.recipientId,
        actorId: sorted[0].id,
        at: sorted[0].at,
        priority: FOLLOWING_PRIORITY.mission,
        missionId: entry.missionId,
        missionTitle: titleById.get(entry.missionId) ?? '',
        actorIds: [...new Set(sorted.map((a) => a.id))],
      })
    }
  }

  // ── #32 팔로잉 근처 드랍 — users.region 문자열 일치 ────────────────────────
  if (userDrops.length > 0) {
    const users = await fetchAllRows<{ id: string; region: string | null }>('users(region)', (from, to) =>
      supabase.from('users').select('id, region').range(from, to)
    )
    const regionOf = new Map(users.map((u) => [u.id, (u.region ?? '').trim()]))

    for (const drop of userDrops) {
      const actorId = drop.dropper_user_id
      if (!actorId) continue
      const actorRegion = regionOf.get(actorId) ?? ''
      // region이 비어 있으면 매칭하지 않는다. 빈 문자열끼리 "일치"로 보면 지역을 설정하지
      // 않은 유저 전원이 서로의 드랍 소식을 받게 된다(users.region 기본값이 '')
      if (actorRegion === '') continue
      for (const recipientId of followersOf.get(actorId) ?? []) {
        if (recipientId === actorId) continue
        if ((regionOf.get(recipientId) ?? '') !== actorRegion) continue
        candidates.push({
          kind: 'drop',
          recipientId,
          actorId,
          at: drop.dropped_at,
          priority: FOLLOWING_PRIORITY.drop,
          poiId: drop.poi_id,
          region: actorRegion,
        })
      }
    }
  }

  return selectFollowingDrafts(candidates, today)
}
