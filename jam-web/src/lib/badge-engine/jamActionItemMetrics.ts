/**
 * JAM! 행동 지표 계산 — 새 JAM 조건 5종: 캡슐 열기·잠긴 개체 열기·잠긴 개체 픽업·다른 트라이브 아이템 종류·트라이브를 넘는 믹스
 * (서버 사이드 전용, 티켓 20261018_1815 2회, 운영 로직 10.2절)
 *
 * `jamActionBadges.ts`의 `METRIC_COMPUTERS`가 부르는 «값 계산» 함수 모음이다. `jamActionMetrics.ts`와 같은 규약이다:
 * `(supabase, userId)`를 받아 숫자를 돌려주고 **DB 오류를 던진다**(0으로 바꿔 돌려주면 「센 값이 0」과 「세지 못함」이
 * 구분되지 않는다). 던진 오류는 `evaluateJamActionBadges`가 그 지표만 건너뛰는 것(fail-closed)으로 받는다.
 * 새 SQL 없이 supabase-js 읽기만 쓴다(마이그레이션은 허용 키 확장 242뿐).
 *
 * ## 값의 정의 (티켓 20261018_1815 「사용자 결정」 6~9번)
 *  - `capsule_open_count`: 내가 캡슐을 연 횟수. 원천은 `capsule_opens`(열 때마다 한 줄, 마이그레이션 232).
 *  - `locked_item_open_count`: 내가 잠긴 아이템 배지를 연 횟수. 원천은 `inventory_item_events`의 `unlocked`(마이그레이션 235).
 *    한 번 연 개체는 다시 잠기지 않아 같은 개체가 두 번 세어지지 않는다.
 *  - `locked_item_pickup_count`: **픽업 당시 잠겨 있던 서로 다른 개체** 수. 자기 드랍은 세지 않고, 같은 개체는 몇 번 주워도 1이다
 *    (드랍·픽업 왕복으로 부풀리지 못한다). 시스템 드랍·놓은 사람이 탈퇴한 드랍은 `pickup_item_count`와 같게 포함한다.
 *    «픽업 당시 잠김»은 별도 기록이 없어 개체의 현재 상태와 픽업 시각으로 가린다: 잠김은 한 번 열면 되돌아오지 않으므로
 *    (231) 지금도 잠겨 있으면 그때도 잠겨 있었고, 지금 열려 있으면 `unlocked_at`이 픽업 시각 이후일 때만 그때 잠겨 있었다.
 *    `unlocked_at`이 비었고 열려 있으면 처음부터 열린 채 받은 개체라 세지 않는다. 개체 행을 못 찾으면 세지 않는다.
 *  - `other_tribe_item_kinds_count`: **지금 가진 개체**(`inventory_id`가 내 인벤토리이고 `destroyed_at`이 비어 있음) 가운데
 *    내 소속(`users.tribe_id`)과 다른 트라이브 배지의 서로 다른 종류(`badge_id`) 수. 잠긴 개체도 가진 개체라 센다. 내 소속이 없거나
 *    배지의 트라이브가 없으면(`badges.tribe_id` NULL) «다른 트라이브»를 가릴 수 없어 세지 않는다.
 *  - `cross_tribe_combine_success_count`: 믹스 성공 기록(`user_combine_success_logs`) 중 재료(`ingredient_badge_ids`)가
 *    `badges.tribe_id` 기준 **2개 이상 트라이브**에 걸친 행 수. 트라이브가 없는 재료와 행을 못 찾은 재료는 트라이브로 세지 않는다.
 *
 * ## SQL 등가식 (읽기 전용 기준값)
 * ```
 * capsule_open_count                = count(*) FROM capsule_opens WHERE user_id = :u
 * locked_item_open_count            = count(*) FROM inventory_item_events WHERE user_id = :u AND event_type = 'unlocked'
 * locked_item_pickup_count          = count(DISTINCT d.inventory_item_id) FROM poi_drops d JOIN inventory_items i ON i.id = d.inventory_item_id
 *                                       WHERE d.picked_up_by = :u AND d.dropper_user_id IS DISTINCT FROM :u
 *                                         AND (i.locked OR i.unlocked_at >= d.picked_up_at)
 * other_tribe_item_kinds_count      = count(DISTINCT i.badge_id) FROM inventory_items i JOIN inventory v ON v.id = i.inventory_id
 *                                       JOIN badges b ON b.id = i.badge_id
 *                                       WHERE v.user_id = :u AND i.destroyed_at IS NULL AND b.tribe_id IS NOT NULL
 *                                         AND b.tribe_id <> (SELECT tribe_id FROM users WHERE id = :u)
 * cross_tribe_combine_success_count = count(*) FROM user_combine_success_logs l WHERE l.user_id = :u
 *                                       AND (SELECT count(DISTINCT b.tribe_id) FROM badges b WHERE b.id = ANY(l.ingredient_badge_ids)) >= 2
 * ```
 *
 * 행을 끌어와 세는 지표(잠긴 픽업·다른 트라이브 종류·트라이브를 넘는 믹스)는 `MAX_PAGES` 페이지(30,000행)를 넘으면 오류를 던지고 그 지표만
 * 건너뛴다(`jamActionPaging.ts`). 규칙은 vitest로 직접 검증하도록 순수 함수로 분리했다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllPages } from './jamActionPaging'

/** 오류 메시지 접두어 — 로그에서 어느 계산인지 알아보도록 공용 페이징에 넘긴다 */
const TAG = 'jamActionItemMetrics'

