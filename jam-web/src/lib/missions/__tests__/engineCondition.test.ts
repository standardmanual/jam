/**
 * `engine_condition` 미션 판정 회귀 테스트 (티켓 20260906_2231)
 *
 * 게이트 미션 40종이 실제로 쓰는 조건 모양(배지엔진 위임 + 미션 전용 어휘)을 대표 케이스로
 * 검증한다 — 뭉개서 표현하지 않았는지(회차·휴식·부분집합·서로 다른 요일/달 구분이 실제로
 * 판정에 반영되는지)가 핵심이다.
 *
 * 실행: `npx tsx src/lib/missions/__tests__/engineCondition.test.ts` (node assert — 러너 불필요)
 */
import assert from 'node:assert'
import { evaluateEngineMissionCondition } from '../engineCondition'
import type { MissionCondition } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'

let seq = 0
function act(startDateLocal: string, overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  seq += 1
  return {
    stravaId: seq,
    name: `act-${seq}`,
    distanceKm: 10,
    movingTimeSec: 3600,
    elevationGainM: 100,
    jamActivityType: 'running',
    startDate: `${startDateLocal}Z`,
    startDateLocal,
    averageSpeedKmh: 10,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
    ...overrides,
  }
}

const cases: Array<[string, () => void]> = [
  // ── 배지엔진 위임 — 단일 활동 + 반복(회차) ──────────────────────────────
  ['single_distance_km + max_pace_sec_per_km + repeat_count — 같은 활동이 둘 다 만족해야 회차로 센다 (R-Q2 형태)', () => {
    const cond: MissionCondition = {
      activity_type: 'running', single_distance_km: 10, max_pace_sec_per_km: 330, repeat_count: 3,
    }
    // pace(초/km) = 3600 / averageSpeedKmh. 330초(5:30/km)보다 빨라야(=작아야) 통과 → averageSpeedKmh > 10.9km/h
    const slowButLong = act('2026-07-02T06:00:00', { distanceKm: 12, averageSpeedKmh: 8 }) // 거리만 만족(페이스 450초=느림)
    const fastButShort = act('2026-07-03T06:00:00', { distanceKm: 5, averageSpeedKmh: 20 }) // 페이스만 만족(거리 미달)
    const qualifying1 = act('2026-07-04T06:00:00', { distanceKm: 12, averageSpeedKmh: 20 })
    const qualifying2 = act('2026-07-05T06:00:00', { distanceKm: 15, averageSpeedKmh: 15 })
    assert.strictEqual(
      evaluateEngineMissionCondition(cond, [slowButLong, fastButShort, qualifying1, qualifying2]),
      false,
      '자격 활동이 2건뿐인데 repeat_count=3을 통과했다'
    )
    const qualifying3 = act('2026-07-06T06:00:00', { distanceKm: 20, averageSpeedKmh: 12 })
    assert.strictEqual(
      evaluateEngineMissionCondition(cond, [slowButLong, fastButShort, qualifying1, qualifying2, qualifying3]),
      true,
      '자격 활동 3건이면 통과해야 한다'
    )
  }],

  ['same_activity — 한 활동이 두 필드를 동시에 만족해야 한다 (H-Q2/T-Q4 형태, 단일 회차)', () => {
    const cond: MissionCondition = {
      activity_type: 'hiking', single_elevation_m: 1000, max_elevation_m: 1200, same_activity: true,
    }
    // 고도 상승은 큰데 최고 도달이 낮은 활동 + 최고 도달은 높은데 상승은 낮은 활동 — 각각 따로는
    // 만족하지만 "같은 활동"이 아니므로 불통과여야 한다
    const bigGainLowPeak = act('2026-08-01T06:00:00', { jamActivityType: 'hiking', elevationGainM: 1500, maxElevationM: 900 })
    const highPeakLowGain = act('2026-08-02T06:00:00', { jamActivityType: 'hiking', elevationGainM: 200, maxElevationM: 1500 })
    assert.strictEqual(
      evaluateEngineMissionCondition(cond, [bigGainLowPeak, highPeakLowGain]),
      false,
      '서로 다른 활동이 각자 한 필드씩만 만족하는데 통과했다 — same_activity가 무시됐다'
    )
    const both = act('2026-08-03T06:00:00', { jamActivityType: 'hiking', elevationGainM: 1500, maxElevationM: 1500 })
    assert.strictEqual(
      evaluateEngineMissionCondition(cond, [bigGainLowPeak, highPeakLowGain, both]),
      true,
      '한 활동이 두 필드를 동시에 만족하면 통과해야 한다'
    )
  }],

  ['rest_after_long + repeat_count — 장거리 뒤 휴식이 N번 있어야 한다 (C-Q7/T-Q7/H-Q7 형태)', () => {
    const cond: MissionCondition = {
      activity_type: 'cycling', single_distance_km: 100, rest_after_long: 1, repeat_count: 2,
    }
    // 100km 활동 뒤 바로 다음날 또 활동(휴식 없음) — 1회만 성립하면 안 됨
    const acts = [
      act('2026-06-01T06:00:00', { jamActivityType: 'cycling', distanceKm: 120 }),
      act('2026-06-02T06:00:00', { jamActivityType: 'cycling', distanceKm: 20 }), // 휴식 없이 다음날 — 미성립
      act('2026-06-10T06:00:00', { jamActivityType: 'cycling', distanceKm: 110 }),
      act('2026-06-12T06:00:00', { jamActivityType: 'cycling', distanceKm: 20 }), // 하루 쉬고 복귀 — 성립 1회
    ]
    assert.strictEqual(evaluateEngineMissionCondition(cond, acts), false, '성립 1회뿐인데 repeat_count=2를 통과했다')

    const withSecond = [
      ...acts,
      act('2026-06-20T06:00:00', { jamActivityType: 'cycling', distanceKm: 105 }),
      act('2026-06-22T06:00:00', { jamActivityType: 'cycling', distanceKm: 20 }), // 하루 쉬고 복귀 — 성립 2회
    ]
    assert.strictEqual(evaluateEngineMissionCondition(cond, withSecond), true, '성립 2회면 통과해야 한다')
  }],

  // ── 미션 전용 어휘 — 주기(streak) + 매기간 최소 횟수 ────────────────────
  ['weekly_streak + weekly_streak_min_count — 매주 존재만으로는 부족하고 매주 N회를 채워야 한다 (M2/R-Q4 형태)', () => {
    const cond: MissionCondition = { activity_type: 'running', weekly_streak: 3, weekly_streak_min_count: 3 }
    // 3주 연속으로 활동은 있지만 마지막 주만 2회뿐 — weekly_streak(존재)만 보면 3주 성립하지만
    // min_count=3을 채우지 못해 실패해야 한다
    const threeWeeksButOneShort = [
      act('2026-01-05T06:00:00'), act('2026-01-06T06:00:00'), act('2026-01-07T06:00:00'), // 1주차 3회
      act('2026-01-12T06:00:00'), act('2026-01-13T06:00:00'), act('2026-01-14T06:00:00'), // 2주차 3회
      act('2026-01-19T06:00:00'), act('2026-01-20T06:00:00'), // 3주차 2회뿐
    ]
    assert.strictEqual(
      evaluateEngineMissionCondition(cond, threeWeeksButOneShort),
      false,
      '마지막 주가 2회뿐인데 통과했다 — weekly_streak_min_count가 무시됐다'
    )
    const allThreeWeeksFull = [
      ...threeWeeksButOneShort,
      act('2026-01-21T06:00:00'), // 3주차 3번째 활동 추가
    ]
    assert.strictEqual(evaluateEngineMissionCondition(cond, allThreeWeeksFull), true, '3주 모두 3회씩이면 통과해야 한다')
  }],

  ['streak_subset — 매주 조건을 채워도 부분집합(주말) 요구를 못 채우면 실패한다 (C-Q5 형태)', () => {
    const cond: MissionCondition = {
      activity_type: 'cycling', weekly_streak: 2, weekly_streak_min_count: 3,
      streak_subset: { day_of_week: ['saturday', 'sunday'], min_count: 1 },
    }
    // 2026-01-05는 월요일 — 매주 평일 3회만 채우고 주말은 하나도 없음
    const noWeekend = [
      act('2026-01-05T06:00:00', { jamActivityType: 'cycling' }), // 월
      act('2026-01-06T06:00:00', { jamActivityType: 'cycling' }), // 화
      act('2026-01-07T06:00:00', { jamActivityType: 'cycling' }), // 수
      act('2026-01-12T06:00:00', { jamActivityType: 'cycling' }), // 월
      act('2026-01-13T06:00:00', { jamActivityType: 'cycling' }), // 화
      act('2026-01-14T06:00:00', { jamActivityType: 'cycling' }), // 수
    ]
    assert.strictEqual(
      evaluateEngineMissionCondition(cond, noWeekend),
      false,
      '주말 활동이 하나도 없는데 통과했다 — streak_subset이 무시됐다'
    )
    const withWeekend = [
      act('2026-01-05T06:00:00', { jamActivityType: 'cycling' }),
      act('2026-01-06T06:00:00', { jamActivityType: 'cycling' }),
      act('2026-01-10T06:00:00', { jamActivityType: 'cycling' }), // 토(주말)
      act('2026-01-12T06:00:00', { jamActivityType: 'cycling' }),
      act('2026-01-13T06:00:00', { jamActivityType: 'cycling' }),
      act('2026-01-18T06:00:00', { jamActivityType: 'cycling' }), // 일(주말)
    ]
    assert.strictEqual(evaluateEngineMissionCondition(cond, withWeekend), true, '매주 주말 1회씩 있으면 통과해야 한다')
  }],

  ['monthly_streak + monthly_streak_min_count — 매달 최소 횟수를 못 채운 달이 있으면 실패한다 (H-Q4/H-Q6 형태)', () => {
    const cond: MissionCondition = { activity_type: 'hiking', monthly_streak: 3, monthly_streak_min_count: 4 }
    const shortMonth = [
      act('2026-01-05T06:00:00', { jamActivityType: 'hiking' }), act('2026-01-10T06:00:00', { jamActivityType: 'hiking' }),
      act('2026-01-15T06:00:00', { jamActivityType: 'hiking' }), act('2026-01-20T06:00:00', { jamActivityType: 'hiking' }),
      act('2026-02-05T06:00:00', { jamActivityType: 'hiking' }), act('2026-02-10T06:00:00', { jamActivityType: 'hiking' }),
      act('2026-02-15T06:00:00', { jamActivityType: 'hiking' }), act('2026-02-20T06:00:00', { jamActivityType: 'hiking' }),
      act('2026-03-05T06:00:00', { jamActivityType: 'hiking' }), act('2026-03-10T06:00:00', { jamActivityType: 'hiking' }), // 3월은 2회뿐
    ]
    assert.strictEqual(evaluateEngineMissionCondition(cond, shortMonth), false, '3월이 2회뿐인데 통과했다')
    const full = [...shortMonth, act('2026-03-15T06:00:00', { jamActivityType: 'hiking' }), act('2026-03-20T06:00:00', { jamActivityType: 'hiking' })]
    assert.strictEqual(evaluateEngineMissionCondition(cond, full), true, '3개월 모두 4회씩이면 통과해야 한다')
  }],

  // ── 미션 전용 어휘 — 서로 다른 요일/달 ─────────────────────────────────
  ['distinct_weekday_count — 요일 수를 세지, 활동 총횟수를 세지 않는다 (M4 형태)', () => {
    const cond: MissionCondition = { activity_type: 'walking', distinct_weekday_count: 5 }
    // 같은 요일(월요일)에 5번 몰아서 해도 서로 다른 요일은 1개뿐이라 실패해야 한다
    const sameWeekdayFiveTimes = [
      act('2026-01-05T06:00:00', { jamActivityType: 'walking', averageSpeedKmh: 5 }),
      act('2026-01-12T06:00:00', { jamActivityType: 'walking', averageSpeedKmh: 5 }),
      act('2026-01-19T06:00:00', { jamActivityType: 'walking', averageSpeedKmh: 5 }),
      act('2026-01-26T06:00:00', { jamActivityType: 'walking', averageSpeedKmh: 5 }),
      act('2026-02-02T06:00:00', { jamActivityType: 'walking', averageSpeedKmh: 5 }),
    ]
    assert.strictEqual(
      evaluateEngineMissionCondition(cond, sameWeekdayFiveTimes),
      false,
      '5회 모두 같은 요일(월요일)인데 통과했다 — distinct_weekday_count가 활동 횟수로 뭉개졌다'
    )
    const fiveDistinctDays = [
      act('2026-01-05T06:00:00', { jamActivityType: 'walking', averageSpeedKmh: 5 }), // 월
      act('2026-01-06T06:00:00', { jamActivityType: 'walking', averageSpeedKmh: 5 }), // 화
      act('2026-01-07T06:00:00', { jamActivityType: 'walking', averageSpeedKmh: 5 }), // 수
      act('2026-01-08T06:00:00', { jamActivityType: 'walking', averageSpeedKmh: 5 }), // 목
      act('2026-01-09T06:00:00', { jamActivityType: 'walking', averageSpeedKmh: 5 }), // 금
    ]
    assert.strictEqual(evaluateEngineMissionCondition(cond, fiveDistinctDays), true, '서로 다른 5개 요일이면 통과해야 한다')
  }],

  ['distinct_months_required — 두 달을 합산하지 않고 각 달이 독립으로 문턱을 넘어야 한다 (M8/R-Q8 형태)', () => {
    const cond: MissionCondition = {
      activity_type: 'walking', distinct_months_required: 2, distinct_months_metric: 'distance_km', distinct_months_threshold: 30,
    }
    // 한 달에 몰아서 60km(합산하면 두 달 몫) — 서로 다른 두 달 조건은 실패해야 한다
    const oneMonthOnly = [act('2026-01-05T06:00:00', { jamActivityType: 'walking', averageSpeedKmh: 5, distanceKm: 60 })]
    assert.strictEqual(
      evaluateEngineMissionCondition(cond, oneMonthOnly),
      false,
      '한 달에 60km를 몰아서 했는데 통과했다 — "서로 다른 두 달"이 총합으로 뭉개졌다'
    )
    const twoMonths = [
      act('2026-01-05T06:00:00', { jamActivityType: 'walking', averageSpeedKmh: 5, distanceKm: 30 }),
      act('2026-02-05T06:00:00', { jamActivityType: 'walking', averageSpeedKmh: 5, distanceKm: 30 }),
    ]
    assert.strictEqual(evaluateEngineMissionCondition(cond, twoMonths), true, '서로 다른 두 달에 각각 30km면 통과해야 한다')
  }],

  ['time_band_counts — 시간대별 독립 카운터, 새벽·밤 각각 채워야 한다 (M3/R-Q5 형태)', () => {
    const cond: MissionCondition = {
      activity_type: 'running',
      time_band_counts: [{ start: '05:00', end: '08:00', count: 2 }, { start: '20:00', end: '05:00', count: 2 }],
    }
    // 새벽만 4번, 밤은 0번 — 밤 조건 미달로 실패해야 한다
    const dawnOnly = [
      act('2026-01-05T06:00:00'), act('2026-01-06T06:00:00'), act('2026-01-07T06:00:00'), act('2026-01-08T06:00:00'),
    ]
    assert.strictEqual(evaluateEngineMissionCondition(cond, dawnOnly), false, '밤 활동이 0건인데 통과했다')
    const bothBands = [
      act('2026-01-05T06:00:00'), act('2026-01-06T06:00:00'),
      act('2026-01-05T21:00:00'), act('2026-01-06T21:00:00'),
    ]
    assert.strictEqual(evaluateEngineMissionCondition(cond, bothBands), true, '새벽·밤 각 2회씩이면 통과해야 한다')
  }],

  // ── fail-closed ──────────────────────────────────────────────────────
  ['알려진 필드가 하나도 없으면(형태 오류) 통과시키지 않는다', () => {
    const cond = { activity_type: 'running' } as MissionCondition
    assert.strictEqual(evaluateEngineMissionCondition(cond, [act('2026-01-05T06:00:00')]), false)
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[engineCondition] ${passed}/${cases.length} passed`)
