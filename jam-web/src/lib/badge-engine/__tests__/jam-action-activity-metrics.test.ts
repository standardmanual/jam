/**
 * JAM! 행동 지표 — 활동 기반 새 지표 6종 값 계산 테스트 (티켓 20261019_0542 1회, 마이그레이션 246)
 *
 * 검증 대상:
 *  ① 순수 함수 경계: 주 경계(월요일 시작, KST 자정 직후), 연도 경계(주는 연말연초를 넘어 이어지고 계절의 해는 달력 연도), 계절 경계
 *     (2·3월, 5·6월, 8·9월, 11·12월, 1·2월과 12월은 겨울), 같은 날 여러 활동은 1일, 복귀 기준 7일 경계, 서로 다른 종목 수
 *  ② 활동 판정: 종목 없음·걷기 게이트 미달·읽을 수 없는 날짜는 세지 않는다
 *  ③ 조회: 인정된 활동(`filter_reason IS NULL`)만, 가입한 날 0시 이후만(가입한 날 당일 포함), 다른 유저 행 분리, 체크인은 읽지 않는다,
 *     조회 오류·가입 시각 없음은 던진다
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-activity-metrics.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const ME = 'user-me'
const OTHER = 'user-other'

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  /** 조회한 테이블 이름 기록 */
  queried: [] as string[],
  error: null as { message: string } | null,
}))

function mockSupabase(): SupabaseClient {
  const from = (table: string) => {
    let cols = ''
    const eqs: [string, unknown][] = []
    const iss: [string, unknown][] = []
    const gtes: [string, unknown][] = []
    let ordered: string | null = null
    let range: [number, number] | null = null
    const builder: Record<string, unknown> = {}
    const run = (single: boolean) => {
      state.queried.push(table)
      if (state.error) return { data: null, error: state.error }
      let rows = (state.tables[table] ?? []).filter(
        (r) =>
          eqs.every(([c, v]) => r[c] === v) &&
          iss.every(([c, v]) => (r[c] ?? null) === v) &&
          gtes.every(([c, v]) => Date.parse(String(r[c])) >= Date.parse(String(v)))
      )
      if (ordered) {
        const key = ordered
        rows = [...rows].sort((x, y) => (String(x[key]) < String(y[key]) ? -1 : 1))
      }
      if (range) rows = rows.slice(range[0], range[1] + 1)
      const wanted = cols.split(',').map((c) => c.trim())
      const projected = rows.map((r) => Object.fromEntries(wanted.map((c) => [c, r[c]])))
      return single ? { data: projected[0] ?? null, error: null } : { data: projected, error: null }
    }
    builder.select = (c: string) => {
      cols = c
      return builder
    }
    builder.eq = (col: string, val: unknown) => {
      eqs.push([col, val])
      return builder
    }
    builder.is = (col: string, val: unknown) => {
      iss.push([col, val])
      return builder
    }
    builder.gte = (col: string, val: unknown) => {
      gtes.push([col, val])
      return builder
    }
    builder.order = (col: string) => {
      ordered = col
      return builder
    }
    builder.range = (from: number, to: number) => {
      range = [from, to]
      return builder
    }
    builder.maybeSingle = () => Promise.resolve(run(true))
    builder.then = (resolve: (v: unknown) => void) => Promise.resolve(run(false)).then(resolve)
    return builder
  }
  return { from } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))

import {
  RETURN_REST_DAYS,
  activeWeekStreak,
  countDistinctActivityTypeCount,
  countDistinctActivityTypes,
  countFullSeasonYearCount,
  countFullSeasonYears,
  countFullWeekCount,
  countFullWeeks,
  countReturnStreakWeeks,
  dayKeysOf,
  fetchRecognizedActivities,
  returnStreakWeeks,
  seasonOfMonth,
  toRecognizedActivities,
} from '../jamActionActivityMetrics'

// ── 픽스처 ───────────────────────────────────────────────────────────────

/** KST 벽시계 시각 → ISO(오프셋 포함) */
const kst = (date: string, time = '12:00:00') => `${date}T${time}+09:00`

const RUN = { jamActivityType: 'running', distanceKm: 5, movingTimeSec: 1800, averageSpeedKmh: 10 }
const RIDE = { jamActivityType: 'cycling', distanceKm: 20, movingTimeSec: 3600, averageSpeedKmh: 20 }
const WALK = { jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4 }

