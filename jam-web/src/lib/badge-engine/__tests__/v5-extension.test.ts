/**
 * 티켓 20260906_0110 — 「v5 카탈로그가 요구하는 엔진 확장 5건」 회귀 테스트
 *
 * ① cumulative_duration_hours · monthly_count (신규 조건 필드)
 * ② CONSUMED_REPEAT_KEYS 확장 — streak_days·weekly_count·monthly_count·weekly_streak의
 *    기간 단위 회차 계산 + v5 스칼라 7종의 engine 전환
 * ⑤ avgCadence ×2 정규화
 *
 * ③(personal_record_break_metric)·④(rest_after_long duration_minutes 짝)는 각각
 * condition-registry.test.ts·rest-conditions.test.ts에서 다룬다.
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/v5-extension.test.ts`
 */
import { evaluateConditionDetailed, checkCondition, collectRepeatOccurrences } from '../index'
import { classifyBadgeProgressKind } from '../badgeProgress'
import { normalizeCadenceForActivityType } from '@/types/strava'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition } from '@/types/database'

function act(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: Math.floor(Math.random() * 1_000_000),
    name: 'act',
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

// ── ① cumulative_duration_hours — 누적 이동시간 (K2 계열, 레벨형·비반복) ────

describe('cumulative_duration_hours — 누적 이동시간', () => {
  it('전체 이력 합계가 조건 이상이면 pass', () => {
    const cond: BadgeCondition = { activity_type: 'walking', cumulative_duration_hours: 2 }
    const acts = [
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, movingTimeSec: 3600, startDate: '2026-07-01T00:00:00Z' }),
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, movingTimeSec: 3900, startDate: '2026-07-02T00:00:00Z' }),
    ]
    // 3600+3900 = 7500초 = 2.08시간 ≥ 2시간
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('미달이면 fail하고 사유에 실측값이 담긴다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', cumulative_duration_hours: 5 }
    const acts = [act({ jamActivityType: 'walking', averageSpeedKmh: 5, movingTimeSec: 3600 })]
    const r = evaluateConditionDetailed(cond, acts)
    expect(r.pass).toBe(false)
    expect(r.reason).toBe('누적 이동시간 부족')
    expect(r.actual).toContain('1시간')
  })

  it('진행률 축은 cumulative다 — unsupported로 새지 않는다', () => {
    expect(classifyBadgeProgressKind({ cumulative_duration_hours: 100 })).toBe('cumulative')
  })
})

// ── ① monthly_count — 월간 활동 횟수 (G2/C2 계열) ──────────────────────────

describe('monthly_count — 특정 달의 최소 활동 횟수', () => {
  it('단독 — 어느 한 달의 활동 횟수가 조건 이상이면 pass', () => {
    const cond: BadgeCondition = { activity_type: 'cycling', monthly_count: 3 }
    const acts = [
      act({ jamActivityType: 'cycling', startDate: '2026-07-01T00:00:00Z', startDateLocal: '2026-07-01T00:00:00' }),
      act({ jamActivityType: 'cycling', startDate: '2026-07-10T00:00:00Z', startDateLocal: '2026-07-10T00:00:00' }),
      act({ jamActivityType: 'cycling', startDate: '2026-07-20T00:00:00Z', startDateLocal: '2026-07-20T00:00:00' }),
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('repeat_count와 결합 — 그 횟수를 채운 달의 수를 센다 (cycling:G2 형태)', () => {
    const cond: BadgeCondition = { activity_type: 'cycling', monthly_count: 8, repeat_count: 2 }
    const months = ['2026-05', '2026-06', '2026-07']
    const acts: NormalizedActivity[] = []
    for (const m of months) {
      for (let d = 1; d <= 8; d++) {
        const day = String(d).padStart(2, '0')
        acts.push(
          act({
            jamActivityType: 'cycling',
            startDate: `${m}-${day}T00:00:00Z`,
            startDateLocal: `${m}-${day}T00:00:00`,
          })
        )
      }
    }
    // 3개월 모두 8회 이상 — repeat_count 2(2개월 이상) 충족
    const occurrences = collectRepeatOccurrences(cond, acts)
    expect(occurrences.length).toBe(3)
    expect(checkCondition(cond, acts)).toBe(true)

    // repeat_count 5(5개월)는 미달
    expect(checkCondition({ ...cond, repeat_count: 5 }, acts)).toBe(false)
  })
})

// ── ② streak_days + repeat_count — 「N일 연속」이 몇 번 (다시) 만들어졌는가 ──

describe('streak_days + repeat_count — 기간 단위 회차 (티켓 20260906_0110 ②)', () => {
  function daysFrom(startYmd: string, n: number, type = 'walking'): NormalizedActivity[] {
    const base = Date.parse(`${startYmd}T00:00:00Z`)
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(base + i * 86_400_000).toISOString().slice(0, 10)
      return act({ jamActivityType: type, averageSpeedKmh: 5, startDate: `${d}T00:00:00Z`, startDateLocal: `${d}T00:00:00` })
    })
  }

  it('3일 연속 스트릭이 두 번 (끊겼다 다시) 나오면 회차 2', () => {
    const cond: BadgeCondition = { activity_type: 'walking', streak_days: 3, repeat_count: 2 }
    const acts = [...daysFrom('2026-06-01', 3), ...daysFrom('2026-06-10', 3)] // 두 런, 각각 3일
    expect(checkCondition(cond, acts)).toBe(true)
    expect(collectRepeatOccurrences(cond, acts).length).toBe(2)
  })

  it('하나의 긴 스트릭은 floor(길이/N)이 아니라 «런 1개 = 회차 1개»다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', streak_days: 3, repeat_count: 2 }
    const acts = daysFrom('2026-06-01', 9) // 끊기지 않은 9일 연속 — 런은 1개뿐
    expect(collectRepeatOccurrences(cond, acts).length).toBe(1)
    expect(checkCondition(cond, acts)).toBe(false) // 회차 2 미달
  })

  it('아직 이 조합을 셀 수 없던 예전에는 회차가 0이었다 — 지금은 실제 값이 나온다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', streak_days: 3, repeat_count: 1 }
    const acts = daysFrom('2026-06-01', 3)
    expect(collectRepeatOccurrences(cond, acts).length).toBe(1)
  })
})