/** `.in()` 한 번에 넘기는 id 수 — URL 길이 상한을 넘지 않게 나눠 읽는다 */
export const ID_CHUNK_SIZE = 200

function throwQueryError(label: string, error: { message?: string }): never {
  throw new Error(`[${TAG}] ${label} 조회 오류: ${error.message ?? '알 수 없는 오류'}`)
}

function chunksOf<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size))
  return chunks
}

// ── 순수 함수 (DB를 만지지 않는다) ────────────────────────────────────────

/** 내가 주운 드랍 한 건 — `inventory_item_id`가 있는 행만 조회한다 */
export interface LockedPickupRow {
  inventory_item_id: string
  /** 놓은 사람. 시스템 드랍이거나 놓은 사람이 탈퇴했으면 null */
  dropper_user_id: string | null
  /** 주운 시각 */
  picked_up_at: string | null
}

/** 픽업 당시 잠김을 가리는 데 쓰는 개체의 현재 상태 */
export interface LockableItemState {
  id: string
  locked: boolean | null
  unlocked_at: string | null
}

/**
 * 픽업 당시 잠겨 있던 서로 다른 개체 수. 자기 드랍은 뺀다.
 * 지금 잠겨 있으면 그때도 잠겨 있었다. 지금 열려 있으면 `unlocked_at`이 픽업 시각 이후일 때만 그때 잠겨 있었다.
 * 픽업 시각을 읽을 수 없으면(null·깨진 값) 열린 개체는 세지 않는다 — 부풀리는 쪽으로 틀리지 않게 한다.
 */
export function countLockedAtPickup(
  userId: string,
  pickups: readonly LockedPickupRow[],
  items: readonly LockableItemState[]
): number {
  const stateById = new Map(items.map((i) => [i.id, i]))
  const counted = new Set<string>()
  for (const pickup of pickups) {
    if (pickup.dropper_user_id === userId) continue // 자기 드랍은 세지 않는다
    const item = stateById.get(pickup.inventory_item_id)
    if (!item) continue
    if (item.locked === true) {
      counted.add(item.id)
      continue
    }
    if (item.unlocked_at === null || pickup.picked_up_at === null) continue
    const unlockedMs = Date.parse(item.unlocked_at)
    const pickedMs = Date.parse(pickup.picked_up_at)
    if (Number.isNaN(unlockedMs) || Number.isNaN(pickedMs)) continue
    if (unlockedMs >= pickedMs) counted.add(item.id)
  }
  return counted.size
}

/**
 * 가진 개체의 배지 가운데 내 소속과 다른 트라이브 배지의 서로 다른 종류 수.
 * `myTribeId`가 없거나 배지의 트라이브가 없으면 «다른 트라이브»를 가릴 수 없어 세지 않는다.
 */
export function countOtherTribeKinds(
  myTribeId: string | null,
  heldBadgeIds: Iterable<string>,
  tribeOfBadge: ReadonlyMap<string, string | null>
): number {
  if (myTribeId === null) return 0
  const kinds = new Set<string>()
  for (const badgeId of heldBadgeIds) {
    const tribe = tribeOfBadge.get(badgeId)
    if (tribe !== undefined && tribe !== null && tribe !== myTribeId) kinds.add(badgeId)
  }
  return kinds.size
}

/** 재료가 서로 다른 트라이브 2개 이상에 걸친 믹스 성공 기록 수. 트라이브를 못 찾은 재료는 트라이브로 세지 않는다 */
export function countCrossTribeCombines(
  ingredientLists: readonly (readonly string[])[],
  tribeOfBadge: ReadonlyMap<string, string | null>
): number {
  let count = 0
  for (const ingredients of ingredientLists) {
    const tribes = new Set<string>()
    for (const badgeId of ingredients) {
      const tribe = tribeOfBadge.get(badgeId)
      if (tribe !== undefined && tribe !== null) tribes.add(tribe)
    }
    if (tribes.size >= 2) count++
  }
  return count
}

// ── DB 읽기 ───────────────────────────────────────────────────────────────

