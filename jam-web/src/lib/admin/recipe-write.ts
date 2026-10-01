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
 *
 * 공개 시각(티켓 20261001_1158): 생성(`createRecipeWithSlots`)·예약 취소(`cancelScheduledRecipe`)·
 * 시각 변경 가드(`assertValidFromChange`)·공개 상태 판정(`recipeReleaseState`)을 이 파일에서 낸다 —
 * 어드민 라우트와 운영툴 자원 연결(티켓 20260930_1500)이 같은 함수를 부른다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import {
  normalizeRecipePayload,
  validateSlotTypes,
  type NormalizedSlot,
  type RecipePayloadInput,
} from '@/lib/combine/recipe-payload'
import { isRecipeReleased, type RecipeReleaseInput } from '@/lib/combine/visibility'
import { collectRecipeReferences } from '@/lib/admin/recipe-references'
import { recipeDeleteBlockedMessage } from '@/lib/admin/recipe-bulk'
import { isUuid } from '@/lib/admin/uuid'
import type { CombinationRecipeRow } from '@/types/database'

export { recipeReleaseState, type RecipeReleaseState } from '@/lib/combine/visibility'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface RecipeRow {
  name: string
  reward_points: number
  reward_badge_ids: string[]
  /** 제출하지 않으면 행에 넣지 않는다(수정 때 기존 공개 시각을 그대로 둔다). `null`은 바로 공개 */
  valid_from?: string | null
}

export interface RecipeSlotRow {
  slot_order: number
  badge_type: NormalizedSlot['badgeType']
  allowed_badge_ids: string[]
}

export async function buildRecipeRow(
  supabase: ServiceClient,
  body: RecipePayloadInput,
  now: Date = new Date()
): Promise<{ ok: true; row: RecipeRow; slots: RecipeSlotRow[] } | { ok: false; error: string }> {
  const normalized = normalizeRecipePayload(body, now)
  if (!normalized.ok) return normalized

  const { name, slots, rewardPoints, rewardBadgeIds, validFrom } = normalized.value

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
      name,
      reward_points: rewardPoints,
      reward_badge_ids: rewardBadgeIds,
      ...(validFrom !== undefined ? { valid_from: validFrom } : {}),
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

export type CreateRecipeResult =
  | { ok: true; recipe: CombinationRecipeRow; slots: RecipeSlotRow[] }
  | { ok: false; status: 400 | 500; error: string }

/**
 * 레시피 행 + 슬롯 생성 — 검증(`buildRecipeRow`) → 행 insert → 슬롯 저장. 슬롯 저장이 실패하면 행만
 * 남는 반쪽 상태를 막으려고 방금 만든 행을 지운다. POST 라우트와 운영툴 자원 연결(티켓 20260930_1500)이
 * 같이 쓴다(티켓 20261001_1158).
 */
export async function createRecipeWithSlots(
  supabase: ServiceClient,
  body: RecipePayloadInput,
  now: Date = new Date()
): Promise<CreateRecipeResult> {
  const built = await buildRecipeRow(supabase, body, now)
  if (!built.ok) return { ok: false, status: 400, error: built.error }

  const { data, error } = await supabase.from('combination_recipes').insert(built.row).select().single()
  if (error) return { ok: false, status: 500, error: error.message }

  const recipe = data as CombinationRecipeRow
  const slotResult = await replaceRecipeSlots(supabase, recipe.id, built.slots)
  if (!slotResult.ok) {
    await supabase.from('combination_recipes').delete().eq('id', recipe.id)
    return { ok: false, status: 500, error: slotResult.error }
  }

  return { ok: true, recipe, slots: built.slots }
}

export type CancelScheduledRecipeResult =
  | { ok: true }
  | { ok: false; status: 404 | 409 | 500; error: string }

/**
 * 공개 전(예약 중) 레시피 취소 = 삭제(티켓 20261001_1158). 레시피에는 종료 시각이 없어 «취소»는 곧 삭제다.
 *
 * 1. 삭제 가드(`collectRecipeReferences`)를 먼저 거친다 — 배지 조건이 가리키는 레시피는 예약 중이어도 지울 수 없다.
 *    조회가 실패하면 fail-closed로 막는다.
 * 2. 삭제는 `valid_from > now` 조건을 단 한 번의 DELETE로 건다 — 읽고 나서 지우는 사이에 공개 시각이 지나도
 *    공개된 레시피를 지우지 않는다. `valid_from`이 null인 행(바로 공개)은 조건에 걸리지 않는다.
 * 3. 지운 행이 없으면 행이 남아 있는지 다시 읽어 «이미 공개됨»(409)과 «없음»(404)을 가른다.
 *
 * 슬롯은 `combination_recipe_slots.recipe_id`의 CASCADE로 함께 지워진다.
 */
export async function cancelScheduledRecipe(
  supabase: ServiceClient,
  id: string,
  now: Date = new Date()
): Promise<CancelScheduledRecipeResult> {
  const notFound = { ok: false, status: 404, error: '레시피를 찾을 수 없어요.' } as const
  if (!isUuid(id)) return notFound

  const references = await collectRecipeReferences(supabase, [id])
  if (references.error) {
    console.error('[recipe-write] 참조 카운트 조회 실패 — 예약 취소를 차단합니다:', references.error)
    return {
      ok: false,
      status: 500,
      error: '취소할 수 없어요. 이력 조회 중 오류가 발생했어요. 다시 시도해도 같으면 개발자에게 전달해 주세요.',
    }
  }
  if (references.total > 0) {
    return { ok: false, status: 409, error: recipeDeleteBlockedMessage(references.total) }
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('combination_recipes')
    .delete()
    .eq('id', id)
    .gt('valid_from', now.toISOString())
    .select('id')
  if (deleteError) {
    console.error('[recipe-write] 예약 취소(삭제) 실패:', deleteError)
    return { ok: false, status: 500, error: '예약을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }
  if ((deleted ?? []).length > 0) return { ok: true }

  const { data: remaining, error: readError } = await supabase
    .from('combination_recipes')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (readError) {
    console.error('[recipe-write] 예약 취소 후 행 확인 실패:', readError)
    return { ok: false, status: 500, error: '예약을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }
  if (!remaining) return notFound
  return {
    ok: false,
    status: 409,
    error: '이미 공개된 레시피는 예약을 취소할 수 없어요. 내리려면 레시피 삭제를 이용해 주세요.',
  }
}

/**
 * 공개 시각 변경 가드(티켓 20261001_1158) — 이미 공개된 레시피는 공개 시각을 바꿀 수 없다. 예약 중이면 다른
 * 미래 시각이나 `null`(바로 공개)로 바꿀 수 있다(미래 여부는 `normalizeValidFrom`이 이미 걸렀다).
 * `nextValidFrom`이 `undefined`(제출하지 않음)이거나 기존 값과 같은 시각이면 바뀌는 게 없으니 통과한다.
 * 거절이면 호출부가 409로 돌려준다.
 */
export function assertValidFromChange(
  existing: RecipeReleaseInput,
  nextValidFrom: string | null | undefined,
  now: Date = new Date()
): { ok: true } | { ok: false; error: string } {
  if (nextValidFrom === undefined) return { ok: true }
  if (!isRecipeReleased(existing, now)) return { ok: true }
  if (sameReleaseInstant(existing.valid_from ?? null, nextValidFrom)) return { ok: true }
  return {
    ok: false,
    error: '이미 공개된 레시피는 공개 시각을 바꿀 수 없어요. 공개 시각을 빼고 다시 저장해 주세요.',
  }
}

function sameReleaseInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return new Date(a).getTime() === new Date(b).getTime()
}
