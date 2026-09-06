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
 *
 * ## v5 — 「희귀도」가 등급만으로는 성립하지 않는다 (티켓 20260905_0038)
 *
 * 무한레벨형 배지는 `badges.rarity`가 **NULL**이다(`isLeveledBadge`). 그래서
 * `.in('rarity', ['epic','mystic'])` DB 필터에 **절대 걸리지 않았고, 레벨형 193종 26계열의
 * 획득이 팔로워에게 한 건도 알려지지 않았다**(2026-09-06 실측). 등급 축과 레벨 축을
 * 각각의 기준으로 거른다 — `FOLLOWING_LEVEL_THRESHOLD` 참조.
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

/**
 * 팔로워에게 알릴 **무한레벨형 배지의 최소 레벨** (티켓 20260905_0038 A묶음).
 *
 * ## 왜 6인가 — 카탈로그가 이미 답을 갖고 있다
 *
 * 레벨형에는 등급이 없어 「Epic 이상」을 그대로 옮길 수 없다. 그래서 **같은 종목·같은 지표의
 * 등급형 임계값과 레벨 사다리를 맞대어** 봤다(v5 카탈로그 실측, 2026-09-06):
 *
 * | 종목·지표 | 등급형 Epic | 레벨형 Lv.6 | 레벨형 Lv.7~8 |
 * |---|---|---|---|
 * | 러닝 누적 거리 | 1,100km | **1,100km** | 1,900 / 3,200km |
 * | 자전거 누적 거리 | 4,200km | **4,200km** | 8,000 / 14,000km |
 * | 걷기 누적 거리 | 250km | 210km | 330 / 550km |
 *
 * **Lv.6이 Epic과 같은 자리**이고 Lv.7 이상이 Mystic 대에 든다. 즉 「Epic·Mystic만 알린다」는
 * 기존 규칙을 레벨 축으로 옮기면 그대로 「Lv.6 이상」이 된다 — 새 정책을 발명한 것이 아니라
 * **기존 정책을 등급 없는 축으로 번역**한 값이다.
 *
 * 폭증 우려: 레벨형 193종 중 이 기준에 드는 것은 63종(33%)이고, 계열마다 한 유저가 한 번씩만
 * 오른다. 게다가 `FOLLOWING_DAILY_CAP`이 수신자당 하루 **사람 2명**으로 최종 상한을 건다.
 *
 * 사다리가 길어져도(무한레벨) 이 절대 기준은 그대로 유효하다 — 위 칸일수록 더 희소하다.
 */
export const FOLLOWING_LEVEL_THRESHOLD = 6

/** ⑥ 안에서만 쓰는 정렬 우선순위 (낮을수록 먼저). PRD §9의 "희귀도 단독" 해석 */
const FOLLOWING_PRIORITY = {
  mystic: 0,
  epic: 1,
  /**
   * 무한레벨형(등급 없음). **Epic 아래에 둔다** — 위 표가 「Lv.6 ≈ Epic」을 보이지만
   * 그건 누적 축 이야기고, 레벨형에는 Epic·Mystic이 요구하는 2단 교차 게이트가 없다.
   * 등급형과 레벨형이 같은 날 겹치면 게이트를 통과한 쪽을 먼저 말한다.
   */
  leveled: 2,
  collection: 3,
  mission: 4,
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
      /** 등급형·반복형이면 등급, **무한레벨형이면 null** */
      rarity: BadgeRarity | null
      /** 무한레벨형이면 레벨, 등급이 있으면 null (둘은 배타다 — 마이그레이션 130의 CHECK) */
      level: number | null
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
        // 레벨형은 rarity가 없다 — 없는 키를 넣지 않아 렌더러가 「등급 없음」을 그대로 읽는다
        payload: {
          badge_id: c.badgeId,
          badge_name: c.badgeName,
          ...(c.rarity ? { rarity: c.rarity } : {}),
          ...(c.level != null ? { level: c.level } : {}),
          ...moreCount,
        },
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
 * 이벤트가 있는데 초안이 0인 상태가 이어지면 팔로우 팬아웃이나 등급·레벨 필터가 깨진 것이다 —
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

  // ── #29 팔로잉 희귀 배지 — Epic·Mystic 또는 Lv.6 이상 ────────────────────
  const badgeIds = [
    ...new Set([...activityBadges.map((b) => b.badge_id), ...invItems.map((i) => i.badge_id)]),
  ]
  if (badgeIds.length > 0) {
    // 24시간 안에 여러 사람이 대량으로 배지를 얻으면 이 목록이 커진다 → 청크 분할
    const badges = await fetchAllRowsIn<
      { id: string; name: string; rarity: BadgeRarity | null; level: number | null },
      string
    >(
      'badges(notable)',
      'id',
      badgeIds,
      (chunk) =>
        supabase
          .from('badges')
          .select('id, name, rarity, level')
          .in('id', chunk)
          // 등급 축과 레벨 축을 **각각** 거른다. `.in('rarity', …)` 하나로는 rarity가 NULL인
          // 레벨형이 영원히 탈락한다(v5 193종 전부 — 티켓 20260905_0038).
          .or(`rarity.in.(epic,mystic),and(rarity.is.null,level.gte.${FOLLOWING_LEVEL_THRESHOLD})`)
          .is('deleted_at', null)
    )
    const notableById = new Map(badges.map((b) => [b.id, b]))

    // 아이템 배지는 inventory → user 매핑이 필요하다
    const invIds = [...new Set(invItems.map((i) => i.inventory_id))].filter(
      (id): id is string => id !== null
    )
    const inventories =
      notableById.size > 0
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
      const badge = notableById.get(e.badgeId)
      if (!badge) continue
      // 등급도 레벨도 없는 배지는 위 필터를 통과할 수 없다(마이그레이션 130의
      // `CHECK ((rarity IS NULL) = (level IS NOT NULL))`). 그래도 말할 수 있는 게
      // 아무것도 없으므로 명시적으로 닫는다 — 예전 주석은 「필터 때문에 null이 올 수 없다」고
      // 적혀 있었고 v5가 그 전제를 깼다(티켓 20260905_0038).
      if (!badge.rarity && badge.level == null) continue
      const priority = badge.rarity
        ? badge.rarity === 'mystic'
          ? FOLLOWING_PRIORITY.mystic
          : FOLLOWING_PRIORITY.epic
        : FOLLOWING_PRIORITY.leveled
      for (const recipientId of followersOf.get(e.userId) ?? []) {
        if (recipientId === e.userId) continue
        candidates.push({
          kind: 'rare_badge',
          recipientId,
          actorId: e.userId,
          at: e.at,
          priority,
          badgeId: badge.id,
          badgeName: badge.name,
          rarity: badge.rarity,
          level: badge.level,
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
