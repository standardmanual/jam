/**
 * JAM! 아이템 드랍 엔진 v2 (서버 사이드 전용)
 *
 * 3레이어 드랍 결정 (로직 문서: PRD/badge/BADGE_ENGINE_UNIFIED.md §3):
 *   Layer 1 — 드랍 발생: 활동당 최소 1개 확정, 변동성은 희귀도·보너스로
 *   Layer 2 — 세계관 선택: 모멘텀 50 / 인접 25 / 탐험 15 (하드캡·선택 UI 없이 가중치로만 집중)
 *   Layer 3 — 아이템북·배지 선택: 완성도 감쇠 + 완성 북 잔류 + 마지막 조각 pity
 *
 * - 인벤토리 슬롯 초과 시 드랍 안 함 ("최소 1개"의 유일한 예외)
 * - 일련번호는 DB 트리거(assign_random_serial)가 난수 부여
 * - service_role 클라이언트 사용 (RLS 우회)
 */
import { createServiceClient } from '@/lib/supabase/server'
import { recordFeedEvent } from '@/lib/activity-feed'
import type {
  BadgeRarity,
  BadgeRow,
  BadgeCondition,
  InventoryRow,
  UserDropStateRow,
} from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'
import { getAbusingPolicy } from '@/lib/abusing/policy'
import { getUserBanLevel, shouldAllowDrop } from '@/lib/abusing/shadow-ban'
import { checkCondition } from '@/lib/badge-engine/index'
import { getDropPolicy, type DropPolicy } from './policy'
import {
  rollRarityV2,
  rollBonusDrop,
  isIntenseActivity,
  isComebackActivity,
  isWeeklyFirstActivity,
  rarityFallbackOrder,
  pickFaction,
  pickBook,
  type RarityContext,
  type BookCandidate,
} from './layers'

// ────────────────────────────────────────────────────────────
// 세계관 고정 상수 (019_seed_worldview.sql 고정 UUID)
// ────────────────────────────────────────────────────────────

/** 미스터리 헌터 — legendary+ 전용 전역 스파이스 */
export const MYSTERY_FACTION_ID = '24d7af8e-a4ef-8798-a7f1-f1f2d6c9d582'
/** 작심삼일 클럽 — 신규 유저 온보딩 + 복귀 서사 */
export const RESOLUTION_FACTION_ID = 'e9e608d7-812c-4139-88c4-81d129076e3f'

/** 신규 유저 온보딩(첫 3드랍): 주 활동종목 → 세계관 매핑 */
const ONBOARDING_FACTION_BY_ACTIVITY: Record<string, string> = {
  walking: '73f0f601-2382-900c-8ca2-5cc7c93ed95d', // 숲속의 갱단
  running: 'e33307bb-5191-5ad5-58e0-053b40cb09f0', // 비트 마에스트로
  road_running: 'e33307bb-5191-5ad5-58e0-053b40cb09f0',
  cycling: '1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d', // 장비병 환자들
  hiking: '7a91727e-e2e1-b7f7-45f0-899ce04716bd', // 아스팔트 레인저
  trail_running: '7a91727e-e2e1-b7f7-45f0-899ce04716bd',
}

const ONBOARDING_DROP_COUNT = 3

// ────────────────────────────────────────────────────────────
// 조건 가드 (v1 유지)
// ────────────────────────────────────────────────────────────

/**
 * 드랍엔진은 활동 1건(또는 이번 싱크 배치)만으로 조건을 평가한다.
 * 누적/기간 집계 필드를 가진 배지는 단일 활동 시점 평가가 불가능하므로 드랍 제외.
 */
const CUMULATIVE_CONDITION_FIELDS: (keyof BadgeCondition)[] = [
  'monthly_km',
  'season_count',
  'weekly_count',
  'streak_days',
  'total_count',
]

export function hasCumulativeCondition(cond: BadgeCondition): boolean {
  return CUMULATIVE_CONDITION_FIELDS.some((f) => cond[f] !== undefined)
}

export function isDroppableForActivity(
  cond: BadgeCondition | null,
  activities: NormalizedActivity[]
): boolean {
  if (!cond || Object.keys(cond).length === 0) return true
  if (hasCumulativeCondition(cond)) return false
  return checkCondition(cond, activities)
}

