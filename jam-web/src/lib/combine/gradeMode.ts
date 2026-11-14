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
import { GRADE_ORDER, groupItemBadgeBundles, type BundleBadgeInput } from '@/lib/admin/recipe-grade-bundles'
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

/**
 * 레시피의 «보상 배지 N개» 표시 개수 (티켓 20261114_2111). 홈 카드(`lib/today/cards.ts`)와 어드민 운영 서랍(`opsBoard/drawerView.ts`)이 함께 쓴다.
 *
 * 등급 고정형은 `reward_badge_ids`의 길이 그대로다. 등급 대응형은 보상 칸에 같은 이름의 4등급 배지가 모두 담겨 있지만 실제로 받는 것은 재료 등급에 맞는
 * 한 개이므로 «같은 컬렉션·같은 이름 묶음»의 수로 센다(보통 1). `badges`는 보상 배지의 이름·컬렉션을 담은 읽기 결과다(보상 배지 id가 아닌 행은 무시한다).
 * - 읽지 못했거나 삭제된 배지(`badges`에 없는 id)는 세지 않는다 — 읽지 못한 값 때문에 «4개»로 되돌아가지 않는다.
 * - 컬렉션이 없는 배지는 묶을 수 없어 각각 하나로 센다.
 */
export function rewardBadgeCountOf(
  recipe: { grade_mode?: string | null; reward_badge_ids?: readonly string[] | null },
  badges: readonly BundleBadgeInput[]
): number {
  const rewardIds = new Set(recipe.reward_badge_ids ?? [])
  if (resolveGradeMode(recipe) !== 'follow_materials') return recipe.reward_badge_ids?.length ?? 0
  const rewards = badges.filter((b) => rewardIds.has(b.id))
  return groupItemBadgeBundles(rewards).length + rewards.filter((b) => !b.item_book_id).length
}

/**
 * 아래 두 함수는 믹스 화면(`app/(main)/combine/gradeClient.ts`)에서 옮겨 왔다(티켓 20261114_2111) — 홈 카드 조회(`lib/today/cards.ts`)도 쓰는데,
 * `gradeClient.ts`는 한국어 사전(`lib/i18n`)을 가져와 이벤트 API 번들에 사전이 딸려 들어가기 때문이다. `gradeClient.ts`가 그대로 다시 내보낸다.
 * 등급 서열은 `lib/rarity.ts`의 `RARITY_TIER`와 같은 순서(common → mystic)인 `GRADE_ORDER`로 읽는다 — `rarity.ts`도 한국어 사전을 가져와 쓸 수 없다.
 */
function tierOf(rarity: string | null | undefined): number {
  const index = rarity ? (GRADE_ORDER as readonly string[]).indexOf(rarity) : -1
  return index >= 0 ? index : Number.POSITIVE_INFINITY
}

/**
 * 등급이 정해지기 전 요약 행에 넘길 «대표 배지». 레시피에 있는 가장 낮은 등급의 보상 배지이고 등급 칩이 나오지 않게 `rarity`를 `null`로 덮는다.
 * 낮은 등급 그림을 등급 칩과 함께 보이면 «Common이 나온다»로 읽히기 때문이다. 같은 등급에 보상 배지가 둘 이상이면(결과가 여러 개인 레시피) 그대로 둘 다 넘겨
 * «+N»이 사실을 말하게 한다. 등급 고정형은 이 함수를 쓰지 않는다(호출부가 보상 배지를 그대로 넘긴다).
 */
export function representativeRewardBadges<B extends { rarity?: string | null }>(recipe: { rewardBadges: B[] }): (Omit<B, 'rarity'> & { rarity: null })[] {
  if (recipe.rewardBadges.length === 0) return []
  const lowest = Math.min(...recipe.rewardBadges.map((b) => tierOf(b.rarity)))
  return recipe.rewardBadges.filter((b) => tierOf(b.rarity) === lowest).map((b) => ({ ...b, rarity: null }))
}

