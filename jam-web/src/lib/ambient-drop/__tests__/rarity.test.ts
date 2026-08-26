/**
 * 앰비언트 드랍 엔진의 순수 함수(등급 추첨/분포 생성/폴백) 유닛 테스트
 */
import {
  pickRandom,
  randomRarityDistribution,
  weightedPickRarity,
  fallbackPickBadge,
  RARITY_ORDER,
} from '../rarity'
import type { BadgeRarity } from '@/types/database'

describe('pickRandom', () => {
  it('빈 배열이면 null', () => {
    expect(pickRandom([])).toBeNull()
  })

  it('원소가 1개면 그 원소를 반환', () => {
    expect(pickRandom(['only'])).toBe('only')
  })

  it('여러 원소 중 하나를 반환 (배열 안에 포함)', () => {
    const arr = ['a', 'b', 'c']
    const picked = pickRandom(arr)
    expect(arr).toContain(picked)
  })
})

describe('randomRarityDistribution', () => {
  it('4개 등급 비율의 합이 1 (부동소수 오차 허용)', () => {
    for (let i = 0; i < 50; i++) {
      const dist = randomRarityDistribution()
      const sum = dist.common + dist.rare + dist.legend + dist.mythic
      expect(sum).toBeCloseTo(1, 10)
      for (const rarity of RARITY_ORDER) {
        expect(dist[rarity]).toBeGreaterThanOrEqual(0)
        expect(dist[rarity]).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('weightedPickRarity', () => {
  it('common=1, 나머지=0이면 항상 common', () => {
    const dist = { common: 1, rare: 0, legend: 0, mythic: 0 }
    for (let i = 0; i < 20; i++) {
      expect(weightedPickRarity(dist)).toBe('common')
    }
  })

  it('legend=1, 나머지=0이면 항상 legend', () => {
    const dist = { common: 0, rare: 0, legend: 1, mythic: 0 }
    for (let i = 0; i < 20; i++) {
      expect(weightedPickRarity(dist)).toBe('legend')
    }
  })

  it('균등 분포면 4개 등급이 모두 등장할 수 있다 (충분히 많이 뽑으면)', () => {
    const dist = { common: 0.25, rare: 0.25, legend: 0.25, mythic: 0.25 }
    const seen = new Set<BadgeRarity>()
    for (let i = 0; i < 500; i++) {
      seen.add(weightedPickRarity(dist))
    }
    expect(seen.size).toBe(4)
  })
})

describe('fallbackPickBadge', () => {
  it('뽑힌 등급에 후보가 있으면 그 등급에서 선택', () => {
    const badgesByRarity: Record<BadgeRarity, { id: string }[]> = {
      common: [{ id: 'c1' }],
      rare: [{ id: 'r1' }],
      legend: [],
      mythic: [],
    }
    const picked = fallbackPickBadge(badgesByRarity, 'rare')
    expect(picked?.id).toBe('r1')
  })

  it('뽑힌 등급에 후보가 없으면 RARITY_ORDER 순서로 폴백', () => {
    const badgesByRarity: Record<BadgeRarity, { id: string }[]> = {
      common: [],
      rare: [{ id: 'r1' }],
      legend: [],
      mythic: [],
    }
    // legend를 뽑았지만 후보가 없어 다음 순서(rare)로 폴백
    const picked = fallbackPickBadge(badgesByRarity, 'legend')
    expect(picked?.id).toBe('r1')
  })

  it('모든 등급에 후보가 없으면 null', () => {
    const badgesByRarity: Record<BadgeRarity, { id: string }[]> = {
      common: [],
      rare: [],
      legend: [],
      mythic: [],
    }
    expect(fallbackPickBadge(badgesByRarity, 'common')).toBeNull()
  })
})
