/**
 * 조건 필드 메타 레지스트리 + fail-closed 안전장치 회귀 테스트 (티켓 20260905_0028)
 *
 * 배경: `matchesPerActivityCondition()`(index.ts)은 아는 키만 검사하고 **마지막에
 * `return true`** 한다. 그래서 레지스트리에 선언됐지만 아직 평가 구현이 없는 필드(v5 신규
 * 20종)나 오탈자로 들어간 키는 조용히 무시되고 조건이 통과된다 —
 * 「미구현 = 발급 안 됨」이 아니라 **「미구현 = 무조건 발급」**이 되는 구조다.
 *
 * 이 테스트가 지키는 두 가지:
 *   ① 미구현/미지의 키가 하나라도 든 조건은 **명시적 사유와 함께 fail**한다
 *   ② 기존 25개 필드만 든 조건은 fail-closed 도입 전과 **한 톨도 다르지 않게** 동작한다
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/condition-registry.test.ts`
 */

import { evaluateConditionDetailed, checkCondition } from '../index'
import {
  ALL_CONDITION_KEYS,
  CONDITION_FIELDS,
  EVALUATED_CONDITION_KEYS,
  MEASURABLE_CONDITION_KEYS,
  findBlockingConditionKeys,
  formatConditionChips,
  formatConditionDetail,
} from '../conditionRegistry'
import { LOWER_IS_BETTER_KEYS } from '../badgeProgress'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function makeActivity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: 1,
    name: 'Test Activity',
    distanceKm: 10,
    movingTimeSec: 3600,
    elevationGainM: 100,
    jamActivityType: 'running',
    startDate: '2026-07-20T05:30:00Z',
    startDateLocal: '2026-07-20T05:30:00',
    averageSpeedKmh: 10,
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
    ...overrides,
  }
}

const activities = [
  makeActivity(),
  makeActivity({ stravaId: 2, startDate: '2026-07-21T05:30:00Z', startDateLocal: '2026-07-21T05:30:00' }),
]

/** 이 티켓 이전부터 존재하던 조건 필드 25종 — 전부 `evaluated: true`여야 한다 */
const LEGACY_25_KEYS = [
  'distance_km',
  'elevation_gain_m',
  'duration_minutes',
  'min_speed_kmh',
  'max_pace_sec_per_km',
  'temperature_min_c',
  'temperature_max_c',
  'weekend_duration_hours',
  'total_count',
  'streak_days',
  'weekly_count',
  'month',
  'monthly_km',
  'season_count',
  'season_count_all',
  'active_days_count',
  'time_range',
  'activity_type',
  'day_of_week',
  'prerequisite_badge_names',
  'route',
  'poi_id',
  'season',
  'same_activity',
  'mission_reward',
] as const

/** v5에서 새로 선언만 된 20종 — 평가 구현은 티켓 20260905_0030 */
const V5_NEW_20_KEYS = [
  'max_elevation_m',
  'max_speed_kmh',
  'single_distance_km',
  'single_elevation_m',
  'avg_heartrate_bpm',
  'avg_watts',
  'avg_cadence',
  'rest_after_streak',
  'rest_after_long',
  'return_gap_days',
  'interval_days',
  'daily_once_count',
  'negative_split',
  'weekly_streak',
  'distinct_time_bands',
  'day_of_month',
  'activities_within_hours',
  'personal_record_break',
  'month_over_month_ratio',
  'vs_personal_average',
] as const

/** 신규 20종 각각의 「타입상 유효한」 예시 값 — 조건에 실어 fail-closed를 확인하는 데 쓴다 */
const V5_SAMPLE_VALUES: Record<(typeof V5_NEW_20_KEYS)[number], unknown> = {
  max_elevation_m: 1500,
  max_speed_kmh: 40,
  single_distance_km: 21.1,
  single_elevation_m: 800,
  avg_heartrate_bpm: 150,
  avg_watts: 200,
  avg_cadence: 90,
  rest_after_streak: 2,
  rest_after_long: 1,
  return_gap_days: 14,
  interval_days: 3,
  daily_once_count: 30,
  negative_split: true,
  weekly_streak: 4,
  distinct_time_bands: 3,
  day_of_month: 1,
  activities_within_hours: { hours: 24, count: 2 },
  personal_record_break: 3,
  month_over_month_ratio: 1.2,
  vs_personal_average: 1.5,
}

