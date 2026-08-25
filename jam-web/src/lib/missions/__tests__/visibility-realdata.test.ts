/**
 * visibility.ts 실데이터 대조 검증 (티켓 20260825_028)
 *
 * 마이그레이션 101 실행 후 실제 DB에 존재하는 유저 배지 보유 상태를 그대로 픽스처로 넣어
 * 순수 함수의 판정 결과가 요구사항 2(순차 노출)와 일치하는지 대조한다.
 * `visibility-logic.test.ts`가 규칙 자체를 고정한다면, 이 파일은 "실제 데이터에서도 그 규칙이
 * 의도한 화면 결과로 이어지는가"를 확인한다.
 *
 * 배경: dev-login 고정 유저(00000000-…-0001)는 5개 트리의 common~mythic을 전부 보유해
 * 화면에서는 15개 미션이 모두 open으로만 보인다. locked/hidden을 화면으로 재현할 실유저가
 * 없으므로 순수 함수 단위로 대조한다.
 *
 * 게이트 구성(마이그레이션 101): 트리 1개당 미션 3종이 각각 Rare/Legend/Mythic 본 배지를 연다.
 *
 * 실행: `npx tsx src/lib/missions/__tests__/visibility-realdata.test.ts`
 */
import assert from 'node:assert'
import {
  resolveMissionVisibilityMap,
  RARITY_TIER,
  type GatedBadgeInfo,
  type MissionVisibility,
  type MissionVisibilityContext,
} from '../visibility'
import type { BadgeRarity } from '@/types/database'

// ── 게이트 픽스처: 마이그레이션 101의 미션명 → (본 배지, 등급) 매핑 그대로 ──────────
const TREES = ['동네 산책러', '첫 숨결', '언덕의 도전자', '첫 고도', '야생의 주자'] as const
const STEPS: Array<{ suffix: string; rarity: BadgeRarity }> = [
  { suffix: '', rarity: 'rare' },
  { suffix: ' Hard', rarity: 'legend' },
  { suffix: ' Ultra', rarity: 'mythic' },
]

interface LevelUpMission {
  id: string
  title: string
  tree: string
  gateRarity: BadgeRarity
  gated_badge_id: string
}

const MISSIONS: LevelUpMission[] = []
const GATED_BADGES = new Map<string, GatedBadgeInfo>()

for (const tree of TREES) {
  for (const { suffix, rarity } of STEPS) {
    const badgeId = `badge:${tree}:${rarity}`
    GATED_BADGES.set(badgeId, { id: badgeId, name: tree, rarity })
    MISSIONS.push({
      id: `mission:${tree}:${rarity}`,
      title: `${tree} 레벨업${suffix}`,
      tree,
      gateRarity: rarity,
      gated_badge_id: badgeId,
    })
  }
}
assert.strictEqual(MISSIONS.length, 15, '레벨업 미션 픽스처는 15종이어야 한다')

// ── 유저 픽스처: 프로덕션 DB 실측(2026-08-25) ───────────────────────────────────
/** 트리별 최고 보유 등급. null = 그 트리 배지를 하나도 보유하지 않음 */
type OwnedByTree = Partial<Record<(typeof TREES)[number], BadgeRarity | null>>

interface UserCase {
  label: string
  owned: OwnedByTree
  /** 검증 대상 트리 → [Rare미션, Legend미션, Mythic미션] 기대 노출 */
  expect: Partial<Record<(typeof TREES)[number], [MissionVisibility, MissionVisibility, MissionVisibility]>>
}

