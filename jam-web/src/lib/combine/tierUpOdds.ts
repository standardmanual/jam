/**
 * 등급 올리기의 순수한 규칙 — 재료 개수, 재료가 될 수 있는 등급, 재료 등급별 결과 등급 확률 (티켓 20261022_2119 4회, 20261023_1648 2회, 운영 로직 8.4절)
 *
 * 서버 굴림(`lib/combine/tierUp.ts`)과 확률 안내 페이지(`lib/probability/disclosure.ts`)가 같은 함수를 쓰도록 `tierUp.ts`에서 뽑았다.
 * `tierUp.ts`는 소각·지급·챕터 점수 같은 서버 모듈을 줄줄이 가져오므로, 확률 안내가 그 모듈을 통째로 끌어오지 않게 하려는 것이다.
 * `tierUp.ts`가 아래 이름을 그대로 다시 내보내므로 기존 가져오기는 바뀌지 않는다.
 *
 * 이 파일은 Supabase·서버 모듈을 값으로 가져오지 않는다(타입만 가져온다). 클라이언트에서 가져와도 서버 코드가 번들에 들어오지 않는다.
 */
import type { BadgeRarity } from '@/types/database'

/** 재료 개수 — 운영 로직 8.4절의 코드 상수 */
export const TIER_UP_MATERIAL_COUNT = 5

/** 재료가 될 수 있는 등급. Mystic은 더 올릴 등급이 없어 재료가 되지 않는다(2026-10-10 결정) */
export const TIER_UP_MATERIAL_RARITIES = ['common', 'rare', 'epic'] as const satisfies readonly BadgeRarity[]

export type TierUpMaterialRarity = (typeof TIER_UP_MATERIAL_RARITIES)[number]

export function isTierUpMaterialRarity(rarity: unknown): rarity is TierUpMaterialRarity {
  return (TIER_UP_MATERIAL_RARITIES as readonly unknown[]).includes(rarity)
}

/** 낮은 등급부터 높은 등급 순서. 재료 등급의 «바로 위 등급»을 찾을 때 쓴다 */
export const RARITY_ASCENDING: readonly BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

export const rarityRank = (rarity: BadgeRarity): number => RARITY_ASCENDING.indexOf(rarity)

/**
 * 재료 등급별 결과 등급 확률. 같은 등급이 `1 - 윗등급 확률`, 바로 위 등급이 `윗등급 확률`이다(`combine_policy.tier_up_probability`, 0~1).
 * `[등급, 확률][]`을 낮은 등급(재료 등급 그대로)부터 돌려준다. 확률 0인 줄도 남긴다(확률 안내가 0% 줄을 지우지 않는다).
 * 확률 안내 페이지와 굴림이 같은 함수를 쓴다.
 *
 * Mystic 재료는 바로 위 등급이 없어 지원하지 않는다 — 던진다.
 */
export function tierUpProbabilities(materialRarity: TierUpMaterialRarity, tierUpProbability: number): Array<[BadgeRarity, number]> {
  if (!isTierUpMaterialRarity(materialRarity)) {
    throw new Error(`등급 올리기 재료가 될 수 없는 등급: ${String(materialRarity)}`)
  }
  const upper = RARITY_ASCENDING[rarityRank(materialRarity) + 1]
  return [
    [materialRarity, 1 - tierUpProbability],
    [upper, tierUpProbability],
  ]
}

/** 재료 등급의 바로 위 등급 — 윗등급이 나오면 이 등급이다 */
export function tierUpUpperRarity(materialRarity: TierUpMaterialRarity): BadgeRarity {
  return RARITY_ASCENDING[rarityRank(materialRarity) + 1]
}

/**
 * 순수 — 컬렉션을 등급 올리기의 받을 컬렉션으로 고를 수 있는가 (티켓 20261025_2011).
 * `rarities`는 그 컬렉션에서 지금 실제로 나올 수 있는 아이템 배지가 있는 등급이다. **재료 등급과 바로 윗등급이 모두** 있어야 한다.
 * 한쪽이 없으면 굴린 등급에 따라 받을 것이 없어 거절이 나는데, 거절은 소각 전이라 비용이 없다 — 윗등급만 있는 컬렉션이면 거절될 때마다
 * 다시 시도해 윗등급 100%를 얻을 수 있다. 믹스 화면의 컬렉션 목록(`tierUpCollectionChoices`)과 서버(`tierUp`)가 이 함수 하나로 판정한다.
 */
export function collectionSupportsTierUp(rarities: readonly BadgeRarity[], materialRarity: TierUpMaterialRarity): boolean {
  return rarities.includes(materialRarity) && rarities.includes(tierUpUpperRarity(materialRarity))
}
