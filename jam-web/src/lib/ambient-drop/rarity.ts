/**
 * 앰비언트 드랍 엔진의 순수 함수(등급 추첨·분포 생성·폴백) — 결정론적 테스트를 위해
 * `index.ts`(Supabase 호출부)와 분리한다.
 */
import type { BadgeRarity } from '@/types/database'

export type RarityDistribution = Record<BadgeRarity, number>

export const RARITY_ORDER: BadgeRarity[] = ['common', 'rare', 'legend', 'mythic']

/** 배열에서 무작위로 1개 선택. 빈 배열이면 null */
export function pickRandom<T>(arr: readonly T[]): T | null {
  if (arr.length === 0) return null
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * 등급 무작위 모드 — "실행 시점에 등급 분포를 무작위로 결정"(티켓 §4). 4개 등급에 대해
 * 균등 난수를 뽑아 합이 1이 되도록 정규화한다. 실행 1회에 한 번만 호출하고, 그 결과
 * 분포로 배치 내 각 드랍의 등급을 weightedPickRarity로 뽑는다.
 */
export function randomRarityDistribution(): RarityDistribution {
  const raw = RARITY_ORDER.map(() => Math.random())
  const sum = raw.reduce((a, b) => a + b, 0) || 1
  const [common, rare, legend, mythic] = raw.map((v) => v / sum)
  return { common, rare, legend, mythic }
}

/** 분포(합=1 가정)에 따라 가중 무작위로 등급 1개를 뽑는다 */
export function weightedPickRarity(distribution: RarityDistribution): BadgeRarity {
  const roll = Math.random()
  let acc = 0
  for (const rarity of RARITY_ORDER) {
    acc += distribution[rarity]
    if (roll < acc) return rarity
  }
  // 부동소수 오차로 acc가 1에 못 미치는 극단적 경우의 안전망
  return RARITY_ORDER[RARITY_ORDER.length - 1]
}

/**
 * 뽑힌 등급에 후보 배지가 없을 때의 폴백 — "미보유 우선, rarity 없으면 인접 등급 폴백" 대신
 * 이 엔진에서는 단순하게 RARITY_ORDER 순서(common → rare → legend → mythic)로 후보가 있는
 * 첫 등급을 사용한다(티켓 §5 — 현재 카탈로그가 common뿐이라 사실상 발동하지 않는다).
 */
export function fallbackPickBadge<T extends { id: string }>(
  badgesByRarity: Record<BadgeRarity, T[]>,
  chosenRarity: BadgeRarity
): T | null {
  const direct = pickRandom(badgesByRarity[chosenRarity])
  if (direct) return direct
  for (const rarity of RARITY_ORDER) {
    if (rarity === chosenRarity) continue
    const candidate = pickRandom(badgesByRarity[rarity])
    if (candidate) return candidate
  }
  return null
}
