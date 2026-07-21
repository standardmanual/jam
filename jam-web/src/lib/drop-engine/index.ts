/**
 * JAM! 아이템 드랍 엔진 v2 (서버 사이드 전용)
 *
 * Layer 1 — 활동당 최소 1개 확정 드랍, 변동성은 희귀도·보너스로:
 *   - rarity 분포(60/28/9/3) + rare+ pity + 일일 하향 + 주간 첫 활동 + 복귀 보너스
 *   - 15%(고강도 30%) 확률 2개째 보너스 드랍
 * Layer 2·3 (세계관 모멘텀·완성 페이싱)는 Step C에서 적용.
 *
 * 로직 문서: PRD/badge/BADGE_ENGINE_UNIFIED.md §3
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
  type RarityContext,
} from './layers'

/**
 * 드랍엔진은 활동 1건(또는 이번 싱크 배치)만으로 조건을 평가한다.
 * 아래 필드는 유저 이력 전반 누적 집계가 필요해 단일 활동 시점 평가가 불가능하므로
 * 드랍 대상에서 명시적으로 제외한다 (자동 통과·오발급 방지).
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

type DropCandidate = Pick<
  BadgeRow,
  'id' | 'name' | 'image_url' | 'rarity' | 'drop_weight' | 'valid_from' | 'valid_until' | 'condition_json' | 'item_book_id'
>

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

/** user_drop_state 조회 (없으면 기본값 — lazy) */
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

/** 활성 아이템북 소속 + 유효기간 내 + rarity 일치(폴백 포함) 후보 조회 */
async function fetchCandidates(
  rarity: BadgeRarity,
  activities: NormalizedActivity[]
): Promise<{ candidates: DropCandidate[]; effectiveRarity: BadgeRarity } | null> {
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const { data: activeBooksRaw } = await supabase
    .from('item_books')
    .select('id')
    .eq('is_active', true)
  const activeBookIds = ((activeBooksRaw ?? []) as { id: string }[]).map((b) => b.id)
  if (activeBookIds.length === 0) return null

  for (const tryRarity of rarityFallbackOrder(rarity)) {
    const { data: candidatesRaw, error } = await supabase
      .from('badges')
      .select('id, name, image_url, rarity, drop_weight, valid_from, valid_until, condition_json, item_book_id')
      .eq('type', 'item')
      .eq('rarity', tryRarity)
      .in('item_book_id', activeBookIds)
      .or(`valid_from.is.null,valid_from.lte.${now}`)
      .or(`valid_until.is.null,valid_until.gte.${now}`)

    if (error) {
      console.error(`[tryItemDrop] 배지 조회 오류 (rarity: ${tryRarity}):`, error)
      continue
    }
    const candidates = ((candidatesRaw ?? []) as DropCandidate[]).filter((b) =>
      isDroppableForActivity(b.condition_json as BadgeCondition | null, activities)
    )
    if (candidates.length > 0) return { candidates, effectiveRarity: tryRarity }
  }
  return null
}

/** 인벤토리 삽입 (슬롯 체크 포함). 성공 시 true */
async function insertDrop(userId: string, picked: DropCandidate): Promise<boolean> {
  const supabase = createServiceClient()

  const { data: inventoryRaw, error: inventoryError } = await supabase
    .from('inventory')
    .select('id, used_slots, max_slots')
    .eq('user_id', userId)
    .single()
  const inventory = inventoryRaw as Pick<InventoryRow, 'id' | 'used_slots' | 'max_slots'> | null

  if (inventoryError || !inventory) {
    console.error(`[tryItemDrop] 인벤토리 조회 오류 (userId: ${userId}):`, inventoryError)
    return false
  }
  if (inventory.used_slots >= inventory.max_slots) {
    console.info(`[tryItemDrop] 슬롯 초과 — 드랍 취소 (userId: ${userId}, ${inventory.used_slots}/${inventory.max_slots})`)
    return false
  }

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
    return false
  }

  const { error: updateError } = await supabase
    .from('inventory')
    // @ts-expect-error supabase-js update() 파라미터 never 추론 문제
    .update({ used_slots: inventory.used_slots + 1 })
    .eq('id', inventory.id)
  if (updateError) {
    console.error(`[tryItemDrop] used_slots 업데이트 오류:`, updateError)
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

/**
 * 활동 1건당 아이템 드랍 (v2 Layer 1).
 * @param activity - 이번 드랍의 기준 활동 (맥락·강도 판단). 미전달 시 기본 롤만 수행 (레거시 호환)
 * @param activities - 이번 싱크 배치 전체 (condition_json 평가용)
 */
export async function tryItemDrop(
  userId: string,
  activity?: NormalizedActivity | string,
  activities: NormalizedActivity[] = []
): Promise<void> {
  // 레거시 시그니처 호환: 두 번째 인자가 activityType 문자열이면 activity 없이 진행
  const act: NormalizedActivity | null = typeof activity === 'object' ? activity : null
  const activityStartDate = act?.startDate ?? new Date().toISOString()

  const [policy, state] = await Promise.all([getDropPolicy(), getDropState(userId)])
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

  // 드랍 개수: 1개 확정 + 보너스
  const dropCount = 1 + (rollBonusDrop(policy, intense, rand) ? 1 : 0)

  for (let i = 0; i < dropCount; i++) {
    const ctx: RarityContext = {
      commonStreak: state.common_streak,
      isComeback: comeback && i === 0, // 복귀 보너스는 첫 드랍에만
      isWeeklyFirst: weeklyFirst && i === 0,
      dailyDropCount: state.daily_drop_count,
    }
    const rolled = rollRarityV2(policy, ctx, rand)
    const capped = await applyShadowBanCap(userId, rolled)
    if (!capped) continue

    const pool = await fetchCandidates(capped, activities)
    if (!pool) continue

    const picked = weightedPick(pool.candidates, rand)
    const inserted = await insertDrop(userId, picked)
    if (!inserted) break // 슬롯 초과 등 — 나머지 드랍도 불가

    // 상태 갱신
    state.daily_drop_count += 1
    state.total_drops += 1
    if (pool.effectiveRarity === 'common') {
      state.common_streak += 1
    } else {
      state.common_streak = 0
    }
    console.info(
      `[tryItemDrop] v2 드랍 — userId: ${userId}, badge: ${picked.name}, rarity: ${pool.effectiveRarity}` +
        `${comeback && i === 0 ? ' (복귀 보너스)' : ''}${i > 0 ? ' (보너스 드랍)' : ''}`
    )
  }

  state.last_activity_at = activityStartDate
  await saveDropState(state)
}
