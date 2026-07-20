/**
 * JAM! 아이템 드랍 엔진 (서버 사이드 전용)
 *
 * - 활동 1건 완료 시 rarity 기반 확률로 아이템 배지 드랍 시도
 * - inventory 슬롯 초과 시 드랍 안 함
 * - service_role 클라이언트 사용 (RLS 우회)
 */
import { createServiceClient } from '@/lib/supabase/server'
import { recordFeedEvent } from '@/lib/activity-feed'
import type { BadgeRarity, ActivityType, BadgeRow, BadgeCondition, InventoryRow } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'
import { getAbusingPolicy } from '@/lib/abusing/policy'
import { getUserBanLevel, shouldAllowDrop } from '@/lib/abusing/shadow-ban'
import { checkCondition } from '@/lib/badge-engine/index'

// rarity별 드랍 확률 구간 (누적)
// [0, 0.40) → common
// [0.40, 0.65) → rare
// [0.65, 0.75) → legendary
// [0.75, 0.80) → mythic
// [0.80, 1.00) → 드랍 없음
const RARITY_THRESHOLDS: Array<{ rarity: BadgeRarity; threshold: number }> = [
  { rarity: 'common', threshold: 0.40 },
  { rarity: 'rare', threshold: 0.65 },
  { rarity: 'legendary', threshold: 0.75 },
  { rarity: 'mythic', threshold: 0.80 },
]

/**
 * rarity 추첨. 드랍 없음인 경우 null 반환.
 */
function rollRarity(): BadgeRarity | null {
  const roll = Math.random()
  for (const { rarity, threshold } of RARITY_THRESHOLDS) {
    if (roll < threshold) return rarity
  }
  return null // 20% 드랍 없음
}

/**
 * 드랍엔진은 활동 1건(또는 이번 싱크 배치)만으로 조건을 평가한다.
 * 아래 필드는 유저 이력 전반에 걸친 누적/기간 집계가 있어야 올바르게 평가되므로,
 * 단일 활동 시점에서는 평가가 불가능하다. 이런 필드를 가진 아이템 배지는
 * 드랍 대상에서 명시적으로 제외한다 (자동 통과·오발급 방지).
 *
 * - monthly_km   : 특정 월 누적 거리
 * - season_count : 계절 내 활동 횟수
 * - weekly_count : 같은 주 내 활동 횟수
 * - streak_days  : 연속 활동 일수
 * - total_count  : 누적 활동 횟수
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

/**
 * 아이템 배지가 이번 활동 시점에서 드랍 가능한지 판정한다.
 * - 조건 없음 → 항상 드랍 가능
 * - 누적/기간 조건 포함 → 드랍 불가 (단일 활동으로 평가 불가)
 * - 그 외 단일 활동 평가 가능 조건 → checkCondition 결과에 따름
 */
export function isDroppableForActivity(
  cond: BadgeCondition | null,
  activities: NormalizedActivity[]
): boolean {
  if (!cond || Object.keys(cond).length === 0) return true
  if (hasCumulativeCondition(cond)) return false
  return checkCondition(cond, activities)
}

/**
 * drop_weight 기반 가중 랜덤 선택.
 */
function weightedPick<T extends { drop_weight: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.drop_weight, 0)
  let rand = Math.random() * total
  for (const item of items) {
    rand -= item.drop_weight
    if (rand <= 0) return item
  }
  return items[items.length - 1]
}

/**
 * 활동 1건당 아이템 드랍을 시도합니다.
 * @param userId - 대상 유저 ID
 * @param activityType - 활동 종류 ('cycling' | 'running' | 'road_running' | 'trail_running' | 'hiking' | 'walking')
 */