// ────────────────────────────────────────────────────────────
// 드랍 구조 데이터 (활성 북·배지·보유·인접 일괄 조회)
// ────────────────────────────────────────────────────────────

type DropBadge = Pick<
  BadgeRow,
  'id' | 'name' | 'image_url' | 'rarity' | 'drop_weight' | 'valid_from' | 'valid_until' | 'condition_json' | 'item_book_id'
>

interface DropStructure {
  /** 활성 북 id → faction id */
  factionOfBook: Map<string, string>
  /** 활성 북 id → 소속 전체 배지 id 목록 (completion 계산용) */
  badgeIdsOfBook: Map<string, string[]>
  /** 유효기간 내 + 조건 통과한 드랍 후보 배지 */
  droppable: DropBadge[]
  /** 직전 드랍 세계관의 인접 세계관 id */
  adjacentFactionIds: string[]
  /** 유저 보유(인벤토리) distinct 배지 id */
  owned: Set<string>
  inventory: Pick<InventoryRow, 'id' | 'used_slots' | 'max_slots'> | null
}

async function fetchDropStructure(
  userId: string,
  lastFactionId: string | null,
  activities: NormalizedActivity[]
): Promise<DropStructure | null> {
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const [{ data: booksRaw }, { data: inventoryRaw }] = await Promise.all([
    supabase.from('item_books').select('id, faction_id').eq('is_active', true),
    supabase.from('inventory').select('id, used_slots, max_slots').eq('user_id', userId).single(),
  ])

  const books = (booksRaw ?? []) as { id: string; faction_id: string | null }[]
  if (books.length === 0) return null
  const factionOfBook = new Map<string, string>()
  for (const b of books) {
    if (b.faction_id) factionOfBook.set(b.id, b.faction_id)
  }
  const activeBookIds = [...factionOfBook.keys()]

  const [{ data: badgesRaw, error: badgesError }, adjacencyRes, ownedRes] = await Promise.all([
    supabase
      .from('badges')
      .select('id, name, image_url, rarity, drop_weight, valid_from, valid_until, condition_json, item_book_id')
      .eq('type', 'item')
      .in('item_book_id', activeBookIds),
    lastFactionId
      ? createServiceClient().from('faction_adjacency').select('adjacent_faction_id').eq('faction_id', lastFactionId)
      : Promise.resolve({ data: [] }),
    inventoryRaw
      ? createServiceClient()
          .from('inventory_items')
          .select('badge_id')
          .eq('inventory_id', (inventoryRaw as { id: string }).id)
      : Promise.resolve({ data: [] }),
  ])

  if (badgesError) {
    console.error('[tryItemDrop] 배지 조회 오류:', badgesError)
    return null
  }

  const allBadges = (badgesRaw ?? []) as DropBadge[]
  const badgeIdsOfBook = new Map<string, string[]>()
  for (const b of allBadges) {
    if (!b.item_book_id) continue
    const list = badgeIdsOfBook.get(b.item_book_id) ?? []
    list.push(b.id)
    badgeIdsOfBook.set(b.item_book_id, list)
  }

  const droppable = allBadges.filter((b) => {
    if (b.valid_from && b.valid_from > now) return false
    if (b.valid_until && b.valid_until < now) return false
    return isDroppableForActivity(b.condition_json as BadgeCondition | null, activities)
  })

  const adjacentFactionIds = (
    ((adjacencyRes as { data: { adjacent_faction_id: string }[] | null }).data ?? [])
  ).map((r) => r.adjacent_faction_id)

  const owned = new Set(
    (((ownedRes as { data: { badge_id: string }[] | null }).data ?? [])).map((r) => r.badge_id)
  )

  return {
    factionOfBook,
    badgeIdsOfBook,
    droppable,
    adjacentFactionIds,
    owned,
    inventory: (inventoryRaw as Pick<InventoryRow, 'id' | 'used_slots' | 'max_slots'> | null) ?? null,
  }
}

// ────────────────────────────────────────────────────────────
// 배지 선정 (Layer 2·3)
// ────────────────────────────────────────────────────────────

