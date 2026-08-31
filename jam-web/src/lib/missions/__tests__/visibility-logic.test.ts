/**
 * visibility.ts resolveMissionVisibility — 미션 노출 판정 유닛 테스트 (티켓 20260825_028)
 *
 * 검증 범위:
 *   - 완료한 미션은 항상 completed (진행중 탭에서 빠지고 완료 탭으로 감)
 *   - gated_badge_id가 없는 일반 미션은 항상 open
 *   - 레벨업 트리 3단계: 다음 1단계만 open, 그 다음 1개는 locked, 그 위는 hidden
 *   - Common 미보유 신규 유저에게도 첫 레벨업 미션(Rare용)은 open
 *   - 게이트 배지를 찾을 수 없으면(삭제·오설정) 게이팅 없이 open (fail-open)
 *
 * 실행: `npx tsx src/lib/missions/__tests__/visibility-logic.test.ts`
 *       (테스트 러너 불필요 — node assert 사용. vitest.config.ts에서 이 디렉터리는 제외됨)
 */
import assert from 'node:assert'
import {
  resolveMissionVisibility,
  resolveMissionVisibilityMap,
  isMissionJoinable,
  type GatedBadgeInfo,
  type MissionVisibilityContext,
} from '../visibility'
import { RARITY_TIER } from '@/lib/rarity'
import type { BadgeRarity } from '@/types/database'

// ── 픽스처 ────────────────────────────────────────────────────────────────
// '첫 숨결' 트리: Rare(레벨업) / Legend(레벨업 Hard) / Mythic(레벨업 Ultra)
const BADGE_RARE: GatedBadgeInfo = { id: 'b-rare', name: '첫 숨결', rarity: 'rare' }
const BADGE_LEGEND: GatedBadgeInfo = { id: 'b-legend', name: '첫 숨결', rarity: 'legend' }
const BADGE_MYTHIC: GatedBadgeInfo = { id: 'b-mythic', name: '첫 숨결', rarity: 'mythic' }

const MISSION_RARE = { id: 'm-rare', gated_badge_id: BADGE_RARE.id }
const MISSION_LEGEND = { id: 'm-legend', gated_badge_id: BADGE_LEGEND.id }
const MISSION_MYTHIC = { id: 'm-mythic', gated_badge_id: BADGE_MYTHIC.id }
const MISSION_PLAIN = { id: 'm-plain', gated_badge_id: null }

const ALL_GATED_BADGES = new Map<string, GatedBadgeInfo>([
  [BADGE_RARE.id, BADGE_RARE],
  [BADGE_LEGEND.id, BADGE_LEGEND],
  [BADGE_MYTHIC.id, BADGE_MYTHIC],
])

function ctx(options?: {
  completed?: string[]
  ownedRarity?: BadgeRarity | null
  gatedBadges?: Map<string, GatedBadgeInfo>
  participated?: string[]
}): MissionVisibilityContext {
  const owned = new Map<string, number>()
  if (options?.ownedRarity) owned.set('첫 숨결', RARITY_TIER[options.ownedRarity])
  return {
    completedMissionIds: new Set(options?.completed ?? []),
    gatedBadges: options?.gatedBadges ?? ALL_GATED_BADGES,
    ownedTierByBadgeName: owned,
    participatedMissionIds: new Set(options?.participated ?? []),
  }
}

const vis = (mission: { id: string; gated_badge_id: string | null }, c: MissionVisibilityContext) =>
  resolveMissionVisibility(mission, c).visibility

