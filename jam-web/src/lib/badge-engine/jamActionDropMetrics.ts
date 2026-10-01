/**
 * JAM! 행동 지표 계산 — 드랍·픽업 4종 (서버 사이드 전용, 티켓 20261001_0632, 상위 20260930_1456 ②)
 *
 * `jamActionBadges.ts`의 `METRIC_COMPUTERS`가 부르는 «값 계산» 함수 모음이다. `jamActionMetrics.ts`와 같은
 * 규약이다: `(supabase, userId)`를 받아 숫자를 돌려주고 **DB 오류를 던진다**(0으로 바꿔 돌려주면
 * 「센 값이 0」과 「세지 못함」이 구분되지 않는다). 던진 오류는 `evaluateJamActionBadges`가 그 지표만
 * 건너뛰는 것(fail-closed)으로 받는다.
 *
 * ## 값의 정의 (BADGE_ENGINE_UNIFIED.md 드랍·픽업 절)
 * 원천은 `poi_drops`이고 드랍 1건 = 1행이다(`create_user_drop`이 매번 INSERT, 픽업은 `picked_up_by`를 채운다).
 * 시스템 드랍(`source = 'system'`)과 놓은 사람이 탈퇴한 드랍(`dropper_user_id` NULL)을 구분해야 해서
 * `custody_events`가 아니라 `poi_drops`를 쓴다. 모든 지표는 **`inventory_item_id`가 있는 행만** 센다
 * (2026-08-29 이전 행은 개체 연결이 없어 자동으로 빠진다). 원시 행 수를 세는 지표는 없다 — 같은 개체를
 * 두 유저가 번갈아 놓고 줍는 왕복이 지표를 부풀리지 못하게 **서로 다른 개체·유저 수**로만 센다.
 *
 *  - `drop_item_count`: 내가 놓은 서로 다른 개체 수. 같은 개체를 몇 번 놓아도 1.
 *  - `pickup_item_count`: 내가 주운 서로 다른 개체 수. 자기 드랍은 뺀다. 시스템 드랍·놓은 사람이 탈퇴한 드랍은 포함한다.
 *  - `pickup_from_user_count`: 내가 주운 드랍을 놓은 서로 다른 유저 수. 자기·시스템·탈퇴 유저는 뺀다.
 *  - `picked_up_by_user_count`: 내가 놓은 드랍을 주운 서로 다른 유저 수. 자기·탈퇴 유저(`picked_up_by` NULL)는 뺀다.
 *
 * ## SQL 등가식 (읽기 전용 기준값 — 마이그레이션 202의 검증 주석과 같다)
 * ```
 * drop_item_count         = count(DISTINCT inventory_item_id) FROM poi_drops
 *                             WHERE dropper_user_id = :u AND inventory_item_id IS NOT NULL
 * pickup_item_count       = count(DISTINCT inventory_item_id) FROM poi_drops
 *                             WHERE picked_up_by = :u AND inventory_item_id IS NOT NULL
 *                               AND dropper_user_id IS DISTINCT FROM :u
 * pickup_from_user_count  = count(DISTINCT dropper_user_id) FROM poi_drops
 *                             WHERE picked_up_by = :u AND inventory_item_id IS NOT NULL
 *                               AND dropper_user_id IS NOT NULL AND dropper_user_id <> :u
 * picked_up_by_user_count = count(DISTINCT picked_up_by) FROM poi_drops
 *                             WHERE dropper_user_id = :u AND inventory_item_id IS NOT NULL
 *                               AND picked_up_by IS NOT NULL AND picked_up_by <> :u
 * ```
 *
 * ## RPC를 쓰지 않는 이유
 * 위 등가식을 `COUNT(DISTINCT)` RPC 하나로 옮기면 행을 끌어오지 않아도 되지만, 규칙(자기·시스템·탈퇴 제외,
 * 번갈아 놓기)을 **vitest로 직접 검증**할 수 있는 순수 함수(`computeDropPickupMetrics`)로 두는 편을 택했다. 유저당
 * 대상 행이 작다(마이그레이션 202의 부분 인덱스가 조회를 받친다). **한 유저의 대상 행이 약 2,000을 넘으면**
 * `COUNT(DISTINCT)` RPC로 옮긴다. 그 전에라도 행이 `MAX_PAGES` 페이지(30,000행)를 넘으면 조회가 오류를 던지고
 * 그 지표만 건너뛴다 — 잘린 값으로 임계를 잘못 넘기지 않도록 fail-closed다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllPages } from './jamActionPaging'

/** 오류 메시지 접두어 — 로그에서 어느 계산인지 알아보도록 공용 페이징에 넘긴다 */
const TAG = 'jamActionDropMetrics'

/** 내가 놓은 드랍 행(놓은 사람 기준) — `inventory_item_id`가 있는 행만 조회한다 */
export interface MyDropRow {
  inventory_item_id: string
  /** 주운 사람. 아직 줍지 않았거나 주운 사람이 탈퇴했으면 null */
  picked_up_by: string | null
}