// ── ② weekly_count + repeat_count — 그 주 조건을 채운 «주»의 개수 ───────────

describe('weekly_count + repeat_count — 기간 단위 회차', () => {
  it('주 3회를 채운 서로 다른 주가 2번 있으면 회차 2 (walking:P2 형태)', () => {
    const cond: BadgeCondition = { activity_type: 'walking', weekly_count: 3, repeat_count: 2 }
    // 2026-06-01(월)~06-07(일) 한 주에 3회, 06-15~06-21 한 주에 3회
    const acts = [
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-01T00:00:00Z', startDateLocal: '2026-06-01T00:00:00' }),
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-03T00:00:00Z', startDateLocal: '2026-06-03T00:00:00' }),
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-05T00:00:00Z', startDateLocal: '2026-06-05T00:00:00' }),
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-15T00:00:00Z', startDateLocal: '2026-06-15T00:00:00' }),
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-17T00:00:00Z', startDateLocal: '2026-06-17T00:00:00' }),
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-19T00:00:00Z', startDateLocal: '2026-06-19T00:00:00' }),
    ]
    expect(collectRepeatOccurrences(cond, acts).length).toBe(2)
    expect(checkCondition(cond, acts)).toBe(true)
    expect(checkCondition({ ...cond, repeat_count: 3 }, acts)).toBe(false)
  })
})

// ── ② weekly_streak — 연속 주(월~일) ────────────────────────────────────

describe('weekly_streak — 연속 주', () => {
  it('단독 — 연속 3주 활동이 있으면 pass', () => {
    const cond: BadgeCondition = { activity_type: 'walking', weekly_streak: 3 }
    const acts = [
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-01T00:00:00Z', startDateLocal: '2026-06-01T00:00:00' }), // 월(06-01)
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-08T00:00:00Z', startDateLocal: '2026-06-08T00:00:00' }), // 그 다음 주
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-15T00:00:00Z', startDateLocal: '2026-06-15T00:00:00' }), // 또 그 다음 주
    ]
    expect(checkCondition(cond, acts)).toBe(true)
  })

  it('중간 주가 비면 연속이 끊긴다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', weekly_streak: 3 }
    const acts = [
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-01T00:00:00Z', startDateLocal: '2026-06-01T00:00:00' }),
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-15T00:00:00Z', startDateLocal: '2026-06-15T00:00:00' }), // 한 주 건너뜀
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-22T00:00:00Z', startDateLocal: '2026-06-22T00:00:00' }),
    ]
    expect(checkCondition(cond, acts)).toBe(false)
  })

  it('repeat_count와 결합 — 4주 연속이 몇 번 (다시) 만들어졌는지', () => {
    const cond: BadgeCondition = { activity_type: 'walking', weekly_streak: 2, repeat_count: 2 }
    const acts = [
      // 1번째 2주 연속
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-01T00:00:00Z', startDateLocal: '2026-06-01T00:00:00' }),
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-08T00:00:00Z', startDateLocal: '2026-06-08T00:00:00' }),
      // 건너뜀
      // 2번째 2주 연속
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-06-29T00:00:00Z', startDateLocal: '2026-06-29T00:00:00' }),
      act({ jamActivityType: 'walking', averageSpeedKmh: 5, startDate: '2026-07-06T00:00:00Z', startDateLocal: '2026-07-06T00:00:00' }),
    ]
    expect(collectRepeatOccurrences(cond, acts).length).toBe(2)
    expect(checkCondition(cond, acts)).toBe(true)
  })
})

// ── ② 발급-진행률 일관성 — 기간 단위 회차 조합이 진행 계산에서도 'repeat'다 ────
//
// `collectRepeatOccurrences`(발급)는 `detectPeriodOccurrenceDriver`로 이 조합을 먼저
// 걸러 회차를 정상적으로 세지만, `badgeProgress.ts`의 `classifyConditionKind`가 같은
// 우선순위로 확인하지 않으면 `unconsumedRepeatConditionKeys`가 streak_days/weekly_count/
// weekly_streak를 「회차 술어가 못 다루는 키」로 잘못 잡아 `unsupported`로 떨어진다 —
// 「발급은 되는데 화면엔 진행 표시 준비 중」이 남는 사고(개선 리뷰 실측: 프로덕션
// repeat_count+streak_days 14계열·+weekly_count 3계열).

