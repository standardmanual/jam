/**
 * 믹스 레시피 저장 페이로드 → DB 행 변환 (티켓 20260910_1408)
 *
 * 어드민 폼은 재료 슬롯 하나에서 배지 타입을 가리지 않고 고른다. **분류는 서버가
 * 배지 타입으로 수행한다** — 클라이언트가 보낸 분류를 신뢰하지 않는다.
 * POST/PATCH 두 라우트가 같은 규칙을 쓰도록 이 파일이 단일 출처다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import {
  classifyIngredients,
  normalizeRecipePayload,
  validateClassified,
  type RecipePayloadInput,
} from '@/lib/combine/recipe-payload'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface RecipeRow {
  ingredient_badge_ids: string[]
  required_badge_ids: string[]
  reward_points: number
  reward_badge_ids: string[]
  hint_text: string | null
  is_public: boolean
}

export async function buildRecipeRow(
  supabase: ServiceClient,
  body: RecipePayloadInput
): Promise<{ ok: true; row: RecipeRow } | { ok: false; error: string }> {
  const normalized = normalizeRecipePayload(body)
  if (!normalized.ok) return normalized

  const { badgeIds, rewardPoints, rewardBadgeIds, hintText, isPublic } = normalized.value

  // 재료 배지의 타입 조회 — 삭제된 배지는 재료로 쓸 수 없다.
  const { data: badgesRaw, error } = await supabase
    .from('badges')
    .select('id, type')
    .in('id', badgeIds)
    .is('deleted_at', null)
  if (error) {
    console.error('[recipe-write] 재료 배지 타입 조회 실패:', error)
    return { ok: false, error: '재료 배지를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }
  const badges = (badgesRaw ?? []) as { id: string; type: string }[]
  if (badges.length !== badgeIds.length) {
    return { ok: false, error: '선택한 재료 배지 중 삭제되었거나 존재하지 않는 배지가 있어요. 다시 선택해 주세요.' }
  }

  // 보상 배지도 존재·미삭제를 확인한다 — 지급 시점에 없으면 매칭돼도 빈손이 된다.
  if (rewardBadgeIds.length > 0) {
    const { data: rewardRaw, error: rewardError } = await supabase
      .from('badges')
      .select('id')
      .in('id', rewardBadgeIds)
      .is('deleted_at', null)
    if (rewardError) {
      console.error('[recipe-write] 보상 배지 조회 실패:', rewardError)
      return { ok: false, error: '보상 배지를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' }
    }
    if ((rewardRaw ?? []).length !== rewardBadgeIds.length) {
      return { ok: false, error: '선택한 보상 배지 중 삭제되었거나 존재하지 않는 배지가 있어요. 다시 선택해 주세요.' }
    }
  }

  // 폼이 보낸 순서를 보존한다(어드민이 슬롯을 배치한 순서 = 목록 표시 순서).
  const typeById = new Map(badges.map((b) => [b.id, b.type]))
  const ordered = badgeIds.map((id) => ({ id, type: typeById.get(id) ?? '' }))
  const classified = classifyIngredients(ordered)

  const valid = validateClassified(classified)
  if (!valid.ok) return valid

  return {
    ok: true,
    row: {
      ingredient_badge_ids: classified.ingredientBadgeIds,
      required_badge_ids: classified.requiredBadgeIds,
      reward_points: rewardPoints,
      reward_badge_ids: rewardBadgeIds,
      hint_text: hintText,
      is_public: isPublic,
    },
  }
}
