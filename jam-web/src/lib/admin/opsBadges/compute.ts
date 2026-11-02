/**
 * 배지 읽기 API의 계산 — 액티비티 배지 계열별·단계별 획득 수 (티켓 20261102_1602). 순수 함수다.
 *
 * - 계열 묶기·단계 이름·정렬은 어드민 계열 화면과 같은 함수를 쓴다(`groupBadgesIntoFamilies`·`slotLabelOf`).
 * - **숨김 배지(`is_hidden`)는 입력에서 걸러 응답에 없다.** 계열의 배지가 모두 숨김이면 계열 자체가 없다.
 * - 단계 항목마다 `badgeId`(배지 행 UUID)를 싣는다. 숨김 배지는 입력에서 이미 빠지므로 숨김 배지 ID는 나가지 않는다.
 * - 획득 수는 `user_activity_badges`에서 그 배지를 받은 행 수(받은 사람 수)다. 유저 ID는 입력에 없다.
 * - 조건 요약은 어드민 목록의 칩 문구(`formatConditionChipEntries`)를 「 · 」로 이은 한 줄이다. 미션 보상 배지는 칩이 없어 「미션 완료 시 지급」이다.
 */
import { formatConditionChipEntries } from '@/lib/badge-engine/conditionRegistry'
import { familySlotRank, groupBadgesIntoFamilies, slotLabelOf, type FamilyBadge } from '@/lib/admin/badge-families'
import type { BadgeCondition } from '@/types/database'

/** 계열 묶기에 쓰는 배지 + 숨김 여부 */
export type OpsBadgeInput = FamilyBadge & { is_hidden: boolean }

export interface OpsBadgeTier {
  /** 이 단계 배지 행의 UUID. 윤진이 `badge_spotlight` 카드의 `card.badge_ids`에 넣는다 (티켓 20261102_2254) */
  badgeId: string
  tier: string
  conditionSummary: string
  earnedCount: number
}

export interface OpsBadgeFamily {
  family: string
  name: string
  tiers: OpsBadgeTier[]
  hidden: false
}

export const NO_CONDITION_SUMMARY = '조건 정보 없음'
export const MISSION_REWARD_SUMMARY = '미션 완료 시 지급'
const SUMMARY_SEPARATOR = ' · '

/** 조건 JSON을 사람이 읽는 한 줄로 바꾼다 */
export function summarizeCondition(condition: BadgeCondition | null | undefined): string {
  const chips = formatConditionChipEntries(condition)
    .filter((entry) => entry.key !== 'mission_reward')
    .map((entry) => entry.text)
  if (chips.length > 0) return chips.join(SUMMARY_SEPARATOR)
  return condition?.mission_reward === true ? MISSION_REWARD_SUMMARY : NO_CONDITION_SUMMARY
}

export function buildBadgeFamilies(
  badges: readonly OpsBadgeInput[],
  earnedByBadge: ReadonlyMap<string, number>
): OpsBadgeFamily[] {
  const visible = badges.filter((badge) => !badge.is_hidden)
  const families = groupBadgesIntoFamilies(visible).map((family): OpsBadgeFamily => ({
    family: family.key,
    name: family.name,
    hidden: false,
    tiers: [...family.variants]
      .sort((a, b) => familySlotRank(a) - familySlotRank(b))
      .map((badge) => ({
        badgeId: badge.id,
        tier: slotLabelOf(badge),
        conditionSummary: summarizeCondition(badge.condition_json),
        earnedCount: earnedByBadge.get(badge.id) ?? 0,
      })),
  }))
  return families.sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.family.localeCompare(b.family))
}

export function filterFamiliesByName(families: readonly OpsBadgeFamily[], family: string): OpsBadgeFamily[] {
  const needle = family.toLowerCase()
  return needle === '' ? [...families] : families.filter((f) => f.name.toLowerCase().includes(needle))
}