describe('진행률 분류 — 발급과 같은 조건 조합을 인식한다', () => {
  it('streak_days + repeat_count는 repeat로 분류된다 (unsupported로 새지 않는다)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', streak_days: 3, repeat_count: 2 })).toBe('repeat')
  })

  it('weekly_count + repeat_count는 repeat로 분류된다', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', weekly_count: 3, repeat_count: 2 })).toBe('repeat')
  })

  it('weekly_streak + repeat_count는 repeat로 분류된다', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', weekly_streak: 2, repeat_count: 2 })).toBe('repeat')
  })

  it('monthly_count + repeat_count는 repeat로 분류된다 (cycling:G2 형태)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'cycling', monthly_count: 8, repeat_count: 2 })).toBe('repeat')
  })

  it('weekly_streak 단독은 cumulative다 (walking:A5 형태)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'walking', weekly_streak: 12 })).toBe('cumulative')
  })

  it('monthly_count 단독은 periodic이다 (cycling:G2·hiking:C2 형태)', () => {
    expect(classifyBadgeProgressKind({ activity_type: 'cycling', monthly_count: 8 })).toBe('periodic')
  })
})

// ── ② v5 스칼라 7종 — engine 전환 (avg_heartrate_bpm + duration_minutes + repeat_count) ──

describe('v5 스칼라 7종 — engine 전환 (running:H1/H2, cycling:H1/H2 형태)', () => {
  it('avg_heartrate_bpm + duration_minutes + repeat_count — 같은 활동이 둘 다 만족해야 회차 1', () => {
    const cond: BadgeCondition = {
      activity_type: 'running',
      avg_heartrate_bpm: 160,
      duration_minutes: 30,
      repeat_count: 1,
    }
    // 심박은 충분하지만 시간이 짧은 활동 — 회차 아님
    const short = act({ movingTimeSec: 20 * 60, avgHeartrateBpm: 170 })
    // 시간은 충분하지만 심박이 낮은 활동 — 회차 아님
    const lowHr = act({ movingTimeSec: 40 * 60, avgHeartrateBpm: 140, startDate: '2026-07-21T05:30:00Z' })
    // 둘 다 만족하는 활동 — 회차 1
    const both = act({ movingTimeSec: 40 * 60, avgHeartrateBpm: 170, startDate: '2026-07-22T05:30:00Z' })

    expect(checkCondition(cond, [short, lowHr])).toBe(false)
    expect(checkCondition(cond, [short, lowHr, both])).toBe(true)
    expect(collectRepeatOccurrences(cond, [short, lowHr, both]).length).toBe(1)
  })

  it('심박계 데이터가 없는 활동은 카운트되지 않는다 (데이터 없음 = 카운트 안 함)', () => {
    const cond: BadgeCondition = { activity_type: 'running', avg_heartrate_bpm: 150, repeat_count: 1 }
    const noSensor = act({ movingTimeSec: 40 * 60 }) // avgHeartrateBpm 없음
    expect(checkCondition(cond, [noSensor])).toBe(false)
  })

  it('single_distance_km — 한 번의 거리가 조건을 만족하는 활동이 있으면 pass (record형)', () => {
    const cond: BadgeCondition = { activity_type: 'running', single_distance_km: 20 }
    expect(checkCondition(cond, [act({ distanceKm: 21.1 })])).toBe(true)
    expect(checkCondition(cond, [act({ distanceKm: 10 })])).toBe(false)
    expect(classifyBadgeProgressKind(cond)).toBe('record')
  })
})

// ── ⑤ avgCadence ×2 정규화 ─────────────────────────────────────────────

describe('normalizeCadenceForActivityType — 케이던스 ×2 정규화 (티켓 20260906_0110 ⑤)', () => {
  it('러닝·트레일러닝은 ×2한다', () => {
    expect(normalizeCadenceForActivityType('running', 86.5)).toBe(173)
    expect(normalizeCadenceForActivityType('trail_running', 55)).toBe(110)
  })

  it('자전거는 그대로 둔다 — rpm은 크랭크 회전수라 편족 개념이 없다', () => {
    expect(normalizeCadenceForActivityType('cycling', 90)).toBe(90)
  })

  it('걷기·등산·알 수 없는 종목도 그대로 둔다', () => {
    expect(normalizeCadenceForActivityType('walking', 100)).toBe(100)
    expect(normalizeCadenceForActivityType('hiking', 100)).toBe(100)
    expect(normalizeCadenceForActivityType(null, 100)).toBe(100)
  })

  it('값이 없으면 undefined를 그대로 돌려준다 — 키를 만들지 않는다', () => {
    expect(normalizeCadenceForActivityType('running', undefined)).toBeUndefined()
  })
})