interface PickResult {
  badge: DropBadge
  factionId: string
  bookId: string
  isLastPiece: boolean
}

function completionOfBook(structure: DropStructure, bookId: string): number {
  const all = structure.badgeIdsOfBook.get(bookId) ?? []
  if (all.length === 0) return 0
  const ownedCount = all.filter((id) => structure.owned.has(id)).length
  return ownedCount / all.length
}

/** 북의 미보유 배지 id 목록 */
function missingOfBook(structure: DropStructure, bookId: string): string[] {
  return (structure.badgeIdsOfBook.get(bookId) ?? []).filter((id) => !structure.owned.has(id))
}

function selectBadge(
  policy: DropPolicy,
  structure: DropStructure,
  state: UserDropStateRow,
  rarity: BadgeRarity,
  rand: () => number
): PickResult | null {
  for (const tryRarity of rarityFallbackOrder(rarity)) {
    const candidates = structure.droppable.filter((b) => b.rarity === tryRarity && b.item_book_id)
    if (candidates.length === 0) continue

    // 세계관 후보 (후보 배지가 존재하는 세계관)
    let candidateFactionIds = [
      ...new Set(candidates.map((b) => structure.factionOfBook.get(b.item_book_id as string)).filter(Boolean)),
    ] as string[]

    // 신규 유저 온보딩: 첫 3드랍은 작심삼일 클럽 + 주 활동종목 세계관으로 제한 (가능할 때만)
    if (state.total_drops < ONBOARDING_DROP_COUNT) {
      const onboarding = candidateFactionIds.filter(
        (id) => id === RESOLUTION_FACTION_ID || Object.values(ONBOARDING_FACTION_BY_ACTIVITY).includes(id)
      )
      if (onboarding.length > 0) candidateFactionIds = onboarding
    }

    const factionId = pickFaction(
      policy,
      {
        candidateFactionIds,
        lastDropFactionId: state.last_drop_faction_id,
        adjacentFactionIds: structure.adjacentFactionIds,
        mysteryFactionId: MYSTERY_FACTION_ID,
        rarity: tryRarity,
        contextFactionIds: [], // 맥락 오버라이드는 Step D에서 연결
      },
      rand
    )
    if (!factionId) continue

    const factionCandidates = candidates.filter(
      (b) => structure.factionOfBook.get(b.item_book_id as string) === factionId
    )
    if (factionCandidates.length === 0) continue

    // 마지막 조각 pity: 이 세계관에서 1개 남은 북이 임계 도달 시 그 배지 확정
    const pity = state.last_piece_pity ?? {}
    for (const [bookId, factionOf] of structure.factionOfBook) {
      if (factionOf !== factionId) continue
      const missing = missingOfBook(structure, bookId)
      if (missing.length !== 1) continue
      if ((pity[bookId] ?? 0) < policy.last_piece_pity_threshold) continue
      const lastBadge = structure.droppable.find((b) => b.id === missing[0])
      if (lastBadge) {
        return { badge: lastBadge, factionId, bookId, isLastPiece: true }
      }
    }

    // 아이템북 선택 (완성 페이싱)
    const bookIds = [...new Set(factionCandidates.map((b) => b.item_book_id as string))]
    const bookCandidates: BookCandidate[] = bookIds.map((bookId) => ({
      bookId,
      baseWeight: factionCandidates
        .filter((b) => b.item_book_id === bookId)
        .reduce((s, b) => s + b.drop_weight, 0),
      completion: completionOfBook(structure, bookId),
    }))
    const bookId = pickBook(policy, bookCandidates, state.last_drop_book_id, rand)
    if (!bookId) continue

    // 배지 선택: 미보유 우선
    const inBook = factionCandidates.filter((b) => b.item_book_id === bookId)
    const unowned = inBook.filter((b) => !structure.owned.has(b.id))
    const pool = unowned.length > 0 ? unowned : inBook
    const badge = weightedPick(pool, rand)
    const isLastPiece = missingOfBook(structure, bookId).length === 1 && !structure.owned.has(badge.id)

    return { badge, factionId, bookId, isLastPiece }
  }
  return null
}

