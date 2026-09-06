/**
 * badgeTree.ts 회귀 테스트 — 티켓 20260906_1947 ③④.
 *
 * 이 파일이 고정하는 성질:
 * ① `crossGate.ts`의 `familyGateSatisfied`를 재구현 없이 그대로 쓴다는 것 — 게이트
 *   미보유 시 잠기고, 보유 후 열리는지를 트리 화면 기준으로 확인한다(0110이 지적한
 *   "열려 보이는데 발급은 안 되는" 어긋남의 반대 방향, 즉 "화면·엔진이 항상 같은 결론"을
 *   지킨다).
 * ② `min_level`(무한레벨형 대상) — 트리 화면도 엔진과 같은 문턱을 본다.
 */
import { describe, it, expect } from 'vitest'
import { buildBadgeActivityTrees, type BadgeTreeSourceBadge } from '@/lib/badgeTree'

function badge(overrides: Partial<BadgeTreeSourceBadge> & Pick<BadgeTreeSourceBadge, 'id' | 'family_key'>): BadgeTreeSourceBadge {
  return {
    name: '테스트 배지',
    rarity: 'common',
    level: null,
    description: null,
    image_url: null,
    activity_types: ['running'],
    condition_json: {},
    sort_order: 0,
    ...overrides,
  }
}

describe('buildBadgeActivityTrees — 교차 게이트(min_rarity)', () => {
  const mystic = badge({
    id: 'mystic-1',
    family_key: 'running:speed',
    rarity: 'mystic',
    condition_json: {
      activity_type: 'running',
      cross_between_axis: { family_keys: ['running:streak'], min_rarity: 'rare' },
      gate_mission_badge: { family_keys: ['running:oath'] },
    },
  })
  const streakCommon = badge({ id: 'streak-common', family_key: 'running:streak', rarity: 'common' })
  const streakRare = badge({ id: 'streak-rare', family_key: 'running:streak', rarity: 'rare' })
  const oath = badge({
    id: 'oath-1',
    family_key: 'running:oath',
    rarity: 'epic',
    condition_json: { mission_reward: true },
  })

  it('대상 계열을 min_rarity 미만으로만 보유하면 게이트가 잠긴 채로 그려진다', () => {
    const badges = [mystic, streakCommon, oath]
    const [tree] = buildBadgeActivityTrees(badges, [], new Set(['streak-common']))
    const stage = tree.families.flatMap((f) => f.stages).find((s) => s.id === 'mystic-1')!
    const crossGroup = stage.gateGroups.find((g) => g.kind === 'cross')!
    expect(crossGroup.fulfilled).toBe(false)
  })

  it('대상 계열을 min_rarity 이상 보유하고 미션 보상 배지도 보유하면 열린다', () => {
    const badges = [mystic, streakRare, oath]
    const [tree] = buildBadgeActivityTrees(badges, [], new Set(['streak-rare', 'oath-1']))
    const stage = tree.families.flatMap((f) => f.stages).find((s) => s.id === 'mystic-1')!
    const crossGroup = stage.gateGroups.find((g) => g.kind === 'cross')!
    const missionGroup = stage.gateGroups.find((g) => g.kind === 'mission')!
    expect(crossGroup.fulfilled).toBe(true)
    expect(missionGroup.fulfilled).toBe(true)
  })
})

describe('buildBadgeActivityTrees — 교차 게이트(min_level, 무한레벨형 대상)', () => {
  const mystic = badge({
    id: 'mystic-lv',
    family_key: 'running:speed',
    rarity: 'mystic',
    condition_json: {
      activity_type: 'running',
      cross_between_axis: { family_keys: ['running:infinite'], min_level: 3 },
      gate_mission_badge: { family_keys: ['running:oath'] },
    },
  })
  const oath = badge({
    id: 'oath-2',
    family_key: 'running:oath',
    rarity: 'epic',
    condition_json: { mission_reward: true },
  })
  const lv1 = badge({ id: 'infinite-lv1', family_key: 'running:infinite', rarity: null, level: 1 })
  const lv3 = badge({ id: 'infinite-lv3', family_key: 'running:infinite', rarity: null, level: 3 })

  it('Lv.1만 보유하면 min_level 미달로 잠긴다 — min_level 없던 시절의 자동 통과 결함 방지', () => {
    const badges = [mystic, oath, lv1]
    const [tree] = buildBadgeActivityTrees(badges, [], new Set(['infinite-lv1']))
    const stage = tree.families.flatMap((f) => f.stages).find((s) => s.id === 'mystic-lv')!
    const crossGroup = stage.gateGroups.find((g) => g.kind === 'cross')!
    expect(crossGroup.fulfilled).toBe(false)
  })

  it('min_level 이상을 보유하면 열린다', () => {
    const badges = [mystic, oath, lv3]
    const [tree] = buildBadgeActivityTrees(badges, [], new Set(['infinite-lv3']))
    const stage = tree.families.flatMap((f) => f.stages).find((s) => s.id === 'mystic-lv')!
    const crossGroup = stage.gateGroups.find((g) => g.kind === 'cross')!
    expect(crossGroup.fulfilled).toBe(true)
  })
})