let nextId = 0
const idOf = () => String(nextId++).padStart(7, '0')

function setSignup(userId: string, createdAt: string | null) {
  state.tables.users = state.tables.users.filter((r) => r.id !== userId)
  if (createdAt !== null) state.tables.users.push({ id: userId, created_at: createdAt })
}

function addActivity(startDate: string, normalized: unknown = RUN, extra: Record<string, unknown> = {}, userId = ME) {
  state.tables.strava_activities.push({ id: idOf(), user_id: userId, start_date: startDate, normalized, ...extra })
}

beforeEach(() => {
  state.tables = { users: [], strava_activities: [], user_checkin_badge_earns: [] }
  state.queried = []
  state.error = null
  nextId = 0
  setSignup(ME, kst('2025-01-01'))
})

// ═══════════════════════════════════════════════════════════════════════
// ① 순수 함수 경계
// ═══════════════════════════════════════════════════════════════════════

describe('seasonOfMonth — 계절 경계', () => {
  it('3~5월 봄, 6~8월 여름, 9~11월 가을, 12·1·2월 겨울', () => {
    const expected = [
      'winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter',
    ]
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(seasonOfMonth)).toEqual(expected)
  })
})

describe('activeWeekStreak — 한 주에 minDays일 이상 활동한 주의 연속', () => {
  // 2026-09-14(월) 주와 2026-09-21(월) 주, 2026-09-28(월) 주
  const WEEK1 = ['2026-09-14', '2026-09-16', '2026-09-18']
  const WEEK2 = ['2026-09-21', '2026-09-23', '2026-09-25']
  const WEEK3 = ['2026-09-28', '2026-09-29', '2026-09-30']

  it('활동이 3일인 주 3개가 이어지면 3이다', () => {
    expect(activeWeekStreak([...WEEK1, ...WEEK2, ...WEEK3], 3)).toBe(3)
  })

  it('한 주가 2일뿐이면 연속이 끊긴다', () => {
    expect(activeWeekStreak([...WEEK1, '2026-09-21', '2026-09-23', ...WEEK3], 3)).toBe(1)
  })

  it('활동이 아예 없는 주가 끼면 끊긴다', () => {
    expect(activeWeekStreak([...WEEK1, ...WEEK3], 3)).toBe(1)
  })

  it('기준이 1일이면 하루만 활동한 주도 채운 주다', () => {
    expect(activeWeekStreak(['2026-09-14', '2026-09-21', '2026-09-28'], 1)).toBe(3)
    expect(activeWeekStreak(['2026-09-14', '2026-09-21', '2026-09-28'])).toBe(3) // 기본값은 1일
  })

  it('가장 긴 연속을 돌려준다 — 끊긴 뒤 다시 이어진 구간이 더 짧으면 앞 구간이다', () => {
    expect(activeWeekStreak([...WEEK1, ...WEEK2, '2026-10-12', '2026-10-13', '2026-10-14'], 3)).toBe(2)
  })

  it('활동이 없으면 0이다', () => {
    expect(activeWeekStreak([], 3)).toBe(0)
  })

  it('주 경계는 월요일이다 — 일요일과 월요일은 서로 다른 주이고 같은 날의 중복은 1일이다', () => {
    // 일(9/20)·월(9/21)·화(9/22)는 «일요일 1일 + 월~화 2일»이라 두 주 모두 3일에 못 미친다
    expect(activeWeekStreak(['2026-09-20', '2026-09-21', '2026-09-22'], 3)).toBe(0)
    // 같은 날 3건은 1일이다
    expect(activeWeekStreak(dayKeysOf([
      { dayKey: '2026-09-14', type: 'running' },
      { dayKey: '2026-09-14', type: 'running' },
      { dayKey: '2026-09-14', type: 'cycling' },
    ]), 2)).toBe(0)
  })

  it('연말연초를 넘어서도 주는 이어진다 — 2025-12-29(월) 주와 2026-01-05(월) 주', () => {
    expect(activeWeekStreak(['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-05', '2026-01-06', '2026-01-07'], 3)).toBe(2)
  })
})

