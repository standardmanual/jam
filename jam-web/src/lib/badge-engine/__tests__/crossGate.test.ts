/**
 * 2단 교차 게이트 회귀 테스트 (티켓 20260906_1947)
 *
 * 축→계열 시딩 전에는 카탈로그에 `cross_in_axis`·`cross_between_axis`·`gate_mission_badge`가
 * 0건이라 이 판정 경로가 실사용에서 한 번도 돌지 않았다. 데이터를 채우는 이 티켓이
 * 「Mystic이 게이트 미보유 시 잠기는지 / 게이트 배지 보유 후 열리는지 / min_level 미달 시
 * 잠기는지」를 지금 검증해 둔다.
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/crossGate.test.ts`
 */
import { evaluateCrossGates, familyMeetsGateRequirement, normalizeGateRequirement, type OwnedBadgeDef } from '../crossGate'
import type { ActivityType, BadgeCondition } from '@/types/database'

function owned(overrides: Partial<OwnedBadgeDef> & Pick<OwnedBadgeDef, 'id' | 'family_key'>): OwnedBadgeDef {
  return {
    name: '테스트 배지',
    rarity: 'epic',
    level: null,
    activity_types: ['running'],
    condition_json: {},
    ...overrides,
  }
}

const MYSTIC_BADGE = { name: '언덕의 지배자', family_key: 'running:P1', activity_types: ['running'] as ActivityType[] }

describe('evaluateCrossGates — Epic→Mystic (축 간 교차 + 미션 보상 배지)', () => {
  const condition: BadgeCondition = {
    cross_between_axis: { family_keys: ['running:N1', 'running:N2'], min_rarity: 'rare' },
    gate_mission_badge: { family_keys: ['running:Q7'] },
  }

  it('교차 축·미션 보상 배지 둘 다 미보유 — 잠긴다', () => {
    const result = evaluateCrossGates(MYSTIC_BADGE, condition, [])
    expect(result.pass).toBe(false)
  })

  it('교차 축(Rare 이상)만 보유하고 미션 보상 배지가 없으면 — 여전히 잠긴다(AND)', () => {
    const ownedDefs = [owned({ id: 'n1', family_key: 'running:N1', rarity: 'rare' })]
    const result = evaluateCrossGates(MYSTIC_BADGE, condition, ownedDefs)
    expect(result.pass).toBe(false)
    if (!result.pass) expect(result.reason).toBe('미션 보상 배지 미보유')
  })

  it('교차 축(Rare 이상) + 미션 보상 배지(Q7) 둘 다 보유 — 열린다', () => {
    const ownedDefs = [
      owned({ id: 'n1', family_key: 'running:N1', rarity: 'rare' }),
      owned({ id: 'q7', family_key: 'running:Q7', rarity: 'epic', condition_json: { mission_reward: true } }),
    ]
    const result = evaluateCrossGates(MYSTIC_BADGE, condition, ownedDefs)
    expect(result.pass).toBe(true)
  })

  it('일반 배지(미션 보상 아님)로 gate_mission_badge를 채우면 — 통과하지 않는다', () => {
    const ownedDefs = [
      owned({ id: 'n1', family_key: 'running:N1', rarity: 'rare' }),
      owned({ id: 'q7', family_key: 'running:Q7', rarity: 'epic', condition_json: {} }),
    ]
    const result = evaluateCrossGates(MYSTIC_BADGE, condition, ownedDefs)
    expect(result.pass).toBe(false)
  })
})

describe('min_level — 레벨형(무한레벨) 계열이 보완 축일 때 (티켓 20260906_1947 ②-b)', () => {
  const condition: BadgeCondition = {
    cross_between_axis: { family_keys: ['running:K1', 'running:K3'], min_level: 5 },
    gate_mission_badge: { family_keys: ['running:Q7'] },
  }
  const ownedMission = owned({ id: 'q7', family_key: 'running:Q7', rarity: 'epic', condition_json: { mission_reward: true } })

  it('레벨형 계열을 Lv.1만 보유(누구나 첫 주 달성) — min_level 미달로 잠긴다(자동통과 방지)', () => {
    const ownedDefs = [ownedMission, owned({ id: 'k1', family_key: 'running:K1', rarity: null, level: 1 })]
    const result = evaluateCrossGates(MYSTIC_BADGE, condition, ownedDefs)
    expect(result.pass).toBe(false)
  })

  it('레벨형 계열을 min_level 이상 보유 — 열린다', () => {
    const ownedDefs = [ownedMission, owned({ id: 'k1', family_key: 'running:K1', rarity: null, level: 5 })]
    const result = evaluateCrossGates(MYSTIC_BADGE, condition, ownedDefs)
    expect(result.pass).toBe(true)
  })

  it('normalizeGateRequirement — min_rarity와 min_level을 동시에 주면 형태 오류', () => {
    const result = normalizeGateRequirement({ family_keys: ['running:K1'], min_rarity: 'rare', min_level: 5 })
    expect(result.ok).toBe(false)
  })

  it('familyMeetsGateRequirement — 등급형 배지(level null)는 min_level 요구를 만족시킬 수 없다', () => {
    const ownedDefs = [owned({ id: 'k1', family_key: 'running:K1', rarity: 'mystic', level: null })]
    const hit = familyMeetsGateRequirement(
      'running:K1',
      { minRarityTier: 0, minLevel: 5 },
      ownedDefs,
      ['running'],
      false
    )
    expect(hit).toBe(false)
  })
})

describe('evaluateCrossGates — Rare→Epic (축 내 교차 OR 축 간 교차)', () => {
  const EPIC_BADGE = { name: '밤의 보행자', family_key: 'running:T2', activity_types: ['running'] as ActivityType[] }
  const condition: BadgeCondition = {
    cross_in_axis: { family_keys: ['running:T1'] },
    cross_between_axis: { family_keys: ['running:M1', 'running:M2'] },
  }

  it('둘 다 미보유 — 잠긴다', () => {
    expect(evaluateCrossGates(EPIC_BADGE, condition, []).pass).toBe(false)
  })

  it('축 내 교차 대상만 보유해도 — 열린다(OR)', () => {
    const ownedDefs = [owned({ id: 't1', family_key: 'running:T1', rarity: 'common' })]
    expect(evaluateCrossGates(EPIC_BADGE, condition, ownedDefs).pass).toBe(true)
  })

  it('축 간 교차 대상만 보유해도 — 열린다(OR)', () => {
    const ownedDefs = [owned({ id: 'm1', family_key: 'running:M1', rarity: 'common' })]
    expect(evaluateCrossGates(EPIC_BADGE, condition, ownedDefs).pass).toBe(true)
  })
})
