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
  /** 표시용 이름(마이그레이션 175) — 믹서 화면 상단 요약·레시피 탐색 목록에 노출한다 */
  name?: unknown
  /** 어드민이 구성한 슬롯 배열 */
  slots?: unknown
  reward_points?: unknown
  reward_badge_ids?: unknown
  /**
   * 공개 시각(마이그레이션 204, 티켓 20261001_1158) — 칸이 없으면 건드리지 않고, 빈 값·null이면 바로 공개,
   * 값이 있으면 시간대가 포함된 미래 ISO여야 한다.
   */
  valid_from?: unknown
}

export interface NormalizedRecipePayload {
  name: string
  slots: NormalizedSlot[]
  rewardPoints: number
  rewardBadgeIds: string[]
  /** `undefined`는 제출하지 않음(행을 바꾸지 않는다), `null`은 바로 공개, 문자열은 UTC ISO 예약 시각 */
  validFrom: string | null | undefined
}

/** 시간대가 붙은 ISO 8601 — 시간대가 없는 값은 서버 시간대로 해석돼 예약이 어긋나므로 받지 않는다 */
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

/**
 * 공개 시각 입력을 정규화한다 — 칸 없음(`undefined`)은 그대로, 빈 문자열·null은 바로 공개(`null`),
 * 값이 있으면 시간대가 포함된 ISO이고 해석 가능하며 `now`보다 미래여야 한다(가정 A6: 과거 시각은 오류).
 */
export function normalizeValidFrom(
  value: unknown,
  now: Date = new Date()
): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined }
  if (value === null || (typeof value === 'string' && value.trim() === '')) return { ok: true, value: null }
  if (typeof value !== 'string' || !ISO_WITH_ZONE.test(value.trim())) {
    return {
      ok: false,
      error:
        '공개 시각 형식이 올바르지 않아요. 시간대가 포함된 날짜와 시각이어야 해요(예: 2026-10-05T09:00:00+09:00). 시각을 다시 선택해 주세요.',
    }
  }
  const trimmed = value.trim()
  const at = new Date(trimmed)
  // `new Date`는 2월 31일을 3월 3일로 조용히 넘겨 읽는다 — 예약이 모르는 사이 밀리지 않도록 달력에 있는 날짜인지 따로 본다.
  const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed) ?? []
  const calendarDay = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (
    Number.isNaN(at.getTime()) ||
    calendarDay.getUTCMonth() !== Number(month) - 1 ||
    calendarDay.getUTCDate() !== Number(day)
  ) {
    return { ok: false, error: '공개 시각을 읽을 수 없어요. 존재하는 날짜와 시각으로 다시 선택해 주세요.' }
  }
  if (at.getTime() <= now.getTime()) {
    return {
      ok: false,
      error: '공개 시각이 이미 지났어요. 지금보다 늦은 시각을 고르거나 「바로 공개」로 바꿔 주세요.',
    }
  }
  return { ok: true, value: at.toISOString() }
}

/**
 * 형식 검증 — 슬롯 배열 구조, 슬롯 개수 하한/상한, 슬롯당 후보 최소 1개, 보상 3분기, 공개 시각.
 * 배지 실제 타입 조회가 필요한 검증(슬롯 내 타입 일치, 아이템 타입 슬롯 하한)은
 * `validateSlotTypes()`가 담당한다.
 */
export function normalizeRecipePayload(
  body: RecipePayloadInput,
  now: Date = new Date()
): { ok: true; value: NormalizedRecipePayload } | { ok: false; error: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return { ok: false, error: '레시피 이름을 입력해 주세요.' }

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

  const validFrom = normalizeValidFrom(body.valid_from, now)
  if (!validFrom.ok) return validFrom

  return {
    ok: true,
    value: { name, slots, rewardPoints, rewardBadgeIds, validFrom: validFrom.value },
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
