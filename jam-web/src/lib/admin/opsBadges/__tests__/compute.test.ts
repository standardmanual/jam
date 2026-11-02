/**
 * 배지 읽기 API의 계산 (티켓 20261102_1602) — 숨김 제외·계열별 단계·획득 수·조건 요약·이름 검색.
 */
import { describe, it, expect } from 'vitest'
import {
  MISSION_REWARD_SUMMARY,
  NO_CONDITION_SUMMARY,
  buildBadgeFamilies,
  filterFamiliesByName,
  summarizeCondition,
  type OpsBadgeInput,
} from '../compute'

function badge(id: string, over: Partial<OpsBadgeInput> = {}): OpsBadgeInput {
  return {
    id,
    name: '러닝 마스터',
    description: null,
    rarity: 'common',
    level: null,
    family_key: 'running_master',
    sort_order: 1,
    image_url: null,
    condition_json: { total_count: 10 },
    activity_types: ['running'],
    deleted_at: null,
    admin_category: null,
    is_hidden: false,
    ...over,
  } as OpsBadgeInput
}

describe('summarizeCondition', () => {
  it('조건 칩을 「 · 」로 이은 한 줄로 바꾼다', () => {
    expect(summarizeCondition({ distance_km: 50, total_count: 10 })).toBe('누적 50km · 10회')
  })

  it('미션 보상 배지는 칩이 없어 고정 문구다', () => {
    expect(summarizeCondition({ mission_reward: true })).toBe(MISSION_REWARD_SUMMARY)
  })

  it('조건이 없으면 「조건 정보 없음」이다', () => {
    expect(summarizeCondition(null)).toBe(NO_CONDITION_SUMMARY)
    expect(summarizeCondition({})).toBe(NO_CONDITION_SUMMARY)
  })
})

describe('buildBadgeFamilies', () => {
  const badges = [
    badge('b-rare', { rarity: 'rare', condition_json: { total_count: 30 } }),
    badge('b-common'),
    badge('b-hidden', { rarity: 'epic', is_hidden: true }),
    badge('h-only', { name: '숨은 계열', family_key: 'hidden_only', is_hidden: true }),
    badge('s-1', { name: '스트릭', family_key: 'streak', condition_json: { streak_days: 7 } }),
  ]
  const earned = new Map([
    ['b-common', 12],
    ['b-rare', 3],
    ['b-hidden', 99],
  ])

  it('숨김 배지는 단계에서도, 계열 전체가 숨김이면 계열에서도 빠진다', () => {
    const families = buildBadgeFamilies(badges, earned)
    expect(families.map((f) => f.family)).not.toContain('hidden_only')
    const running = families.find((f) => f.family === 'running_master')
    expect(running?.tiers).toHaveLength(2)
    expect(JSON.stringify(families)).not.toContain('99')
  })

  it('단계는 낮은 등급부터, 획득 수와 조건 요약을 싣는다. 받은 사람이 없으면 0이다', () => {
    const families = buildBadgeFamilies(badges, earned)
    const running = families.find((f) => f.family === 'running_master')
    expect(running?.tiers).toEqual([
      { tier: 'Common', conditionSummary: '10회', earnedCount: 12 },
      { tier: 'Rare', conditionSummary: '30회', earnedCount: 3 },
    ])
    expect(families.find((f) => f.family === 'streak')?.tiers[0]).toMatchObject({
      conditionSummary: '7일 연속',
      earnedCount: 0,
    })
  })

  it('계열 모양은 { family, name, tiers, hidden:false }뿐이고 유저 칸이 없다', () => {
    const [first] = buildBadgeFamilies(badges, earned)
    expect(Object.keys(first).sort()).toEqual(['family', 'hidden', 'name', 'tiers'])
    expect(first.hidden).toBe(false)
  })
})

describe('filterFamiliesByName', () => {
  const families = buildBadgeFamilies([badge('a'), badge('b', { name: '스트릭', family_key: 'streak' })], new Map())

  it('빈 문자열이면 거르지 않고, 이름에 포함된 계열만 남긴다', () => {
    expect(filterFamiliesByName(families, '')).toHaveLength(2)
    expect(filterFamiliesByName(families, '러닝').map((f) => f.family)).toEqual(['running_master'])
    expect(filterFamiliesByName(families, '없는이름')).toEqual([])
  })
})