/** 내가 주운 드랍 행(주운 사람 기준) — `inventory_item_id`가 있는 행만 조회한다 */
export interface MyPickupRow {
  inventory_item_id: string
  /** 놓은 사람. 시스템 드랍이거나 놓은 사람이 탈퇴했으면 null */
  dropper_user_id: string | null
}

export interface DropPickupMetrics {
  dropItemCount: number
  pickupItemCount: number
  pickupFromUserCount: number
  pickedUpByUserCount: number
}

/**
 * 조회한 행에서 네 지표를 계산한다(순수 함수 — DB를 만지지 않는다).
 *
 * 같은 개체를 두 유저가 10번 왕복해 행이 20개여도 각 집합은 그 개체·상대 한 명만 담으므로 모든 지표가 1이다.
 */
export function computeDropPickupMetrics(
  userId: string,
  myDrops: readonly MyDropRow[],
  myPickups: readonly MyPickupRow[]
): DropPickupMetrics {
  const droppedItems = new Set<string>()
  const pickedUpByUsers = new Set<string>()
  for (const row of myDrops) {
    droppedItems.add(row.inventory_item_id)
    // 주운 사람이 없거나(미픽업·탈퇴) 나 자신이면 «다른 유저가 주운 것»이 아니다
    if (row.picked_up_by !== null && row.picked_up_by !== userId) pickedUpByUsers.add(row.picked_up_by)
  }

  const pickedUpItems = new Set<string>()
  const pickupFromUsers = new Set<string>()
  for (const row of myPickups) {
    // 자기 드랍을 자기가 주운 것은 뺀다. 시스템·탈퇴 유저의 드랍(dropper_user_id null)은 픽업에 포함한다
    if (row.dropper_user_id === userId) continue
    pickedUpItems.add(row.inventory_item_id)
    // 놓은 사람이 없으면(시스템·탈퇴) «함께 줍기» 상대가 아니다
    if (row.dropper_user_id !== null) pickupFromUsers.add(row.dropper_user_id)
  }

  return {
    dropItemCount: droppedItems.size,
    pickupItemCount: pickedUpItems.size,
    pickupFromUserCount: pickupFromUsers.size,
    pickedUpByUserCount: pickedUpByUsers.size,
  }
}

/** 내가 놓은 드랍 행 — `inventory_item_id`가 있는 행만(옛 행 제외) */
export async function fetchMyDropRows(supabase: SupabaseClient, userId: string): Promise<MyDropRow[]> {
  return selectAllPages<MyDropRow>(TAG, '내가 놓은 드랍', (from, to) =>
    supabase
      .from('poi_drops')
      .select('inventory_item_id, picked_up_by')
      .eq('dropper_user_id', userId)
      .not('inventory_item_id', 'is', null)
      .order('id')
      .range(from, to)
  )
}

/** 내가 주운 드랍 행 — `inventory_item_id`가 있는 행만(옛 행 제외) */
export async function fetchMyPickupRows(supabase: SupabaseClient, userId: string): Promise<MyPickupRow[]> {
  return selectAllPages<MyPickupRow>(TAG, '내가 주운 드랍', (from, to) =>
    supabase
      .from('poi_drops')
      .select('inventory_item_id, dropper_user_id')
      .eq('picked_up_by', userId)
      .not('inventory_item_id', 'is', null)
      .order('id')
      .range(from, to)
  )
}

/** 드랍한 아이템 수 — 내가 놓은 서로 다른 개체 수 */
export async function countDroppedItems(supabase: SupabaseClient, userId: string): Promise<number> {
  const drops = await fetchMyDropRows(supabase, userId)
  return computeDropPickupMetrics(userId, drops, []).dropItemCount
}

/** 픽업한 아이템 수 — 내가 주운 서로 다른 개체 수(자기 드랍 제외) */
export async function countPickedUpItems(supabase: SupabaseClient, userId: string): Promise<number> {
  const pickups = await fetchMyPickupRows(supabase, userId)
  return computeDropPickupMetrics(userId, [], pickups).pickupItemCount
}

/** 함께 줍기 — 내가 주운 드랍을 놓은 서로 다른 유저 수(자기·시스템·탈퇴 제외) */
export async function countPickupFromUsers(supabase: SupabaseClient, userId: string): Promise<number> {
  const pickups = await fetchMyPickupRows(supabase, userId)
  return computeDropPickupMetrics(userId, [], pickups).pickupFromUserCount
}

/** 나눔가 — 내가 놓은 드랍을 주운 서로 다른 유저 수(자기·탈퇴 제외) */
export async function countPickedUpByUsers(supabase: SupabaseClient, userId: string): Promise<number> {
  const drops = await fetchMyDropRows(supabase, userId)
  return computeDropPickupMetrics(userId, drops, []).pickedUpByUserCount
}