describe('레지스트리 — 필드 구성', () => {
  it('45종(기존 25 + v5 신규 20)을 선언한다', () => {
    expect(CONDITION_FIELDS.length).toBe(45)
    expect(ALL_CONDITION_KEYS.length).toBe(45)
    expect(new Set(ALL_CONDITION_KEYS).size).toBe(45) // 중복 키 없음
  })

  it('기존 25종이 전부 들어 있고 전부 평가 구현됨이다', () => {
    for (const key of LEGACY_25_KEYS) {
      expect(ALL_CONDITION_KEYS).toContain(key)
      expect(EVALUATED_CONDITION_KEYS).toContain(key)
    }
  })

  it('v5 신규 20종이 전부 들어 있고 전부 평가 미구현이다', () => {
    for (const key of V5_NEW_20_KEYS) {
      expect(ALL_CONDITION_KEYS).toContain(key)
      expect(EVALUATED_CONDITION_KEYS).not.toContain(key)
    }
  })

  it('MEASURABLE_CONDITION_KEYS는 기존 17종을 그대로 포함한다 (「평가 가능한 조건 없음」 게이트 회귀)', () => {
    const legacyMeasurable = [
      'distance_km',
      'elevation_gain_m',
      'duration_minutes',
      'min_speed_kmh',
      'max_pace_sec_per_km',
      'temperature_min_c',
      'temperature_max_c',
      'weekend_duration_hours',
      'total_count',
      'streak_days',
      'weekly_count',
      'month',
      'monthly_km',
      'season_count',
      'season_count_all',
      'active_days_count',
      'time_range',
    ]
    for (const key of legacyMeasurable) expect(MEASURABLE_CONDITION_KEYS).toContain(key)
    // 필터 전용·메타 필드는 절대 들어가면 안 된다 — 들어가면 {activity_type:'walking'} 단독
    // 조건이 게이트를 통과해 마지막 pass:true로 샌다(084 사고와 같은 유형)
    for (const key of ['activity_type', 'day_of_week', 'season', 'same_activity', 'mission_reward']) {
      expect(MEASURABLE_CONDITION_KEYS).not.toContain(key)
    }
  })

  it('방향성(direction)이 badgeProgress의 LOWER_IS_BETTER와 어긋나지 않는다', () => {
    for (const meta of CONDITION_FIELDS) {
      if (meta.direction === 'lower') expect(LOWER_IS_BETTER_KEYS.has(meta.key)).toBe(true)
    }
    for (const key of LOWER_IS_BETTER_KEYS) {
      const meta = CONDITION_FIELDS.find((f) => f.key === key)
      expect(meta?.direction).toBe('lower')
    }
  })

  it('짝 필드(pairedWith)는 전부 실재하는 키를 가리킨다', () => {
    for (const meta of CONDITION_FIELDS) {
      for (const paired of meta.pairedWith ?? []) {
        expect(ALL_CONDITION_KEYS).toContain(paired)
      }
    }
  })
})

describe('레지스트리 ↔ DB 마이그레이션 동기화 (마이그레이션 131)', () => {
  // 티켓 20260905_0028이 지목한 «누락돼도 조용히 통과하는» 복제 위치 중 DB 쪽 2곳
  // (CHECK 제약 · 계열 정합성 트리거의 measurable_keys)이 레지스트리와 어긋나면 여기서 깨진다.
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/131_condition_keys_v5.sql'), 'utf-8')

  /** SQL 텍스트에서 `ARRAY[ ... ]` 블록 안의 작은따옴표 리터럴을 뽑는다 */
  function keysInArrayAfter(marker: string): string[] {
    const from = sql.indexOf(marker)
    expect(from, `마커를 찾지 못했다: ${marker}`).toBeGreaterThan(-1)
    const open = sql.indexOf('ARRAY[', from)
    const close = sql.indexOf(']', open)
    // SQL 주석(-- ...)은 키가 아니다 — 먼저 걷어낸다
    const body = sql
      .slice(open + 'ARRAY['.length, close)
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n')
    return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  }

  it('CHECK 제약(badges_condition_json_known_keys)의 허용 키가 ALL_CONDITION_KEYS와 같다', () => {
    const sqlKeys = keysInArrayAfter('ADD CONSTRAINT badges_condition_json_known_keys')
    expect([...sqlKeys].sort()).toEqual([...ALL_CONDITION_KEYS].sort())
  })

  it('트리거 함수의 measurable_keys가 MEASURABLE_CONDITION_KEYS와 같다', () => {
    const sqlKeys = keysInArrayAfter('measurable_keys TEXT[] :=')
    expect([...sqlKeys].sort()).toEqual([...MEASURABLE_CONDITION_KEYS].sort())
  })

  it('130이 넣은 무한레벨형 예외 두 줄을 되돌리지 않았다', () => {
    // 되돌리면 무한레벨 계열 INSERT가 다시 EXCEPTION으로 막힌다(마스터 티켓 B-4 재발)
    expect(sql).toContain('IF NEW.level IS NOT NULL THEN')
    expect(sql).toContain('AND level IS NULL')
  })
})

