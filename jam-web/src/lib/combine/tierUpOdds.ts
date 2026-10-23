/**
 * 등급 올리기의 순수한 규칙 — 재료 개수, 재료가 될 수 있는 등급, 재료 등급별 결과 등급 확률 (티켓 20261022_2119 4회, 운영 로직 8.4절)
 *
 * 서버 굴림(`lib/combine/tierUp.ts`)과 확률 안내 페이지(`lib/probability/disclosure.ts`)가 같은 함수를 쓰도록 `tierUp.ts`에서 뽑았다.
 * `tierUp.ts`는 소각·지급·챕터 점수 같은 서버 모듈을 줄줄이 가져오므로, 확률 안내가 그 모듈을 통째로 끌어오지 않게 하려는 것이다.
 * `tierUp.ts`가 아래 이름을 그대로 다시 내보내므로 기존 가져오기는 바뀌지 않는다.
 *
 * 이 파일은 Supabase·서버 모듈을 값으로 가져오지 않는다(타입만 가져온다). 클라이언트에서 가져와도 서버 코드가 번들에 들어오지 않는다.
 */
import type { CapsulePolicy } from '@/lib/capsule/policy'
import type { BadgeRarity } from '@/types/database'

/** 재료 개수 — 운영 로직 8.4절의 코드 상수 */
export const TIER_UP_MATERIAL_COUNT = 5

/** 재료가 될 수 있는 등급. Mystic은 더 올릴 등급이 없어 재료가 되지 않는다(2026-10-10 결정) */
export const TIER_UP_MATERIAL_RARITIES = ['common', 'rare', 'epic'] as const satisfies readonly BadgeRarity[]

export type TierUpMaterialRarity = (typeof TIER_UP_MATERIAL_RARITIES)[number]

export function isTierUpMaterialRarity(rarity: unknown): rarity is TierUpMaterialRarity {
  return (TIER_UP_MATERIAL_RARITIES as readonly unknown[]).includes(rarity)
}

/** 낮은 등급부터 높은 등급 순서. 서버 굴림(`rollTierUp`)이 «재료 등급 아래로는 내려가지 않는다»를 셀 때도 쓴다 */
export const RARITY_ASCENDING: readonly BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

export const rarityRank = (rarity: BadgeRarity): number => RARITY_ASCENDING.indexOf(rarity)

/** 확률표가 읽는 정책 칸 — 캡슐 등급 확률(퍼센트) */
export type TierUpRarityPolicy = Pick<CapsulePolicy, 'rarity_common' | 'rarity_rare' | 'rarity_epic' | 'rarity_mystic'>

/**
 * 재료 등급별 결과 등급 확률. 캡슐 정책의 등급 확률에서 재료 등급 이상만 남겨 합이 1이 되게 다시 맞춘 `[등급, 확률][]`을 낮은 등급부터 돌려준다.
 * 확률 0인 등급도 줄에 남긴다(확률 안내가 0% 줄을 지우지 않는다). 확률 안내 페이지와 굴림이 같은 함수를 쓴다.
 *
 * 재료 등급 이상의 설정 확률이 전부 0이면 올릴 길이 없으므로 재료 등급 그대로 100%다(합 1, 낮은 등급 없음 유지).
 * Mystic 재료는 지원하지 않는다 — 던진다.
 */
export function tierUpProbabilities(materialRarity: TierUpMaterialRarity, policy: TierUpRarityPolicy): Array<[BadgeRarity, number]> {
  if (!isTierUpMaterialRarity(materialRarity)) {
    throw new Error(`등급 올리기 재료가 될 수 없는 등급: ${String(materialRarity)}`)
  }
  const weightOf: Record<BadgeRarity, number> = {
    common: policy.rarity_common,
    rare: policy.rarity_rare,
    epic: policy.rarity_epic,
    mystic: policy.rarity_mystic,
  }
  const eligible = RARITY_ASCENDING.slice(rarityRank(materialRarity))
  const total = eligible.reduce((sum, rarity) => sum + weightOf[rarity], 0)
  if (!(total > 0)) return [[materialRarity, 1]]
  return eligible.map((rarity): [BadgeRarity, number] => [rarity, weightOf[rarity] / total])
}
