/**
 * 믹스 레시피 어드민 페이로드 검증·정규화 — 슬롯 기반 OR 매칭 (티켓 20260917_1427)
 *
 * 슬롯 하나는 "이 자리에 넣을 수 있는 배지 후보 목록(OR)"이다. 어드민은 슬롯마다
 * `badge_type`(아이템/액티비티/체크인)을 고정하고, 같은 타입의 배지만 후보로 담는다.
 * **타입 일치 검증은 서버가 배지 실제 타입으로 수행한다** — 클라이언트가 보낸 분류를
 * 신뢰하지 않는다(실제 배지 타입 조회는 `lib/admin/recipe-write.ts`에서 수행).
 *
 * 소각 여부는 슬롯 컬럼이 아니라 `badge_type` 값으로 항상 고정 결정한다
 * (item = 소각, activity|checkin = 비소각).
 *
 * 이전(티켓 20260910_1408)에는 재료를 `ingredient_badge_ids`(소각) · `required_badge_ids`
 * (보유 조건) 두 배열로 저장해 "정확히 일치"만 매칭됐다. 슬롯 구조가 이를 완전히 대체한다.
 */

export type CombineSlotBadgeType = 'item' | 'activity' | 'checkin'

const SLOT_BADGE_TYPES: readonly CombineSlotBadgeType[] = ['item', 'activity', 'checkin']

export interface NormalizedSlot {
  badgeType: CombineSlotBadgeType
  allowedBadgeIds: string[]
}

/** 레시피당 슬롯 개수 — 최소 2개, 최대 10개 (구 MIN_INGREDIENTS/MAX_INGREDIENTS를 슬롯 개수 기준으로 재정의) */
export const MIN_SLOTS = 2
export const MAX_SLOTS = 10
/** 소각되는 재료가 전혀 없는 레시피 방지 — 최소 1개의 아이템 타입 슬롯이 있어야 한다 */
export const MIN_ITEM_SLOTS = 1

export interface RecipeSlotInput {
  badge_type?: unknown
  allowed_badge_ids?: unknown
}

export interface RecipePayloadInput {
  /** 어드민이 구성한 슬롯 배열 */
  slots?: unknown
  reward_points?: unknown
  reward_badge_ids?: unknown
}

export interface NormalizedRecipePayload {
  slots: NormalizedSlot[]
  rewardPoints: number
  rewardBadgeIds: string[]
}

/**
 * 형식 검증 — 슬롯 배열 구조, 슬롯 개수 하한/상한, 슬롯당 후보 최소 1개, 보상 3분기.
 * 배지 실제 타입 조회가 필요한 검증(슬롯 내 타입 일치, 아이템 타입 슬롯 하한)은
 * `validateSlotTypes()`가 담당한다.
 */
export function normalizeRecipePayload(
  body: RecipePayloadInput
): { ok: true; value: NormalizedRecipePayload } | { ok: false; error: string } {
  const slots = normalizeSlots(body.slots)
  if (!slots) return { ok: false, error: '슬롯 구성이 올바르지 않아요. 슬롯을 다시 확인해 주세요.' }
  if (slots.length < MIN_SLOTS) {
    return { ok: false, error: `슬롯을 ${MIN_SLOTS}개 이상 만들어 주세요.` }
  }
  if (slots.length > MAX_SLOTS) {
    return { ok: false, error: `슬롯은 최대 ${MAX_SLOTS}개까지 만들 수 있어요.` }
  }
  for (const slot of slots) {
    if (slot.allowedBadgeIds.length === 0) {
      return { ok: false, error: '슬롯마다 후보 배지를 1개 이상 넣어 주세요.' }
    }
  }

  const rewardBadgeIds = uniqueIds(body.reward_badge_ids)
  if (!rewardBadgeIds) return { ok: false, error: '보상 배지 목록이 올바르지 않아요. 중복 없이 다시 선택해 주세요.' }

  const rewardPointsRaw = body.reward_points
  const rewardPoints =
    rewardPointsRaw === undefined || rewardPointsRaw === null || rewardPointsRaw === ''
      ? 0
      : Number(rewardPointsRaw)
  if (!Number.isInteger(rewardPoints) || rewardPoints < 0) {
    return { ok: false, error: '보상 포인트는 0 이상의 정수여야 해요.' }
  }

  if (rewardPoints === 0 && rewardBadgeIds.length === 0) {
    return { ok: false, error: '보상을 하나 이상 지정해 주세요. 포인트나 배지 중 최소 하나가 필요해요.' }
  }

  return {
    ok: true,
    value: { slots, rewardPoints, rewardBadgeIds },
  }
}

/**
 * 배지 실제 타입 조회 결과로 슬롯을 검증한다.
 *  - 슬롯이 선언한 `badgeType`과 후보 배지들의 실제 타입이 전부 일치해야 한다.
 *  - 최소 1개의 아이템 타입 슬롯이 있어야 한다(소각되는 재료가 전혀 없는 레시피 방지).
 */
export function validateSlotTypes(
  slots: NormalizedSlot[],
  actualTypeById: Map<string, string>
): { ok: true } | { ok: false; error: string } {
  const itemSlotCount = slots.filter((s) => s.badgeType === 'item').length
  if (itemSlotCount < MIN_ITEM_SLOTS) {
    return {
      ok: false,
      error: `아이템 타입 슬롯을 ${MIN_ITEM_SLOTS}개 이상 만들어 주세요. 소각되는 재료가 없는 레시피는 만들 수 없어요.`,
    }
  }

  for (const slot of slots) {
    for (const badgeId of slot.allowedBadgeIds) {
      const actualType = actualTypeById.get(badgeId)
      if (actualType !== slot.badgeType) {
        return {
          ok: false,
          error: `이 슬롯은 ${slotTypeLabel(slot.badgeType)} 배지만 넣을 수 있어요. 다른 타입을 쓰려면 슬롯을 새로 추가해 주세요.`,
        }
      }
    }
  }

  return { ok: true }
}

function slotTypeLabel(type: CombineSlotBadgeType): string {
  if (type === 'item') return '아이템'
  if (type === 'activity') return '액티비티'
  return '체크인'
}

function normalizeSlots(value: unknown): NormalizedSlot[] | null {
  if (!Array.isArray(value)) return null
  const slots: NormalizedSlot[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null
    const slot = raw as RecipeSlotInput
    if (typeof slot.badge_type !== 'string' || !SLOT_BADGE_TYPES.includes(slot.badge_type as CombineSlotBadgeType)) {
      return null
    }
    const allowedBadgeIds = uniqueIds(slot.allowed_badge_ids)
    if (!allowedBadgeIds) return null
    slots.push({ badgeType: slot.badge_type as CombineSlotBadgeType, allowedBadgeIds })
  }
  return slots
}

function uniqueIds(value: unknown): string[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null
  const ids: string[] = []
  for (const v of value) {
    if (typeof v !== 'string' || !v.trim()) return null
    if (ids.includes(v)) return null
    ids.push(v)
  }
  return ids
}
