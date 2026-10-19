/**
 * ranking.ts filterRankableParticipants — 순위에서 이용 정지 유저 제외 유닛 테스트 (티켓 20261019_1311)
 *
 * 검증 범위:
 *   - 이용 정지 중인 유저는 목록에서 빠진다
 *   - viewerUserId 본인은 정지 중이어도 남는다 (본인 화면에는 보인다)
 *   - 정지가 풀리면(집합에서 빠지면) 다시 포함된다
 *   - 걸러낸 뒤의 목록으로 순위 번호를 매긴다 (rankMissionParticipants와 함께 쓰는 경로)
 *   - 입력 배열을 바꾸지 않고, 기존 compareMissionRank 동작은 그대로다
 *
 * 실행: `npx tsx src/lib/missions/__tests__/ranking-rankable.test.ts`
 *       (테스트 러너 불필요 — node assert 사용. vitest.config.ts에서 이 디렉터리는 제외됨)
 */
import assert from 'node:assert'
import { filterRankableParticipants, rankMissionParticipants, compareMissionRank } from '../ranking'

const list = [
  { userId: 'u1', progressValue: 90, completedAt: null },
  { userId: 'u2', progressValue: 50, completedAt: null },
  { userId: 'u3', progressValue: 10, completedAt: null },
]

const ids = (rows: { userId: string }[]) => rows.map((r) => r.userId)

const cases: [string, () => void][] = [
  ['정지 중인 유저는 목록에서 빠진다', () => {
    assert.deepStrictEqual(ids(filterRankableParticipants(list, new Set(['u2']))), ['u1', 'u3'])
  }],

  ['정지 유저가 없으면 모두 남는다', () => {
    assert.deepStrictEqual(ids(filterRankableParticipants(list, new Set())), ['u1', 'u2', 'u3'])
  }],

  ['viewerUserId 본인은 정지 중이어도 남는다', () => {
    assert.deepStrictEqual(ids(filterRankableParticipants(list, new Set(['u1', 'u2']), 'u1')), ['u1', 'u3'])
  }],

  ['viewerUserId가 정지 중이 아니면 다른 정지 유저는 그대로 빠진다', () => {
    assert.deepStrictEqual(ids(filterRankableParticipants(list, new Set(['u2']), 'u3')), ['u1', 'u3'])
  }],

  ['정지가 풀리면(집합에서 빠지면) 다시 포함된다', () => {
    assert.deepStrictEqual(ids(filterRankableParticipants(list, new Set(['u2']))), ['u1', 'u3'])
    assert.deepStrictEqual(ids(filterRankableParticipants(list, new Set())), ['u1', 'u2', 'u3'])
  }],

  ['걸러낸 뒤의 목록으로 순위가 매겨진다', () => {
    const ranked = rankMissionParticipants(filterRankableParticipants(list, new Set(['u1'])))
    assert.deepStrictEqual(ranked.map((r) => [r.userId, r.rank]), [['u2', 1], ['u3', 2]])
  }],

  ['본인이 정지 중이면 본인은 남아 다른 유저들 사이에서 자기 순서로 매겨진다', () => {
    const ranked = rankMissionParticipants(filterRankableParticipants(list, new Set(['u1', 'u2']), 'u1'))
    assert.deepStrictEqual(ranked.map((r) => [r.userId, r.rank]), [['u1', 1], ['u3', 2]])
  }],

  ['입력 배열을 바꾸지 않는다', () => {
    const input = [...list]
    filterRankableParticipants(input, new Set(['u1']))
    assert.strictEqual(input.length, 3)
  }],

  ['추가 필드를 가진 항목도 그대로 돌려준다(제네릭)', () => {
    const rows = [{ userId: 'u1', extra: 'a' }, { userId: 'u2', extra: 'b' }]
    assert.deepStrictEqual(filterRankableParticipants(rows, new Set(['u2'])), [{ userId: 'u1', extra: 'a' }])
  }],

  ['기존 비교 규칙은 그대로다: 완료자 우선 → 먼저 완료 → 진행도 높은 순', () => {
    const a = { progressValue: 1, completedAt: '2026-10-01T00:00:00Z' }
    const b = { progressValue: 99, completedAt: null }
    const c = { progressValue: 1, completedAt: '2026-10-02T00:00:00Z' }
    assert.ok(compareMissionRank(a, b) < 0)
    assert.ok(compareMissionRank(a, c) < 0)
    assert.ok(compareMissionRank(b, { progressValue: 5, completedAt: null }) < 0)
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[ranking-rankable] ${passed}/${cases.length} passed`)
