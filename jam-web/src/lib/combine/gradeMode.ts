/**
 * 믹스 레시피 유형(등급 대응형/등급 고정형) 판정 — 순수 함수 (티켓 20261114_1705 1회차, 마이그레이션 340)
 *
 * 등급 대응형(`follow_materials`) 레시피는 슬롯 후보와 보상 배지에 «아이템 배지 묶음»(같은 컬렉션·같은 이름)의 4등급 배지를 모두 담는다.
 * 재료를 모두 같은 등급으로 넣으면 결과도 그 등급이다(확률 없음, 100%). 판정은 세 단계다.
 *  1) `resolveMaterialGrade` — 투입 재료의 등급이 한 가지인지 본다. 섞였으면 재료를 소각하기 전에 거절한다.
 *  2) `narrowSlotsToGrade` — 슬롯 후보를 그 등급의 배지로 좁힌다. 이후 슬롯 대응은 등급 고정형과 같은 알고리즘이다.
 *  3) `pickRewardBadgeIdsForGrade` — 보상 배지 중 그 등급의 것만 고른다(등급이 없는 배지는 그대로 둔다).
 *
 * 등급 고정형(`fixed`, 기본)은 이 파일을 거치지 않는다 — 지금 방식 그대로다. 칸이 없거나 알 수 없는 값도 `fixed`다
 * (마이그레이션 340이 적용되기 전 환경에서도 레시피가 갑자기 바뀌지 않는다).
 */
import type { CombinationRecipeSlotRow, CombineRecipeGradeMode } from '@/types/database'

/** 배지 id → 등급(`badges.rarity`) 조회 결과. 등급이 없는 배지(액티비티·체크인 등)는 값이 `null`이다. */
export type RarityById = ReadonlyMap<string, string | null>

/** 레시피 유형을 읽는다. `follow_materials`만 등급 대응형이고 그 밖의 값·빈 칸은 모두 `fixed`다. */
export function resolveGradeMode(recipe: { grade_mode?: string | null }): CombineRecipeGradeMode {
  return recipe.grade_mode === 'follow_materials' ? 'follow_materials' : 'fixed'
}

export type MaterialGradeResult =
  | { ok: true; rarity: string }
  /** `mixed`: 재료 등급이 둘 이상이다. `unknown`: 재료 중 등급을 알 수 없는 배지가 있다(조회되지 않았거나 등급이 없다). 재료가 없어도 `unknown`이다. */
  | { ok: false; reason: 'mixed' | 'unknown' }

/**
 * 투입 재료(아이템 배지) 등급이 한 가지인지 본다. 등급을 하나라도 알 수 없으면 `unknown`, 알려진 등급이 둘 이상이면 `mixed`다.
 * 알 수 없는 재료와 섞인 경우에는 `unknown`이 앞선다(등급을 모르면 같은 등급이라고 말할 수 없다).
 */
export function resolveMaterialGrade(inputBadgeIds: readonly string[], rarityById: RarityById): MaterialGradeResult {
  if (inputBadgeIds.length === 0) return { ok: false, reason: 'unknown' }
  const rarities = new Set<string>()
  for (const id of inputBadgeIds) {
    const rarity = rarityById.get(id)
    if (!rarity) return { ok: false, reason: 'unknown' }
    rarities.add(rarity)
  }
  if (rarities.size > 1) return { ok: false, reason: 'mixed' }
  return { ok: true, rarity: [...rarities][0] }
}

/**
 * 아이템 슬롯의 후보를 `rarity` 등급의 배지로 좁힌다. 액티비티·체크인 슬롯은 등급이 없으므로 그대로 둔다.
 * 입력 배열은 바꾸지 않는다. 좁힌 결과 후보가 비는 아이템 슬롯은 어떤 재료도 받지 못하므로 매칭이 성립하지 않는다.
 */
export function narrowSlotsToGrade(
  slots: readonly CombinationRecipeSlotRow[],
  rarity: string,
  rarityById: RarityById
): CombinationRecipeSlotRow[] {
  return slots.map((slot) =>
    slot.badge_type === 'item'
      ? { ...slot, allowed_badge_ids: slot.allowed_badge_ids.filter((id) => rarityById.get(id) === rarity) }
      : slot
  )
}

/**
 * 보상 배지 중 `rarity` 등급의 것만 고른다. 입력 순서를 지킨다. 등급이 없는(`null`·조회되지 않은) 배지는 등급을 따를 수 없으므로
 * 남기지 않는다 — 삭제된 배지는 어차피 지급되지 않는다.
 */
export function pickRewardBadgeIdsForGrade(
  rewardBadgeIds: readonly string[],
  rarity: string,
  rarityById: RarityById
): string[] {
  return rewardBadgeIds.filter((id) => rarityById.get(id) === rarity)
}
