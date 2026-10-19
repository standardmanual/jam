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
import { ENGINE_DELEGATED_DB_CONDITION_KEY_LIST } from '../condition-keys'

/** DB 기록 키의 조건 값 — 객체 값을 가진 키는 `count`가 `n`인 올바른 모양으로, 나머지는 숫자 `n`으로 만든다 */
function dbKeyConditionValue(key: string, n: number): unknown {
  if (key === 'recipe_first_success') return { recipe_id: 'r1' }
  if (key === 'checkin_category_count') return { category: 'train_subway', count: n }
  if (key === 'checkin_badge_count') return { checkin_badge_names: ['성수역'], count: n }
  return n
}
import type { MissionCondition } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'
import { kstIso } from '@/lib/badge-engine/__tests__/kstFixture'

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
    // 배지 조건 판정은 UTC startDate를 한국 시각으로 바꿔 읽는다 — 인자는 한국 시각으로 본다(티켓 20261018_1815)
    startDate: kstIso(startDateLocal),
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

  // ── 활동 기록 조건 위임 — 시간대·요일·계절·운동 속성 (티켓 20261019_1312) ──
  ['time_range — 그 시간대(KST)에 시작한 활동이 있어야 한다', () => {
    const cond: MissionCondition = { activity_type: 'running', time_range: { start: '05:00', end: '08:00' } }
    const noonOnly = [act('2026-07-02T12:00:00'), act('2026-07-03T20:00:00')]
    assert.strictEqual(evaluateEngineMissionCondition(cond, noonOnly), false, '그 시간대 활동이 없는데 통과했다')
    assert.strictEqual(evaluateEngineMissionCondition(cond, [...noonOnly, act('2026-07-04T06:30:00')]), true, '새벽 활동이 있으면 통과해야 한다')
  }],

  ['distinct_time_bands — 서로 다른 시간대의 수를 센다', () => {
    const cond: MissionCondition = { distinct_time_bands: 3 }
    // 같은 시간대(오전)에 3번 해도 시간대는 1개뿐이다
    const sameBand = [act('2026-07-01T08:00:00'), act('2026-07-02T08:30:00'), act('2026-07-03T09:00:00')]
    assert.strictEqual(evaluateEngineMissionCondition(cond, sameBand), false, '같은 시간대 3번이 서로 다른 시간대 3개로 셌다')
    const threeBands = [act('2026-07-01T06:00:00'), act('2026-07-02T12:00:00'), act('2026-07-03T19:00:00')]
    assert.strictEqual(evaluateEngineMissionCondition(cond, threeBands), true, '새벽·점심·저녁이면 통과해야 한다')
  }],

  ['day_of_week + distance_km — 그 요일의 활동만 거리에 합친다', () => {
    const cond: MissionCondition = { day_of_week: 'sunday', distance_km: 15 }
    // 2026-01-05 월요일 20km는 일요일이 아니라 합치지 않는다 / 2026-01-11 일요일 10km뿐이면 15km 미달
    const mondayAndShortSunday = [act('2026-01-05T08:00:00', { distanceKm: 20 }), act('2026-01-11T08:00:00', { distanceKm: 10 })]
    assert.strictEqual(evaluateEngineMissionCondition(cond, mondayAndShortSunday), false, '월요일 거리가 일요일 조건에 합쳐졌다')
    const withLongSunday = [...mondayAndShortSunday, act('2026-01-18T08:00:00', { distanceKm: 10 })]
    assert.strictEqual(evaluateEngineMissionCondition(cond, withLongSunday), true, '일요일 거리 합계가 15km 이상이면 통과해야 한다')
  }],

  ['season + season_count — 그 계절에 활동한 날만 센다', () => {
    const cond: MissionCondition = { season: 'summer', season_count: 2 }
    const oneSummerDay = [act('2026-06-10T08:00:00'), act('2026-12-10T08:00:00'), act('2026-12-11T08:00:00')]
    assert.strictEqual(evaluateEngineMissionCondition(cond, oneSummerDay), false, '겨울 활동이 여름 횟수로 셌다')
    const twoSummerDays = [...oneSummerDay, act('2026-07-15T08:00:00')]
    assert.strictEqual(evaluateEngineMissionCondition(cond, twoSummerDays), true, '여름에 활동한 날이 2일이면 통과해야 한다')
  }],

  ['season_count_all — 네 계절 모두 채워야 한다', () => {
    const cond: MissionCondition = { season_count_all: 1 }
    const threeSeasons = [act('2026-04-10T08:00:00'), act('2026-07-10T08:00:00'), act('2026-10-10T08:00:00')]
    assert.strictEqual(evaluateEngineMissionCondition(cond, threeSeasons), false, '겨울 활동이 없는데 통과했다')
    assert.strictEqual(evaluateEngineMissionCondition(cond, [...threeSeasons, act('2026-01-10T08:00:00')]), true, '네 계절 모두 있으면 통과해야 한다')
  }],

  ['max_speed_kmh — 속도 기록이 없는 활동은 채우지 못한다', () => {
    const cond: MissionCondition = { activity_type: 'running', max_speed_kmh: 30 }
    const slow = act('2026-07-02T08:00:00', { maxSpeedKmh: 25 })
    const noData = act('2026-07-03T08:00:00') // 값이 없으면 키 자체가 없다(데이터 없음 = 세지 않음)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [slow, noData]), false, '최고 속도 30km/h 미달인데 통과했다')
    assert.strictEqual(evaluateEngineMissionCondition(cond, [slow, noData, act('2026-07-04T08:00:00', { maxSpeedKmh: 35 })]), true, '최고 속도 35km/h면 통과해야 한다')
  }],

  ['avg_heartrate_bpm — 심박 기록이 있는 활동만 센다', () => {
    const cond: MissionCondition = { avg_heartrate_bpm: 150 }
    assert.strictEqual(evaluateEngineMissionCondition(cond, [act('2026-07-02T08:00:00'), act('2026-07-03T08:00:00', { avgHeartrateBpm: 140 })]), false)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [act('2026-07-04T08:00:00', { avgHeartrateBpm: 160 })]), true)
  }],

  ['avg_watts·avg_cadence — 각자 기록이 있는 활동에서 판정한다', () => {
    const cond: MissionCondition = { activity_type: 'cycling', avg_watts: 200, avg_cadence: 80 }
    const lowWatts = act('2026-07-02T08:00:00', { jamActivityType: 'cycling', avgWatts: 150, avgCadence: 90 })
    assert.strictEqual(evaluateEngineMissionCondition(cond, [lowWatts]), false, '평균 파워 200W 미달인데 통과했다')
    const both = act('2026-07-03T08:00:00', { jamActivityType: 'cycling', avgWatts: 220, avgCadence: 85 })
    assert.strictEqual(evaluateEngineMissionCondition(cond, [lowWatts, both]), true, '파워와 케이던스를 채우면 통과해야 한다')
  }],

  ['cumulative_duration_hours — 활동 시간을 모두 합친다', () => {
    const cond: MissionCondition = { cumulative_duration_hours: 2 }
    const oneHour = act('2026-07-02T08:00:00') // movingTimeSec 3600
    assert.strictEqual(evaluateEngineMissionCondition(cond, [oneHour]), false, '1시간뿐인데 누적 2시간을 통과했다')
    assert.strictEqual(evaluateEngineMissionCondition(cond, [oneHour, act('2026-07-03T08:00:00')]), true, '1시간씩 두 번이면 통과해야 한다')
  }],

  ['weekend_duration_hours — 주말에 한 활동 하나의 시간을 본다', () => {
    const cond: MissionCondition = { weekend_duration_hours: 2 }
    // 2026-01-05 월요일 3시간은 주말이 아니다 / 2026-01-10 토요일 1시간은 2시간 미달
    const weekdayLongAndShortSaturday = [act('2026-01-05T08:00:00', { movingTimeSec: 10800 }), act('2026-01-10T08:00:00', { movingTimeSec: 3600 })]
    assert.strictEqual(evaluateEngineMissionCondition(cond, weekdayLongAndShortSaturday), false, '평일 활동 시간이 주말로 셌다')
    assert.strictEqual(evaluateEngineMissionCondition(cond, [...weekdayLongAndShortSaturday, act('2026-01-17T08:00:00', { movingTimeSec: 7200 })]), true, '주말에 2시간 활동하면 통과해야 한다')
  }],

  ['새 위임 키와 미션 전용 키를 함께 쓰면 둘 다 만족해야 한다 (AND)', () => {
    const cond: MissionCondition = { distinct_weekday_count: 2, distinct_time_bands: 2 }
    // 요일은 2개지만 시간대는 하나(오전)뿐
    const twoWeekdaysOneBand = [act('2026-01-05T08:00:00'), act('2026-01-06T08:30:00')]
    assert.strictEqual(evaluateEngineMissionCondition(cond, twoWeekdaysOneBand), false, '시간대 조건을 못 채웠는데 통과했다')
    const both = [act('2026-01-05T08:00:00'), act('2026-01-06T19:00:00')]
    assert.strictEqual(evaluateEngineMissionCondition(cond, both), true, '요일 2개·시간대 2개면 통과해야 한다')
  }],

  ['day_of_week만 위임분에 남으면 판정을 막는다 — 거르는 조건이 조용히 무시되지 않는다', () => {
    // 미션 전용 키(distinct_weekday_count)는 요일 필터를 보지 않는다. 수치 검사 필드 없이 필터만 위임되면
    // 배지엔진이 「평가 가능한 조건 없음」으로 막는다 — 통과시키면 일요일 조건이 사라진 채 완료된다.
    const cond: MissionCondition = { day_of_week: 'sunday', distinct_weekday_count: 1 }
    assert.strictEqual(evaluateEngineMissionCondition(cond, [act('2026-01-11T08:00:00')]), false)
  }],

  ['기온 키는 위임되지 않는다 — 저장 단계가 막으므로 판정은 기온을 보지 않는다', () => {
    const cond = { distance_km: 5, temperature_min_c: 30 } as MissionCondition
    // 기온 30°C 이상 조건을 위임했다면 10°C 활동은 실패해야 한다. 위임하지 않으므로 거리 조건만 본다.
    assert.strictEqual(evaluateEngineMissionCondition(cond, [act('2026-07-02T08:00:00', { weatherTempC: 10 })]), true)
  }],

  // ── fail-closed ──────────────────────────────────────────────────────
  ['count·badge_id만 있는 복합 조건은 판정하는 조건이 없으므로 통과시키지 않는다', () => {
    // 그 둘은 activity_count·item_collect 타입의 목표 값이다. 예전에는 «알려진 필드»로 셌고, 그것만 든 조건이
    // 참가하자마자 완료됐다(티켓 20261019_1312).
    const a = [act('2026-01-05T06:00:00')]
    assert.strictEqual(evaluateEngineMissionCondition({ count: 5 } as MissionCondition, a), false)
    assert.strictEqual(evaluateEngineMissionCondition({ badge_id: '00000000-0000-0000-0000-000000000001' } as MissionCondition, a), false)
    assert.strictEqual(evaluateEngineMissionCondition({ activity_type: 'running', count: 5 } as MissionCondition, a), false)
    // 판정하는 다른 조건이 있으면 그 조건으로 판정한다
    assert.strictEqual(evaluateEngineMissionCondition({ count: 5, distance_km: 5 } as MissionCondition, a), true)
  }],

  ['알려진 필드가 하나도 없으면(형태 오류) 통과시키지 않는다', () => {
    const cond = { activity_type: 'running' } as MissionCondition
    assert.strictEqual(evaluateEngineMissionCondition(cond, [act('2026-01-05T06:00:00')]), false)
  }],

  // ── 날 기준 KST (티켓 20261019_1312 2회, 티켓 20261018_2303) ─────────────────────────────
  // 해외(미국 서부, 한국보다 16시간 늦음)에서 한 활동은 현지 벽시계(`startDateLocal`)의 날이 한국 시각의 날과 갈린다.
  // 주·달·요일 개수는 한국 시각의 날로 센다 — 같은 조건 안에서 시간대·요일 판정(KST)과 같은 날을 본다.
  ['weekly_streak_min_count — 주는 한국 시각 월~일이다 (한국 월요일 7/6과 일요일 7/12는 현지 주가 갈려도 같은 주)', () => {
    const cond: MissionCondition = { weekly_streak: 1, weekly_streak_min_count: 2 }
    const sameKstWeek = [
      act('2026-07-06T10:00:00', { startDateLocal: '2026-07-05T18:00:00' }), // 현지 일요일 → 현지 주는 6/29 주
      act('2026-07-12T20:00:00', { startDateLocal: '2026-07-12T04:00:00' }), // 현지도 일요일 → 7/6 주
    ]
    assert.strictEqual(evaluateEngineMissionCondition(cond, sameKstWeek), true, '한국 시각으로 같은 주의 두 활동이 세어지지 않았다')
    const otherKstWeek = [
      act('2026-07-05T20:00:00', { startDateLocal: '2026-07-05T04:00:00' }), // 한국 일요일 → 6/29 주
      act('2026-07-06T10:00:00', { startDateLocal: '2026-07-05T18:00:00' }), // 한국 월요일 → 7/6 주 (현지는 같은 일요일)
    ]
    assert.strictEqual(evaluateEngineMissionCondition(cond, otherKstWeek), false, '한국 시각으로 다른 주인 활동이 한 주로 세어졌다')
  }],
  ['monthly_streak_min_count·distinct_months — 달은 한국 시각 기준이다 (한국 8/1은 현지 7/31이어도 8월)', () => {
    const monthly: MissionCondition = { monthly_streak: 1, monthly_streak_min_count: 2 }
    const acts = [
      act('2026-08-01T10:00:00', { startDateLocal: '2026-07-31T18:00:00', distanceKm: 10 }),
      act('2026-08-20T10:00:00', { startDateLocal: '2026-08-19T18:00:00', distanceKm: 10 }),
    ]
    assert.strictEqual(evaluateEngineMissionCondition(monthly, acts), true, '한국 시각 8월의 두 활동이 한 달로 세어지지 않았다')
    const months: MissionCondition = { distinct_months_required: 1, distinct_months_metric: 'distance_km', distinct_months_threshold: 20 }
    assert.strictEqual(evaluateEngineMissionCondition(months, acts), true, '한국 시각 8월 합계 20km가 문턱을 넘지 못했다')
  }],
  ['distinct_weekday_count — 요일은 한국 시각 기준이다 (한국 월요일 두 번은 현지 일·월이어도 요일 1개)', () => {
    const cond: MissionCondition = { distinct_weekday_count: 2 }
    const sameKstDay = [
      act('2026-07-06T10:00:00', { startDateLocal: '2026-07-05T18:00:00' }), // 현지 일요일
      act('2026-07-06T20:00:00', { startDateLocal: '2026-07-06T04:00:00' }), // 현지 월요일
    ]
    assert.strictEqual(evaluateEngineMissionCondition(cond, sameKstDay), false, '한국 시각으로 같은 요일이 둘로 세어졌다')
    const nextKstDay = [...sameKstDay, act('2026-07-07T10:00:00', { startDateLocal: '2026-07-06T18:00:00' })]
    assert.strictEqual(evaluateEngineMissionCondition(cond, nextKstDay), true, '한국 시각으로 다른 요일 둘이 세어지지 않았다')
  }],
  ['한국 활동은 startDateLocal이 한국 시각 그대로여도, 없어도 주·달·요일 판정이 같다 (회귀)', () => {
    const korean = [act('2026-07-06T06:00:00'), act('2026-07-14T21:30:00'), act('2026-07-22T00:10:00'), act('2026-08-03T12:00:00')]
    const withoutLocal = korean.map((a) => ({ ...a, startDateLocal: undefined }))
    const conds: Array<[string, MissionCondition, boolean]> = [
      ['weekly 3주 연속', { weekly_streak: 3, weekly_streak_min_count: 1 }, true],
      ['weekly 4주 연속', { weekly_streak: 4, weekly_streak_min_count: 1 }, false],
      ['monthly 2달 연속', { monthly_streak: 2, monthly_streak_min_count: 1 }, true],
      ['monthly 7월 3회', { monthly_streak: 1, monthly_streak_min_count: 3 }, true],
      ['요일 3개', { distinct_weekday_count: 3 }, true],
      ['요일 4개', { distinct_weekday_count: 4 }, false],
    ]
    for (const [name, cond, expected] of conds) {
      assert.strictEqual(evaluateEngineMissionCondition(cond, korean), expected, `${name}: startDateLocal 있음`)
      assert.strictEqual(evaluateEngineMissionCondition(cond, withoutLocal), expected, `${name}: startDateLocal 없음`)
    }
  }],

  // ── DB 기록 키 (티켓 20261019_1445) — dbMetrics는 checker가 «참가한 뒤, 기간 안» 값으로 읽어 넘긴다 ──
  ['DB 기록 키: 값이 조건 이상이면 통과하고 미만이면 통과하지 않는다 (경계 포함)', () => {
    const cond: MissionCondition = { combine_success_count: 3 }
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { combine_success_count: 2 }), false)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { combine_success_count: 3 }), true)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { combine_success_count: 9 }), true)
  }],
  ['DB 기록 키만 든 조건은 활동이 없어도 값만으로 판정한다 (알려진 키가 있다고 보되 값이 모자라면 미완료)', () => {
    assert.strictEqual(evaluateEngineMissionCondition({ capsule_open_count: 1 }, [], { capsule_open_count: 0 }), false)
    assert.strictEqual(evaluateEngineMissionCondition({ capsule_open_count: 1 }, [], { capsule_open_count: 1 }), true)
  }],
  ['DB 기록 키 값을 주지 않으면 통과하지 않는다 (fail-closed — 참가 즉시 완료 방지)', () => {
    for (const key of ENGINE_DELEGATED_DB_CONDITION_KEY_LIST) {
      const cond = { [key]: dbKeyConditionValue(key, 1) } as MissionCondition
      assert.strictEqual(evaluateEngineMissionCondition(cond, []), false, `${key}: dbMetrics 없이 통과했다`)
      assert.strictEqual(evaluateEngineMissionCondition(cond, [], {}), false, `${key}: 값 없이 통과했다`)
    }
  }],
  ['DB 기록 키 19개 전부 값이 있으면 통과한다', () => {
    const cond: MissionCondition = {}
    const metrics: Record<string, number> = {}
    for (const key of ENGINE_DELEGATED_DB_CONDITION_KEY_LIST) {
      ;(cond as Record<string, unknown>)[key] = dbKeyConditionValue(key, 2)
      metrics[key] = key === 'recipe_first_success' ? 1 : 2
    }
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], metrics), true)
  }],
  // ── 날짜·체크인 키 (티켓 20261019_1445 2회) ──
  ['날짜 키(weekly_active_days·same_spot_checkin_days)와 new_checkin_badge_count: 값이 조건 이상이면 통과한다 (경계 포함)', () => {
    for (const key of ['weekly_active_days', 'same_spot_checkin_days', 'new_checkin_badge_count'] as const) {
      const cond = { [key]: 3 } as MissionCondition
      assert.strictEqual(evaluateEngineMissionCondition(cond, [], { [key]: 2 }), false, `${key}: 2 < 3`)
      assert.strictEqual(evaluateEngineMissionCondition(cond, [], { [key]: 3 }), true, `${key}: 3 ≥ 3`)
      assert.strictEqual(evaluateEngineMissionCondition(cond, [], { [key]: 0 }), false, `${key}: 0`)
    }
  }],
  ['checkin_category_count: 읽은 값(그 장소 종류의 배지 수)이 count 이상이면 통과한다 (경계 포함)', () => {
    const cond: MissionCondition = { checkin_category_count: { category: 'train_subway', count: 2 } }
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { checkin_category_count: 1 }), false)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { checkin_category_count: 2 }), true)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { checkin_category_count: 9 }), true)
  }],
  ['checkin_badge_count: 읽은 값(지정 이름 중 받은 수)이 count 이상이면 통과한다 (경계 포함)', () => {
    const cond: MissionCondition = { checkin_badge_count: { checkin_badge_names: ['성수역', '왕십리역'], count: 2 } }
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { checkin_badge_count: 1 }), false)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { checkin_badge_count: 2 }), true)
  }],
  ['checkin_category_count·checkin_badge_count: 값 모양이 틀리면 읽은 값이 커도 통과하지 않는다 (fail-closed)', () => {
    const malformed: unknown[] = [
      { checkin_category_count: { category: 'train_subway' } }, // count 없음
      { checkin_category_count: { count: 1 } }, // category 없음
      { checkin_category_count: { category: 'train_subway', count: '1' } }, // count가 문자열
      { checkin_category_count: 3 }, // 객체가 아님
      { checkin_category_count: { category: 'train_subway', count: Number.NaN } },
      { checkin_badge_count: { checkin_badge_names: '성수역', count: 1 } }, // 이름이 배열이 아님
      { checkin_badge_count: { count: 1 } },
      { checkin_badge_count: { checkin_badge_names: ['성수역'], count: null } },
    ]
    for (const cond of malformed) {
      assert.strictEqual(
        evaluateEngineMissionCondition(cond as MissionCondition, [], { checkin_category_count: 99, checkin_badge_count: 99 }),
        false,
        JSON.stringify(cond)
      )
    }
  }],
  ['날짜·체크인 키는 활동 기록 조건과 AND로 묶이고 DB 키 사이도 모두 충족해야 한다', () => {
    const cond: MissionCondition = { distance_km: 5, weekly_active_days: 3, new_checkin_badge_count: 2 }
    const acts = [act('2026-07-02T08:00:00')] // 10km
    assert.strictEqual(evaluateEngineMissionCondition(cond, acts, { weekly_active_days: 3, new_checkin_badge_count: 1 }), false)
    assert.strictEqual(evaluateEngineMissionCondition(cond, acts, { weekly_active_days: 2, new_checkin_badge_count: 2 }), false)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { weekly_active_days: 3, new_checkin_badge_count: 2 }), false)
    assert.strictEqual(evaluateEngineMissionCondition(cond, acts, { weekly_active_days: 3, new_checkin_badge_count: 2 }), true)
  }],
  ['recipe_first_success: 기간 안에 처음 성공했으면(1) 통과, 아니면(0) 통과하지 않는다', () => {
    const cond: MissionCondition = { recipe_first_success: { recipe_id: 'r1' } }
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { recipe_first_success: 1 }), true)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { recipe_first_success: 0 }), false)
    // 레시피를 가리키지 않으면 물을 수 없다
    assert.strictEqual(evaluateEngineMissionCondition({ recipe_first_success: {} } as MissionCondition, [], { recipe_first_success: 1 }), false)
  }],
  ['DB 기록 키: 조건 값이 숫자가 아니면(문자열·null) 통과하지 않는다', () => {
    assert.strictEqual(evaluateEngineMissionCondition({ combine_success_count: '3' } as unknown as MissionCondition, [], { combine_success_count: 99 }), false)
    assert.strictEqual(evaluateEngineMissionCondition({ combine_success_count: null } as unknown as MissionCondition, [], { combine_success_count: 99 }), false)
  }],
  ['DB 기록 키는 활동 기록 조건과 AND로 묶인다', () => {
    const cond: MissionCondition = { distance_km: 5, combine_success_count: 2 }
    const acts = [act('2026-07-02T08:00:00')] // 10km
    assert.strictEqual(evaluateEngineMissionCondition(cond, acts, { combine_success_count: 1 }), false, 'DB 조건이 모자란데 통과했다')
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { combine_success_count: 5 }), false, '활동 조건이 모자란데 통과했다')
    assert.strictEqual(evaluateEngineMissionCondition(cond, acts, { combine_success_count: 2 }), true)
  }],
  ['DB 기록 키는 배지엔진에 위임하지 않는다 — 활동이 없어도 값이 충분하면 통과한다', () => {
    // 위임했다면 evaluateConditionDetailed가 «외부 판정 키»로 막았을 것이다
    assert.strictEqual(evaluateEngineMissionCondition({ mission_complete_count: 2, drop_item_count: 1 }, [], { mission_complete_count: 2, drop_item_count: 1 }), true)
  }],

  // ── 기간 동안 모은 잼 (티켓 20261019_1445 3-A회) — 미션 전용 DB 키, 배지 레지스트리에는 없다 ──
  ['jam_period_earned: 모은 잼이 조건 이상이면 통과하고 미만이면 통과하지 않는다 (경계 포함)', () => {
    const cond: MissionCondition = { jam_period_earned: 100 }
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { jam_period_earned: 99 }), false)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { jam_period_earned: 100 }), true)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { jam_period_earned: 250 }), true)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { jam_period_earned: 0 }), false)
  }],
  ['jam_period_earned: 값을 주지 않으면 통과하지 않는다 (fail-closed — 참가 즉시 완료 방지)', () => {
    const cond: MissionCondition = { jam_period_earned: 1 }
    assert.strictEqual(evaluateEngineMissionCondition(cond, []), false)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], {}), false)
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { jam_period_earned: Number.NaN }), false)
  }],
  ['jam_period_earned: 조건 값이 숫자가 아니면(문자열·null) 읽은 값이 커도 통과하지 않는다', () => {
    assert.strictEqual(evaluateEngineMissionCondition({ jam_period_earned: '100' } as unknown as MissionCondition, [], { jam_period_earned: 999 }), false)
    assert.strictEqual(evaluateEngineMissionCondition({ jam_period_earned: null } as unknown as MissionCondition, [], { jam_period_earned: 999 }), false)
  }],
  ['jam_period_earned: 활동 기록 조건·다른 DB 키와 AND로 묶인다', () => {
    const cond: MissionCondition = { distance_km: 5, combine_success_count: 2, jam_period_earned: 100 }
    const acts = [act('2026-07-02T08:00:00')] // 10km
    assert.strictEqual(evaluateEngineMissionCondition(cond, acts, { combine_success_count: 2, jam_period_earned: 99 }), false, '잼이 모자란데 통과했다')
    assert.strictEqual(evaluateEngineMissionCondition(cond, acts, { combine_success_count: 1, jam_period_earned: 100 }), false, '믹스가 모자란데 통과했다')
    assert.strictEqual(evaluateEngineMissionCondition(cond, [], { combine_success_count: 2, jam_period_earned: 100 }), false, '활동 조건이 모자란데 통과했다')
    assert.strictEqual(evaluateEngineMissionCondition(cond, acts, { combine_success_count: 2, jam_period_earned: 100 }), true)
  }],
  ['jam_period_earned만 든 조건은 활동이 없어도 값만으로 판정한다 (배지엔진에 위임하지 않는다)', () => {
    assert.strictEqual(evaluateEngineMissionCondition({ jam_period_earned: 30 }, [], { jam_period_earned: 30 }), true)
    assert.strictEqual(evaluateEngineMissionCondition({ activity_type: 'running', jam_period_earned: 30 }, [], { jam_period_earned: 30 }), true)
    assert.strictEqual(evaluateEngineMissionCondition({ activity_type: 'running', jam_period_earned: 30 }, [], { jam_period_earned: 29 }), false)
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[engineCondition] ${passed}/${cases.length} passed`)