/** drop_weight 기반 가중 랜덤 선택 */
function weightedPick<T extends { drop_weight: number }>(items: T[], rand: () => number): T {
  const total = items.reduce((sum, item) => sum + item.drop_weight, 0)
  let roll = rand() * total
  for (const item of items) {
    roll -= item.drop_weight
    if (roll <= 0) return item
  }
  return items[items.length - 1]
}

/** 마지막 조각 pity 카운터 갱신 — 이번 드랍이 발생한 세계관의 1개 남은 북들 */
function updateLastPiecePity(
  structure: DropStructure,
  state: UserDropStateRow,
  factionId: string,
  pickedBadgeId: string
): void {
  const pity: Record<string, number> = { ...(state.last_piece_pity ?? {}) }
  for (const [bookId, factionOf] of structure.factionOfBook) {
    if (factionOf !== factionId) continue
    const missing = missingOfBook(structure, bookId)
    if (missing.length === 1 && missing[0] === pickedBadgeId) {
      delete pity[bookId] // 이번 드랍으로 완성 → 카운터 제거
    } else if (missing.length === 1) {
      pity[bookId] = (pity[bookId] ?? 0) + 1 // 이 세계관에서 드랍 발생했으나 마지막 조각 못 얻음
    }
  }
  state.last_piece_pity = pity
}

// ────────────────────────────────────────────────────────────
// 상태 관리
// ────────────────────────────────────────────────────────────

async function getDropState(userId: string): Promise<UserDropStateRow> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('user_drop_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (data) return data as UserDropStateRow
  return {
    user_id: userId,
    last_drop_faction_id: null,
    last_drop_book_id: null,
    common_streak: 0,
    last_piece_pity: {},
    daily_drop_count: 0,
    daily_drop_date: null,
    total_drops: 0,
    last_activity_at: null,
    updated_at: new Date().toISOString(),
  }
}

async function saveDropState(state: UserDropStateRow): Promise<void> {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('user_drop_state')
    .upsert({ ...state, updated_at: new Date().toISOString() })
}

/** 섀도우밴을 rarity 상한으로 적용: 차단된 rarity는 common으로 강등, common도 차단이면 null */
async function applyShadowBanCap(userId: string, rarity: BadgeRarity): Promise<BadgeRarity | null> {
  const [banLevel, policy] = await Promise.all([getUserBanLevel(userId), getAbusingPolicy()])
  if (shouldAllowDrop(rarity, banLevel, policy)) return rarity
  if (rarity !== 'common' && shouldAllowDrop('common', banLevel, policy)) {
    console.info(`[tryItemDrop] 섀도우밴 rarity 강등 — userId: ${userId}, ${rarity} → common`)
    return 'common'
  }
  console.info(`[tryItemDrop] 섀도우밴으로 드랍 차단 — userId: ${userId}, rarity: ${rarity}`)
  return null
}

/** 인벤토리 삽입. 성공 시 true (슬롯은 호출부에서 사전 체크) */
async function insertDrop(
  inventoryId: string,
  userId: string,
  picked: DropBadge
): Promise<boolean> {
  const supabase = createServiceClient()
  const expiresAt = picked.valid_until ?? null

  const { error: insertError } = await supabase
    .from('inventory_items')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      inventory_id: inventoryId,
      badge_id: picked.id,
      obtained_by: 'drop',
      expires_at: expiresAt,
    } as any)
  if (insertError) {
    console.error(`[tryItemDrop] inventory_items 삽입 오류 (badge_id: ${picked.id}):`, insertError)
    return false
  }

  await recordFeedEvent(userId, 'item_dropped', {
    badge_id: picked.id,
    badge_name: picked.name,
    badge_image_url: picked.image_url ?? '',
    rarity: picked.rarity,
    poi_name: '',
  })
  return true
}

// ────────────────────────────────────────────────────────────
// 메인 엔트리
// ────────────────────────────────────────────────────────────

/**
 * 활동 1건당 아이템 드랍 (v2 3레이어).
 * @param activity - 이번 드랍의 기준 활동 (맥락·강도 판단). 문자열(activityType)은 레거시 호환
 * @param activities - 이번 싱크 배치 전체 (condition_json 평가용)
 */
