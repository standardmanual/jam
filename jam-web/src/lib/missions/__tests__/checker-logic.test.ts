/**
 * checker.ts evaluateMission — 순수 로직 유닛 테스트 (Phase13)
 *
 * 검증 범위:
 *   - 참가 게이트: 미참가 유저는 조건을 만족해도 achieved=false (버그 수정 회귀 방지)
 *   - distance / activity_count 진행값 계산 (기존 유지)
 *   - checkin / item_collect 달성형(0/1) 계산 (신규)
 *   - streak_days / duration_minutes / elevation_gain_m — 배지엔진 evaluateConditionDetailed
 *     재사용 판정 (티켓 20260813_001)
 *
 * 실행: `npx tsx src/lib/missions/__tests__/checker-logic.test.ts` (테스트 러너 불필요 — node assert 사용)
 */
import assert from 'node:assert'
import { evaluateMission, isMissionActive, activeMissionsQueryFilter, type OwnershipContext } from '../checker'
import { evaluateConditionDetailed } from '@/lib/badge-engine'
import type { MissionRow, MissionCondition, BadgeCondition } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'

function makeActivity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: 1,
    name: 'Test',
    distanceKm: 10,
    movingTimeSec: 3600,
    elevationGainM: 100,
    jamActivityType: 'running',
    startDate: '2026-07-20T05:30:00Z',
    startDateLocal: '2026-07-20T05:30:00',
    averageSpeedKmh: 10,
    startLatLng: null,
    ...overrides,
  } as NormalizedActivity
}

function mission(mission_type: MissionRow['mission_type'], condition: MissionCondition) {
  return { mission_type, condition_json: condition }
}

const emptyOwnership: OwnershipContext = { ownedBadgeIds: new Set(), visitedPoiIds: new Set() }