describe('countFullWeeks — 월~일 7일을 모두 활동한 주', () => {
  const week = (monday: string) => {
    const [y, m, d] = monday.split('-').map(Number)
    return Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10))
  }

  it('7일을 채운 주만 센다', () => {
    expect(countFullWeeks([...week('2026-09-14'), ...week('2026-09-28')])).toBe(2)
  })

  it('6일이면 세지 않는다', () => {
    expect(countFullWeeks(week('2026-09-14').slice(0, 6))).toBe(0)
  })

  it('일요일부터 토요일까지 7일은 한 주가 아니다 — 월~일 경계를 따른다', () => {
    // 2026-09-13(일)~2026-09-19(토): 앞 한 주의 일요일 1일 + 다음 주 월~토 6일
    const days = ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19']
    expect(countFullWeeks(days)).toBe(0)
  })

  it('같은 날 여러 번 활동해도 1일이다', () => {
    const doubled = week('2026-09-14').slice(0, 6).flatMap((d) => [d, d])
    expect(countFullWeeks(doubled)).toBe(0)
  })
})

describe('countFullSeasonYears — 네 계절을 모두 채운 달력 연도(KST)', () => {
  it('한 해 안에 봄·여름·가을·겨울이 모두 있으면 1이다 (겨울은 1월)', () => {
    expect(countFullSeasonYears(['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10'])).toBe(1)
  })

  it('12월도 같은 해의 겨울이다 — 12월이 그 해의 겨울을 채운다', () => {
    expect(countFullSeasonYears(['2026-03-01', '2026-06-01', '2026-09-01', '2026-12-31'])).toBe(1)
  })

  it('연도 경계: 2025년 12월은 2026년의 겨울을 채우지 않는다', () => {
    expect(countFullSeasonYears(['2025-12-15', '2026-03-10', '2026-06-10', '2026-09-10'])).toBe(0)
  })

  it('연도 경계: 12월 31일과 1월 1일은 서로 다른 해다', () => {
    expect(countFullSeasonYears(['2025-12-31', '2026-01-01', '2025-03-01', '2025-06-01', '2025-09-01'])).toBe(1) // 2025년만 채움
  })

  it('계절 경계: 각 계절의 마지막 날로도 채워진다 — 2/28 겨울·5/31 봄·8/31 여름·11/30 가을', () => {
    expect(countFullSeasonYears(['2026-02-28', '2026-05-31', '2026-08-31', '2026-11-30'])).toBe(1)
  })

  it('계절 경계: 각 계절의 첫 날로도 채워진다 — 3/1 봄·6/1 여름·9/1 가을·12/1 겨울', () => {
    expect(countFullSeasonYears(['2026-03-01', '2026-06-01', '2026-09-01', '2026-12-01'])).toBe(1)
  })

  it('계절 경계: 2월 28일은 봄이 아니다 — 겨울·여름·가을·겨울이면 봄이 비어 세지 않는다', () => {
    expect(countFullSeasonYears(['2026-02-28', '2026-06-01', '2026-09-01', '2026-12-01'])).toBe(0)
  })

  it('세 계절만 채우면 세지 않는다', () => {
    expect(countFullSeasonYears(['2026-03-01', '2026-06-01', '2026-09-01'])).toBe(0)
  })

  it('두 해를 모두 채우면 2다', () => {
    const year = (y: number) => [`${y}-01-15`, `${y}-04-15`, `${y}-07-15`, `${y}-10-15`]
    expect(countFullSeasonYears([...year(2025), ...year(2026)])).toBe(2)
  })

  it('활동이 없으면 0이다', () => {
    expect(countFullSeasonYears([])).toBe(0)
  })
})

