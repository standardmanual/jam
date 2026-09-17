/**
 * 믹스 레시피 저장 페이로드 → DB 행 변환 — 슬롯 기반 OR 매칭 (티켓 20260917_1427)
 *
 * 어드민 폼은 슬롯마다 배지 타입을 고정하고 후보(OR)를 여러 개 담는다. **타입 일치
 * 검증은 서버가 배지 실제 타입으로 수행한다** — 클라이언트가 보낸 분류를 신뢰하지 않는다.
 * POST/PATCH 두 라우트가 같은 규칙을 쓰도록 이 파일이 단일 출처다.
 *
 * 슬롯 저장은 `combination_recipe_slots`에 대한 delete-then-insert(레시피 수정 시 슬롯
 * 전체 교체) 방식이다 — 실제 delete-then-insert 실행은 이 파일을 호출하는 API 라우트가
 * 레시피 upsert 성공 이후 수행한다(레시피 id가 먼저 확정돼야 슬롯의 recipe_id를 채울 수
 * 있어 신규 생성 시 순서상 분리가 불가피하다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import {
  normalizeRecipePayload,
  validateSlotTypes,
  type NormalizedSlot,
  type RecipePayloadInput,
} from '@/lib/combine/recipe-payload'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface RecipeRow {
  reward_points: number
  reward_badge_ids: string[]
}

export interface RecipeSlotRow {
  slot_order: number
  badge_type: NormalizedSlot['badgeType']
  allowed_badge_ids: string[]
}

export async function buildRecipeRow(
  supabase: ServiceClient,
  body: RecipePayloadInput
): Promise<{ ok: true; row: RecipeRow; slots: RecipeSlotRow[] } | { ok: false; error: string }> {
  const normalized = normalizeRecipePayload(body)
  if (!normalized.ok) return normalized

  const { slots, rewardPoints, rewardBadgeIds } = normalized.value

  // 슬롯 후보 배지 전체의 실제 타입 조회 — 삭제된 배지는 후보로 쓸 수 없다.
  const allowedBadgeIds = [...new Set(slots.flatMap((s) => s.allowedBadgeIds))]
  const { data: badgesRaw, error } = await supabase
    .from('badges')
    .select('id, type')
    .in('id', allowedBadgeIds)
    .is('deleted_at', null)
  if (error) {
    console.error('[recipe-write] 슬롯 후보 배지 타입 조회 실패:', error)
    return { ok: false, error: '슬롯 후보 배지를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }
  const badges = (badgesRaw ?? []) as { id: string; type: string }[]
  if (badges.length !== allowedBadgeIds.length) {
    return { ok: false, error: '슬롯에 지정한 후보 중 삭제되었거나 존재하지 않는 배지가 있어요. 다시 선택해 주세요.' }
  }

  const actualTypeById = new Map(badges.map((b) => [b.id, b.type]))
  const validSlots = validateSlotTypes(slots, actualTypeById)
  if (!validSlots.ok) return validSlots

  // 보상 배지는 존재·미삭제 + **아이템 배지 여부**를 확인한다.
  // 엔진의 배지 지급은 inventory_items에 개체를 꽂는 경로뿐이라, 액티비티·체크인 배지를
  // 보상으로 두면 인벤토리에는 개체가 생기지만 각 타입의 획득 기록 테이블
  // (user_activity_badges / user_checkin_badge_earns)에는 남지 않아 데이터가 어긋난다.
  if (rewardBadgeIds.length > 0) {
    const { data: rewardRaw, error: rewardError } = await supabase
      .from('badges')
      .select('id, type')
      .in('id', rewardBadgeIds)
      .is('deleted_at', null)
    if (rewardError) {
      console.error('[recipe-write] 보상 배지 조회 실패:', rewardError)
      return { ok: false, error: '보상 배지를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' }
    }
    const rewardBadges = (rewardRaw ?? []) as { id: string; type: string }[]
    if (rewardBadges.length !== rewardBadgeIds.length) {
      return { ok: false, error: '선택한 보상 배지 중 삭제되었거나 존재하지 않는 배지가 있어요. 다시 선택해 주세요.' }
    }
    if (rewardBadges.some((b) => b.type !== 'item')) {
      return {
        ok: false,
        error: '보상 배지는 아이템 배지만 지정할 수 있어요. 액티비티·체크인 배지는 보상으로 쓸 수 없어요.',
      }
    }
  }

  return {
    ok: true,
    row: {
      reward_points: rewardPoints,
      reward_badge_ids: rewardBadgeIds,
    },
    slots: slots.map((s, idx) => ({
      slot_order: idx,
      badge_type: s.badgeType,
      allowed_badge_ids: s.allowedBadgeIds,
    })),
  }
}

/** 레시피 슬롯 전체 교체 — delete-then-insert. */
export async function replaceRecipeSlots(
  supabase: ServiceClient,
  recipeId: string,
  slots: RecipeSlotRow[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: deleteError } = await supabase
    .from('combination_recipe_slots')
    .delete()
    .eq('recipe_id', recipeId)
  if (deleteError) {
    console.error('[recipe-write] 기존 슬롯 삭제 실패:', deleteError)
    return { ok: false, error: '슬롯을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }

  const { error: insertError } = await supabase.from('combination_recipe_slots').insert(
    slots.map((s) => ({
      recipe_id: recipeId,
      slot_order: s.slot_order,
      badge_type: s.badge_type,
      allowed_badge_ids: s.allowed_badge_ids,
    }))
  )
  if (insertError) {
    console.error('[recipe-write] 슬롯 저장 실패:', insertError)
    return { ok: false, error: '슬롯을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }

  return { ok: true }
}
