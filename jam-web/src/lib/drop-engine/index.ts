/**
 * JAM! 아이템 드랍 엔진 v2 (서버 사이드 전용)
 *
 * 3레이어 드랍 결정 (로직 문서: Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md §3):
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
import { awardPoints } from '@/lib/points'
import { recordActivityRecap } from '@/lib/notifications/recap'
import type { RecapItemBadge } from '@/lib/notifications/types'
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
import { checkCondition, passesWalkingGate } from '@/lib/badge-engine/index'
import { getDropPolicy, type DropPolicy } from './policy'
import { fetchAllRows } from '@/lib/notifications/batch/shared'
import type { Database, Json } from '@/types/database.generated'

/**
 * `inventory_items.serial_number`는 NOT NULL인데 DEFAULT가 없어(migrations/034) 생성 타입이
 * Insert 필수 컬럼으로 잡지만, 실제 값은 BEFORE INSERT 트리거 `assign_random_serial()`
 * (migrations/108)이 채운다. 이 한 컬럼만 `Omit`으로 떼어내고 나머지 컬럼은 이름·타입 검사를
 * 그대로 받게 둔다 — 억제(`@ts-expect-error`)로 덮으면 컬럼명 오타까지 같이 통과한다
 * (티켓 20260831_1213).
 */
type InventoryItemInsert = Database['public']['Tables']['inventory_items']['Insert']
type InventoryItemInsertByTrigger = Omit<InventoryItemInsert, 'serial_number'>

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
import { matchContextFactions, CONTEXT_FACTION_IDS } from './context'
import { logEngineDecision } from '@/lib/engine-log'

import {
  MYSTERY_FACTION_ID,
  RESOLUTION_FACTION_ID,
  ONBOARDING_FACTION_BY_ACTIVITY,
  ONBOARDING_DROP_COUNT,
  ACTIVITY_TYPE_DROP_WEIGHT,
  DEFAULT_ACTIVITY_DROP_WEIGHT,
} from './constants'

export { MYSTERY_FACTION_ID, RESOLUTION_FACTION_ID }

// ────────────────────────────────────────────────────────────
// 조건 가드 (v1 유지)
// ────────────────────────────────────────────────────────────

/**
 * 드랍엔진은 활동 1건(또는 이번 싱크 배치)만으로 조건을 평가한다.
 * 누적/기간 집계 필드를 가진 배지는 단일 활동 시점 평가가 불가능하므로 드랍 제외.
 *
 * `distance_km`/`elevation_gain_m`은 2026-08-31(티켓 20260831_2100)부터 badge-engine에서
 * 기본이 "전체 이력 누적 합계"로 평가되므로(활동 1건만으로는 판정 불가) 여기 추가한다.
 * `isDroppableForActivity`가 badge-engine의 `checkCondition`(=`evaluateConditionDetailed`)을
 * 그대로 재사용하는 이상 두 엔진의 "단일 활동 평가 가능 여부" 판단은 일치해야 한다.
 * (`same_activity:true`로 예외 처리되는 배지가 있어도 안전한 방향으로 보수적으로 제외한다 —
 * 현재 `type='item'` 배지는 전부 `condition_json`이 비어 있어 실질 영향 없음.)
 */