describe('returnStreakWeeks — 7일 이상 쉬었다가 돌아온 뒤 이어진 연속 주', () => {
  it('복귀 기준은 7일이다 (코드 상수)', () => {
    expect(RETURN_REST_DAYS).toBe(7)
  })

  it('돌아온 날이 속한 주가 1주이고 다음 주들에 활동이 이어지는 만큼 센다', () => {
    // 9/1(화) 활동 → 9/2~9/8 7일 쉼 → 9/9(수) 복귀(주 9/7). 이후 9/14 주, 9/21 주 활동, 9/28 주 없음 → 3
    expect(returnStreakWeeks(['2026-09-01', '2026-09-09', '2026-09-15', '2026-09-22'])).toBe(3)
  })

  it('쉰 날이 7일에 하루 모자라면(6일) 돌아온 것이 아니다', () => {
    // 9/1 → 9/8: 쉰 날 9/2~9/7 = 6일
    expect(returnStreakWeeks(['2026-09-01', '2026-09-08', '2026-09-15'])).toBe(0)
  })

  it('쉰 날이 정확히 7일이면 돌아온 것이다', () => {
    // 9/1 → 9/9: 쉰 날 9/2~9/8 = 7일
    expect(returnStreakWeeks(['2026-09-01', '2026-09-09'])).toBe(1)
  })

  it('돌아온 주 다음 주에 활동이 없으면 1주에서 끝난다', () => {
    expect(returnStreakWeeks(['2026-09-01', '2026-09-09', '2026-09-23'])).toBe(1)
  })

  it('여러 번 돌아왔다면 가장 긴 기록이다', () => {
    const days = [
      '2026-01-05',
      '2026-02-02', // 복귀 1: 주 2/2, 다음 주 2/9 → 2주
      '2026-02-10',
      '2026-04-06', // 복귀 2: 주 4/6, 4/13, 4/20 → 3주
      '2026-04-14',
      '2026-04-21',
    ]
    expect(returnStreakWeeks(days)).toBe(3)
  })

  it('첫 활동은 돌아온 것이 아니고 쉬지 않고 이어진 활동도 돌아온 것이 아니다', () => {
    expect(returnStreakWeeks(['2026-09-01'])).toBe(0)
    expect(returnStreakWeeks(['2026-09-01', '2026-09-03', '2026-09-08'])).toBe(0)
    expect(returnStreakWeeks([])).toBe(0)
  })

  it('연말연초를 넘어서도 주가 이어진다', () => {
    // 12/1 → 12/29(월) 복귀, 1/5 주 활동 → 2주
    expect(returnStreakWeeks(['2025-12-01', '2025-12-29', '2026-01-06'])).toBe(2)
  })
})

