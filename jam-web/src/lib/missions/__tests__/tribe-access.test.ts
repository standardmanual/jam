/**
 * tribe-access.ts 트라이브 접근 판정 유닛 테스트 (티켓 20261019_1311)
 *
 * 검증 범위:
 *   - 허용 트라이브를 정하지 않은 미션(목록 없음·빈 목록)은 모든 유저에게 열려 있다
 *   - 허용 목록이 있으면 유저 트라이브가 들어 있을 때만 열려 있고, 없으면 닫힌다
 *   - 트라이브가 아직 없는 유저(온보딩 전)는 공통 미션만 본다
 *   - 미션별 판정(isMissionOpenToUser)은 맵에 없는 미션을 공통 미션으로 본다
 *
 * 실행: `npx tsx src/lib/missions/__tests__/tribe-access.test.ts`
 *       (테스트 러너 불필요 — node assert 사용. vitest.config.ts에서 이 디렉터리는 제외됨)
 */
import assert from 'node:assert'
import { isMissionOpenToTribe, isMissionOpenToUser, type MissionTribeAccess } from '../tribe-access'

const TRIBE_A = 'tribe-a'
const TRIBE_B = 'tribe-b'
const TRIBE_C = 'tribe-c'

function access(userTribeId: string | null, entries: Record<string, string[]>): MissionTribeAccess {
  return { userTribeId, allowedTribeIdsByMission: new Map(Object.entries(entries)) }
}

const cases: [string, () => void][] = [
  ['허용 목록이 없으면(undefined·null) 모두에게 열려 있다', () => {
    assert.strictEqual(isMissionOpenToTribe(undefined, TRIBE_A), true)
    assert.strictEqual(isMissionOpenToTribe(null, TRIBE_A), true)
  }],

  ['허용 목록이 비어 있으면 공통 미션이라 모두에게 열려 있다', () => {
    assert.strictEqual(isMissionOpenToTribe([], TRIBE_A), true)
    assert.strictEqual(isMissionOpenToTribe([], null), true)
  }],

  ['목록에 내 트라이브가 있으면 열려 있다', () => {
    assert.strictEqual(isMissionOpenToTribe([TRIBE_A], TRIBE_A), true)
    assert.strictEqual(isMissionOpenToTribe([TRIBE_B, TRIBE_A], TRIBE_A), true)
  }],

  ['목록에 내 트라이브가 없으면 닫혀 있다', () => {
    assert.strictEqual(isMissionOpenToTribe([TRIBE_B], TRIBE_A), false)
    assert.strictEqual(isMissionOpenToTribe([TRIBE_B, TRIBE_C], TRIBE_A), false)
  }],

  ['트라이브가 아직 없는 유저(null·undefined)는 목록이 있는 미션이 닫히고 공통 미션만 열린다', () => {
    assert.strictEqual(isMissionOpenToTribe([TRIBE_A], null), false)
    assert.strictEqual(isMissionOpenToTribe([TRIBE_A], undefined), false)
    assert.strictEqual(isMissionOpenToTribe(undefined, null), true)
  }],

  ['isMissionOpenToUser는 맵에 없는 미션을 공통 미션으로 본다', () => {
    const a = access(TRIBE_A, { 'm-restricted': [TRIBE_B] })
    assert.strictEqual(isMissionOpenToUser(a, 'm-common'), true)
    assert.strictEqual(isMissionOpenToUser(a, 'm-restricted'), false)
  }],

  ['isMissionOpenToUser는 미션별 허용 목록에 유저 트라이브가 있을 때만 연다', () => {
    const a = access(TRIBE_A, { 'm-a': [TRIBE_A], 'm-ab': [TRIBE_A, TRIBE_B], 'm-b': [TRIBE_B] })
    assert.strictEqual(isMissionOpenToUser(a, 'm-a'), true)
    assert.strictEqual(isMissionOpenToUser(a, 'm-ab'), true)
    assert.strictEqual(isMissionOpenToUser(a, 'm-b'), false)
  }],

  ['트라이브 없는 유저는 isMissionOpenToUser로도 제한 미션이 닫힌다', () => {
    const a = access(null, { 'm-a': [TRIBE_A] })
    assert.strictEqual(isMissionOpenToUser(a, 'm-a'), false)
    assert.strictEqual(isMissionOpenToUser(a, 'm-common'), true)
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[tribe-access] ${passed}/${cases.length} passed`)