export async function tryItemDrop(
  userId: string,
  activityType: ActivityType | string,
  activities: NormalizedActivity[] = []
): Promise<void> {
  // 1. rarity 추첨
  const rarity = rollRarity()
  if (!rarity) return

  // 2. 섀도우밴 체크 — 밴 레벨에 따라 고가치 아이템 드랍 차단
  const [banLevel, policy] = await Promise.all([
    getUserBanLevel(userId),
    getAbusingPolicy(),
  ])
  if (!shouldAllowDrop(rarity, banLevel, policy)) {
    console.info(`[tryItemDrop] 섀도우밴으로 드랍 차단 — userId: ${userId}, rarity: ${rarity}, level: ${banLevel}`)
    return
  }

  const supabase = createServiceClient()

  // 3. 해당 rarity + type='item' 배지 목록 조회 (유효 기간 필터 + 활성 아이템북 소속만)
  const now = new Date().toISOString()

  // 3-a. is_active = true 인 아이템북 ID 목록
  const { data: activeBooksRaw } = await supabase
    .from('item_books')
    .select('id')
    .eq('is_active', true)
  const activeBookIds = ((activeBooksRaw ?? []) as { id: string }[]).map((b) => b.id)
  if (activeBookIds.length === 0) return

  // 3-b. 활성 아이템북 소속 배지만 드랍 풀에 포함
  const { data: candidatesRaw, error: badgesError } = await supabase
    .from('badges')
    .select('id, name, image_url, rarity, drop_weight, valid_from, valid_until, condition_json')
    .eq('type', 'item')
    .eq('rarity', rarity)
    .in('item_book_id', activeBookIds)
    .or(`valid_from.is.null,valid_from.lte.${now}`)
    .or(`valid_until.is.null,valid_until.gte.${now}`)

  const candidatesAll = candidatesRaw as Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity' | 'drop_weight' | 'valid_from' | 'valid_until' | 'condition_json'>[] | null

  if (badgesError || !candidatesAll || candidatesAll.length === 0) {
    if (badgesError) {
      console.error(`[tryItemDrop] 배지 조회 오류 (rarity: ${rarity}):`, badgesError)
    }
    return
  }

  // 4. condition_json 필터 — 조건이 있는 배지는 조건 충족 시에만 드랍 풀에 포함.
  //    누적/기간 조건(monthly_km, season_count 등)을 가진 배지는 단일 활동으로
  //    평가할 수 없으므로 드랍 대상에서 제외한다 (isDroppableForActivity).
  const candidates = candidatesAll.filter((b) =>
    isDroppableForActivity(b.condition_json as BadgeCondition | null, activities)
  )

  if (candidates.length === 0) return

  // 5. drop_weight 기반 가중 랜덤 선택
  const picked = weightedPick(candidates)

  // 6. 인벤토리 슬롯 확인
  const { data: inventoryRaw, error: inventoryError } = await supabase
    .from('inventory')
    .select('id, used_slots, max_slots')
    .eq('user_id', userId)
    .single()

  const inventory = inventoryRaw as Pick<InventoryRow, 'id' | 'used_slots' | 'max_slots'> | null

  if (inventoryError || !inventory) {
    console.error(`[tryItemDrop] 인벤토리 조회 오류 (userId: ${userId}):`, inventoryError)
    return
  }

  if (inventory.used_slots >= inventory.max_slots) {
    console.info(`[tryItemDrop] 슬롯 초과 — 드랍 취소 (userId: ${userId}, used: ${inventory.used_slots}/${inventory.max_slots})`)
    return
  }

  // 6. inventory_items INSERT (만료일: 배지의 valid_until, 없으면 null)
  const expiresAt = picked.valid_until ?? null

  const { error: insertError } = await supabase
    .from('inventory_items')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      inventory_id: inventory.id,
      badge_id: picked.id,
      obtained_by: 'drop',
      expires_at: expiresAt,
    } as any)

  if (insertError) {
    console.error(`[tryItemDrop] inventory_items 삽입 오류 (badge_id: ${picked.id}):`, insertError)
    return
  }

  // 7. inventory.used_slots +1
  const { error: updateError } = await supabase
    .from('inventory')
    // @ts-expect-error supabase-js update() 파라미터 never 추론 문제
    .update({ used_slots: inventory.used_slots + 1 })
    .eq('id', inventory.id)

  if (updateError) {
    console.error(`[tryItemDrop] used_slots 업데이트 오류 (inventoryId: ${inventory.id}):`, updateError)
    return
  }

  console.info(
    `[tryItemDrop] 아이템 드랍 완료 — userId: ${userId}, badge: ${picked.name}, rarity: ${rarity}, activityType: ${activityType}, expires: ${expiresAt}`
  )
  await recordFeedEvent(userId, 'item_dropped', {
    badge_id: picked.id,
    badge_name: picked.name,
    badge_image_url: picked.image_url ?? '',
    rarity: picked.rarity,
    poi_name: '',
  })
}
