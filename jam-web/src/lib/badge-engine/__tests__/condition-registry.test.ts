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
  PENDING_CONDITION_KEYS,
  getConditionField,
  MEASURABLE_CONDITION_KEYS,
  findBlockingConditionKeys,
  formatConditionChips,
  formatConditionDetail,
} from '../conditionRegistry'
import { LOWER_IS_BETTER_KEYS, classifyBadgeProgressKind } from '../badgeProgress'
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

/**
 * 이 티켓 이전부터 존재하던 조건 필드 25종.
 *
 * 그중 **`route`만 예외**로 `evaluation: 'pending'`이다 — 타입·스키마·DB CHECK에만 있고
 * badge-engine에 `condition.route` 참조가 0건이라(실측 2026-09-05) 아무도 평가하지 않는다.
 * 「선언만 있고 평가가 없는 필드가 조용히 조건을 통과시킨다」는 이 티켓이 없애려는 문제
 * 그 자체라, 쓰는 배지가 0건인 지금 정직하게 표기했다(게이트 리뷰 지적).
 */
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

  it('기존 25종이 전부 들어 있고, route를 뺀 24종은 평가 주체가 있다', () => {
    for (const key of LEGACY_25_KEYS) {
      expect(ALL_CONDITION_KEYS).toContain(key)
      if (key === 'route') continue
      expect(EVALUATED_CONDITION_KEYS).toContain(key)
    }
  })

  it('route는 평가 주체가 없다 — 선언만 있고 엔진 참조가 0건이다', () => {
    expect(PENDING_CONDITION_KEYS).toContain('route')
    // 조건에 route가 있으면 fail-closed가 막는다. 쓰는 배지가 0건이라 회귀는 없다.
    const r = evaluateConditionDetailed({ activity_type: 'running', route: 'x' } as never, activities)
    expect(r.pass).toBe(false)
    expect(r.reason).toContain('평가 구현 대기')
  })

  it('평가 주체를 세 가지로 구분한다 — engine / external / pending', () => {
    // boolean 하나가 「엔진이 검사」·「엔진 밖에서 처리」·「아무도 안 함」을 겸하던 과적재를
    // 풀었다. external은 fail-closed를 통과해야 한다 — 엔진이 안 볼 뿐 평가는 된다.
    const byEval = (v: string) => CONDITION_FIELDS.filter((f) => f.evaluation === v).map((f) => f.key)
    expect(byEval('external').sort()).toEqual(['mission_reward', 'poi_id', 'prerequisite_badge_names'])
    expect(byEval('pending')).toContain('route')
    expect(byEval('pending').length).toBe(21) // route + v5 신규 20
    expect(byEval('engine').length).toBe(21)
  })

  it('v5 신규 20종이 전부 들어 있고 전부 평가 미구현이다', () => {
    for (const key of V5_NEW_20_KEYS) {
      expect(ALL_CONDITION_KEYS).toContain(key)
      expect(EVALUATED_CONDITION_KEYS).not.toContain(key)
      expect(PENDING_CONDITION_KEYS).toContain(key)
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
  it('기존 필드는 route 하나를 빼고 fail-closed에 걸리지 않는다', () => {
    // route만 예외다 — 선언만 있고 엔진 참조가 0건이라 evaluation: 'pending'으로 정직하게
    // 표기했다(게이트 리뷰). 쓰는 배지가 0건이라 발급 회귀는 없다.
    for (const key of LEGACY_25_KEYS) {
      const blocking = findBlockingConditionKeys({ [key]: 1 } as unknown as BadgeCondition)
      expect(blocking.unknown, `${key}가 미지의 필드로 분류됐다`).toEqual([])
      expect(blocking.pending, `${key}의 구현 대기 분류가 예상과 다르다`).toEqual(key === 'route' ? ['route'] : [])
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

// ─────────────────────────────────────────────────────────────────────────
// 리뷰 반영분 (티켓 20260905_0028 게이트·개선 리뷰)
// ─────────────────────────────────────────────────────────────────────────

describe('지표 라벨 — 레지스트리와 마이그레이션 131의 시드가 어긋나지 않는다', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/131_condition_keys_v5.sql'), 'utf-8')

  /**
   * 라벨은 세 곳에 복제돼 있다 — 레지스트리 `label`/`unit` · 131의 INSERT · DB 테이블.
   * DB 런타임 값은 어드민이 편집할 수 있어 대조 대상이 아니지만, **레지스트리 ↔ 시드**가
   * 갈리면 어드민이 편집하기 전까지 두 화면이 서로 다른 라벨을 보여준다. 이 티켓이 지목한
   * 「누락돼도 조용히 통과」의 마지막 남은 한 곳이라 파싱해서 못 박는다(게이트 [우려 3]).
   */
  function seededLabels(): Map<string, { label: string; unit: string | null }> {
    const open = sql.indexOf('INSERT INTO public.badge_metric_labels')
    expect(open, 'badge_metric_labels INSERT를 찾지 못했다').toBeGreaterThan(-1)
    const close = sql.indexOf('ON CONFLICT', open)
    const body = sql
      .slice(open, close)
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n')
    const out = new Map<string, { label: string; unit: string | null }>()
    for (const m of body.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([^']*)'\s*,\s*(?:'([^']*)'|NULL)\s*\)/g)) {
      out.set(m[1], { label: m[2], unit: m[3] ?? null })
    }
    return out
  }

  it('시드된 모든 키의 라벨·단위가 레지스트리 선언과 일치한다', () => {
    const seeded = seededLabels()
    expect(seeded.size).toBeGreaterThan(0)
    for (const [key, seed] of seeded) {
      const meta = getConditionField(key)
      expect(meta, `레지스트리에 없는 키를 시드하고 있다: ${key}`).toBeDefined()
      expect(seed.label, `${key} 라벨 불일치`).toBe(meta!.label)
      expect(seed.unit ?? null, `${key} 단위 불일치`).toBe(meta!.unit ?? null)
    }
  })

  it('평가 대기 필드는 전부 라벨이 시드돼 있다 — 화면에 영문 키가 노출되지 않는다', () => {
    const seeded = seededLabels()
    for (const key of PENDING_CONDITION_KEYS) {
      if (key === 'route') continue // route는 v5 신규가 아니라 기존 필드다
      expect(seeded.has(key), `${key} 라벨 시드 누락`).toBe(true)
    }
  })

  it('유저 문장에 삽입되는 라벨은 명사구로 끝난다', () => {
    // getMetricLabels → computeBadgeProgress → badgeProgressText가 「지난 활동 {label}
    // 기록은 …」 형태로 그대로 끼운다. 「전월 대비」 같은 부사구면 비문이 된다.
    for (const meta of CONDITION_FIELDS) {
      expect(meta.label, `${meta.key}: 부사구 라벨`).not.toMatch(/\s대비$/)
    }
  })
})

describe('미션 평가 경로 — fail-closed가 미션을 영구 미달성으로 만들지 않는다', () => {
  it('미션 고유 키(count·badge_id)는 extraAllowedKeys로 통과시킨다', () => {
    const missionCondition = { activity_type: 'running', distance_km: 5, count: 3 } as never
    // 열어 주지 않으면 「알 수 없는 필드」로 막힌다
    expect(evaluateConditionDetailed(missionCondition, activities).reason).toContain('알 수 없는 필드')
    // 미션 경로처럼 열어 주면 기존 판정 로직이 그대로 돈다
    const allowed = evaluateConditionDetailed(missionCondition, activities, {
      extraAllowedKeys: new Set(['count', 'badge_id']),
    })
    expect(allowed.reason).not.toContain('알 수 없는 필드')
  })

  it('extraAllowedKeys를 열어도 평가 대기 필드는 여전히 막힌다', () => {
    // 「모르는 키 허용」과 「미구현 필드 허용」은 다르다 — 후자는 열면 안 된다
    const r = evaluateConditionDetailed({ activity_type: 'running', avg_watts: 200 } as never, activities, {
      extraAllowedKeys: new Set(['avg_watts']),
    })
    expect(r.pass).toBe(false)
    expect(r.reason).toContain('평가 구현 대기')
  })
})

describe('어드민 표시 — 조건 한 건의 형태 오류가 목록 전체를 죽이지 않는다', () => {
  it('객체형 필드에 스칼라가 들어와도 나머지 필드는 그대로 그린다', () => {
    // condition_json은 jsonb라 형태 보장이 없다. 이 함수는 어드민 목록의 셀 안에서 행마다
    // 호출되므로, 예외가 나면 목록 전체가 빈 화면이 된다(개선 리뷰 지적).
    const broken = { distance_km: 5, activities_within_hours: 3 } as never
    expect(() => formatConditionChips(broken)).not.toThrow()
    const chips = formatConditionChips(broken)
    expect(chips.some((c) => c.includes('5km'))).toBe(true)
    expect(chips.some((c) => c.includes('형태 오류'))).toBe(true)
  })

  it('접근 자체가 터지는 형태(null)도 그 필드만 대체한다', () => {
    // `(3).hours`는 던지지 않고 undefined를 주지만, `null.hours`는 TypeError를 던진다.
    // 두 경로 모두 막아야 한다.
    const broken = { total_count: 10, activities_within_hours: null } as never
    expect(() => formatConditionDetail(broken)).not.toThrow()
    const detail = formatConditionDetail(broken)
    expect(detail.some((d) => d.includes('10'))).toBe(true)
    expect(detail.some((d) => d.includes('형태 오류'))).toBe(true)
  })

  it('정상 조건에는 「형태 오류」가 끼어들지 않는다', () => {
    const ok = { distance_km: 5, activities_within_hours: { hours: 3, count: 2 } } as never
    expect(formatConditionChips(ok).join(' ')).not.toContain('형태 오류')
    expect(formatConditionDetail(ok).join(' ')).not.toContain('형태 오류')
  })
})

describe('진행률 — fail-closed로 막히는 조건은 진행률도 그리지 않는다', () => {
  it('기존 축 + 평가 대기 필드 조합은 unsupported다', () => {
    // 대기 필드를 무시한 채 cumulative 진행률을 그리면, 발급은 안 되는데 화면에는
    // 「78% 달성」이 뜨는 상태가 된다. 유저 노출(배지 트리 진행 레일)이라 정직해야 한다.
    expect(classifyBadgeProgressKind({ distance_km: 100 })).not.toBe('unsupported')
    expect(classifyBadgeProgressKind({ distance_km: 100, avg_watts: 200 } as never)).toBe('unsupported')
  })

  it('오탈자 키가 섞여도 unsupported다', () => {
    expect(classifyBadgeProgressKind({ distance_km: 100, distnace_km: 5 } as never)).toBe('unsupported')
  })
})
