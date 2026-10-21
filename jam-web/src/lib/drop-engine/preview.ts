/**
 * 아이템 드랍 미리보기 — 어드민 시뮬레이터(`/api/admin/simulate`)용 (티켓 20261001_1219)
 *
 * `tryItemDrop`(index.ts)의 판정 순서를 **DB에 아무것도 쓰지 않고** 그대로 따라간다.
 * 시뮬레이터가 v1 상수로 따로 굴리던 때는 결과가 엔진과 어긋나 경제 판단의 근거가 되지 못했다.
 *
 * ⚠️ `tryItemDrop`의 판정 순서를 고치면 여기도 함께 고친다. 두 곳이 같은 순서로 같은 난수를
 * 소비해야 같은 난수열에서 같은 결과가 나온다(대조 테스트: `__tests__/preview.test.ts`).
 *
 * 두 층으로 나뉜다.
 * - `planItemDrops` — 순수 함수. 정책·드랍 상태·드랍 구조·난수를 받아 드랍 계획을 돌려준다.
 * - `previewItemDrop` — 정책·상태·구조를 읽어 `planItemDrops`를 부른다.
 *
 * 유저의 드랍 상태(연속 common·pity·일일 카운터)와 결산 소식·엔진 판정 로그는 남기지 않는다.
 * 계획 안에서 상태가 이어지는 것은 한 호출 안의 보너스 드랍(2개째)에 반영하기 위해서다.
 */
import type { BadgeRarity, UserDropStateRow } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'
import { isInventoryFull } from '@/lib/inventory/slots'
import { getDropPolicy, type DropPolicy } from './policy'
import {
  rollRarityV2,
  rollBonusDrop,
  isIntenseActivity,
  isComebackActivity,
  isWeeklyFirstActivity,
  type Rand,
  type RarityContext,
} from './layers'
import { matchContextTribes } from './context'
import {
  fetchDropStructure,
  getActivityDropWeight,
  getDropState,
  selectBadge,
  updateLastPiecePity,
  type DropBadge,
  type DropStructure,
} from './index'

/** 이번 드랍 시도가 드랍 없이 끝난 이유 — `tryItemDrop`의 `drop_attempt` outcome과 같은 이름이다 */
export type SkippedDropReason = 'slot_full' | 'no_candidate'

export interface PlannedDrop {
  /** 0 = 확정 드랍, 1 = 보너스 드랍 */
  attempt: number
  isBonus: boolean
  badge: DropBadge
  /** 등급 추첨 결과 */
  rolledRarity: BadgeRarity
  /** 후보를 고를 때 쓴 등급 — 상한이 없어 rolledRarity와 같다. 이 등급에 후보가 없으면 `badge.rarity`는 한 등급씩 내려간 등급이다(티켓 20261021_1250) */
  cappedRarity: BadgeRarity
  tribeId: string
  tribeName: string
  bookId: string
  isLastPiece: boolean
  contextActive: boolean
  isComeback: boolean
}

export interface SkippedDrop {
  attempt: number
  reason: SkippedDropReason
  rolledRarity?: BadgeRarity
  cappedRarity?: BadgeRarity
}

export interface DropPlan {
  drops: PlannedDrop[]
  skipped: SkippedDrop[]
  /** 슬롯·후보와 무관하게 굴린 드랍 시도 횟수 (1 또는 2) */
  dropCount: number
  comeback: boolean
  weeklyFirst: boolean
  intense: boolean
}

/** 인벤토리가 있는 드랍 구조 — 슬롯 확인에 쓴다 */
export type PlannableStructure = DropStructure & {
  inventory: NonNullable<DropStructure['inventory']>
}

export interface PlanItemDropsInput {
  policy: DropPolicy
  state: UserDropStateRow
  structure: PlannableStructure
  activity: NormalizedActivity | null
  /** UTC 기준 활동 시작 시각 (`tryItemDrop`의 activityStartDate와 같은 값) */
  activityStartDate: string
  /** `getActivityDropWeight(activity)` 값 */
  activityWeight: number
}

/**
 * `tryItemDrop`의 판정 흐름을 쓰기 없이 따라간다. `state`·`structure`는 복사본으로 다루므로
 * 호출부 객체는 바뀌지 않는다.
 */
