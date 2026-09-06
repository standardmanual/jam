/**
 * dedupeByRewardBadge 회귀 테스트 (티켓 20260907_0043)
 *
 * `20260906_2231`이 시딩한 게이트 미션 중 다수는 같은 보상 배지를 서로 다른 축에서
 * 열 수 있어(예: `주말의 증명` — `cycling:요일`/`cycling:주기`) 미션 목록에 중복 카드로
 * 나타난다. 이 함수가 지키는 세 가지 우선순위를 각각 고정한다:
 *   ① 참가중인 행이 있으면 그 행을 남긴다 (열림 여부와 무관)
 *   ② 참가중이 없고 열림(open)인 행이 있으면 그 행을 남긴다
 *   ③ 전부 locked면 gate_axis 알파벳순으로 결정적으로 하나만 남긴다(재실행해도 동일)
 *
 * 실행: `npx tsx src/lib/missions/__tests__/dedupeReward.test.ts`
 * (이 디렉터리는 vitest.config.ts에서 제외되고 `npm run test:node`가 tsx로 실행한다)
 */
import assert from 'node:assert'
import { dedupeByRewardBadge } from '../dedupeReward'
import type { MissionRow, MissionVisibilityRule } from '@/types/database'
import type { MissionVisibilityResult } from '../visibility'