export const CUMULATIVE_CONDITION_FIELDS: (keyof BadgeCondition)[] = [
  'monthly_km',
  'season_count',
  'weekly_count',
  'streak_days',
  'total_count',
  'distance_km',
  'elevation_gain_m',
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

/**
 * 이번 드랍의 기준 활동에 적용할 activity_type 가중치.
 * 걷기는 축1 게이트(진짜 걷기 판정)를 통과했을 때만 감쇠 계수를 적용한다.
 * 확정 1개 드랍에는 영향 없음 — 보너스 드랍 확률·rare+ pity 진행 기여도에만 사용.
 */
export function getActivityDropWeight(activity: NormalizedActivity | null): number {
  if (!activity || activity.jamActivityType !== 'walking') return DEFAULT_ACTIVITY_DROP_WEIGHT
  if (!passesWalkingGate(activity)) return DEFAULT_ACTIVITY_DROP_WEIGHT
  return ACTIVITY_TYPE_DROP_WEIGHT.walking ?? DEFAULT_ACTIVITY_DROP_WEIGHT
}

// ────────────────────────────────────────────────────────────
// 하드코딩 faction UUID 검증 (constants.ts / context.ts)
// ────────────────────────────────────────────────────────────

/** 검증 통과 후 프로세스 생존 기간 동안 재검증을 건너뛰기 위한 캐시 */
let factionConstantsValidated = false

/**
 * DB 리셋·재시드 등으로 하드코딩된 faction UUID가 실제 factions 테이블과
 * 어긋나면(예: 019_seed_worldview.sql이 다른 UUID로 재적용됨) 온보딩 필터·맥락
 * 오버라이드가 조용히 빈 배열로 폴백해 의도한 동작이 깨진다. 이미 조회한
 * factions 목록을 재사용해 추가 쿼리 없이 존재 여부만 확인한다.
 */
async function validateFactionConstants(factionIds: Set<string>): Promise<void> {
  if (factionConstantsValidated) return

  const expected = new Set([
    MYSTERY_FACTION_ID,
    RESOLUTION_FACTION_ID,
    ...Object.values(ONBOARDING_FACTION_BY_ACTIVITY),
    ...CONTEXT_FACTION_IDS,
  ])
  const missing = [...expected].filter((id) => !factionIds.has(id))

  if (missing.length > 0) {
    console.error(`[drop-engine] 하드코딩 faction UUID가 factions 테이블에 없음: ${missing.join(', ')}`)
    await logEngineDecision('drop', 'faction_constant_missing', null, { missing })
    return // 다음 호출에서 재검증 (DB가 아직 정정되지 않았을 수 있으므로 캐시하지 않음)
  }

  factionConstantsValidated = true
}

// ────────────────────────────────────────────────────────────
// 드랍 구조 데이터 (활성 북·배지·보유·인접 일괄 조회)
// ────────────────────────────────────────────────────────────

type DropBadge = Pick<
  BadgeRow,
  'id' | 'name' | 'image_url' | 'rarity' | 'drop_weight' | 'valid_from' | 'valid_until' | 'condition_json' | 'item_book_id' | 'point_reward'
>

/**
 * 조회 단계에서 쓰는 형태. `badges.condition_json`은 jsonb라 생성 타입이 `Json`이고,
 * 도메인 좁힘 타입인 `BadgeCondition | null`로는 바로 받을 수 없다(interface라 인덱스
 * 시그니처가 없어 `Json`과 서로 대입되지 않는다). **이 한 컬럼만** 넓혀 두면 나머지
 * 컬럼명·타입은 select 문과 계속 대조된다 (티켓 20260831_1213).
 */
type DropBadgeFromDb = Omit<DropBadge, 'condition_json'> & { condition_json: Json }

interface DropStructure {
  /** 활성 북 id → faction id */
  factionOfBook: Map<string, string>
  /** faction id → 이름 (피드 이벤트 payload용) */
  factionNames: Map<string, string>
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

  const [{ data: booksRaw }, { data: inventoryRaw }, { data: factionsRaw }] = await Promise.all([
    supabase.from('item_books').select('id, faction_id').eq('is_active', true),
    supabase.from('inventory').select('id, used_slots, max_slots').eq('user_id', userId).single(),
    supabase.from('factions').select('id, name'),
  ])

  const books = (booksRaw ?? []) as { id: string; faction_id: string | null }[]
  if (books.length === 0) return null
  const factionOfBook = new Map<string, string>()
  for (const b of books) {
    if (b.faction_id) factionOfBook.set(b.id, b.faction_id)
  }
  const activeBookIds = [...factionOfBook.keys()]

  // PostgREST 기본 max-rows(보통 1,000행) 제한을 넘는 테이블을 안전하게 전체 조회.
  // `.select('*')` 등 단일 호출은 결과가 조용히 잘려나가도 에러가 안 나므로
  // (2026-07-31 POI/산 배지 대량 누락 인시던트의 원인) range 기반으로 끝까지 순회한다.
  // 아이템배지(type='item')는 이 글 작성 시점 기준 활성 아이템북 안에서만도 900개에
  // 근접해 있어(전체는 3,600개), 컨텐츠가 조금만 늘어도 이 문제가 재발할 수 있었다.
  // `.order('id')`는 페이지 경계 중복/누락을 막는 안정 tie-break — notifications/batch/shared.ts의
  // fetchAllRows는 이를 잊을 수 없게 orderBy를 필수 인자로 강제한다 (티켓 20260825_036).
  // 이 헬퍼는 예외를 던지므로 기존 { data, error } 그레이스풀 폴백 패턴에 맞춰 여기서 흡수한다.
  const [badgesResult, adjacencyRes, ownedRes] = await Promise.all([
    fetchAllRows<DropBadgeFromDb>('drop-engine:item-badges', 'id', () =>
      supabase
        .from('badges')
        .select('id, name, image_url, rarity, drop_weight, valid_from, valid_until, condition_json, item_book_id, point_reward')
        .eq('type', 'item')
        .is('deleted_at', null)
        .in('item_book_id', activeBookIds)
    )
      .then((data) => ({
        // 위 DropBadgeFromDb 주석 참조 — jsonb 컬럼 하나의 표현 차이라 형태는 동일하다.
        data: data as unknown as DropBadge[],
        error: null as { message: string } | null,
      }))
      .catch((err: unknown) => ({
        data: [] as DropBadge[],
        error: { message: err instanceof Error ? err.message : String(err) },
      })),
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

  const { data: badgesRaw, error: badgesError } = badgesResult
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

  const factionNames = new Map(
    (((factionsRaw ?? []) as { id: string; name: string }[])).map((f) => [f.id, f.name])
  )

  void validateFactionConstants(new Set(factionNames.keys()))

  return {
    factionOfBook,
    factionNames,
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
  contextFactionIds: string[],
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
        contextFactionIds,
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
  const { data, error } = await supabase
    .from('user_drop_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    // 조회 실패를 "신규 유저"와 구분하지 않고 빈 상태로 폴백하면 스트릭·pity·일일 카운터가
    // 무음으로 리셋된다 — 최소한 서버 로그로 신호를 남긴다 (티켓 20260901_1843)
    console.error(`[tryItemDrop] 드랍 상태 조회 실패 — 신규 상태로 폴백 (userId: ${userId}):`, error)
  }
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

/**
 * 드랍 상태를 저장한다. 실패하면 호출부가 인지하도록 예외를 던진다.
 * (이전에는 upsert 반환 error를 확인하지 않아 스트릭·pity·일일 카운터 저장 실패가 무음으로
 * 넘어갔다 — 티켓 20260901_1843. 호출부(`tryItemDrop`)는 이미 배지가 지급된 뒤에 이 함수를
 * 부르므로, 여기서 던진 예외는 `strava/sync.ts`의 활동 단위 try/catch가 로깅 후 흡수한다.)
 */
async function saveDropState(state: UserDropStateRow): Promise<void> {
  const supabase = createServiceClient()
  const table = supabase.from('user_drop_state')
  const payload = { ...state, updated_at: new Date().toISOString() }
  const { error } = await table.upsert(payload)
  if (error) {
    console.error(`[tryItemDrop] 드랍 상태 저장 실패 (userId: ${state.user_id}):`, error)
    throw new Error(`user_drop_state upsert 실패 (${error.code}): ${error.message}`)
  }
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

/**
 * 인벤토리 삽입. 성공 시 생성된 `inventory_items.id`, 실패 시 null (슬롯은 호출부에서 사전 체크)
 *
 * 20260824_019 — 반환을 boolean에서 id로 넓혔다. 소식 #3(아이템 배지 획득)의 착지점이
 * 배지 도감이 아니라 **인벤토리 인스턴스**(`/inventory/[itemId]`)라 그 id가 필요하다.
 */
async function insertDrop(
  inventoryId: string,
  userId: string,
  picked: DropBadge,
  factionName: string,
  isLastPiece: boolean,
  activityStartDate?: string,
  /**
   * 20260827_018 — 이 드랍이 **실제로 발생한 그 활동 1건**의 Strava 숫자 id.
   * 활동 없이 호출된 경로(activity 미전달)에서는 null이라 피드에서 단건으로 남는다.
   * ⚠️ 배치 전체(`activities`)의 id를 싣지 않는다 — 귀속 입도가 어긋난다.
   */
  stravaActivityId?: number | null
): Promise<string | null> {
  const supabase = createServiceClient()
  const expiresAt = picked.valid_until ?? null

  const inventoryItemsTable = supabase.from('inventory_items')
  const insertPayload: InventoryItemInsertByTrigger = {
    inventory_id: inventoryId,
    badge_id: picked.id,
    obtained_by: 'drop',
    expires_at: expiresAt,
  }
  const { data: insertedRaw, error: insertError } = await inventoryItemsTable
    .insert(insertPayload as InventoryItemInsert)
    .select('id')
    .single()
  if (insertError) {
    console.error(`[tryItemDrop] inventory_items 삽입 오류 (badge_id: ${picked.id}):`, insertError)
    return null
  }
  const inventoryItemId = (insertedRaw as { id: string }).id

  // 잼 포인트 지급 — 아이템배지에 point_reward가 붙어 있으면 획득 직후 1회 지급.
  // (아이템배지도 badges 테이블이므로 point_reward를 가질 수 있음. 0이면 스킵.)
  // 실패 시 로깅은 awardPoints() 내부에서 일괄 처리한다(호출부에서 중복 기록 안 함).
  const pointReward = picked.point_reward ?? 0
  if (pointReward > 0) {
    await awardPoints(userId, pointReward, 'badge_point_reward', { sourceBadgeId: picked.id })
  }

  await recordFeedEvent(userId, 'item_dropped', {
    // 홈/프로필 피드가 inventory_items를 다시 훑어 "레거시" 항목을 합성할 때
    // 이 필드로 이미 실기록된 드랍인지 식별해 중복 표시를 막는다 (page.tsx 참고)
    inventory_item_id: inventoryItemId,
    badge_id: picked.id,
    badge_name: picked.name,
    badge_image_url: picked.image_url ?? '',
    rarity: picked.rarity,
    poi_name: '',
    faction_name: factionName,
    is_last_piece: isLastPiece,
    // 20260827_018 — 지급한 포인트를 피드에도 남긴다. 프로필 묶음 카드가 포인트를
    // 합산할 때 아이템 배지 몫이 빠져 알림 결산 총액과 어긋나던 문제를 해소한다.
    // badge_earned와 같은 규약으로 0이면 싣지 않는다.
    ...(pointReward > 0 ? { point_reward: pointReward } : {}),
  }, activityStartDate, stravaActivityId ?? null)
  return inventoryItemId
}

// ────────────────────────────────────────────────────────────
// 메인 엔트리
// ────────────────────────────────────────────────────────────

/**
 * 활동 1건당 아이템 드랍 (v2 3레이어).
 * @param activity - 이번 드랍의 기준 활동 (맥락·강도 판단). 문자열(activityType)은 레거시 호환
 * @param activities - 이번 싱크 배치 전체 (condition_json 평가용)
 * @returns 이번 호출에서 실제로 드랍된 배지 id 목록 (드랍 순서 유지, 없으면 빈 배열).
 *          20260823_007 — 동기화 응답에 획득 배지 상세를 실어보내기 위해 추가.
 *          호출부의 순차 처리 불변식(user_drop_state 읽기/쓰기)은 그대로다 — 병렬화 금지.
 */
export async function tryItemDrop(
  userId: string,
  activity?: NormalizedActivity | string,
  activities: NormalizedActivity[] = []
): Promise<string[]> {
  /** 이번 호출에서 드랍된 배지 id (드랍 순서) */
  const droppedBadgeIds: string[] = []
  /** 이번 호출에서 드랍된 아이템 (드랍 순서) — ① 활동 결산의 재료 */
  const droppedItems: RecapItemBadge[] = []
  const act: NormalizedActivity | null = typeof activity === 'object' ? activity : null
  // 20260824_006 — Strava startDateLocal은 로컬 벽시계에 Z를 붙인 값이라(진짜 UTC 아님)
  // timestamptz(피드 event_at)에 그대로 넣으면 최대 +9시간 미래로 오해석된다.
  // 이 값은 일일 카운터·복귀 판정(activityDate/comeback/weeklyFirst/last_activity_at)에도
  // 쓰여 daily_drop_date 등 상태 컬럼에 그대로 저장되므로, 반드시 진짜 UTC인 startDate만
  // 쓴다(strava/sync.ts의 last_activity_at 검증 가드도 이 값 기준으로 함께 맞춰뒀다).
  const activityStartDate = act?.startDate ?? new Date().toISOString()
  // 걷기(축1 게이트 통과)는 0.4 — 확정 1개 드랍엔 영향 없이 보너스 드랍 확률·pity 진행에만 반영
  const activityWeight = getActivityDropWeight(act)

  const [policy, state] = await Promise.all([getDropPolicy(), getDropState(userId)])
  const structure = await fetchDropStructure(userId, state.last_drop_faction_id, activities)
  if (!structure || !structure.inventory) {
    if (!structure) {
      console.info('[tryItemDrop] 드랍 구조 없음 (활성 북/배지 없음)')
      await logEngineDecision('drop', 'drop_attempt', userId, { outcome: 'no_drop_structure' })
    } else {
      console.error(`[tryItemDrop] 인벤토리 없음 (userId: ${userId})`)
      // 2026-08-11 인시던트(20260811_001) 재발 감지용 — 이 분기가 조용히 지나가면서
      // 원인(handle_new_user 트리거 드리프트)을 몇 주간 못 찾았음. 인벤토리는
      // 정상 가입이면 항상 존재해야 하므로, 이 로그가 쌓이면 즉시 이상 신호다.
      await logEngineDecision('drop', 'drop_attempt', userId, { outcome: 'no_inventory' })
    }
    return droppedBadgeIds
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

  // 맥락 오버라이드 매칭 (복귀는 발동률 무시하고 항상 적용)
  const contextMatch = matchContextFactions(act, comeback)

  // Layer 1: 드랍 개수 — 1개 확정(activity_type 가중치 미적용) + 보너스(가중치 적용)
  const dropCount = 1 + (rollBonusDrop(policy, intense, rand, activityWeight) ? 1 : 0)
  let usedSlots = structure.inventory.used_slots

  for (let i = 0; i < dropCount; i++) {
    // 슬롯 사전 체크 — "최소 1개"의 유일한 예외
    if (usedSlots >= structure.inventory.max_slots) {
      console.info(`[tryItemDrop] 슬롯 초과 — 드랍 취소 (userId: ${userId}, ${usedSlots}/${structure.inventory.max_slots})`)
      await logEngineDecision('drop', 'drop_attempt', userId, {
        attempt: i, outcome: 'slot_full', usedSlots, maxSlots: structure.inventory.max_slots,
      })
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
    if (!capped) {
      await logEngineDecision('drop', 'drop_attempt', userId, {
        attempt: i, outcome: 'shadow_ban_blocked', rolledRarity: rolled,
      })
      continue
    }

    // 맥락 오버라이드 발동 판정 — 복귀는 항상, 그 외는 context_override_rate 확률
    const contextActive =
      contextMatch !== null && (contextMatch.always || rand() < policy.context_override_rate)
    const contextFactionIds = contextActive ? contextMatch.factionIds : []

    // Layer 2·3: 세계관 → 아이템북 → 배지
    const result = selectBadge(policy, structure, state, capped, contextFactionIds, rand)
    if (!result) {
      await logEngineDecision('drop', 'drop_attempt', userId, {
        attempt: i, outcome: 'no_candidate', rolledRarity: rolled, cappedRarity: capped, contextActive,
      })
      continue
    }

    const insertedInventoryItemId = await insertDrop(
      structure.inventory.id,
      userId,
      result.badge,
      structure.factionNames.get(result.factionId) ?? '',
      result.isLastPiece,
      activityStartDate,
      act?.stravaId ?? null
    )
    if (!insertedInventoryItemId) {
      await logEngineDecision('drop', 'drop_attempt', userId, {
        attempt: i, outcome: 'insert_failed', badgeId: result.badge.id, rolledRarity: rolled, cappedRarity: capped,
      })
      break
    }

    await logEngineDecision('drop', 'drop_attempt', userId, {
      attempt: i,
      outcome: 'issued',
      badgeId: result.badge.id,
      badgeName: result.badge.name,
      rarity: result.badge.rarity,
      rolledRarity: rolled,
      cappedRarity: capped,
      factionId: result.factionId,
      bookId: result.bookId,
      isLastPiece: result.isLastPiece,
      contextActive,
      isComeback: comeback && i === 0,
      pityCounters: state.last_piece_pity,
    })

    usedSlots += 1
    droppedBadgeIds.push(result.badge.id)
    droppedItems.push({
      inventory_item_id: insertedInventoryItemId,
      badge_id: result.badge.id,
      name: result.badge.name,
      rarity: result.badge.rarity,
    })

    // 상태·구조 갱신 (다음 드랍/다음 싱크에 반영)
    updateLastPiecePity(structure, state, result.factionId, result.badge.id)
    structure.owned.add(result.badge.id)
    state.daily_drop_count += 1
    state.total_drops += 1
    state.last_drop_faction_id = result.factionId
    state.last_drop_book_id = result.bookId
    if (result.badge.rarity === 'common') {
      // rare+ pity 진행 기여도에 activity_type 가중치 반영 (걷기는 0.4만큼만 전진)
      state.common_streak += activityWeight
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
      .update({ used_slots: usedSlots })
      .eq('id', structure.inventory.id)
    if (error) console.error('[tryItemDrop] used_slots 업데이트 오류:', error)
  }

  state.last_activity_at = activityStartDate
  await saveDropState(state)

  // ① 활동 결산에 아이템 배지를 싣는다 — 티켓 20260827_014
  // (20260824_019의 #3 아이템 배지 소식이 결산으로 흡수됐다. 묶음 단위가 KST 하루라
  //  활동 정보 없이 호출된 레거시·시뮬레이터 경로도 같은 행에 합쳐진다)
  if (droppedItems.length > 0) {
    await recordActivityRecap(userId, {
      ...(act ? { activity_ids: [act.stravaId] } : {}),
      item_badges: droppedItems,
    })
  }

  return droppedBadgeIds
}
