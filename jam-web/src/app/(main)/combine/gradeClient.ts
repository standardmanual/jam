/**
 * 믹서 화면의 등급 대응형 레시피 도우미 — 순수 함수 (티켓 20261114_1705 3회, 채원 사전 판정 2026-11-14). `tierUpClient.ts`의 짝이다.
 *
 * ⚠️ 이 파일의 등급 계산은 «화면이 고를 수 있는 칸을 좁혀 보여 주는 용도»일 뿐이다. 최종 판정은 서버(`lib/combine/gradeMode.ts`,
 * `combineRecipeAttempt` 3-a단계)가 소각 전에 한다. 둘이 어긋나도 서버가 거절하므로 재료는 안전하다. 클라이언트는 서버 규칙을
 * 새로 만들지 않고, 서버가 내려 준 후보·보상(끝난 등급은 `page.tsx`가 이미 뺐다)을 한 등급으로 좁히기만 한다.
 *
 * 등급은 저장하지 않는다. 채운 칸의 등급에서 매번 계산하므로 칸을 모두 비우면 저절로 풀린다(상태 불일치가 없다).
 * 서버 전용 모듈은 가져오지 않는다 — `gradeMode.ts`는 Supabase 의존이 없는 순수 파일이다.
 */
import { getRarityLabel } from '@/components/ui/RarityBadge'
import { d, t } from '@/lib/i18n'
import { representativeRewardBadges, resolveGradeMode } from '@/lib/combine/gradeMode'
import type { BadgeRarity, CombineSlotBadgeType } from '@/types/database'

interface GradeBadge {
  id: string
  rarity?: string | null
}

interface GradeSlot<C extends GradeBadge> {
  id: string
  badge_type: CombineSlotBadgeType
  candidates: C[]
}

interface GradeRecipe<C extends GradeBadge, B extends GradeBadge> {
  grade_mode?: string | null
  slots: GradeSlot<C>[]
  rewardBadges: B[]
}

type GradeFills = Record<string, { rarity?: string | null }>

/** 등급 대응형(`follow_materials`)인가 — 칸이 없거나 알 수 없는 값은 등급 고정형이다 */
export function isFollowMaterials(recipe: { grade_mode?: string | null }): boolean {
  return resolveGradeMode(recipe) === 'follow_materials'
}

/** 채운 아이템 칸의 등급들 — 등급을 모르는 재료(등급 없는 배지)는 세지 않는다 */
function filledItemRarities(recipe: GradeRecipe<GradeBadge, GradeBadge>, fills: GradeFills): Set<string> {
  const rarities = new Set<string>()
  for (const slot of recipe.slots) {
    if (slot.badge_type !== 'item') continue
    const rarity = fills[slot.id]?.rarity
    if (rarity) rarities.add(rarity)
  }
  return rarities
}

/**
 * 채운 아이템 칸이 정한 등급. 등급 고정형·빈 레시피·아직 아무것도 안 담았으면 `null`이다.
 * 등급이 섞여 있으면 어느 쪽도 고르지 않고 `null`이다(방어 — 화면은 섞이지 않게 후보를 좁히므로 정상 경로에서는 나오지 않는다).
 */
export function lockedGradeOf(recipe: GradeRecipe<GradeBadge, GradeBadge>, fills: GradeFills): string | null {
  if (!isFollowMaterials(recipe)) return null
  const rarities = filledItemRarities(recipe, fills)
  return rarities.size === 1 ? [...rarities][0] : null
}

/** 등급 대응형인데 채운 재료의 등급이 섞여 있다 — 제출을 막는 방어 판정(서버도 `mixed_grade_not_allowed`로 거절한다) */
export function hasMixedGrades(recipe: GradeRecipe<GradeBadge, GradeBadge>, fills: GradeFills): boolean {
  return isFollowMaterials(recipe) && filledItemRarities(recipe, fills).size > 1
}

/**
 * 아이템 슬롯의 후보와 보상 배지를 `rarity` 등급의 것으로 좁힌 레시피를 돌려준다. 입력은 바꾸지 않는다.
 * 액티비티·체크인 슬롯은 등급을 따르지 않으므로 그대로 둔다(서버 `narrowSlotsToGrade`와 같다). 등급 고정형이거나 `rarity`가 없으면 그대로 돌려준다.
 */
export function narrowRecipeToGrade<C extends GradeBadge, B extends GradeBadge, R extends GradeRecipe<C, B>>(
  recipe: R,
  rarity: string | null
): R {
  if (!rarity || !isFollowMaterials(recipe)) return recipe
  return {
    ...recipe,
    slots: recipe.slots.map((slot) =>
      slot.badge_type === 'item' ? { ...slot, candidates: slot.candidates.filter((c) => c.rarity === rarity) } : slot
    ),
    rewardBadges: recipe.rewardBadges.filter((b) => b.rarity === rarity),
  }
}

export { representativeRewardBadges }

/** 슬롯 그리드 아래 한 줄 — 「지금은 Rare 아이템 배지만 넣을 수 있어요」. 등급은 색이 아니라 영문 글자로 전한다 */
export function gradeLockNote(rarity: string): string {
  return t(d.combine.gradeLockNote, { rarity: getRarityLabel(rarity as BadgeRarity) ?? '' })
}
