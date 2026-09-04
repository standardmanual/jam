/**
 * ⑥ 팔로우한 사람의 활동 — #29·#30·#31 (티켓 20260825_002)
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
 * 친밀도 지표가 아직 없어 **희귀도만** 쓴다. 다만 #30·#31은 희귀도 축이 없으므로
 * "얻기 어려운 순"으로 고정 우선순위를 준다(컬렉션 완성 > 미션 완료).
 * 동순위는 최근 이벤트 우선. 친밀도 지표가 생기면 PRD §9에 따라 재검토한다.
 */
import { scopedGroupKey } from '@/lib/notifications/groupKey'
import type { BadgeRarity } from '@/types/database'
import {
  FOLLOWING_WINDOW_MS,
  fetchAllRows,
  fetchAllRowsIn,
  type BatchContext,
  type NotificationDraft,
  type StepOutput,
} from './shared'

/**
 * PRD §3 ⑥ — 이 카테고리 전체에 걸리는 하루 상한.
 *
 * **20260827_014(R15)부터 「2건」이 아니라 「사람 2명」이다.** 한 사람이 알림함 두 줄을
 * 차지하지 않고, 여러 사람의 근황이 고르게 보인다 — 이 카테고리의 목적("둘러보기")에 맞는다.
 */
export const FOLLOWING_DAILY_CAP = 2

