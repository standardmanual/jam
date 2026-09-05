/**
 * 게이트 미션 — 노출 판정 · 정합성 검사 회귀 테스트 (티켓 20260905_0033)
 *
 * 이 파일이 지키는 다섯 가지 (티켓 «완료 조건»):
 *   ① **레벨형 배지를 게이트로 걸어도 게이팅이 꺼지지 않는다**
 *      (`rarityTier`가 0을 「서열 밖」으로 다루는가 — 예전 `RARITY_TIER[r] ?? 0`은
 *       `0 <= 1`이 되어 에러도 로그도 없이 `open`을 돌려줬다)
 *   ② 축·단계 기반 판정이 «축 Epic 보유 AND Mystic 미보유»를 표현한다
 *   ③ 4개 진입점(미션 목록·상세·참가 API·오늘 카드)이 같은 판정 함수를 쓴다(재선언 없음)
 *   ④ 정합성 검사가 구멍·중복·죽은 보상 배지를 잡는다
 *   ⑤ 마이그레이션 135가 130~134의 변경분을 되돌리지 않는다
 *
 * 실행: `npx tsx src/lib/missions/__tests__/gate-visibility.test.ts`
 *       (테스트 러너 불필요 — node assert 사용. vitest.config.ts에서 이 디렉터리는 제외됨)
 */
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import {
  resolveMissionVisibility,
  resolveMissionVisibilityMap,
  type GatedBadgeInfo,
  type MissionVisibilityContext,
  type MissionVisibilityInput,
} from '../visibility'
import {
  buildGateMatrix,
  checkGateMissionConsistency,
  collectRuleFamilyKeys,
  parseVisibilityRule,
  type GateMissionBadge,
  type GateMissionInput,
} from '../gateMissions'
import { RARITY_TIER } from '@/lib/rarity'
import type { MissionVisibilityRule } from '@/types/database'

const REPO_ROOT = path.resolve(__dirname, '../../../..')

// ── 픽스처 ────────────────────────────────────────────────────────────────
const AXIS = 'walking:거리'
const EPIC_FAMILY = 'walking:밤의-보행자'
const MYSTIC_FAMILY = 'walking:새벽의-보행자'

/** «해당 축 Epic 보유 AND Mystic 미보유» — v5가 표현해야 하는 노출 조건 그 자체 */
const RULE_EPIC_OWNED_MYSTIC_NOT: MissionVisibilityRule = {
  require_owned: { family_keys: [EPIC_FAMILY], min_rarity: 'epic' },
  hide_when_owned: { family_keys: [MYSTIC_FAMILY], min_rarity: 'mystic' },
}

const GATE_MISSION: MissionVisibilityInput = {
  id: 'gm-1',
  gated_badge_id: null,
  gate_axis: AXIS,
  gate_stage: 'epic_to_mystic',
  visibility_rule_json: RULE_EPIC_OWNED_MYSTIC_NOT,
}

function ctx(options?: {
  completed?: string[]
  participated?: string[]
  ownedFamilyTiers?: Record<string, number>
  gatedBadges?: Map<string, GatedBadgeInfo>
  ownedTierByBadgeName?: Record<string, number>
}): MissionVisibilityContext {
  return {
    completedMissionIds: new Set(options?.completed ?? []),
    participatedMissionIds: new Set(options?.participated ?? []),
    gatedBadges: options?.gatedBadges ?? new Map(),
    ownedTierByBadgeName: new Map(Object.entries(options?.ownedTierByBadgeName ?? {})),
    ownedFamilyTiers: new Map(Object.entries(options?.ownedFamilyTiers ?? {})),
  }
}

const vis = (mission: MissionVisibilityInput, c: MissionVisibilityContext) =>
  resolveMissionVisibility(mission, c).visibility

/** console.warn을 삼키고 호출 횟수만 센다 — fail-closed 경로는 «경고를 남기는 것»도 요구다 */
function countWarnings(fn: () => void): number {
  const original = console.warn
  let count = 0
  console.warn = () => {
    count += 1
  }
  try {
    fn()
  } finally {
    console.warn = original
  }
  return count
}

function badge(overrides: Partial<GateMissionBadge> & Pick<GateMissionBadge, 'id' | 'name'>): GateMissionBadge {
  return {
    rarity: 'epic',
    level: null,
    family_key: null,
    deleted_at: null,
    condition_json: {},
    activity_types: ['walking'],
    ...overrides,
  }
}