const USER_CASES: UserCase[] = [
  {
    // 실유저 deeec47b — '첫 숨결' common까지만 보유
    label: "deeec47b (실측): '첫 숨결' 최고보유 common",
    owned: { '첫 숨결': 'common' },
    expect: { '첫 숨결': ['open', 'locked', 'hidden'] },
  },
  {
    // 실유저 3649ed39 — '첫 숨결' rare까지 보유
    label: "3649ed39 (실측): '첫 숨결' 최고보유 rare",
    owned: { '첫 숨결': 'rare' },
    expect: { '첫 숨결': ['open', 'open', 'locked'] },
  },
  {
    // 실유저 00000000-…-0004 — '동네 산책러' rare, '야생의 주자' common
    label: "00000000-…-0004 (실측): '동네 산책러' rare · '야생의 주자' common",
    owned: { '동네 산책러': 'rare', '야생의 주자': 'common' },
    expect: {
      '동네 산책러': ['open', 'open', 'locked'],
      '야생의 주자': ['open', 'locked', 'hidden'],
    },
  },
  {
    // 실유저 00000000-…-0003 — '첫 숨결' legend, 나머지 4개 트리는 mythic
    // (legend 등급 커버리지를 담당하는 실유저. 이전 버전은 이 조합을 0004로 잘못 라벨링했다)
    label: "00000000-…-0003 (실측): '첫 숨결' legend · 나머지 4트리 mythic",
    owned: {
      '첫 숨결': 'legend',
      '동네 산책러': 'mythic',
      '야생의 주자': 'mythic',
      '언덕의 도전자': 'mythic',
      '첫 고도': 'mythic',
    },
    expect: {
      // legend 보유 → Mythic 게이트(tier 3)가 ownedTier(2)+1 이내라 open
      '첫 숨결': ['open', 'open', 'open'],
      '동네 산책러': ['open', 'open', 'open'],
    },
  },
  {
    // dev-login 고정 유저 00000000-…-0001 — 5개 트리 전부 mythic까지 보유
    label: 'dev-login 00000000-…-0001 (실측): 5개 트리 전부 mythic',
    owned: Object.fromEntries(TREES.map((t) => [t, 'mythic' as BadgeRarity])),
    expect: Object.fromEntries(
      TREES.map((t) => [t, ['open', 'open', 'open'] as [MissionVisibility, MissionVisibility, MissionVisibility]]),
    ),
  },
  {
    // 신규 유저 — 트리 배지를 하나도 보유하지 않음 (Common 보유로 취급, 티켓 §2)
    label: '신규 유저: 트리 배지 미보유',
    owned: {},
    expect: Object.fromEntries(
      TREES.map((t) => [
        t,
        ['open', 'locked', 'hidden'] as [MissionVisibility, MissionVisibility, MissionVisibility],
      ]),
    ),
  },
]

function buildContext(owned: OwnedByTree): MissionVisibilityContext {
  const ownedTierByBadgeName = new Map<string, number>()
  for (const [tree, rarity] of Object.entries(owned)) {
    if (rarity) ownedTierByBadgeName.set(tree, RARITY_TIER[rarity])
  }
  return {
    completedMissionIds: new Set<string>(),
    gatedBadges: GATED_BADGES,
    ownedTierByBadgeName,
  }
}

// ── 실행 ──────────────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

for (const user of USER_CASES) {
  const map = resolveMissionVisibilityMap(MISSIONS, buildContext(user.owned))

  for (const [tree, expected] of Object.entries(user.expect)) {
    STEPS.forEach(({ rarity }, idx) => {
      const mission = MISSIONS.find((m) => m.tree === tree && m.gateRarity === rarity)!
      const result = map.get(mission.id)!
      const label = `${user.label} → ${mission.title}`
      try {
        assert.strictEqual(result.visibility, expected[idx], label)
        // locked 카드는 안내 문구를 위해 "먼저 획득해야 하는 배지"가 반드시 있어야 한다.
        if (result.visibility === 'locked') {
          assert.ok(result.requiredBadge, `${label}: locked인데 requiredBadge가 없다`)
          assert.strictEqual(result.requiredBadge!.name, tree, `${label}: requiredBadge 이름 불일치`)
          assert.strictEqual(
            RARITY_TIER[result.requiredBadge!.rarity],
            RARITY_TIER[rarity] - 1,
            `${label}: requiredBadge는 게이트 배지 바로 아래 등급이어야 한다`,
          )
        }
        console.log(`  ✓ ${label} = ${result.visibility}`)
        passed++
      } catch (e) {
        console.error(`  ✗ ${label}: ${(e as Error).message}`)
        failed++
      }
    })
  }
}

// 전체 미션 수 대비 hidden/locked가 실제로 목록에서 제외·잠금되는지 요약도 남긴다.
const newbieMap = resolveMissionVisibilityMap(MISSIONS, buildContext({}))
const counts = { open: 0, locked: 0, hidden: 0, completed: 0 }
for (const r of newbieMap.values()) counts[r.visibility]++
console.log(`\n신규 유저 15종 요약: open ${counts.open} / locked ${counts.locked} / hidden ${counts.hidden}`)
assert.deepStrictEqual(counts, { open: 5, locked: 5, hidden: 5, completed: 0 }, '신규 유저 요약 불일치')

console.log(`\n실데이터 대조: ${passed}/${passed + failed} 통과`)
if (failed > 0) process.exit(1)