let seq = 0
function makeMission(overrides: Partial<MissionRow> & { gate_axis: string; reward_badge_ids: string[] }): MissionRow {
  seq += 1
  return {
    id: `mission-${seq}`,
    title: `테스트 미션 ${seq}`,
    description: null,
    mission_type: 'engine_condition',
    condition_json: {} as MissionRow['condition_json'],
    reward_type: null,
    reward_id: null,
    reward_points: null,
    status_display_type: 'ranking',
    visible_rank_count: null,
    starts_at: '2026-01-01T00:00:00.000Z',
    ends_at: null,
    max_completions: null,
    image_url: null,
    gated_badge_id: null,
    gate_stage: 'rare_to_epic',
    visibility_rule_json: null as unknown as MissionVisibilityRule,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function visResult(visibility: MissionVisibilityResult['visibility']): MissionVisibilityResult {
  return { visibility, requiredBadge: null }
}

let passed = 0
let failed = 0
function check(label: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${label}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${label}: ${(e as Error).message}`)
    failed++
  }
}

// ── 안전장치: reward_badge_ids가 1개가 아니면 그룹핑 대상에서 제외 ──────────────
check('reward_badge_ids가 2개 이상이면 중복 제거 대상이 아니다(그대로 통과)', () => {
  const a = makeMission({ gate_axis: 'cycling:요일', reward_badge_ids: ['badge-multi', 'badge-other'] })
  const b = makeMission({ gate_axis: 'cycling:주기', reward_badge_ids: ['badge-multi', 'badge-other'] })
  const result = dedupeByRewardBadge([a, b], new Set(), new Map())
  assert.strictEqual(result.length, 2, '다중 보상 미션은 병합되면 안 된다')
})

// ── 우선순위 ①: 참가중인 행이 있으면 그 행을 남긴다 ────────────────────────────
check('① 참가중인 행이 open이 아니어도 그 행을 남긴다(참가했는데 사라지는 회귀 방지)', () => {
  const joinedButLocked = makeMission({ gate_axis: 'cycling:주기', reward_badge_ids: ['badge-1'] })
  const openButNotJoined = makeMission({ gate_axis: 'cycling:요일', reward_badge_ids: ['badge-1'] })
  const participationSet = new Set([joinedButLocked.id])
  const visibilityMap = new Map<string, MissionVisibilityResult>([
    [joinedButLocked.id, visResult('locked')],
    [openButNotJoined.id, visResult('open')],
  ])
  const result = dedupeByRewardBadge([joinedButLocked, openButNotJoined], participationSet, visibilityMap)
  assert.strictEqual(result.length, 1, '보상 배지 1개당 1행만 남아야 한다')
  assert.strictEqual(result[0].id, joinedButLocked.id, '참가중인 행이 open인 행보다 우선해야 한다')
})

// ── 우선순위 ②: 참가중이 없으면 open인 행을 남긴다 ─────────────────────────────
check('② 참가중이 없으면 open인 행을 남긴다', () => {
  const locked = makeMission({ gate_axis: 'cycling:요일', reward_badge_ids: ['badge-2'] })
  const open = makeMission({ gate_axis: 'cycling:주기', reward_badge_ids: ['badge-2'] })
  const visibilityMap = new Map<string, MissionVisibilityResult>([
    [locked.id, visResult('locked')],
    [open.id, visResult('open')],
  ])
  const result = dedupeByRewardBadge([locked, open], new Set(), visibilityMap)
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].id, open.id, 'open인 행이 locked인 행보다 우선해야 한다')
})

// ── 우선순위 ③: 전부 locked면 gate_axis 알파벳순으로 결정적 선택 ────────────────
check('③ 전부 locked면 gate_axis 알파벳순으로 결정적으로 하나만 남긴다(재실행해도 동일)', () => {
  const a = makeMission({ gate_axis: 'cycling:주기', reward_badge_ids: ['badge-3'] })
  const b = makeMission({ gate_axis: 'cycling:요일', reward_badge_ids: ['badge-3'] })
  const visibilityMap = new Map<string, MissionVisibilityResult>([
    [a.id, visResult('locked')],
    [b.id, visResult('locked')],
  ])
  const expectedId = [a, b].sort((x, y) => x.gate_axis!.localeCompare(y.gate_axis!))[0].id

  // 입력 순서를 바꿔가며 여러 번 실행해도 항상 같은 행이 선택돼야 한다(결정성)
  const run1 = dedupeByRewardBadge([a, b], new Set(), visibilityMap)
  const run2 = dedupeByRewardBadge([b, a], new Set(), visibilityMap)
  assert.strictEqual(run1.length, 1)
  assert.strictEqual(run2.length, 1)
  assert.strictEqual(run1[0].id, expectedId, '알파벳순 첫 번째 gate_axis 행이 선택돼야 한다')
  assert.strictEqual(run2[0].id, expectedId, '입력 순서가 바뀌어도 같은 행이 선택돼야 한다')
})

// ── 둘 다 open인 극단 케이스(유저가 두 축 모두 Epic 보유)도 결정적으로 하나만 ────
check('둘 다 open이면(양쪽 축 모두 충족) gate_axis 알파벳순으로 타이브레이크한다', () => {
  const a = makeMission({ gate_axis: 'cycling:주기', reward_badge_ids: ['badge-4'] })
  const b = makeMission({ gate_axis: 'cycling:요일', reward_badge_ids: ['badge-4'] })
  const visibilityMap = new Map<string, MissionVisibilityResult>([
    [a.id, visResult('open')],
    [b.id, visResult('open')],
  ])
  const expectedId = [a, b].sort((x, y) => x.gate_axis!.localeCompare(y.gate_axis!))[0].id
  const result = dedupeByRewardBadge([a, b], new Set(), visibilityMap)
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].id, expectedId)
})

// ── 원본 순서 보존 확인 ───────────────────────────────────────────────────────
check('중복 제거 후에도 원본 배열의 상대 순서를 유지한다', () => {
  const solo = makeMission({ gate_axis: 'hiking:거리', reward_badge_ids: ['badge-solo'] })
  const dupA = makeMission({ gate_axis: 'cycling:요일', reward_badge_ids: ['badge-5'] })
  const dupB = makeMission({ gate_axis: 'cycling:주기', reward_badge_ids: ['badge-5'] })
  const visibilityMap = new Map<string, MissionVisibilityResult>([
    [dupA.id, visResult('locked')],
    [dupB.id, visResult('locked')],
  ])
  const input = [solo, dupA, dupB]
  const result = dedupeByRewardBadge(input, new Set(), visibilityMap)
  assert.strictEqual(result.length, 2)
  assert.strictEqual(result[0].id, solo.id, 'solo 미션이 원래 위치(첫 번째)를 유지해야 한다')
})

// ── 실제 프로덕션 사례 실측(2026-09-07, 읽기 전용 조회) ─────────────────────────
// '주말의 증명'(cycling Q5 배지)이 cycling:요일 / cycling:주기 두 축 게이트 미션으로
// 중복 시딩된 실제 사례. 53개 게이트 미션 중 13개 보상이 이런 식으로 중복되어 있었고,
// 이 함수 적용 후 40개로 줄어드는 것을 프로덕션 DB 조회로 확인했다(스크립트는 임시 실행 후 삭제).
check("실제 사례: '주말의 증명'(cycling:요일/cycling:주기) 중복이 1개로 합쳐진다", () => {
  const weekday = makeMission({ gate_axis: 'cycling:요일', reward_badge_ids: ['986f659f-610b-4abe-8de9-c9697fd36ff4'] })
  const cycle = makeMission({ gate_axis: 'cycling:주기', reward_badge_ids: ['986f659f-610b-4abe-8de9-c9697fd36ff4'] })
  const visibilityMap = new Map<string, MissionVisibilityResult>([
    [weekday.id, visResult('locked')],
    [cycle.id, visResult('locked')],
  ])
  const result = dedupeByRewardBadge([weekday, cycle], new Set(), visibilityMap)
  assert.strictEqual(result.length, 1, "'주말의 증명' 중복 2행이 1행으로 합쳐져야 한다")
})

console.log(`\ndedupeByRewardBadge 회귀 테스트: ${passed}/${passed + failed} 통과`)
if (failed > 0) process.exit(1)