function gateMission(overrides: Partial<GateMissionInput> & Pick<GateMissionInput, 'id'>): GateMissionInput {
  return {
    title: `미션 ${overrides.id}`,
    gate_axis: AXIS,
    gate_stage: 'epic_to_mystic',
    visibility_rule_json: null,
    reward_badge_ids: [],
    gated_badge_id: null,
    ...overrides,
  }
}

// ── 케이스 ────────────────────────────────────────────────────────────────
const cases: Array<[string, () => void]> = [
  // ── ① 레벨형 게이트에서 게이팅이 꺼지지 않는다 ──────────────────────────
  ['① 등급 없는 배지(레벨형)를 레거시 게이트로 걸면 open이 아니라 locked + 경고', () => {
    const leveled: GatedBadgeInfo = { id: 'b-lv', name: '밤의 보행자', rarity: null }
    const mission: MissionVisibilityInput = {
      id: 'm-lv',
      gated_badge_id: leveled.id,
      gate_axis: null,
      gate_stage: null,
      visibility_rule_json: null,
    }
    const c = ctx({ gatedBadges: new Map([[leveled.id, leveled]]) })

    let result = 'unset'
    const warnings = countWarnings(() => {
      result = vis(mission, c)
    })
    // 예전 구현: RARITY_TIER[null] ?? 0 → 0 <= MIN_EFFECTIVE_TIER(1) → open (게이팅 소멸)
    assert.notStrictEqual(result, 'open', '레벨형 게이트에서 게이팅이 꺼지면 안 된다')
    assert.strictEqual(result, 'locked')
    assert.strictEqual(warnings, 1, '조용히 잠기면 운영자가 오설정을 알 수 없다')
  }],

  ['① rarityTier의 0은 「서열 밖」 — Common(1)과 같은 값이 아니다', () => {
    // 이 단언이 깨지면 ①의 회귀 방향(0을 서열 맨 아래로 다루기)이 되살아난 것이다
    assert.strictEqual(RARITY_TIER.common, 1)
    assert.ok(RARITY_TIER.common > 0)
  }],

  ['① 노출 규칙의 등급 요구는 레벨형 계열(티어 0) 보유로 충족되지 않는다', () => {
    // 「그 계열을 보유하고 있다」(키 존재)지만 등급이 없다 → epic 요구를 만족시키지 못한다
    const c = ctx({ ownedFamilyTiers: { [EPIC_FAMILY]: 0 } })
    assert.strictEqual(vis(GATE_MISSION, c), 'locked')
  }],

  // ── ② 축·단계 기반 판정 ─────────────────────────────────────────────────
  ['② 축 Epic 미보유 → locked', () => {
    assert.strictEqual(vis(GATE_MISSION, ctx()), 'locked')
  }],

  ['② 축 Epic 보유 AND Mystic 미보유 → open', () => {
    const c = ctx({ ownedFamilyTiers: { [EPIC_FAMILY]: RARITY_TIER.epic } })
    assert.strictEqual(vis(GATE_MISSION, c), 'open')
  }],

  ['② Mystic까지 보유하면 hidden — 미션의 역할이 끝났다', () => {
    const c = ctx({
      ownedFamilyTiers: { [EPIC_FAMILY]: RARITY_TIER.epic, [MYSTIC_FAMILY]: RARITY_TIER.mystic },
    })
    assert.strictEqual(vis(GATE_MISSION, c), 'hidden')
  }],

  ['② hidden이어도 참가 이력이 있으면 locked로 완화 (20260825_029 규칙 유지)', () => {
    const c = ctx({
      participated: [GATE_MISSION.id],
      ownedFamilyTiers: { [EPIC_FAMILY]: RARITY_TIER.epic, [MYSTIC_FAMILY]: RARITY_TIER.mystic },
    })
    assert.strictEqual(vis(GATE_MISSION, c), 'locked')
  }],

  ['② 완료 기록은 축 판정보다 앞선다', () => {
    assert.strictEqual(vis(GATE_MISSION, ctx({ completed: [GATE_MISSION.id] })), 'completed')
  }],

  ['② unmet_visibility: hidden이면 미충족 시 목록에서 빠진다', () => {
    const mission: MissionVisibilityInput = {
      ...GATE_MISSION,
      id: 'gm-hidden',
      visibility_rule_json: { ...RULE_EPIC_OWNED_MYSTIC_NOT, unmet_visibility: 'hidden' },
    }
    assert.strictEqual(vis(mission, ctx()), 'hidden')
  }],

  ['② min_rarity 없는 요구는 「그 계열을 하나라도 보유」 — 레벨형 계열도 열 수 있다', () => {
    const mission: MissionVisibilityInput = {
      ...GATE_MISSION,
      id: 'gm-any',
      visibility_rule_json: { require_owned: { family_keys: [EPIC_FAMILY] } },
    }
    assert.strictEqual(vis(mission, ctx({ ownedFamilyTiers: { [EPIC_FAMILY]: 0 } })), 'open')
    assert.strictEqual(vis(mission, ctx()), 'locked')
  }],

  ['② min_count는 AND — 두 계열을 다 보유해야 열린다', () => {
    const mission: MissionVisibilityInput = {
      ...GATE_MISSION,
      id: 'gm-and',
      visibility_rule_json: {
        require_owned: { family_keys: [EPIC_FAMILY, MYSTIC_FAMILY], min_count: 2 },
      },
    }
    assert.strictEqual(vis(mission, ctx({ ownedFamilyTiers: { [EPIC_FAMILY]: 3 } })), 'locked')
    assert.strictEqual(vis(mission, ctx({ ownedFamilyTiers: { [EPIC_FAMILY]: 3, [MYSTIC_FAMILY]: 3 } })), 'open')
  }],

  ['② 규칙 형태가 깨지면 fail-closed — open이 아니라 locked + 경고', () => {
    for (const broken of [
      { require_owned: {} },
      { require_owned: { family_keys: [] } },
      { require_owned: { family_keys: ['a:b'], min_rarity: 'legendary' } },
      { require_owned: { family_keys: ['a:b'], min_count: 0 } },
      { require_owned: { family_keys: ['a:b', 'a:c'], min_count: 3 } },
      [] as unknown,
    ]) {
      const mission = {
        ...GATE_MISSION,
        id: 'gm-broken',
        visibility_rule_json: broken as MissionVisibilityRule,
      }
      let result = 'unset'
      const warnings = countWarnings(() => {
        result = vis(mission, ctx({ ownedFamilyTiers: { [EPIC_FAMILY]: 3 } }))
      })
      assert.strictEqual(result, 'locked', `형태 오류(${JSON.stringify(broken)})가 통과하면 안 된다`)
      assert.strictEqual(warnings, 1)
    }
  }],

  ['② 축만 있고 규칙이 없으면 노출 제한 없음(open) — 명시적 설정이다', () => {
    const mission: MissionVisibilityInput = { ...GATE_MISSION, id: 'gm-norule', visibility_rule_json: null }
    assert.strictEqual(vis(mission, ctx()), 'open')
  }],

  ['② 축이 있으면 레거시 gated_badge_id 경로를 타지 않는다', () => {
    // 마이그레이션 135의 CHECK가 공존을 막지만, 판정 우선순위도 코드로 고정해 둔다
    const mystic: GatedBadgeInfo = { id: 'b-mystic', name: '첫 숨결', rarity: 'mystic' }
    const mission: MissionVisibilityInput = {
      ...GATE_MISSION,
      id: 'gm-both',
      gated_badge_id: mystic.id,
      visibility_rule_json: null,
    }
    const c = ctx({ gatedBadges: new Map([[mystic.id, mystic]]) })
    // 레거시 규칙이었다면 hidden(미보유 → Common 취급, Mystic은 2단계 위)이 나온다
    assert.strictEqual(vis(mission, c), 'open')
  }],

  ['② resolveMissionVisibilityMap이 게이트 미션도 함께 판정한다', () => {
    const legacyPlain: MissionVisibilityInput = {
      id: 'm-plain',
      gated_badge_id: null,
      gate_axis: null,
      gate_stage: null,
      visibility_rule_json: null,
    }
    const map = resolveMissionVisibilityMap([GATE_MISSION, legacyPlain], ctx())
    assert.strictEqual(map.size, 2)
    assert.strictEqual(map.get('gm-1')?.visibility, 'locked')
    assert.strictEqual(map.get('m-plain')?.visibility, 'open')
  }],

  ['② collectRuleFamilyKeys가 조회 대상과 판정 대상을 일치시킨다', () => {
    const keys = collectRuleFamilyKeys([GATE_MISSION])
    assert.deepStrictEqual([...keys].sort(), [EPIC_FAMILY, MYSTIC_FAMILY].sort())
    // 형태가 깨진 규칙은 어차피 fail-closed로 잠기므로 조회 대상이 아니다
    assert.deepStrictEqual(
      collectRuleFamilyKeys([{ visibility_rule_json: { require_owned: {} } as MissionVisibilityRule }]),
      []
    )
  }],

  ['② parseVisibilityRule은 모르는 키를 통과시키지 않는다', () => {
    const result = parseVisibilityRule({ require_ownedd: { family_keys: ['a:b'] } })
    assert.strictEqual(result.ok, false)
  }],

  // ── ③ 4개 진입점이 같은 판정 함수를 쓴다 ────────────────────────────────
  ['③ 미션 목록·상세·참가 API·오늘 카드가 visibility.ts를 그대로 쓴다(재선언 없음)', () => {
    const entryPoints = [
      'src/app/(main)/missions/page.tsx',
      'src/app/(main)/missions/[id]/page.tsx',
      'src/app/api/missions/[id]/join/route.ts',
      'src/lib/today/cards.ts',
    ]
    for (const rel of entryPoints) {
      const source = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')
      assert.ok(
        source.includes("from '@/lib/missions/visibility'"),
        `${rel}가 판정 함수를 import하지 않는다`
      )
      assert.ok(
        source.includes("from '@/lib/missions/visibility-server'"),
        `${rel}가 컨텍스트 조회를 import하지 않는다`
      )
      // 판정 규칙을 그 자리에서 다시 쓰면(등급 비교·계열 비교) 화면과 가드가 갈린다
      for (const forbidden of ['RARITY_TIER[', 'rarityTier(', 'ownedFamilyTiers', 'visibility_rule_json']) {
        assert.ok(
          !source.includes(forbidden),
          `${rel}에 판정 규칙 재선언으로 보이는 코드가 있다: ${forbidden}`
        )
      }
    }
  }],

  // ── ④ 정합성 검사 ───────────────────────────────────────────────────────
  ['④ 축에 한 단계만 있으면 구멍을 잡는다', () => {
    const issues = checkGateMissionConsistency({
      missions: [gateMission({ id: 'a', gate_stage: 'rare_to_epic', reward_badge_ids: ['r1'] })],
      activityBadges: [],
      referencedBadges: new Map([['r1', badge({ id: 'r1', name: '보상' })]]),
    })
    const gap = issues.filter((i) => i.code === 'axis_stage_gap')
    assert.strictEqual(gap.length, 1)
    assert.strictEqual(gap[0].stage, 'epic_to_mystic')
  }],

  ['④ 같은 축·단계에 미션 2개면 중복을 잡는다', () => {
    const issues = checkGateMissionConsistency({
      missions: [gateMission({ id: 'a' }), gateMission({ id: 'b' })],
      activityBadges: [],
      referencedBadges: new Map(),
    })
    const dup = issues.filter((i) => i.code === 'axis_stage_duplicate')
    assert.strictEqual(dup.length, 1)
    assert.deepStrictEqual(dup[0].missionIds, ['a', 'b'])
  }],

  ['④ 보상 배지가 삭제됐거나 없으면 잡는다', () => {
    const issues = checkGateMissionConsistency({
      missions: [
        gateMission({ id: 'a', reward_badge_ids: ['dead'] }),
        gateMission({ id: 'b', gate_stage: 'rare_to_epic', reward_badge_ids: [] }),
      ],
      activityBadges: [],
      referencedBadges: new Map([
        ['dead', badge({ id: 'dead', name: '삭제된 보상', deleted_at: '2026-09-01T00:00:00Z' })],
      ]),
    })
    assert.strictEqual(issues.filter((i) => i.code === 'reward_badge_deleted').length, 1)
    assert.strictEqual(issues.filter((i) => i.code === 'reward_badge_missing').length, 1)
  }],

  ['④ 존재하지 않는 계열을 가리키는 노출 조건을 잡는다', () => {
    const issues = checkGateMissionConsistency({
      missions: [gateMission({ id: 'a', visibility_rule_json: RULE_EPIC_OWNED_MYSTIC_NOT })],
      activityBadges: [],
      referencedBadges: new Map(),
    })
    assert.ok(issues.filter((i) => i.code === 'unknown_family_key').length >= 1)
  }],

  ['④ 레벨형 계열에 등급 조건을 걸면 「영원히 미충족」으로 잡는다', () => {
    const issues = checkGateMissionConsistency({
      missions: [
        gateMission({
          id: 'a',
          visibility_rule_json: { require_owned: { family_keys: [EPIC_FAMILY], min_rarity: 'epic' } },
        }),
      ],
      // 그 계열이 레벨형(rarity null)만으로 이뤄져 있다
      activityBadges: [badge({ id: 'lv1', name: '밤의 보행자', rarity: null, level: 1, family_key: EPIC_FAMILY })],
      referencedBadges: new Map(),
    })
    assert.strictEqual(issues.filter((i) => i.code === 'rarity_requirement_on_leveled_family').length, 1)
    assert.strictEqual(issues.filter((i) => i.code === 'unknown_family_key').length, 0)
  }],

  ['④ 보상 배지 계열을 미션 게이트로 가리키는 배지가 없으면 잡는다 (두 판정이 어긋남)', () => {
    const reward = badge({
      id: 'r1',
      name: '미션 보상',
      family_key: 'walking:미션보상',
      condition_json: { mission_reward: true },
    })
    const withGate = badge({
      id: 'mystic',
      name: '미스틱',
      rarity: 'mystic',
      family_key: MYSTIC_FAMILY,
      condition_json: { gate_mission_badge: { family_keys: ['walking:미션보상'] } },
    })

    const missing = checkGateMissionConsistency({
      missions: [gateMission({ id: 'a', reward_badge_ids: ['r1'] })],
      activityBadges: [reward],
      referencedBadges: new Map([['r1', reward]]),
    })
    assert.strictEqual(missing.filter((i) => i.code === 'reward_family_not_gated').length, 1)

    const linked = checkGateMissionConsistency({
      missions: [gateMission({ id: 'a', reward_badge_ids: ['r1'] })],
      activityBadges: [reward, withGate],
      referencedBadges: new Map([['r1', reward]]),
    })
    assert.strictEqual(linked.filter((i) => i.code === 'reward_family_not_gated').length, 0)
    assert.strictEqual(linked.filter((i) => i.code === 'reward_badge_not_mission_reward').length, 0)
  }],

  ['④ 폐기 대상(레거시 게이트 미션)을 식별한다', () => {
    const issues = checkGateMissionConsistency({
      missions: [
        gateMission({ id: 'legacy', gate_axis: null, gate_stage: null, gated_badge_id: 'b1' }),
        gateMission({ id: 'plain', gate_axis: null, gate_stage: null }),
      ],
      activityBadges: [],
      referencedBadges: new Map(),
    })
    const legacy = issues.filter((i) => i.code === 'legacy_gate_mission')
    assert.strictEqual(legacy.length, 1)
    assert.deepStrictEqual(legacy[0].missionIds, ['legacy'])
  }],

  ['④ 매트릭스는 축별로 두 단계의 채움 여부를 드러낸다', () => {
    const rows = buildGateMatrix([
      gateMission({ id: 'a', gate_stage: 'rare_to_epic' }),
      gateMission({ id: 'b', gate_stage: 'epic_to_mystic' }),
      gateMission({ id: 'c', gate_axis: 'running:속도', gate_stage: 'rare_to_epic' }),
      gateMission({ id: 'plain', gate_axis: null, gate_stage: null }),
    ])
    assert.strictEqual(rows.length, 2)
    const walking = rows.find((r) => r.axis === AXIS)
    assert.strictEqual(walking?.complete, true)
    assert.strictEqual(walking?.activityType, 'walking')
    assert.strictEqual(rows.find((r) => r.axis === 'running:속도')?.complete, false)
  }],

  // ── ⑤ 마이그레이션 135가 130~134를 되돌리지 않는다 ──────────────────────
  ['⑤ 135는 badges 테이블·CHECK·트리거·RPC를 건드리지 않는다', () => {
    const sql = fs.readFileSync(
      path.join(REPO_ROOT, 'supabase/migrations/135_mission_gate_axis.sql'),
      'utf8'
    )
    // 주석(`--`)을 걷어낸 «실행되는» SQL만 본다
    const executable = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')

    for (const forbidden of [
      'public.badges',
      'badges_condition_json_known_keys',
      'check_family_condition_consistency',
      'badges_family_consistency',
      'increment_activity_badge_earn',
    ]) {
      assert.ok(
        !executable.includes(forbidden),
        `135가 130~134의 산출물을 건드린다: ${forbidden}`
      )
    }
    // 대상은 missions 하나뿐이고, 컬럼 3종을 더한다
    assert.ok(executable.includes('ADD COLUMN IF NOT EXISTS gate_axis'))
    assert.ok(executable.includes('ADD COLUMN IF NOT EXISTS gate_stage'))
    assert.ok(executable.includes('ADD COLUMN IF NOT EXISTS visibility_rule_json'))
    // 폐기 절차는 «주석으로만» 있어야 한다 — 이 티켓에서 실행하지 않는다(판단 ②)
    assert.ok(!executable.includes('DELETE FROM'), '135가 데이터를 지우면 안 된다')
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[gate-visibility] ${passed}/${cases.length} passed`)
