/**
 * POI 배지 반복 획득 로직 유닛테스트 (순수 JS, node:assert)
 *
 * 대상 로직: src/lib/strava/sync.ts 의 6-3 단계
 *   - badge.type === 'poi' 인 경우, 매번 user_poi_badge_earns 에 새 행 insert.
 *     보유 여부 사전 체크 없음.
 *   - UNIQUE(user_id, badge_id, poi_id, triggered_by_strava_id) 위반(23505)만 무시하고 계속 진행.
 *
 * 이 스크립트는 실제 Supabase를 붙이지 않고, 위 제약과 insert 분기의 "의도"를
 * 인메모리 배열 + Set 기반 mock으로 재현해서 검증한다.
 *
 * 실행: node scripts/test-poi-badge-repeat.js
 */

const assert = require('node:assert')

// ---------------------------------------------------------------------------
// Mock: user_poi_badge_earns 테이블
// UNIQUE (user_id, badge_id, poi_id, triggered_by_strava_id) 를 그대로 흉내낸다.
// ---------------------------------------------------------------------------
function createMockPoiBadgeEarnsTable() {
  const rows = []
  const uniqueKeys = new Set()

  function keyOf(row) {
    return [row.user_id, row.badge_id, row.poi_id, row.triggered_by_strava_id].join('::')
  }

  /**
   * 실제 Supabase insert를 흉내낸다.
   * 반환값은 supabase-js 스타일: { error } (error.code === '23505' 이면 unique 위반)
   */
  function insert(row) {
    const key = keyOf(row)
    if (uniqueKeys.has(key)) {
      return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
    }
    uniqueKeys.add(key)
    rows.push({ ...row, id: `earn_${rows.length + 1}` })
    return { error: null }
  }

  return {
    insert,
    get rows() {
      return rows
    },
  }
}

// ---------------------------------------------------------------------------
// sync.ts 6-3 단계의 poi 타입 발급 분기를 그대로 재현한 순수 함수.
// (실제 코드: badge.type === 'poi' 이면 매번 insert, 23505만 무시하고 계속)
// ---------------------------------------------------------------------------
function processPoiBadgeEarn(table, { userId, badgeId, poiId, stravaActivityId, activityName, activityDate }) {
  const { error } = table.insert({
    user_id: userId,
    badge_id: badgeId,
    poi_id: poiId,
    triggered_by_strava_id: stravaActivityId,
    triggered_by_activity_name: activityName,
    triggered_by_activity_date: activityDate,
  })

  if (error) {
    if (error.code !== '23505') {
      throw new Error(`unexpected error: ${JSON.stringify(error)}`)
    }
    // 23505 — 동일 활동 재처리, 무시하고 계속(발급 카운트 증가 없음)
    return { earned: false }
  }
  return { earned: true }
}

let passCount = 0
function check(label, fn) {
  fn()
  passCount++
  console.log(`  PASS: ${label}`)
}

// ===========================================================================
// 시나리오 1: 같은 유저가 같은 배지를 여러 다른 POI에서 획득 → 매번 새 행
// ===========================================================================
console.log('시나리오 1: 같은 배지, 다른 POI들에서 반복 획득')
{
  const table = createMockPoiBadgeEarnsTable()
  const userId = 'user-1'
  const badgeId = 'badge-mountain-100'

  const r1 = processPoiBadgeEarn(table, {
    userId, badgeId, poiId: 'poi-bukhan', stravaActivityId: 1001, activityName: '북한산 등반', activityDate: '2026-07-20',
  })
  const r2 = processPoiBadgeEarn(table, {
    userId, badgeId, poiId: 'poi-gwanak', stravaActivityId: 1002, activityName: '관악산 등반', activityDate: '2026-07-21',
  })
  const r3 = processPoiBadgeEarn(table, {
    userId, badgeId, poiId: 'poi-dobong', stravaActivityId: 1003, activityName: '도봉산 등반', activityDate: '2026-07-22',
  })

  check('3개 POI 모두 새로 발급됨(earned=true)', () => {
    assert.strictEqual(r1.earned, true)
    assert.strictEqual(r2.earned, true)
    assert.strictEqual(r3.earned, true)
  })
  check('user_poi_badge_earns에 3행 쌓임', () => {
    assert.strictEqual(table.rows.length, 3)
  })
  check('poi_id가 서로 다른 3개의 distinct 값', () => {
    const poiIds = new Set(table.rows.map((r) => r.poi_id))
    assert.strictEqual(poiIds.size, 3)
  })
}