// ── 케이스 ────────────────────────────────────────────────────────────────
const cases: Array<[string, () => void]> = [
  ['완료한 미션은 completed — 게이팅 여부와 무관', () => {
    const c = ctx({ completed: ['m-rare', 'm-plain'], ownedRarity: null })
    assert.strictEqual(vis(MISSION_RARE, c), 'completed')
    assert.strictEqual(vis(MISSION_PLAIN, c), 'completed')
  }],

  ['본 배지를 이미 보유해도 완료 기록이 우선한다', () => {
    const c = ctx({ completed: ['m-rare'], ownedRarity: 'rare' })
    assert.strictEqual(vis(MISSION_RARE, c), 'completed')
  }],

  ['gated_badge_id가 없는 일반 미션은 항상 open', () => {
    assert.strictEqual(vis(MISSION_PLAIN, ctx({ ownedRarity: null })), 'open')
    assert.strictEqual(vis(MISSION_PLAIN, ctx({ ownedRarity: 'mythic' })), 'open')
  }],

  ['배지 미보유 신규 유저: Rare용 open / Legend용 locked / Mythic용 hidden', () => {
    const c = ctx({ ownedRarity: null })
    assert.strictEqual(vis(MISSION_RARE, c), 'open')
    assert.strictEqual(vis(MISSION_LEGEND, c), 'locked')
    assert.strictEqual(vis(MISSION_MYTHIC, c), 'hidden')
  }],

  ['Common 보유: 미보유와 동일 (Rare용 open / Legend용 locked / Mythic용 hidden)', () => {
    const c = ctx({ ownedRarity: 'common' })
    assert.strictEqual(vis(MISSION_RARE, c), 'open')
    assert.strictEqual(vis(MISSION_LEGEND, c), 'locked')
    assert.strictEqual(vis(MISSION_MYTHIC, c), 'hidden')
  }],

  ['Rare 보유: Legend용 open / Mythic용 locked', () => {
    const c = ctx({ ownedRarity: 'rare' })
    assert.strictEqual(vis(MISSION_LEGEND, c), 'open')
    assert.strictEqual(vis(MISSION_MYTHIC, c), 'locked')
  }],

  ['Legend 보유: Mythic용 open', () => {
    const c = ctx({ ownedRarity: 'legend' })
    assert.strictEqual(vis(MISSION_MYTHIC, c), 'open')
  }],

  ['정상 진행 경로에서 동시에 open인 레벨업 미션은 항상 1개', () => {
    // 실제 진행 순서: 레벨업 완료 → 본 배지 Rare 획득 → Hard 완료 → Legend 획득 → Ultra
    const steps: Array<{ ownedRarity: BadgeRarity | null; completed: string[]; expectOpen: string }> = [
      { ownedRarity: null,     completed: [],                      expectOpen: 'm-rare' },
      { ownedRarity: 'common', completed: [],                      expectOpen: 'm-rare' },
      { ownedRarity: 'rare',   completed: ['m-rare'],              expectOpen: 'm-legend' },
      { ownedRarity: 'legend', completed: ['m-rare', 'm-legend'],  expectOpen: 'm-mythic' },
    ]
    for (const step of steps) {
      const c = ctx({ ownedRarity: step.ownedRarity, completed: step.completed })
      const open = [MISSION_RARE, MISSION_LEGEND, MISSION_MYTHIC].filter((m) => vis(m, c) === 'open')
      assert.strictEqual(open.length, 1, `보유 등급 ${step.ownedRarity ?? '없음'}에서 open이 ${open.length}개`)
      assert.strictEqual(open[0].id, step.expectOpen)
    }
  }],

  ['locked/hidden이면 먼저 획득해야 하는 배지를 알려준다 (게이트 바로 아래 등급)', () => {
    const c = ctx({ ownedRarity: null })
    const legend = resolveMissionVisibility(MISSION_LEGEND, c)
    assert.strictEqual(legend.visibility, 'locked')
    assert.deepStrictEqual(legend.requiredBadge, { name: '첫 숨결', rarity: 'rare' })

    const mythic = resolveMissionVisibility(MISSION_MYTHIC, c)
    assert.strictEqual(mythic.visibility, 'hidden')
    assert.deepStrictEqual(mythic.requiredBadge, { name: '첫 숨결', rarity: 'legend' })
  }],

  ['open이면 requiredBadge는 null', () => {
    assert.strictEqual(resolveMissionVisibility(MISSION_RARE, ctx()).requiredBadge, null)
    assert.strictEqual(resolveMissionVisibility(MISSION_PLAIN, ctx()).requiredBadge, null)
  }],

  ['게이트 배지를 찾을 수 없으면 게이팅 없이 open (fail-open)', () => {
    const c = ctx({ gatedBadges: new Map() })
    assert.strictEqual(vis(MISSION_MYTHIC, c), 'open')
  }],

  ['참가 이력 있음 + 게이트 미달(원래 hidden)이면 locked로 완화된다 (티켓 20260825_029)', () => {
    const c = ctx({ ownedRarity: null, participated: ['m-mythic'] })
    // 참가 이력이 없으면 여전히 hidden
    assert.strictEqual(vis(MISSION_LEGEND, c), 'locked') // 원래도 locked인 케이스는 그대로 locked
    assert.strictEqual(vis(MISSION_MYTHIC, ctx({ ownedRarity: null })), 'hidden')
    // 참가 이력이 있으면 hidden → locked로 완화되고, requiredBadge도 그대로 채워진다
    const result = resolveMissionVisibility(MISSION_MYTHIC, c)
    assert.strictEqual(result.visibility, 'locked')
    assert.deepStrictEqual(result.requiredBadge, { name: '첫 숨결', rarity: 'legend' })
  }],

  ['참가 이력이 있어도 open/completed 판정에는 관여하지 않는다', () => {
    const openCtx = ctx({ ownedRarity: null, participated: ['m-rare'] })
    assert.strictEqual(vis(MISSION_RARE, openCtx), 'open')
    const completedCtx = ctx({ completed: ['m-rare'], participated: ['m-rare'] })
    assert.strictEqual(vis(MISSION_RARE, completedCtx), 'completed')
  }],

  ['참가 이력이 있어도 원래 locked인 판정은 그대로 locked (완화는 hidden 전용)', () => {
    const c = ctx({ ownedRarity: null, participated: ['m-legend'] })
    assert.strictEqual(vis(MISSION_LEGEND, c), 'locked')
  }],

  ['isMissionJoinable은 open일 때만 true', () => {
    const c = ctx({ completed: ['m-plain'], ownedRarity: null })
    assert.strictEqual(isMissionJoinable(resolveMissionVisibility(MISSION_RARE, c)), true)
    assert.strictEqual(isMissionJoinable(resolveMissionVisibility(MISSION_LEGEND, c)), false)
    assert.strictEqual(isMissionJoinable(resolveMissionVisibility(MISSION_MYTHIC, c)), false)
    assert.strictEqual(isMissionJoinable(resolveMissionVisibility(MISSION_PLAIN, c)), false)
  }],

  ['resolveMissionVisibilityMap은 미션 id별 결과를 모두 담는다', () => {
    const c = ctx({ ownedRarity: null })
    const map = resolveMissionVisibilityMap([MISSION_RARE, MISSION_LEGEND, MISSION_MYTHIC, MISSION_PLAIN], c)
    assert.strictEqual(map.size, 4)
    assert.strictEqual(map.get('m-rare')?.visibility, 'open')
    assert.strictEqual(map.get('m-legend')?.visibility, 'locked')
    assert.strictEqual(map.get('m-mythic')?.visibility, 'hidden')
    assert.strictEqual(map.get('m-plain')?.visibility, 'open')
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[visibility-logic] ${passed}/${cases.length} passed`)