const cases: Array<[string, () => void]> = [
  // ── 참가 게이트 ──────────────────────────────────────────────
  ['미참가 유저는 조건을 만족해도 achieved=false', () => {
    const acts = [makeActivity({ distanceKm: 100 })]
    const evalResult = evaluateMission(mission('distance', { distance_km: 50 }), acts, emptyOwnership, false)
    assert.strictEqual(evalResult.achieved, false)
    assert.strictEqual(evalResult.progressValue, 0)
    assert.strictEqual(evalResult.isParticipating, false)
  }],
  ['참가 유저는 조건 만족 시 achieved=true', () => {
    const acts = [makeActivity({ distanceKm: 60 })]
    const evalResult = evaluateMission(mission('distance', { distance_km: 50 }), acts, emptyOwnership, true)
    assert.strictEqual(evalResult.achieved, true)
    assert.strictEqual(evalResult.progressValue, 60)
  }],

  // ── distance / activity_count ────────────────────────────────
  ['distance: activity_type 필터 적용', () => {
    const acts = [makeActivity({ jamActivityType: 'running', distanceKm: 30 }), makeActivity({ jamActivityType: 'cycling', distanceKm: 40 })]
    const r = evaluateMission(mission('distance', { distance_km: 50, activity_type: 'cycling' }), acts, emptyOwnership, true)
    assert.strictEqual(r.progressValue, 40)
    assert.strictEqual(r.achieved, false)
  }],
  ['activity_count: 횟수 집계', () => {
    const acts = [makeActivity(), makeActivity(), makeActivity()]
    const r = evaluateMission(mission('activity_count', { count: 3 }), acts, emptyOwnership, true)
    assert.strictEqual(r.progressValue, 3)
    assert.strictEqual(r.achieved, true)
  }],

  // ── checkin (달성형) ─────────────────────────────────────────
  ['checkin: 체크인 이력 있으면 달성', () => {
    const own: OwnershipContext = { ownedBadgeIds: new Set(), visitedPoiIds: new Set(['poi-1']) }
    const r = evaluateMission(mission('checkin', { poi_id: 'poi-1' }), [], own, true)
    assert.strictEqual(r.progressValue, 1)
    assert.strictEqual(r.target, 1)
    assert.strictEqual(r.achieved, true)
  }],
  ['checkin: 체크인 이력 없으면 미달성', () => {
    const r = evaluateMission(mission('checkin', { poi_id: 'poi-1' }), [], emptyOwnership, true)
    assert.strictEqual(r.progressValue, 0)
    assert.strictEqual(r.achieved, false)
  }],

  // ── item_collect (달성형) ────────────────────────────────────
  ['item_collect: 배지 보유 시 달성', () => {
    const own: OwnershipContext = { ownedBadgeIds: new Set(['badge-9']), visitedPoiIds: new Set() }
    const r = evaluateMission(mission('item_collect', { badge_id: 'badge-9' }), [], own, true)
    assert.strictEqual(r.progressValue, 1)
    assert.strictEqual(r.achieved, true)
  }],
  ['item_collect: 배지 미보유 시 미달성', () => {
    const r = evaluateMission(mission('item_collect', { badge_id: 'badge-9' }), [], emptyOwnership, true)
    assert.strictEqual(r.progressValue, 0)
    assert.strictEqual(r.achieved, false)
  }],

  // ── streak_days / duration_minutes / elevation_gain_m (티켓 20260813_001 — 배지엔진 재사용) ──
  ['streak_days: 연속 7일 걸으면 달성 (걷기 축1 게이트 통과 활동만 집계)', () => {
    const acts = [
      makeActivity({ jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T09:00:00' }),
      makeActivity({ jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T09:00:00' }),
      makeActivity({ jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4, startDate: '2026-07-03T00:00:00Z', startDateLocal: '2026-07-03T09:00:00' }),
      makeActivity({ jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4, startDate: '2026-07-04T00:00:00Z', startDateLocal: '2026-07-04T09:00:00' }),
      makeActivity({ jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4, startDate: '2026-07-05T00:00:00Z', startDateLocal: '2026-07-05T09:00:00' }),
      makeActivity({ jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4, startDate: '2026-07-06T00:00:00Z', startDateLocal: '2026-07-06T09:00:00' }),
      makeActivity({ jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4, startDate: '2026-07-07T00:00:00Z', startDateLocal: '2026-07-07T09:00:00' }),
    ]
    const r = evaluateMission(mission('streak_days', { activity_type: 'walking', streak_days: 7 }), acts, emptyOwnership, true)
    assert.strictEqual(r.progressValue, 7)
    assert.strictEqual(r.achieved, true)
  }],
  ['streak_days: 축1 게이트 미통과(너무 짧은 거리) 걷기는 연속일수에서 제외', () => {
    const acts = [
      makeActivity({ jamActivityType: 'walking', distanceKm: 0.1, movingTimeSec: 1800, averageSpeedKmh: 4, startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T09:00:00' }),
      makeActivity({ jamActivityType: 'walking', distanceKm: 0.1, movingTimeSec: 1800, averageSpeedKmh: 4, startDate: '2026-07-02T00:00:00Z', startDateLocal: '2026-07-02T09:00:00' }),
    ]
    const r = evaluateMission(mission('streak_days', { activity_type: 'walking', streak_days: 2 }), acts, emptyOwnership, true)
    assert.strictEqual(r.achieved, false)
  }],
  ['duration_minutes: 단일 활동 120분 이상 러닝 시 달성', () => {
    const acts = [makeActivity({ jamActivityType: 'running', movingTimeSec: 121 * 60 })]
    const r = evaluateMission(mission('duration_minutes', { activity_type: 'running', duration_minutes: 120 }), acts, emptyOwnership, true)
    assert.strictEqual(r.progressValue, 121)
    assert.strictEqual(r.achieved, true)
  }],
  ['duration_minutes: 모든 활동이 목표 미달이면 미달성', () => {
    const acts = [makeActivity({ jamActivityType: 'running', movingTimeSec: 60 * 60 })]
    const r = evaluateMission(mission('duration_minutes', { activity_type: 'running', duration_minutes: 120 }), acts, emptyOwnership, true)
    assert.strictEqual(r.achieved, false)
  }],
  ['elevation_gain_m: 단일 활동 상승고도 600m 이상 트레일러닝 시 달성(누적 합계이므로 1건이어도 그대로 합계)', () => {
    const acts = [makeActivity({ jamActivityType: 'trail_running', elevationGainM: 650 })]
    const r = evaluateMission(mission('elevation_gain_m', { activity_type: 'trail_running', elevation_gain_m: 600 }), acts, emptyOwnership, true)
    assert.strictEqual(r.progressValue, 650)
    assert.strictEqual(r.achieved, true)
  }],
  ['elevation_gain_m: 목표 미달이면 미달성', () => {
    const acts = [makeActivity({ jamActivityType: 'trail_running', elevationGainM: 300 })]
    const r = evaluateMission(mission('elevation_gain_m', { activity_type: 'trail_running', elevation_gain_m: 600 }), acts, emptyOwnership, true)
    assert.strictEqual(r.achieved, false)
  }],
  // ── 티켓 20260831_2152 — elevation_gain_m 진행바(calculateProgress)와 완료 판정
  // (evaluateConditionDetailed) 일치 회귀 테스트 ──
  ['elevation_gain_m: 여러 활동에 걸쳐 누적으로 목표를 채우면 progressValue=합계, achieved=true (표시-판정 일치)', () => {
    const acts = [
      makeActivity({ jamActivityType: 'trail_running', elevationGainM: 300 }),
      makeActivity({ jamActivityType: 'trail_running', elevationGainM: 250 }),
      makeActivity({ jamActivityType: 'trail_running', elevationGainM: 100 }),
    ]
    const r = evaluateMission(mission('elevation_gain_m', { activity_type: 'trail_running', elevation_gain_m: 600 }), acts, emptyOwnership, true)
    // 개별 활동은 전부 600m 미달이지만 합계(650m)는 목표를 넘는다 — Math.max였다면 300으로
    // 표시되고 achieved=false였을 상황
    assert.strictEqual(r.progressValue, 650)
    assert.strictEqual(r.achieved, true)
  }],
  ['elevation_gain_m: 누적 합계가 목표 직전이면 progressValue는 합계 그대로, achieved=false (표시-판정 동시 미달)', () => {
    const acts = [
      makeActivity({ jamActivityType: 'trail_running', elevationGainM: 300 }),
      makeActivity({ jamActivityType: 'trail_running', elevationGainM: 250 }),
    ]
    const r = evaluateMission(mission('elevation_gain_m', { activity_type: 'trail_running', elevation_gain_m: 600 }), acts, emptyOwnership, true)
    assert.strictEqual(r.progressValue, 550)
    assert.strictEqual(r.achieved, false)
  }],
  ['elevation_gain_m: 걷기 축1 게이트 미통과 활동은 진행값·판정 양쪽에서 제외(합산에도 포함 안 됨)', () => {
    const acts = [
      // 축1 게이트 통과 — 정상 걷기
      makeActivity({ jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4, elevationGainM: 400 }),
      // 축1 게이트 미통과 — 너무 짧은 거리(GPS 노이즈성 활동으로 간주)
      makeActivity({ jamActivityType: 'walking', distanceKm: 0.05, movingTimeSec: 1800, averageSpeedKmh: 4, elevationGainM: 500 }),
    ]
    const r = evaluateMission(mission('elevation_gain_m', { activity_type: 'walking', elevation_gain_m: 600 }), acts, emptyOwnership, true)
    // 게이트 통과분(400m)만 합산되어야 함 — 900m가 아니라 400m
    assert.strictEqual(r.progressValue, 400)
    assert.strictEqual(r.achieved, false)
  }],
  ['elevation_gain_m: calculateProgress(progressValue)와 evaluateConditionDetailed(actual)가 같은 누적값을 계산한다(교차 대조)', () => {
    const acts = [
      makeActivity({ jamActivityType: 'trail_running', elevationGainM: 210 }),
      makeActivity({ jamActivityType: 'trail_running', elevationGainM: 190 }),
      makeActivity({ jamActivityType: 'trail_running', elevationGainM: 205 }),
    ]
    const condition: MissionCondition = { activity_type: 'trail_running', elevation_gain_m: 600 }
    const r = evaluateMission(mission('elevation_gain_m', condition), acts, emptyOwnership, true)
    const engineResult = evaluateConditionDetailed(condition as BadgeCondition, acts)
    // progressValue(표시값)와 evaluateConditionDetailed의 실측 문자열(판정값)이 같은
    // 합계(605m)에서 나왔는지 대조 — 605 >= 600이므로 둘 다 달성
    assert.strictEqual(r.progressValue, 605)
    assert.strictEqual(engineResult.actual, '누적고도: 605m')
    assert.strictEqual(r.achieved, true)
    assert.strictEqual(engineResult.pass, true)
  }],

  // ── 상시 미션 (ends_at null) ────────────────────────────────
  ['isMissionActive: ends_at null이고 시작만 지났으면 항상 활성(상시 미션)', () => {
    const now = new Date('2026-08-13T00:00:00Z')
    assert.strictEqual(isMissionActive({ starts_at: '2026-01-01T00:00:00Z', ends_at: null }, now), true)
  }],
  ['isMissionActive: 시작 전이면 ends_at null이어도 비활성', () => {
    const now = new Date('2026-08-13T00:00:00Z')
    assert.strictEqual(isMissionActive({ starts_at: '2099-01-01T00:00:00Z', ends_at: null }, now), false)
  }],
  ['isMissionActive: ends_at이 과거면 비활성(일반 미션과 동일)', () => {
    const now = new Date('2026-08-13T00:00:00Z')
    assert.strictEqual(isMissionActive({ starts_at: '2026-01-01T00:00:00Z', ends_at: '2026-01-31T00:00:00Z' }, now), false)
  }],

  // ── checkMissions 쿼리 필터 ↔ isMissionActive 기준 일치 (티켓 20260813_001 후속) ──
  // activeMissionsQueryFilter가 만드는 PostgREST 필터(starts_at <= now, ends_at IS NULL OR
  // ends_at >= now)를 그대로 흉내 낸 술어와 isMissionActive의 결과가 대표 케이스 전부에서
  // 일치하는지 검증한다 — 둘 중 하나만 기준이 바뀌면 이 테스트가 깨진다.
  ['activeMissionsQueryFilter ↔ isMissionActive: 대표 케이스 전부 동일한 활성 판정', () => {
    const now = new Date('2026-08-13T00:00:00Z')
    const nowIso = now.toISOString()
    const filter = activeMissionsQueryFilter(nowIso)
    assert.strictEqual(filter.startsAtLte, nowIso)
    assert.strictEqual(filter.endsAtOrExpr, `ends_at.is.null,ends_at.gte.${nowIso}`)

    // PostgREST `.lte('starts_at', X).or('ends_at.is.null,ends_at.gte.X')`와 동일한 의미로
    // filter 문자열을 해석하는 술어 — 실제 쿼리를 대체하진 않지만 문자열 파싱으로 필터의
    // 경계 조건(<=, IS NULL, >=)이 isMissionActive와 같은 기준인지 대조한다.
    function matchesQueryFilter(mission: { starts_at: string; ends_at: string | null }): boolean {
      const startsOk = new Date(mission.starts_at) <= now
      const endsOk = filter.endsAtOrExpr === `ends_at.is.null,ends_at.gte.${nowIso}`
        ? mission.ends_at === null || new Date(mission.ends_at) >= now
        : false
      return startsOk && endsOk
    }

    const rows: { starts_at: string; ends_at: string | null }[] = [
      { starts_at: '2026-01-01T00:00:00Z', ends_at: null }, // 상시 미션
      { starts_at: '2099-01-01T00:00:00Z', ends_at: null }, // 시작 전
      { starts_at: '2026-01-01T00:00:00Z', ends_at: '2026-01-31T00:00:00Z' }, // 종료됨
      { starts_at: '2026-01-01T00:00:00Z', ends_at: '2026-12-31T00:00:00Z' }, // 진행 중
      { starts_at: '2026-01-01T00:00:00Z', ends_at: nowIso }, // 경계값(정확히 now)
    ]

    for (const row of rows) {
      assert.strictEqual(
        matchesQueryFilter(row),
        isMissionActive(row, now),
        `불일치: starts_at=${row.starts_at}, ends_at=${row.ends_at}`
      )
    }
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[checker-logic] ${passed}/${cases.length} passed`)