export function planItemDrops(input: PlanItemDropsInput, rand: Rand): DropPlan {
  const { policy, activity, activityStartDate, activityWeight } = input
  const state: UserDropStateRow = {
    ...input.state,
    last_piece_pity: { ...(input.state.last_piece_pity ?? {}) },
  }
  const structure: PlannableStructure = { ...input.structure, owned: new Set(input.structure.owned) }

  // 일일 카운터 리셋 (활동 날짜 기준, UTC)
  const activityDate = activityStartDate.slice(0, 10)
  if (state.daily_drop_date !== activityDate) {
    state.daily_drop_count = 0
    state.daily_drop_date = activityDate
  }

  const comeback = isComebackActivity(policy, state.last_activity_at, activityStartDate)
  const weeklyFirst = isWeeklyFirstActivity(state.last_activity_at, activityStartDate)
  const intense = activity ? isIntenseActivity(policy, activity) : false

  // 맥락 오버라이드 매칭 (복귀는 발동률 무시하고 항상 적용)
  const contextMatch = matchContextTribes(activity, comeback)

  // Layer 1: 드랍 개수 — 1개 확정(activity_type 가중치 미적용) + 보너스(가중치 적용)
  const dropCount = 1 + (rollBonusDrop(policy, intense, rand, activityWeight) ? 1 : 0)
  let usedSlots = structure.inventory.used_slots

  const drops: PlannedDrop[] = []
  const skipped: SkippedDrop[] = []

  for (let i = 0; i < dropCount; i++) {
    // 슬롯 사전 체크 — "최소 1개"의 유일한 예외
    if (isInventoryFull({ used_slots: usedSlots, max_slots: structure.inventory.max_slots })) {
      skipped.push({ attempt: i, reason: 'slot_full' })
      break
    }

    const ctx: RarityContext = {
      commonStreak: state.common_streak,
      isComeback: comeback && i === 0, // 복귀·주간 보너스는 첫 드랍에만
      isWeeklyFirst: weeklyFirst && i === 0,
      dailyDropCount: state.daily_drop_count,
    }
    const rolled = rollRarityV2(policy, ctx, rand)
    // 섀도우밴 상한은 없다(티켓 20261021_1250) — `tryItemDrop`(index.ts)과 같게 추첨 등급을 그대로 쓰고, 응답 필드 이름(cappedRarity)은 그대로 둔다.
    const capped = rolled

    // 맥락 오버라이드 발동 판정 — 복귀는 항상, 그 외는 context_override_rate 확률
    const contextActive =
      contextMatch !== null && (contextMatch.always || rand() < policy.context_override_rate)
    const contextTribeIds = contextActive ? contextMatch.tribeIds : []

    // Layer 2·3: 트라이브 → 아이템북 → 배지
    const result = selectBadge(policy, structure, state, capped, contextTribeIds, rand)
    if (!result) {
      skipped.push({ attempt: i, reason: 'no_candidate', rolledRarity: rolled, cappedRarity: capped })
      continue
    }

    usedSlots += 1
    drops.push({
      attempt: i,
      isBonus: i > 0,
      badge: result.badge,
      rolledRarity: rolled,
      cappedRarity: capped,
      tribeId: result.tribeId,
      tribeName: structure.tribeNames.get(result.tribeId) ?? '',
      bookId: result.bookId,
      isLastPiece: result.isLastPiece,
      contextActive,
      isComeback: comeback && i === 0,
    })

    // 상태·구조 갱신 (같은 호출 안의 다음 드랍에 반영)
    updateLastPiecePity(structure, state, result.tribeId, result.badge.id)
    structure.owned.add(result.badge.id)
    state.daily_drop_count += 1
    state.total_drops += 1
    state.last_drop_tribe_id = result.tribeId
    state.last_drop_book_id = result.bookId
    if (result.badge.rarity === 'common') {
      // rare+ pity 진행 기여도에 activity_type 가중치 반영 (걷기는 0.4만큼만 전진)
      state.common_streak += activityWeight
    } else {
      state.common_streak = 0
    }
  }

  return { drops, skipped, dropCount, comeback, weeklyFirst, intense }
}

export type ItemDropPreview =
  | {
      kind: 'planned'
      plan: DropPlan
      /** 적용 모드가 고른 배지를 넣을 인벤토리 */
      inventory: PlannableStructure['inventory']
    }
  | {
      kind: 'unavailable'
      /** `tryItemDrop`의 `no_drop_structure`·`no_inventory` outcome과 같은 이름이다 */
      reason: 'no_drop_structure' | 'no_inventory'
    }

/**
 * 현재 `drop_policy`·유저 드랍 상태·드랍 구조를 읽어 이번 활동의 아이템 드랍을
 * 미리 굴린다. DB에 아무것도 쓰지 않는다.
 * @param activity - 이번 드랍의 기준 활동 (맥락·강도 판단)
 * @param activities - 이번 배치 전체 (condition_json 평가용)
 */
export async function previewItemDrop(
  userId: string,
  activity: NormalizedActivity | null,
  activities: NormalizedActivity[] = []
): Promise<ItemDropPreview> {
  const activityStartDate = activity?.startDate ?? new Date().toISOString()
  const activityWeight = getActivityDropWeight(activity)

  const [policy, state] = await Promise.all([getDropPolicy(), getDropState(userId)])
  const structure = await fetchDropStructure(userId, state.last_drop_tribe_id, activities)
  if (!structure) return { kind: 'unavailable', reason: 'no_drop_structure' }
  if (!structure.inventory) return { kind: 'unavailable', reason: 'no_inventory' }

  const plannable: PlannableStructure = { ...structure, inventory: structure.inventory }
  const plan = planItemDrops(
    {
      policy,
      state,
      structure: plannable,
      activity,
      activityStartDate,
      activityWeight,
    },
    Math.random
  )
  return { kind: 'planned', plan, inventory: structure.inventory }
}