export async function tryItemDrop(
  userId: string,
  activity?: NormalizedActivity | string,
  activities: NormalizedActivity[] = []
): Promise<void> {
  const act: NormalizedActivity | null = typeof activity === 'object' ? activity : null
  const activityStartDate = act?.startDate ?? new Date().toISOString()

  const [policy, state] = await Promise.all([getDropPolicy(), getDropState(userId)])
  const structure = await fetchDropStructure(userId, state.last_drop_faction_id, activities)
  if (!structure || !structure.inventory) {
    if (!structure) console.info('[tryItemDrop] 드랍 구조 없음 (활성 북/배지 없음)')
    else console.error(`[tryItemDrop] 인벤토리 없음 (userId: ${userId})`)
    return
  }
  const rand = Math.random

  // 일일 카운터 리셋 (활동 날짜 기준, UTC)
  const activityDate = activityStartDate.slice(0, 10)
  if (state.daily_drop_date !== activityDate) {
    state.daily_drop_count = 0
    state.daily_drop_date = activityDate
  }

  const comeback = isComebackActivity(policy, state.last_activity_at, activityStartDate)
  const weeklyFirst = isWeeklyFirstActivity(state.last_activity_at, activityStartDate)
  const intense = act ? isIntenseActivity(policy, act) : false

  // Layer 1: 드랍 개수 — 1개 확정 + 보너스
  const dropCount = 1 + (rollBonusDrop(policy, intense, rand) ? 1 : 0)
  let usedSlots = structure.inventory.used_slots

  for (let i = 0; i < dropCount; i++) {
    // 슬롯 사전 체크 — "최소 1개"의 유일한 예외
    if (usedSlots >= structure.inventory.max_slots) {
      console.info(`[tryItemDrop] 슬롯 초과 — 드랍 취소 (userId: ${userId}, ${usedSlots}/${structure.inventory.max_slots})`)
      break
    }

    const ctx: RarityContext = {
      commonStreak: state.common_streak,
      isComeback: comeback && i === 0, // 복귀·주간 보너스는 첫 드랍에만
      isWeeklyFirst: weeklyFirst && i === 0,
      dailyDropCount: state.daily_drop_count,
    }
    const rolled = rollRarityV2(policy, ctx, rand)
    const capped = await applyShadowBanCap(userId, rolled)
    if (!capped) continue

    // Layer 2·3: 세계관 → 아이템북 → 배지
    const result = selectBadge(policy, structure, state, capped, rand)
    if (!result) continue

    const inserted = await insertDrop(structure.inventory.id, userId, result.badge)
    if (!inserted) break

    usedSlots += 1

    // 상태·구조 갱신 (다음 드랍/다음 싱크에 반영)
    updateLastPiecePity(structure, state, result.factionId, result.badge.id)
    structure.owned.add(result.badge.id)
    state.daily_drop_count += 1
    state.total_drops += 1
    state.last_drop_faction_id = result.factionId
    state.last_drop_book_id = result.bookId
    if (result.badge.rarity === 'common') {
      state.common_streak += 1
    } else {
      state.common_streak = 0
    }

    console.info(
      `[tryItemDrop] v2 드랍 — userId: ${userId}, badge: ${result.badge.name}, rarity: ${result.badge.rarity}, ` +
        `faction: ${result.factionId}${result.isLastPiece ? ' [마지막 파편!]' : ''}` +
        `${comeback && i === 0 ? ' (복귀 보너스)' : ''}${i > 0 ? ' (보너스 드랍)' : ''}`
    )
  }

  // used_slots 일괄 반영
  if (usedSlots !== structure.inventory.used_slots) {
    const supabase = createServiceClient()
    const { error } = await supabase
      .from('inventory')
      // @ts-expect-error supabase-js update() 파라미터 never 추론 문제
      .update({ used_slots: usedSlots })
      .eq('id', structure.inventory.id)
    if (error) console.error('[tryItemDrop] used_slots 업데이트 오류:', error)
  }

  state.last_activity_at = activityStartDate
  await saveDropState(state)
}