/** ⑥ 안에서만 쓰는 정렬 우선순위 (낮을수록 먼저). PRD §9의 "희귀도 단독" 해석 */
const FOLLOWING_PRIORITY = {
  mystic: 0,
  epic: 1,
  collection: 2,
  mission: 3,
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

/** 대표 선정 정렬 — 우선순위(R8) → 최근 순. 동률은 행위자 id로 고정해 결정론을 유지한다 */
function byPriorityThenRecent(a: FollowingCandidate, b: FollowingCandidate): number {
  if (a.priority !== b.priority) return a.priority - b.priority
  const at = b.at.localeCompare(a.at)
  if (at !== 0) return at
  return a.actorId.localeCompare(b.actorId)
}

/**
 * 후보 → 초안. **사람 단위로 묶고(R15), 수신자별 하루 상한 「사람 2명」**을 여기서 자른다
 * (순수 함수 — 테스트 대상).
 *
 * 한 사람의 소식이 하루 2건 이상이면 대표 하나를 말하고 나머지는 개수로 접는다
 * ("… 소식이 1건 더 있어요"). 대표 선정은 기존 배치 우선순위를 그대로 쓴다
 * (mystic > epic > 컬렉션 완성 > 미션 완료, 동순위는 최근 순 — R8).
 */
export function selectFollowingDrafts(
  candidates: FollowingCandidate[],
  today: string
): NotificationDraft[] {
  const byRecipient = new Map<string, Map<string, FollowingCandidate[]>>()
  for (const c of candidates) {
    let byActor = byRecipient.get(c.recipientId)
    if (!byActor) {
      byActor = new Map()
      byRecipient.set(c.recipientId, byActor)
    }
    const list = byActor.get(c.actorId) ?? []
    list.push(c)
    byActor.set(c.actorId, list)
  }

  const drafts: NotificationDraft[] = []
  for (const [, byActor] of byRecipient) {
    // 사람마다 대표 하나 + 나머지 건수
    const perPerson: { rep: FollowingCandidate; more: number }[] = []
    for (const [, list] of byActor) {
      list.sort(byPriorityThenRecent)
      perPerson.push({ rep: list[0], more: list.length - 1 })
    }
    // 사람 사이의 순서도 대표의 우선순위로 정한다 — 상한이 「사람 수」라 여기서 잘린다
    perPerson.sort((a, b) => byPriorityThenRecent(a.rep, b.rep))
    for (const { rep, more } of perPerson.slice(0, FOLLOWING_DAILY_CAP)) {
      drafts.push(toDraft(rep, today, more))
    }
  }
  return drafts
}

function toDraft(c: FollowingCandidate, today: string, more = 0): NotificationDraft {
  // R15 묶음 꼬리 — 렌더러가 more_count로 "소식이 N건 더 있어요"를 붙이고 착지를
  // 그 사람 프로필로 올린다
  const moreCount = more > 0 ? { more_count: more } : {}
  switch (c.kind) {
    case 'rare_badge':
      return {
        userId: c.recipientId,
        type: 'following_rare_badge',
        actorUserId: c.actorId,
        payload: { badge_id: c.badgeId, badge_name: c.badgeName, rarity: c.rarity, ...moreCount },
        groupKey: scopedGroupKey('following_rare_badge', c.badgeId, c.actorId),
        mode: 'once',
      }
    case 'collection':
      return {
        userId: c.recipientId,
        type: 'following_collection_complete',
        actorUserId: c.actorId,
        payload: { item_book_id: c.itemBookId, book_name: c.bookName, ...moreCount },
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
        payload: {
          mission_id: c.missionId,
          mission_title: c.missionTitle,
          actor_ids: c.actorIds,
          ...moreCount,
        },
        groupKey: scopedGroupKey('following_mission_complete', c.missionId, today),
        mode: 'once',
        appendKeys: ['actor_ids'],
      }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB 로더
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `scanned`는 **지난 24시간 이벤트 행 수**다(배지·아이템·컬렉션 완성·미션 완료 합).
 * 이벤트가 있는데 초안이 0인 상태가 이어지면 팔로우 팬아웃이나 희귀도 필터가 깨진 것이다 —
 * 제거된 지역 소식이 정확히 이 패턴(입력은 있는데 매칭이 0)으로 무증상이었다.
 */
export async function buildFollowingDrafts(ctx: BatchContext): Promise<StepOutput> {
  const { supabase, startedAt, today } = ctx
  const since = new Date(startedAt.getTime() - FOLLOWING_WINDOW_MS).toISOString()

  const follows = await fetchAllRows<{ follower_id: string; following_id: string }>(
    'user_follows',
    'id',
    () => supabase.from('user_follows').select('follower_id, following_id')
  )
  if (follows.length === 0) return { drafts: [], scanned: 0 }

  /** 행위자 → 그 사람을 팔로우하는 사람들 */
  const followersOf = new Map<string, string[]>()
  for (const f of follows) {
    const list = followersOf.get(f.following_id) ?? []
    list.push(f.follower_id)
    followersOf.set(f.following_id, list)
  }

  // 지난 24시간 이벤트만 조회한다(배지 전체를 훑고 거르는 것보다 훨씬 싸다)
  const [activityBadges, invItems, bookCompletions, missionCompletions] = await Promise.all([
    fetchAllRows<{ user_id: string; badge_id: string; earned_at: string }>(
      'user_activity_badges(24h)',
      'id',
      () => supabase.from('user_activity_badges').select('user_id, badge_id, earned_at').gte('earned_at', since)
    ),
    // inventory_id는 NULL 허용이다 — 드랍/파괴로 주인이 없어진 개체(migrations/108, "주인 없음").
    // 주인이 없으면 알릴 대상도 없으므로 아래에서 걸러진다(기존 동작과 동일).
    fetchAllRows<{ inventory_id: string | null; badge_id: string; obtained_at: string }>(
      'inventory_items(24h)',
      'id',
      () =>
        supabase
          .from('inventory_items')
          .select('inventory_id, badge_id, obtained_at')
          .gte('obtained_at', since)
          .is('dropped_at', null)
    ),
    // user_item_book_completions는 복합 PK (user_id, item_book_id) — 둘 다 줘야 전순서가 잡힌다
    fetchAllRows<{ user_id: string; item_book_id: string; completed_at: string }>(
      'user_item_book_completions(24h)',
      ['user_id', 'item_book_id'],
      () =>
        supabase
          .from('user_item_book_completions')
          .select('user_id, item_book_id, completed_at')
          .gte('completed_at', since)
    ),
    fetchAllRows<{ user_id: string; mission_id: string; completed_at: string }>(
      'user_mission_completions(24h)',
      'id',
      () =>
        supabase
          .from('user_mission_completions')
          .select('user_id, mission_id, completed_at')
          .gte('completed_at', since)
    ),
  ])

  const candidates: FollowingCandidate[] = []
  const scanned =
    activityBadges.length + invItems.length + bookCompletions.length + missionCompletions.length

  // ── #29 팔로잉 희귀 배지 — epic/mystic만 ─────────────────────────────────
  const badgeIds = [
    ...new Set([...activityBadges.map((b) => b.badge_id), ...invItems.map((i) => i.badge_id)]),
  ]
  if (badgeIds.length > 0) {
    // 24시간 안에 여러 사람이 대량으로 배지를 얻으면 이 목록이 커진다 → 청크 분할
    const badges = await fetchAllRowsIn<{ id: string; name: string; rarity: BadgeRarity | null }, string>(
      'badges(rare)',
      'id',
      badgeIds,
      (chunk) =>
        supabase
          .from('badges')
          .select('id, name, rarity')
          .in('id', chunk)
          .in('rarity', ['epic', 'mystic'])
          .is('deleted_at', null)
    )
    const rareById = new Map(badges.map((b) => [b.id, b]))

    // 아이템 배지는 inventory → user 매핑이 필요하다
    const invIds = [...new Set(invItems.map((i) => i.inventory_id))].filter(
      (id): id is string => id !== null
    )
    const inventories =
      rareById.size > 0
        ? await fetchAllRowsIn<{ id: string; user_id: string }, string>(
            'inventory(owner)',
            'id',
            invIds,
            (chunk) => supabase.from('inventory').select('id, user_id').in('id', chunk)
          )
        : []
    const userByInventory = new Map(inventories.map((i) => [i.id, i.user_id]))

    const earned: { userId: string; badgeId: string; at: string }[] = [
      ...activityBadges.map((b) => ({ userId: b.user_id, badgeId: b.badge_id, at: b.earned_at })),
      ...invItems
        .map((i) => ({
          userId: (i.inventory_id ? userByInventory.get(i.inventory_id) : undefined) ?? '',
          badgeId: i.badge_id,
          at: i.obtained_at,
        }))
        .filter((e) => e.userId !== ''),
    ]

    for (const e of earned) {
      const badge = rareById.get(e.badgeId)
      if (!badge) continue
      // 아래 .in('rarity', ['epic','mystic']) 필터 때문에 실제로는 null이 올 수 없지만,
      // rarity가 nullable이 된 뒤(마이그레이션 130) 타입상 열려 있어 명시적으로 닫는다.
      if (!badge.rarity) continue
      for (const recipientId of followersOf.get(e.userId) ?? []) {
        if (recipientId === e.userId) continue
        candidates.push({
          kind: 'rare_badge',
          recipientId,
          actorId: e.userId,
          at: e.at,
          priority: badge.rarity === 'mystic' ? FOLLOWING_PRIORITY.mystic : FOLLOWING_PRIORITY.epic,
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
    const books = await fetchAllRowsIn<{ id: string; name: string }, string>(
      'item_books(complete)',
      'id',
      bookIds,
      (chunk) => supabase.from('item_books').select('id, name').in('id', chunk)
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
    const missions = await fetchAllRowsIn<{ id: string; title: string }, string>(
      'missions(complete)',
      'id',
      missionIds,
      (chunk) => supabase.from('missions').select('id, title').in('id', chunk)
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

  return { drafts: selectFollowingDrafts(candidates, today), scanned }
}