describe('fail-closed — ① 평가할 수 없는 키가 든 조건은 발급되지 않는다', () => {
  it('v5 신규 20종은 각각 단독으로도 fail한다', () => {
    for (const key of V5_NEW_20_KEYS) {
      const cond = { activity_type: 'running', [key]: V5_SAMPLE_VALUES[key] } as BadgeCondition
      const result = evaluateConditionDetailed(cond, activities)
      expect(result.pass, `${key} 단독 조건이 통과했다`).toBe(false)
      expect(result.reason).toContain('평가할 수 없는 조건 필드')
      expect(result.reason).toContain(key)
    }
  })

  it('충족되는 기존 조건과 섞여 있어도 fail한다 (미구현 필드가 조용히 무시되지 않는다)', () => {
    // distance_km: 5 는 이 이력에서 통과하는 조건이다. 그 옆에 미구현 필드를 하나 얹으면
    // 예전 코드는 미구현 필드를 무시하고 pass:true를 냈다.
    const passing: BadgeCondition = { activity_type: 'running', distance_km: 5 }
    expect(evaluateConditionDetailed(passing, activities).pass).toBe(true)

    const withPending = { ...passing, avg_heartrate_bpm: 150 } as BadgeCondition
    const result = evaluateConditionDetailed(withPending, activities)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('평가 구현 대기')
    expect(checkCondition(withPending, activities)).toBe(false)
  })

  it('레지스트리에 아예 없는 키(오탈자)도 fail한다', () => {
    const typo = { activity_type: 'running', distance_km: 5, distancekm: 5 } as unknown as BadgeCondition
    const result = evaluateConditionDetailed(typo, activities)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('알 수 없는 필드')
    expect(result.reason).toContain('distancekm')
  })

  it('활동 이력이 아무리 많아도 미구현 필드가 든 조건은 통과하지 않는다', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      makeActivity({ stravaId: i + 1, distanceKm: 100, elevationGainM: 3000, movingTimeSec: 36000 })
    )
    expect(checkCondition({ activity_type: 'running', weekly_streak: 1 }, many)).toBe(false)
    expect(checkCondition({ activity_type: 'running', personal_record_break: 1 }, many)).toBe(false)
  })

  it('findBlockingConditionKeys가 미지의 키와 구현 대기 키를 구분한다', () => {
    const blocking = findBlockingConditionKeys({
      distance_km: 5,
      avg_watts: 200,
      nope: 1,
    } as unknown as BadgeCondition)
    expect(blocking.unknown).toEqual(['nope'])
    expect(blocking.pending).toEqual(['avg_watts'])
  })

  it('값이 undefined인 키는 막지 않는다 (조건에 존재하지 않는 것과 같다)', () => {
    const cond = { activity_type: 'running', distance_km: 5, avg_watts: undefined } as BadgeCondition
    expect(evaluateConditionDetailed(cond, activities).pass).toBe(true)
  })
})