// ===========================================================================
// 시나리오 1-2: 같은 POI를 여러 번(다른 Strava 활동 ID로) 재방문 → 매번 새 행
// ===========================================================================
console.log('시나리오 1-2: 같은 POI를 다른 활동 ID로 재방문')
{
  const table = createMockPoiBadgeEarnsTable()
  const userId = 'user-1'
  const badgeId = 'badge-bukhan-visit'
  const poiId = 'poi-bukhan'

  const visits = [2001, 2002, 2003].map((stravaId, i) =>
    processPoiBadgeEarn(table, {
      userId, badgeId, poiId, stravaActivityId: stravaId, activityName: `북한산 방문 ${i + 1}`, activityDate: `2026-07-2${i}`,
    })
  )

  check('같은 POI라도 활동 ID가 다르면 매번 발급됨', () => {
    assert.deepStrictEqual(visits.map((v) => v.earned), [true, true, true])
  })
  check('user_poi_badge_earns에 3행 쌓임(동일 poi_id, 동일 badge_id, 다른 strava_id)', () => {
    assert.strictEqual(table.rows.length, 3)
    assert.strictEqual(new Set(table.rows.map((r) => r.poi_id)).size, 1)
    assert.strictEqual(new Set(table.rows.map((r) => r.triggered_by_strava_id)).size, 3)
  })
}

// ===========================================================================
// 시나리오 2: 같은 Strava 활동을 재동기화(같은 strava_activity_id로 재처리)
//            → 중복 행 생기면 안 됨(idempotency)
// ===========================================================================
console.log('시나리오 2: 동일 Strava 활동 재동기화 — idempotency')
{
  const table = createMockPoiBadgeEarnsTable()
  const userId = 'user-1'
  const badgeId = 'badge-bukhan-visit'
  const poiId = 'poi-bukhan'
  const stravaActivityId = 3001

  // 최초 동기화(웹훅)
  const firstSync = processPoiBadgeEarn(table, {
    userId, badgeId, poiId, stravaActivityId, activityName: '북한산 등반', activityDate: '2026-07-25',
  })
  // 웹훅 재전송 / 수동 재싱크로 동일 활동이 다시 처리됨
  const resyncAttempt1 = processPoiBadgeEarn(table, {
    userId, badgeId, poiId, stravaActivityId, activityName: '북한산 등반', activityDate: '2026-07-25',
  })
  const resyncAttempt2 = processPoiBadgeEarn(table, {
    userId, badgeId, poiId, stravaActivityId, activityName: '북한산 등반', activityDate: '2026-07-25',
  })

  check('최초 동기화는 발급됨(earned=true)', () => {
    assert.strictEqual(firstSync.earned, true)
  })
  check('재동기화는 발급되지 않음(earned=false, 23505로 무시됨)', () => {
    assert.strictEqual(resyncAttempt1.earned, false)
    assert.strictEqual(resyncAttempt2.earned, false)
  })
  check('user_poi_badge_earns에는 딱 1행만 존재(중복 없음)', () => {
    assert.strictEqual(table.rows.length, 1)
  })
}

// ===========================================================================
// 시나리오 2-복합: 반복 획득 + idempotency가 동시에 정확히 구분되는지
//   - user A, badge X, poi P1, strava 4001 → 발급
//   - 같은 조합 재처리(웹훅 중복) → 무시
//   - 같은 유저/배지/POI, 다른 날 재방문(strava 4002) → 새로 발급
//   - 다른 POI(P2)에서 같은 배지 획득(strava 4003) → 새로 발급
// ===========================================================================
console.log('시나리오 3: 반복 획득과 idempotency가 동시에 정확히 구분되는지')
{
  const table = createMockPoiBadgeEarnsTable()
  const userId = 'user-A'
  const badgeId = 'badge-X'

  const events = [
    { poiId: 'P1', stravaActivityId: 4001, expected: true }, // 최초 발급
    { poiId: 'P1', stravaActivityId: 4001, expected: false }, // 재처리 — idempotent
    { poiId: 'P1', stravaActivityId: 4002, expected: true }, // 같은 POI 재방문(다른 날) — 반복 발급
    { poiId: 'P2', stravaActivityId: 4003, expected: true }, // 다른 POI에서 같은 배지 — 반복 발급
    { poiId: 'P2', stravaActivityId: 4003, expected: false }, // 이것도 재처리되면 idempotent
  ]

  const results = events.map((e) =>
    processPoiBadgeEarn(table, {
      userId, badgeId, poiId: e.poiId, stravaActivityId: e.stravaActivityId, activityName: 'test', activityDate: '2026-07-27',
    })
  )

  check('각 이벤트의 발급 여부가 UNIQUE 제약 의도와 정확히 일치', () => {
    assert.deepStrictEqual(results.map((r) => r.earned), events.map((e) => e.expected))
  })
  check('최종적으로 3행만 남음(중복 2건 제외)', () => {
    assert.strictEqual(table.rows.length, 3)
  })

  // 다른 유저가 동일 배지/POI/활동ID 조합으로 발급받는 것은 서로 영향 없어야 함
  const otherUserResult = processPoiBadgeEarn(table, {
    userId: 'user-B', badgeId, poiId: 'P1', stravaActivityId: 4001, activityName: 'test', activityDate: '2026-07-27',
  })
  check('다른 유저는 동일 조합이어도 독립적으로 발급됨', () => {
    assert.strictEqual(otherUserResult.earned, true)
    assert.strictEqual(table.rows.length, 4)
  })
}

console.log(`\nPASS — 총 ${passCount}개 검증 케이스 통과 (test-poi-badge-repeat.js)`)