describe('countDistinctActivityTypes — 서로 다른 종목 수', () => {
  it('같은 종목을 여러 번 해도 1종목이다', () => {
    expect(
      countDistinctActivityTypes([
        { dayKey: '2026-09-01', type: 'running' },
        { dayKey: '2026-09-02', type: 'running' },
        { dayKey: '2026-09-03', type: 'cycling' },
      ])
    ).toBe(2)
    expect(countDistinctActivityTypes([])).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② 활동 판정
// ═══════════════════════════════════════════════════════════════════════

describe('toRecognizedActivities — 어떤 행을 활동으로 세는가', () => {
  it('KST 날짜로 옮긴다 — UTC 일요일 15:30은 KST 월요일 00:30이라 다음 날이다', () => {
    const out = toRecognizedActivities([{ start_date: '2026-09-27T15:30:00Z', normalized: RUN }])
    expect(out).toEqual([{ dayKey: '2026-09-28', type: 'running' }])
  })

  it('KST 자정 직전은 같은 날이다 — UTC 14:59는 KST 23:59', () => {
    const out = toRecognizedActivities([{ start_date: '2026-09-27T14:59:00Z', normalized: RUN }])
    expect(out).toEqual([{ dayKey: '2026-09-27', type: 'running' }])
  })

  it('종목이 없거나 normalized가 비어 있거나 날짜를 읽을 수 없는 행은 뺀다', () => {
    const out = toRecognizedActivities([
      { start_date: kst('2026-09-01'), normalized: null },
      { start_date: kst('2026-09-02'), normalized: { distanceKm: 5 } },
      { start_date: kst('2026-09-03'), normalized: { ...RUN, jamActivityType: '' } },
      { start_date: 'not-a-date', normalized: RUN },
      { start_date: kst('2026-09-04'), normalized: RUN },
    ])
    expect(out).toEqual([{ dayKey: '2026-09-04', type: 'running' }])
  })

  it('걷기는 축1 게이트를 통과해야 한다 — 0.5km 미만·10분 미만·속도 범위 밖은 뺀다', () => {
    const out = toRecognizedActivities([
      { start_date: kst('2026-09-01'), normalized: WALK },
      { start_date: kst('2026-09-02'), normalized: { ...WALK, distanceKm: 0.3 } },
      { start_date: kst('2026-09-03'), normalized: { ...WALK, movingTimeSec: 300 } },
      { start_date: kst('2026-09-04'), normalized: { ...WALK, averageSpeedKmh: 12 } },
      { start_date: kst('2026-09-05'), normalized: { ...WALK, distanceKm: 'x' } },
    ])
    expect(out).toEqual([{ dayKey: '2026-09-01', type: 'walking' }])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ③ 조회와 계산 함수
// ═══════════════════════════════════════════════════════════════════════

describe('fetchRecognizedActivities — 조회', () => {
  it('인정된 활동만 읽는다 — filter_reason이 있는 행과 다른 유저 행은 제외한다', async () => {
    addActivity(kst('2026-09-01'), RUN)
    addActivity(kst('2026-09-02'), RUN, { filter_reason: 'vehicle_speed' })
    addActivity(kst('2026-09-03'), RUN, {}, OTHER)
    const out = await fetchRecognizedActivities(mockSupabase(), ME)
    expect(out).toEqual([{ dayKey: '2026-09-01', type: 'running' }])
  })

  it('가입한 날 0시(KST) 이후만 읽는다 — 가입한 날 당일은 세고 전날은 세지 않는다', async () => {
    setSignup(ME, kst('2026-09-10', '15:00:00'))
    addActivity(kst('2026-09-09', '23:59:00'), RUN)
    addActivity(kst('2026-09-10', '00:01:00'), RUN)
    const out = await fetchRecognizedActivities(mockSupabase(), ME)
    expect(out.map((a) => a.dayKey)).toEqual(['2026-09-10'])
  })

  it('체크인 기록은 읽지 않는다 — 체크인만 한 날은 활동한 날이 아니다', async () => {
    state.tables.user_checkin_badge_earns.push({ id: 'c1', user_id: ME, poi_id: 'p', triggered_by_activity_date: kst('2026-09-01') })
    await fetchRecognizedActivities(mockSupabase(), ME)
    expect(state.queried).not.toContain('user_checkin_badge_earns')
  })

  it('조회 오류는 던진다 — 0으로 바꿔 돌려주지 않는다', async () => {
    state.error = { message: 'db down' }
    await expect(fetchRecognizedActivities(mockSupabase(), ME)).rejects.toThrow()
  })

  it('가입 시각을 읽지 못하면 던진다', async () => {
    setSignup(ME, null)
    await expect(fetchRecognizedActivities(mockSupabase(), ME)).rejects.toThrow('가입 시각')
  })
})

describe('계산 함수 — 메모리 테이블', () => {
  it('복귀 뒤 이어간 주: 7일 쉰 뒤 돌아와 두 주 활동하면 2', async () => {
    for (const d of ['2026-09-01', '2026-09-09', '2026-09-16']) addActivity(kst(d))
    expect(await countReturnStreakWeeks(mockSupabase(), ME)).toBe(2)
  })

  it('월~일 7일을 모두 채운 주의 수 — 같은 날 여러 활동은 1일이라 6일 + 중복은 채운 주가 아니다', async () => {
    for (const d of ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']) addActivity(kst(d))
    for (const d of ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26']) {
      addActivity(kst(d, '07:00:00'))
      addActivity(kst(d, '19:00:00'))
    }
    expect(await countFullWeekCount(mockSupabase(), ME)).toBe(1)
  })

  it('네 계절을 모두 채운 해의 수', async () => {
    for (const d of ['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10']) addActivity(kst(d))
    expect(await countFullSeasonYearCount(mockSupabase(), ME)).toBe(1)
  })

  it('해 본 종목 수 — 종목 없는 활동과 게이트 미달 걷기는 세지 않는다', async () => {
    addActivity(kst('2026-09-01'), RUN)
    addActivity(kst('2026-09-02'), RUN)
    addActivity(kst('2026-09-03'), RIDE)
    addActivity(kst('2026-09-04'), { ...WALK, distanceKm: 0.1 })
    addActivity(kst('2026-09-05'), { distanceKm: 3 })
    expect(await countDistinctActivityTypeCount(mockSupabase(), ME)).toBe(2)
  })

  it('활동이 없으면 모두 0이다', async () => {
    const supabase = mockSupabase()
    expect(await countReturnStreakWeeks(supabase, ME)).toBe(0)
    expect(await countFullWeekCount(supabase, ME)).toBe(0)
    expect(await countFullSeasonYearCount(supabase, ME)).toBe(0)
    expect(await countDistinctActivityTypeCount(supabase, ME)).toBe(0)
  })
})