describe('fail-closed — ② 기존 25개 필드만 든 조건은 이전과 동일하게 동작한다', () => {
  it('기존 25개 필드는 어떤 조합이어도 fail-closed에 걸리지 않는다', () => {
    for (const key of LEGACY_25_KEYS) {
      const blocking = findBlockingConditionKeys({ [key]: 1 } as unknown as BadgeCondition)
      expect(blocking.unknown, `${key}가 미지의 필드로 분류됐다`).toEqual([])
      expect(blocking.pending, `${key}가 구현 대기로 분류됐다`).toEqual([])
    }
  })

  it('통과하던 조건은 그대로 통과한다', () => {
    expect(evaluateConditionDetailed({ activity_type: 'running', distance_km: 5 }, activities).pass).toBe(true)
    expect(evaluateConditionDetailed({ activity_type: 'running', total_count: 2 }, activities).pass).toBe(true)
    expect(
      evaluateConditionDetailed({ activity_type: 'running', duration_minutes: 60 }, activities).pass
    ).toBe(true)
  })

  it('탈락하던 조건의 사유 문자열도 그대로다', () => {
    expect(evaluateConditionDetailed({ activity_type: 'running', distance_km: 500 }, activities).reason).toBe(
      '누적 거리 부족'
    )
    expect(evaluateConditionDetailed({ mission_reward: true }, activities).reason).toContain('미션 완료로만 지급')
    expect(evaluateConditionDetailed({ poi_id: 'poi-uuid' }, activities).reason).toContain('GPS 경로 매칭')
    expect(evaluateConditionDetailed({ activity_type: 'running' }, activities).reason).toBe('평가 가능한 조건 없음')
    expect(evaluateConditionDetailed({}, activities).reason).toBe('조건 없음')
  })
})

describe('표시 함수 — 레지스트리 기반 (어드민 목록·상세)', () => {
  it('기존 칩 문구가 그대로 나온다', () => {
    expect(formatConditionChips({ activity_type: 'running', distance_km: 100 })).toEqual(['누적 100km'])
    expect(formatConditionChips({ total_count: 30, streak_days: 7 })).toEqual(['30회', '7일 연속'])
    expect(formatConditionChips({ max_pace_sec_per_km: 330 })).toEqual(['5:30/km 이내'])
    expect(formatConditionChips({ month: [6, 7], monthly_km: 150 })).toEqual(['6·7월 150km'])
    expect(formatConditionChips({ monthly_km: 150 })).toEqual(['월간 150km'])
    expect(formatConditionChips({ season: 'winter', season_count: 5 })).toEqual(['겨울 5회'])
    expect(formatConditionChips({ day_of_week: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], total_count: 300 })).toEqual([
      '300회',
      '월~금 각각',
    ])
    expect(formatConditionChips(null)).toEqual([])
  })

  it('기존 상세 문구가 그대로 나온다', () => {
    expect(formatConditionDetail({ activity_type: 'running', distance_km: 100 })).toEqual(['거리 누적 100km'])
    expect(formatConditionDetail({ temperature_max_c: -15 })).toEqual(['최고 기온 -15°C 이하'])
    expect(formatConditionDetail({ time_range: { start: '22:00', end: '06:00' } })).toEqual(['시간 22:00~06:00'])
    expect(formatConditionDetail({ prerequisite_badge_names: ['첫 숨결', '리듬의 발견'] })).toEqual([
      '선행 배지: 첫 숨결, 리듬의 발견',
    ])
    expect(formatConditionDetail(null)).toEqual([])
  })

  it('예전 표시 함수가 빠뜨리던 필드도 이제 문구가 나온다', () => {
    // 하드코딩 시절 BadgeDetail은 active_days_count·season_count_all·day_of_week를 통째로
    // 건너뛰었다 — 값이 있어도 화면에 아무것도 안 나왔다
    expect(formatConditionDetail({ active_days_count: 100 })).toEqual(['누적 활동일수 100일'])
    expect(formatConditionDetail({ season_count_all: 3 })).toEqual(['4계절 각 3회'])
    expect(formatConditionDetail({ day_of_week: 'sunday' })).toEqual(['매주 일'])
    expect(formatConditionDetail({ same_activity: true, distance_km: 0.6 })).toEqual([
      '거리 누적 0.6km',
      '한 번의 활동에서 충족',
    ])
  })

  it('v5 신규 필드도 한국어 문구를 갖는다 (영문 키 노출 없음)', () => {
    for (const key of V5_NEW_20_KEYS) {
      const cond = { [key]: V5_SAMPLE_VALUES[key] } as BadgeCondition
      const chips = formatConditionChips(cond)
      const detail = formatConditionDetail(cond)
      expect(chips.length, `${key} 칩 없음`).toBe(1)
      expect(detail.length, `${key} 상세 없음`).toBe(1)
      expect(chips[0]).not.toContain(key)
      expect(detail[0]).not.toContain(key)
    }
  })
})