/** 배지 id → 소속 트라이브 id. 여러 번에 나눠 읽는다. 배지 행을 못 찾으면 맵에 없다 */
async function fetchBadgeTribes(supabase: SupabaseClient, badgeIds: readonly string[]): Promise<Map<string, string | null>> {
  const tribeOf = new Map<string, string | null>()
  for (const chunk of chunksOf([...new Set(badgeIds)], ID_CHUNK_SIZE)) {
    const { data, error } = await supabase.from('badges').select('id, tribe_id').in('id', chunk)
    if (error) throwQueryError('배지의 트라이브', error)
    for (const row of (data ?? []) as { id: string; tribe_id: string | null }[]) tribeOf.set(row.id, row.tribe_id)
  }
  return tribeOf
}

// ── 지표 계산 ─────────────────────────────────────────────────────────────

/** 캡슐 연 횟수 — `capsule_opens` 행 수(열 때마다 한 줄) */
export async function countCapsuleOpens(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('capsule_opens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (error) throwQueryError('캡슐 열기 기록', error)
  return count ?? 0
}

/** 잠긴 아이템 배지를 연 횟수 — 개체 이력(`inventory_item_events`)의 `unlocked` 행 수 */
export async function countLockedItemOpens(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('inventory_item_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', 'unlocked')
  if (error) throwQueryError('잠긴 개체 열기 기록', error)
  return count ?? 0
}

/** 잠긴 아이템 배지 픽업 횟수 — 픽업 당시 잠겨 있던 서로 다른 개체 수(자기 드랍 제외) */
export async function countLockedItemPickups(supabase: SupabaseClient, userId: string): Promise<number> {
  const pickups = await selectAllPages<LockedPickupRow>(TAG, '내가 주운 드랍', (from, to) =>
    supabase
      .from('poi_drops')
      .select('inventory_item_id, dropper_user_id, picked_up_at')
      .eq('picked_up_by', userId)
      .not('inventory_item_id', 'is', null)
      .order('id')
      .range(from, to)
  )
  const itemIds = [...new Set(pickups.filter((p) => p.dropper_user_id !== userId).map((p) => p.inventory_item_id))]
  const items: LockableItemState[] = []
  for (const chunk of chunksOf(itemIds, ID_CHUNK_SIZE)) {
    const { data, error } = await supabase.from('inventory_items').select('id, locked, unlocked_at').in('id', chunk)
    if (error) throwQueryError('픽업한 개체', error)
    items.push(...((data ?? []) as LockableItemState[]))
  }
  return countLockedAtPickup(userId, pickups, items)
}

/** 모은 다른 트라이브 아이템 배지의 종류 수 — 지금 가진 개체 중 내 소속과 다른 트라이브 배지의 서로 다른 종류 수 */
export async function countOtherTribeItemKinds(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data: userRow, error: userError } = await supabase.from('users').select('tribe_id').eq('id', userId).maybeSingle()
  if (userError) throwQueryError('내 트라이브', userError)
  const myTribeId = (userRow as { tribe_id: string | null } | null)?.tribe_id ?? null
  if (myTribeId === null) return 0

  const { data: inventories, error: inventoryError } = await supabase.from('inventory').select('id').eq('user_id', userId)
  if (inventoryError) throwQueryError('내 인벤토리', inventoryError)
  const inventoryIds = ((inventories ?? []) as { id: string }[]).map((r) => r.id)
  if (inventoryIds.length === 0) return 0

  const held = await selectAllPages<{ badge_id: string }>(TAG, '가진 개체', (from, to) =>
    supabase
      .from('inventory_items')
      .select('badge_id')
      .in('inventory_id', inventoryIds)
      .is('destroyed_at', null)
      .order('id')
      .range(from, to)
  )
  const badgeIds = [...new Set(held.map((r) => r.badge_id))]
  const tribeOf = await fetchBadgeTribes(supabase, badgeIds)
  return countOtherTribeKinds(myTribeId, badgeIds, tribeOf)
}

/** 트라이브를 넘는 믹스 성공 횟수 — 재료가 트라이브 2개 이상에 걸친 성공 기록 수 */
export async function countCrossTribeCombineSuccess(supabase: SupabaseClient, userId: string): Promise<number> {
  const rows = await selectAllPages<{ ingredient_badge_ids: string[] | null }>(TAG, '믹스 성공 기록', (from, to) =>
    supabase
      .from('user_combine_success_logs')
      .select('ingredient_badge_ids')
      .eq('user_id', userId)
      .order('id')
      .range(from, to)
  )
  const ingredientLists = rows.map((r) => r.ingredient_badge_ids ?? [])
  const badgeIds = [...new Set(ingredientLists.flat())]
  if (badgeIds.length === 0) return 0
  const tribeOf = await fetchBadgeTribes(supabase, badgeIds)
  return countCrossTribeCombines(ingredientLists, tribeOf)
}
