/**
 * 믹스 레시피 어드민 페이로드 검증·정규화 (티켓 20260910_1408)
 *
 * 어드민 폼은 재료 슬롯 하나에서 아이템·액티비티·체크인 배지를 구분 없이 고른다.
 * **분류는 서버가 배지 타입으로 수행한다** — 클라이언트가 보낸 분류를 신뢰하지 않는다.
 *
 * - 아이템 배지 → `ingredient_badge_ids` (믹스 시 소각)
 * - 액티비티·체크인 배지 → `required_badge_ids` (보유 여부만 검증, 소각 안 함)
 *
 * 이전에는 `POST/PATCH /api/admin/recipes`가 body를 검증 없이 그대로 insert/update했다.
 */

export type IngredientBadgeType = 'item' | 'activity' | 'checkin'

export interface ClassifiedIngredients {
  ingredientBadgeIds: string[]
  requiredBadgeIds: string[]
}

/** 배지 타입으로 재료를 소각(아이템) / 보유 조건(액티비티·체크인)으로 가른다. 입력 순서를 보존한다. */
export function classifyIngredients(
  badges: { id: string; type: string }[]
): ClassifiedIngredients {
  const ingredientBadgeIds: string[] = []
  const requiredBadgeIds: string[] = []
  for (const badge of badges) {
    if (badge.type === 'item') ingredientBadgeIds.push(badge.id)
    else requiredBadgeIds.push(badge.id)
  }
  return { ingredientBadgeIds, requiredBadgeIds }
}

export const MIN_INGREDIENTS = 2
export const MAX_INGREDIENTS = 10

export interface RecipePayloadInput {
  /** 어드민이 재료 슬롯에서 고른 배지 id 전체 (타입 무관) */
  badge_ids?: unknown
  reward_points?: unknown
  reward_badge_ids?: unknown
  hint_text?: unknown
  is_public?: unknown
}

export interface NormalizedRecipePayload {
  badgeIds: string[]
  rewardPoints: number
  rewardBadgeIds: string[]
  hintText: string | null
  isPublic: boolean
}

/**
 * 분류 이전 단계의 형식 검증. 배지 타입 조회가 필요한 검증(아이템 배지 2개 이상)은
 * `validateClassified()`가 담당한다.
 */
export function normalizeRecipePayload(
  body: RecipePayloadInput
): { ok: true; value: NormalizedRecipePayload } | { ok: false; error: string } {
  const badgeIds = uniqueIds(body.badge_ids)
  if (!badgeIds) return { ok: false, error: '재료 배지 목록이 올바르지 않아요. 중복 없이 다시 선택해 주세요.' }
  if (badgeIds.length < MIN_INGREDIENTS) {
    return { ok: false, error: `재료를 ${MIN_INGREDIENTS}개 이상 선택해 주세요.` }
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

  const hintTextRaw = body.hint_text
  if (hintTextRaw !== undefined && hintTextRaw !== null && typeof hintTextRaw !== 'string') {
    return { ok: false, error: '힌트 문구가 올바르지 않아요.' }
  }
  const hintText = typeof hintTextRaw === 'string' && hintTextRaw.trim() ? hintTextRaw.trim() : null

  const isPublicRaw = body.is_public
  if (isPublicRaw !== undefined && typeof isPublicRaw !== 'boolean') {
    return { ok: false, error: '공개 여부가 올바르지 않아요.' }
  }

  return {
    ok: true,
    value: { badgeIds, rewardPoints, rewardBadgeIds, hintText, isPublic: isPublicRaw === true },
  }
}

/** 분류 결과 검증 — 소각 재료(아이템 배지)는 2~10개여야 한다. */
export function validateClassified(
  classified: ClassifiedIngredients
): { ok: true } | { ok: false; error: string } {
  const count = classified.ingredientBadgeIds.length
  if (count < MIN_INGREDIENTS) {
    return {
      ok: false,
      error: `소모될 아이템 배지를 ${MIN_INGREDIENTS}개 이상 선택해 주세요. 액티비티·체크인 배지는 보유 조건으로만 쓰여요.`,
    }
  }
  if (count > MAX_INGREDIENTS) {
    return { ok: false, error: `소모될 아이템 배지는 최대 ${MAX_INGREDIENTS}개까지 지정할 수 있어요.` }
  }
  return { ok: true }
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
