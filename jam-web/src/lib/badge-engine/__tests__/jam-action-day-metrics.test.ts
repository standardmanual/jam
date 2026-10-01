/**
 * JAM! 행동 지표 — 가입 경과일·최근 30일 활동일·주간 활동일·같은 지점 체크인 일수 값 계산 테스트
 * (티켓 20261001_0633, 상위 20260930_1456 ③)
 *
 * 검증 대상:
 *  ① 순수 함수: KST 주 경계(월요일 키·연말연초), 서버 시간대 독립, 최고 주, 최근 30일 창, 지점별 최댓값,
 *     날짜 차, 활동 판정(R2: 종목·걷기 게이트·차량 속도)
 *  ② 계산 함수(메모리 테이블): 월·수·금 → 3, 같은 날 여러 번 → 1, 활동 없는 날의 체크인, R1(가입 이전 제외·당일 포함),
 *     R2, R5(활동 날짜 없는 체크인 제외·며칠 뒤 동기화해도 활동 날짜로), 가입 경과일, 최근 30일
 *  ③ 조회: 읽는 열·필터 고정, 다른 유저 행 분리, 페이징(2,500행 3페이지·31페이지 오류), 조회 오류는 던진다,
 *     `user_daily_sync_counts`를 읽지 않는다(동기화만 한 날은 세지 않는다)
 *
 * 테이블 모킹은 메모리 테이블에 `eq`·`not`·`gte`·`order`·`range`·`maybeSingle`을 실제로 적용하고 `select`한 열만
 * 돌려준다 — 「어떤 행을 어떤 열로 읽는가」가 고정 대상이라 실제 조회와 같은 모양이어야 한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-day-metrics.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const ME = 'user-me'
const OTHER = 'user-other'

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  /** 조회 1회마다 기록 */
  queries: [] as {
    table: string
    cols: string
    eqs: [string, unknown][]
    nots: [string, string, unknown][]
    gtes: [string, unknown][]
    ordered: string | null
    range: [number, number] | null
  }[],
  error: null as { message: string } | null,
  /** 차량 속도 상한으로 해석될 정책 값 */
  vehicleSpeedFilterKmh: 60,
  /** `getAbusingPolicy`가 받은 클라이언트 */
  policyClients: [] as unknown[],
}))

function mockSupabase(): SupabaseClient {
  const from = (table: string) => {
    let cols = ''
    const eqs: [string, unknown][] = []
    const nots: [string, string, unknown][] = []
    const gtes: [string, unknown][] = []
    let ordered: string | null = null
    let range: [number, number] | null = null
    const builder: Record<string, unknown> = {}
    const run = (single: boolean) => {
      state.queries.push({ table, cols, eqs, nots, gtes, ordered, range })
      if (state.error) return { data: null, error: state.error }
      let rows = (state.tables[table] ?? []).filter(
        (r) =>
          eqs.every(([c, v]) => r[c] === v) &&
          nots.every(([c, op, v]) => (op === 'is' && v === null ? r[c] !== null && r[c] !== undefined : true)) &&
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
    builder.not = (col: string, op: string, val: unknown) => {
      nots.push([col, op, val])
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
vi.mock('@/lib/abusing/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/policy')>()
  return {
    ...actual,
    getAbusingPolicy: vi.fn(async (client?: unknown) => {
      state.policyClients.push(client)
      return { ...actual.DEFAULT_POLICY, vehicle_speed_filter_kmh: state.vehicleSpeedFilterKmh }
    }),
  }
})

import {
  RECENT_ACTIVE_WINDOW_DAYS,
  bestWeekActiveDays,
  countDaysSinceSignup,
  countRecentActiveDays,
  countSameSpotCheckinDays,
  countWeeklyActiveDays,
  daysBetweenKstDays,
  fetchActivityDayKeys,
  fetchCheckinRows,
  isCountableActivity,
  kstWeekStartKey,
  maxSpotCheckinDays,
  recentActiveDays,
  toKstDayKey,
} from '../jamActionDayMetrics'

// ── 픽스처 ───────────────────────────────────────────────────────────────

/** KST 벽시계 시각 → ISO(오프셋 포함) */
const kst = (date: string, time = '12:00:00') => `${date}T${time}+09:00`

const RUN = { jamActivityType: 'running', distanceKm: 5, movingTimeSec: 1800, averageSpeedKmh: 10 }
const WALK = { jamActivityType: 'walking', distanceKm: 2, movingTimeSec: 1800, averageSpeedKmh: 4 }

let nextId = 0
const idOf = () => String(nextId++).padStart(7, '0')

function setSignup(userId: string, createdAt: string | null) {
  state.tables.users = state.tables.users.filter((r) => r.id !== userId)
  if (createdAt !== null) state.tables.users.push({ id: userId, created_at: createdAt })
}

function addActivity(startDate: string, normalized: unknown = RUN, userId = ME) {
  state.tables.strava_activities.push({ id: idOf(), user_id: userId, start_date: startDate, normalized })
}

function addCheckin(poiId: string, activityDate: string | null, userId = ME, earnedAt = '2026-09-30T00:00:00Z') {
  state.tables.user_checkin_badge_earns.push({
    id: idOf(),
    user_id: userId,
    poi_id: poiId,
    triggered_by_activity_date: activityDate,
    earned_at: earnedAt,
  })
}

beforeEach(() => {
  state.tables = { users: [], strava_activities: [], user_checkin_badge_earns: [], user_daily_sync_counts: [] }
  state.queries = []
  state.error = null
  state.vehicleSpeedFilterKmh = 60
  state.policyClients = []
  nextId = 0
  // 기본 가입 시각 — 아래 대부분의 시나리오보다 충분히 앞선다
  setSignup(ME, kst('2026-08-01', '10:00:00'))
})

// ═══════════════════════════════════════════════════════════════════════
// ① 순수 함수
// ═══════════════════════════════════════════════════════════════════════

describe('kstWeekStartKey — 월~일(KST)이 같은 주', () => {
  it('월요일부터 일요일까지 모두 같은 월요일 키로 묶인다', () => {
    // 2026-09-07(월) ~ 2026-09-13(일)
    for (const day of ['07', '08', '09', '10', '11', '12', '13']) {
      expect(kstWeekStartKey(`2026-09-${day}`)).toBe('2026-09-07')
    }
    expect(kstWeekStartKey('2026-09-14')).toBe('2026-09-14')
  })

  it('연말·연초를 넘는 주도 한 주다 — 2026-12-28(월) ~ 2027-01-03(일)', () => {
    for (const day of ['2026-12-28', '2026-12-31', '2027-01-01', '2027-01-03']) {
      expect(kstWeekStartKey(day)).toBe('2026-12-28')
    }
    expect(kstWeekStartKey('2027-01-04')).toBe('2027-01-04')
  })
})

describe('toKstDayKey — 시각을 KST 날짜로 옮긴다', () => {
  it('일요일 23:00 KST(14:00Z)는 지난 주 일요일, 월요일 00:00 KST(일요일 15:00Z)는 새 주 월요일이다', () => {
    const sunday = toKstDayKey('2026-09-13T14:00:00Z')
    const monday = toKstDayKey('2026-09-13T15:00:00Z')
    expect(sunday).toBe('2026-09-13')
    expect(monday).toBe('2026-09-14')
    expect(kstWeekStartKey(sunday!)).toBe('2026-09-07')
    expect(kstWeekStartKey(monday!)).toBe('2026-09-14')
  })

  it('읽을 수 없는 값은 null이다 — 오늘로 대체하지 않는다', () => {
    expect(toKstDayKey(null)).toBeNull()
    expect(toKstDayKey(undefined)).toBeNull()
    expect(toKstDayKey('')).toBeNull()
    expect(toKstDayKey('not-a-date')).toBeNull()
    expect(toKstDayKey(12345)).toBeNull()
  })
})

describe('bestWeekActiveDays — 역대 최고 주', () => {
  it('일요일 23:00·월요일 00:00·화·수 12:00 KST → 최고 주 3 (UTC 날짜로 묶으면 2)', () => {
    const starts = [
      '2026-09-13T14:00:00Z', // 일요일 23:00 KST
      '2026-09-13T15:00:00Z', // 월요일 00:00 KST
      '2026-09-15T03:00:00Z', // 화요일 12:00 KST
      '2026-09-16T03:00:00Z', // 수요일 12:00 KST
    ]
    const kstDays = starts.map((s) => toKstDayKey(s)!)
    expect(bestWeekActiveDays(kstDays)).toBe(3)

    // 같은 시각을 UTC 날짜로 묶으면 일요일 23:00과 월요일 00:00이 한 날이 되어 2가 된다 — 이 차이가 KST 계산의 이유다
    const utcDays = starts.map((s) => s.slice(0, 10))
    expect(bestWeekActiveDays(utcDays)).toBe(2)
  })

  it('두 주 중 높은 주의 값이다', () => {
    // 첫 주(09-07 주) 2일, 둘째 주(09-14 주) 4일
    expect(
      bestWeekActiveDays(['2026-09-08', '2026-09-10', '2026-09-14', '2026-09-15', '2026-09-17', '2026-09-20'])
    ).toBe(4)
  })

  it('같은 날 여러 번 들어와도 1일이다', () => {
    expect(bestWeekActiveDays(['2026-09-14', '2026-09-14', '2026-09-14'])).toBe(1)
  })

  it('날이 없으면 0이다', () => {
    expect(bestWeekActiveDays([])).toBe(0)
  })
})

describe('서버 시간대와 무관하다 — process.env.TZ를 바꿔도 같은 값', () => {
  const originalTz = process.env.TZ
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  const starts = [
    '2026-09-13T14:00:00Z', // 일요일 23:00 KST
    '2026-09-13T15:00:00Z', // 월요일 00:00 KST
    '2026-09-15T03:00:00Z',
    '2026-09-16T03:00:00Z',
    '2026-12-31T16:00:00Z', // 2027-01-01 01:00 KST
  ]

  function compute() {
    const days = starts.map((s) => toKstDayKey(s)!)
    return {
      days,
      weekStarts: days.map(kstWeekStartKey),
      best: bestWeekActiveDays(days),
      recent: recentActiveDays(days, '2026-09-20', RECENT_ACTIVE_WINDOW_DAYS),
      diff: daysBetweenKstDays('2026-09-01', '2026-10-01'),
    }
  }

  it('UTC · Asia/Seoul · America/Los_Angeles에서 결과가 같다', () => {
    const results: ReturnType<typeof compute>[] = []
    for (const tz of ['UTC', 'Asia/Seoul', 'America/Los_Angeles']) {
      process.env.TZ = tz
      results.push(compute())
    }
    expect(results[1]).toEqual(results[0])
    expect(results[2]).toEqual(results[0])
    expect(results[0].best).toBe(3)
    expect(results[0].diff).toBe(30)
  })
})

describe('recentActiveDays — 오늘(KST)을 포함한 최근 30일', () => {
  const today = '2026-10-01'

  it('오늘과 29일 전은 포함, 30일 전은 제외한다', () => {
    expect(daysBetweenKstDays('2026-09-02', today)).toBe(29)
    expect(daysBetweenKstDays('2026-09-01', today)).toBe(30)
    expect(recentActiveDays(['2026-10-01', '2026-09-02'], today)).toBe(2)
    expect(recentActiveDays(['2026-09-01'], today)).toBe(0)
  })

  it('오늘보다 뒤 날짜는 세지 않는다', () => {
    expect(recentActiveDays(['2026-10-02'], today)).toBe(0)
  })

  it('같은 날은 한 번만 센다', () => {
    expect(recentActiveDays(['2026-09-30', '2026-09-30'], today)).toBe(1)
  })
})

describe('maxSpotCheckinDays — 지점별 서로 다른 날의 최댓값', () => {
  it('같은 날 같은 지점을 여러 번 찾아도 1일이다', () => {
    const rows = [
      { poi_id: 'p1', triggered_by_activity_date: kst('2026-09-14', '08:00:00') },
      { poi_id: 'p1', triggered_by_activity_date: kst('2026-09-14', '18:00:00') },
      { poi_id: 'p1', triggered_by_activity_date: kst('2026-09-14', '23:00:00') },
    ]
    expect(maxSpotCheckinDays(rows)).toBe(1)
  })

  it('지점마다 따로 세서 최댓값을 쓴다 — 합이 아니다', () => {
    const rows = [
      { poi_id: 'p1', triggered_by_activity_date: kst('2026-09-14') },
      { poi_id: 'p1', triggered_by_activity_date: kst('2026-09-15') },
      { poi_id: 'p2', triggered_by_activity_date: kst('2026-09-14') },
      { poi_id: 'p2', triggered_by_activity_date: kst('2026-09-16') },
      { poi_id: 'p2', triggered_by_activity_date: kst('2026-09-17') },
      { poi_id: 'p3', triggered_by_activity_date: kst('2026-09-14') },
    ]
    expect(maxSpotCheckinDays(rows)).toBe(3)
  })

  it('23:30 KST와 00:30 KST는 다른 날이다', () => {
    const rows = [
      { poi_id: 'p1', triggered_by_activity_date: kst('2026-09-14', '23:30:00') },
      { poi_id: 'p1', triggered_by_activity_date: kst('2026-09-15', '00:30:00') },
    ]
    expect(maxSpotCheckinDays(rows)).toBe(2)
  })

  it('활동 날짜가 없는 행은 세지 않는다 (R5)', () => {
    expect(maxSpotCheckinDays([{ poi_id: 'p1', triggered_by_activity_date: null }])).toBe(0)
    expect(maxSpotCheckinDays([])).toBe(0)
  })
})

describe('isCountableActivity — R2: JAM! 종목 · 걷기 게이트 · 차량 속도', () => {
  it('종목이 없는 활동(0km·13분)은 세지 않는다', () => {
    expect(isCountableActivity({ jamActivityType: null, distanceKm: 0, movingTimeSec: 780, averageSpeedKmh: 0 }, 60)).toBe(false)
  })

  it('러닝·자전거·트레일 러닝은 종목이 있으면 센다', () => {
    expect(isCountableActivity(RUN, 60)).toBe(true)
    expect(isCountableActivity({ ...RUN, jamActivityType: 'cycling', averageSpeedKmh: 25 }, 60)).toBe(true)
    expect(isCountableActivity({ ...RUN, jamActivityType: 'hiking', averageSpeedKmh: 4 }, 60)).toBe(true)
  })

  it('걷기: 9분 · 0.4km · 평균 시속 9km는 세지 않고, 경계값(0.5km·10분·시속 2/8km)은 센다', () => {
    expect(isCountableActivity({ ...WALK, movingTimeSec: 540 }, 60)).toBe(false)
    expect(isCountableActivity({ ...WALK, distanceKm: 0.4 }, 60)).toBe(false)
    expect(isCountableActivity({ ...WALK, averageSpeedKmh: 9 }, 60)).toBe(false)
    expect(isCountableActivity({ ...WALK, averageSpeedKmh: 1.9 }, 60)).toBe(false)
    expect(isCountableActivity({ ...WALK, distanceKm: 0.5, movingTimeSec: 600, averageSpeedKmh: 2 }, 60)).toBe(true)
    expect(isCountableActivity({ ...WALK, averageSpeedKmh: 8 }, 60)).toBe(true)
  })

  it('차량 속도: 평균 시속이 상한 이하면 센다(경계 포함), 넘으면 세지 않는다', () => {
    expect(isCountableActivity({ ...RUN, averageSpeedKmh: 60 }, 60)).toBe(true)
    expect(isCountableActivity({ ...RUN, averageSpeedKmh: 61 }, 60)).toBe(false)
    expect(isCountableActivity({ ...RUN, jamActivityType: 'cycling', averageSpeedKmh: 61 }, 60)).toBe(false)
  })

  it('normalized가 없거나 판정 필드가 숫자가 아니면 세지 않는다', () => {
    expect(isCountableActivity(null, 60)).toBe(false)
    expect(isCountableActivity(undefined, 60)).toBe(false)
    expect(isCountableActivity('running', 60)).toBe(false)
    expect(isCountableActivity({}, 60)).toBe(false)
    expect(isCountableActivity({ jamActivityType: 'running' }, 60)).toBe(false)
    expect(isCountableActivity({ ...RUN, averageSpeedKmh: '10' }, 60)).toBe(false)
    expect(isCountableActivity({ ...RUN, averageSpeedKmh: Number.NaN }, 60)).toBe(false)
    expect(isCountableActivity({ ...WALK, distanceKm: null }, 60)).toBe(false)
    expect(isCountableActivity({ ...WALK, movingTimeSec: undefined }, 60)).toBe(false)
  })
})

describe('daysBetweenKstDays', () => {
  it('같은 날은 0, 다음 날은 1, 달·해가 바뀌어도 날짜 차다', () => {
    expect(daysBetweenKstDays('2026-09-10', '2026-09-10')).toBe(0)
    expect(daysBetweenKstDays('2026-09-10', '2026-09-11')).toBe(1)
    expect(daysBetweenKstDays('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetweenKstDays('2026-09-11', '2026-09-10')).toBe(-1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② 계산 함수 — 주간 활동일
// ═══════════════════════════════════════════════════════════════════════

describe('countWeeklyActiveDays — 주간 활동일', () => {
  it('월·수·금에 활동했으면 3이다 (동기화만 한 일요일은 세지 않는다)', async () => {
    addActivity(kst('2026-09-14')) // 월
    addActivity(kst('2026-09-16')) // 수
    addActivity(kst('2026-09-18')) // 금
    // 일요일에 동기화만 했다 — 동기화한 날은 활동한 날이 아니다
    state.tables.user_daily_sync_counts.push({ user_id: ME, sync_date: '2026-09-20', count: 1 })

    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(3)
  })

  it('같은 날 여러 활동은 1일이다', async () => {
    addActivity(kst('2026-09-14', '07:00:00'))
    addActivity(kst('2026-09-14', '12:00:00'))
    addActivity(kst('2026-09-14', '19:00:00'))
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(1)
  })

  it('두 주 중 높은 주의 값이다', async () => {
    addActivity(kst('2026-09-08')) // 첫 주 2일
    addActivity(kst('2026-09-10'))
    addActivity(kst('2026-09-14')) // 둘째 주 4일
    addActivity(kst('2026-09-15'))
    addActivity(kst('2026-09-17'))
    addActivity(kst('2026-09-20'))
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(4)
  })

  it('일요일 23:00·월요일 00:00·화·수 12:00 KST → 3이다', async () => {
    addActivity('2026-09-13T14:00:00Z')
    addActivity('2026-09-13T15:00:00Z')
    addActivity(kst('2026-09-15'))
    addActivity(kst('2026-09-16'))
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(3)
  })

  it('활동이 없는 날의 체크인도 활동한 날로 센다', async () => {
    addActivity(kst('2026-09-14')) // 월 활동
    addCheckin('p1', kst('2026-09-16')) // 수 체크인만
    addCheckin('p2', kst('2026-09-18')) // 금 체크인만
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(3)
  })

  it('같은 날 활동과 체크인이 함께 있으면 1일이다', async () => {
    addActivity(kst('2026-09-14', '08:00:00'))
    addCheckin('p1', kst('2026-09-14', '08:00:00'))
    addCheckin('p2', kst('2026-09-14', '08:00:00'))
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(1)
  })

  it('활동도 체크인도 없으면 0이다', async () => {
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(0)
  })

  it('R1: 가입한 날 이전의 활동·체크인은 세지 않고, 가입한 날 당일은 센다', async () => {
    // 가입: 수요일 18:00 KST — 같은 날 오전 활동(가입 시각보다 앞)도 가입한 날이므로 센다
    setSignup(ME, kst('2026-09-16', '18:00:00'))
    addActivity(kst('2026-09-14')) // 월 — 가입 전
    addActivity(kst('2026-09-15')) // 화 — 가입 전
    addCheckin('p1', kst('2026-09-15')) // 화 체크인 — 가입 전
    addActivity(kst('2026-09-16', '09:00:00')) // 수 — 가입한 날 당일
    addActivity(kst('2026-09-17')) // 목
    addCheckin('p1', kst('2026-09-18')) // 금 체크인

    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(3)
  })

  it('R2: 종목 없는 활동 · 걷기 게이트 탈락 · 차량 속도 초과 · normalized 없음은 세지 않는다', async () => {
    addActivity(kst('2026-09-14'), { jamActivityType: null, distanceKm: 0, movingTimeSec: 780, averageSpeedKmh: 0 })
    addActivity(kst('2026-09-15'), { ...WALK, movingTimeSec: 540 }) // 9분 걷기
    addActivity(kst('2026-09-16'), { ...WALK, distanceKm: 0.4 }) // 0.4km 걷기
    addActivity(kst('2026-09-17'), { ...WALK, averageSpeedKmh: 9 }) // 평균 시속 9km 걷기
    addActivity(kst('2026-09-18'), { ...RUN, averageSpeedKmh: 61 }) // 차량 속도
    addActivity(kst('2026-09-19'), null) // normalized 없음
    addActivity(kst('2026-09-20'), RUN) // 유일하게 센다
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(1)
  })

  it('R2: 체크인한 날에는 활동 필터를 적용하지 않는다', async () => {
    // 활동은 모두 탈락하지만 같은 날 체크인이 있으면 센다
    addActivity(kst('2026-09-14'), { ...RUN, averageSpeedKmh: 61 })
    addCheckin('p1', kst('2026-09-14'))
    addActivity(kst('2026-09-15'), { jamActivityType: null, distanceKm: 0, movingTimeSec: 780, averageSpeedKmh: 0 })
    addCheckin('p1', kst('2026-09-15'))
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(2)
  })

  it('R2: 차량 속도 상한은 정책 값을 쓰고, 정책 값이 0·음수·NaN이면 기본값 60으로 판정한다', async () => {
    addActivity(kst('2026-09-14'), { ...RUN, averageSpeedKmh: 61 })
    addActivity(kst('2026-09-15'), { ...RUN, averageSpeedKmh: 59 })

    state.vehicleSpeedFilterKmh = 80 // 정책 상한을 올리면 61km/h도 센다
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(2)

    for (const broken of [0, -5, Number.NaN]) {
      state.vehicleSpeedFilterKmh = broken // 기본값 60 → 61km/h는 탈락, 59km/h는 통과
      expect(await countWeeklyActiveDays(mockSupabase(), ME), `정책 값 ${broken}`).toBe(1)
    }
  })

  it('R5: 활동 날짜가 없는 체크인은 세지 않고, 며칠 뒤에 동기화한 체크인은 활동 날짜로 센다', async () => {
    addCheckin('p1', null, ME, kst('2026-09-14')) // 활동 날짜 없음 — earned_at이 있어도 세지 않는다
    addCheckin('p1', kst('2026-09-14'), ME, kst('2026-09-17')) // 월요일 활동, 사흘 뒤(목) 동기화
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(1)

    // 센 날짜는 earned_at(목)이 아니라 활동 날짜(월)다 — 월요일 활동 하나를 더하면 같은 날이라 그대로 1이다
    addActivity(kst('2026-09-14'))
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(1)
    // 목요일에 활동이 있으면 비로소 2다
    addActivity(kst('2026-09-17'))
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(2)
  })

  it('다른 유저의 활동·체크인은 세지 않는다', async () => {
    addActivity(kst('2026-09-14'), RUN, OTHER)
    addCheckin('p1', kst('2026-09-15'), OTHER)
    addActivity(kst('2026-09-16'))
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(1)
  })

  it('가입 시각을 못 읽으면 던진다', async () => {
    setSignup(ME, null)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(countWeeklyActiveDays(mockSupabase(), ME)).rejects.toThrow(/가입 시각/)
    spy.mockRestore()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② 계산 함수 — 같은 지점 체크인 일수
// ═══════════════════════════════════════════════════════════════════════

describe('countSameSpotCheckinDays — 같은 지점 체크인 일수', () => {
  it('같은 날 같은 지점을 여러 번 찾아도 1이다', async () => {
    addCheckin('p1', kst('2026-09-14', '07:00:00'))
    addCheckin('p1', kst('2026-09-14', '13:00:00'))
    addCheckin('p1', kst('2026-09-14', '21:00:00'))
    expect(await countSameSpotCheckinDays(mockSupabase(), ME)).toBe(1)
  })

  it('지점마다 따로 세서 최댓값을 쓴다 — 합이 아니다', async () => {
    addCheckin('p1', kst('2026-09-14'))
    addCheckin('p1', kst('2026-09-15'))
    addCheckin('p2', kst('2026-09-14'))
    addCheckin('p2', kst('2026-09-16'))
    addCheckin('p2', kst('2026-09-17'))
    expect(await countSameSpotCheckinDays(mockSupabase(), ME)).toBe(3)
  })

  it('23:30 KST와 00:30 KST는 다른 날이다', async () => {
    addCheckin('p1', kst('2026-09-14', '23:30:00'))
    addCheckin('p1', kst('2026-09-15', '00:30:00'))
    expect(await countSameSpotCheckinDays(mockSupabase(), ME)).toBe(2)
  })

  it('R1: 가입한 날 이전 체크인은 세지 않고 가입한 날 당일은 센다', async () => {
    setSignup(ME, kst('2026-09-16', '18:00:00'))
    addCheckin('p1', kst('2026-09-14'))
    addCheckin('p1', kst('2026-09-15'))
    addCheckin('p1', kst('2026-09-16', '07:00:00')) // 가입한 날 당일
    addCheckin('p1', kst('2026-09-17'))
    expect(await countSameSpotCheckinDays(mockSupabase(), ME)).toBe(2)
  })

  it('R5: 활동 날짜가 없는 체크인은 세지 않는다', async () => {
    addCheckin('p1', null, ME, kst('2026-09-14'))
    addCheckin('p1', null, ME, kst('2026-09-15'))
    expect(await countSameSpotCheckinDays(mockSupabase(), ME)).toBe(0)
  })

  it('체크인이 없으면 0이다', async () => {
    expect(await countSameSpotCheckinDays(mockSupabase(), ME)).toBe(0)
  })

  it('다른 유저의 체크인은 세지 않는다', async () => {
    addCheckin('p1', kst('2026-09-14'), OTHER)
    addCheckin('p1', kst('2026-09-15'), OTHER)
    addCheckin('p1', kst('2026-09-16'), ME)
    expect(await countSameSpotCheckinDays(mockSupabase(), ME)).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② 계산 함수 — 가입 경과일 · 최근 30일 활동일
// ═══════════════════════════════════════════════════════════════════════

describe('countDaysSinceSignup — 가입 경과일', () => {
  it('가입한 날은 0이다', async () => {
    setSignup(ME, kst('2026-09-10', '23:00:00'))
    expect(await countDaysSinceSignup(mockSupabase(), ME, new Date(kst('2026-09-10', '23:30:00')))).toBe(0)
    expect(await countDaysSinceSignup(mockSupabase(), ME, new Date(kst('2026-09-10', '00:00:00')))).toBe(0)
  })

  it('가입 23:00 KST와 다음 날 00:30 KST는 1이다 — 24시간이 아니라 한국 날짜 차이다', async () => {
    setSignup(ME, kst('2026-09-10', '23:00:00'))
    expect(await countDaysSinceSignup(mockSupabase(), ME, new Date(kst('2026-09-11', '00:30:00')))).toBe(1)
  })

  it('100일 뒤는 100이다', async () => {
    setSignup(ME, kst('2026-06-01', '10:00:00'))
    expect(await countDaysSinceSignup(mockSupabase(), ME, new Date(kst('2026-09-09', '10:00:00')))).toBe(100)
  })

  it('가입 시각을 못 읽으면(행 없음) 던진다', async () => {
    setSignup(ME, null)
    await expect(countDaysSinceSignup(mockSupabase(), ME)).rejects.toThrow(/가입 시각/)
  })

  it('가입 시각 조회가 실패하면 던진다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.error = { message: 'DB 장애' }
    await expect(countDaysSinceSignup(mockSupabase(), ME)).rejects.toThrow(/가입 시각/)
    spy.mockRestore()
  })

  it('활동 기록은 읽지 않는다 — users만 조회한다', async () => {
    await countDaysSinceSignup(mockSupabase(), ME)
    expect(state.queries.map((q) => q.table)).toEqual(['users'])
  })
})

describe('countRecentActiveDays — 최근 30일 활동일', () => {
  // 가입은 8월 초 — 최근 30일 창과 겹치지 않는다
  const now = new Date(kst('2026-10-01', '12:00:00'))

  it('오늘(KST)을 포함한 최근 30일: 오늘·29일 전은 포함, 30일 전은 제외한다', async () => {
    addActivity(kst('2026-10-01')) // 오늘
    addActivity(kst('2026-09-02')) // 29일 전
    addActivity(kst('2026-09-01')) // 30일 전 — 제외
    expect(await countRecentActiveDays(mockSupabase(), ME, now)).toBe(2)
  })

  it('KST 자정 경계: 판정 시각이 KST 날짜를 넘기면 창이 하루 밀린다', async () => {
    addActivity(kst('2026-09-01'))
    // 2026-09-30 23:59:59 KST — 오늘은 9월 30일, 창은 9월 1일부터 → 포함
    expect(await countRecentActiveDays(mockSupabase(), ME, new Date(kst('2026-09-30', '23:59:59')))).toBe(1)
    // 2026-10-01 00:00:00 KST — 오늘은 10월 1일, 창은 9월 2일부터 → 제외
    expect(await countRecentActiveDays(mockSupabase(), ME, new Date(kst('2026-10-01', '00:00:00')))).toBe(0)
  })

  it('활동한 날과 체크인한 날을 함께 센다 (같은 날은 1일)', async () => {
    addActivity(kst('2026-09-28'))
    addCheckin('p1', kst('2026-09-28'))
    addCheckin('p1', kst('2026-09-29'))
    addActivity(kst('2026-09-30'))
    expect(await countRecentActiveDays(mockSupabase(), ME, now)).toBe(3)
  })

  it('R1·R2를 같은 정의로 적용한다 — 가입 전·종목 없는 활동은 세지 않는다', async () => {
    setSignup(ME, kst('2026-09-20', '10:00:00'))
    addActivity(kst('2026-09-19')) // 가입 전
    addActivity(kst('2026-09-21'), { jamActivityType: null, distanceKm: 0, movingTimeSec: 780, averageSpeedKmh: 0 })
    addActivity(kst('2026-09-22'))
    expect(await countRecentActiveDays(mockSupabase(), ME, now)).toBe(1)
  })

  it('가입 시각을 못 읽으면 던진다', async () => {
    setSignup(ME, null)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(countRecentActiveDays(mockSupabase(), ME, now)).rejects.toThrow(/가입 시각/)
    spy.mockRestore()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ③ 조회
// ═══════════════════════════════════════════════════════════════════════

describe('조회 — 읽는 열·필터 고정', () => {
  it('활동은 start_date·normalized만, user_id와 가입한 날 KST 0시 이후, id 순으로 읽는다', async () => {
    setSignup(ME, kst('2026-09-16', '18:00:00'))
    addActivity(kst('2026-09-17'))
    await countWeeklyActiveDays(mockSupabase(), ME)

    const q = state.queries.find((x) => x.table === 'strava_activities')
    expect(q).toBeDefined()
    expect(q!.cols).toBe('start_date, normalized')
    expect(q!.eqs).toEqual([['user_id', ME]])
    // 가입한 날(2026-09-16 KST) 0시 = 2026-09-15T15:00:00Z
    expect(q!.gtes).toEqual([['start_date', '2026-09-15T15:00:00.000Z']])
    expect(q!.ordered).toBe('id')
    expect(q!.range).toEqual([0, 999])
  })

  it('체크인은 poi_id·triggered_by_activity_date만, 활동 날짜가 있는 행을 가입한 날 KST 0시 이후로 읽는다', async () => {
    setSignup(ME, kst('2026-09-16', '18:00:00'))
    await countSameSpotCheckinDays(mockSupabase(), ME)

    const q = state.queries.find((x) => x.table === 'user_checkin_badge_earns')
    expect(q).toBeDefined()
    expect(q!.cols).toBe('poi_id, triggered_by_activity_date')
    expect(q!.eqs).toEqual([['user_id', ME]])
    expect(q!.nots).toEqual([['triggered_by_activity_date', 'is', null]])
    expect(q!.gtes).toEqual([['triggered_by_activity_date', '2026-09-15T15:00:00.000Z']])
    expect(q!.ordered).toBe('id')
  })

  it('user_daily_sync_counts(동기화한 날)는 어떤 지표에서도 읽지 않는다', async () => {
    state.tables.user_daily_sync_counts.push({ user_id: ME, sync_date: '2026-09-14', count: 3 })
    const now = new Date(kst('2026-09-20'))
    await countDaysSinceSignup(mockSupabase(), ME, now)
    await countRecentActiveDays(mockSupabase(), ME, now)
    await countWeeklyActiveDays(mockSupabase(), ME)
    await countSameSpotCheckinDays(mockSupabase(), ME)
    expect(state.queries.map((q) => q.table)).not.toContain('user_daily_sync_counts')
  })

  it('차량 속도 상한은 주입된 클라이언트로 정책을 읽어 정한다', async () => {
    const supabase = mockSupabase()
    await fetchActivityDayKeys(supabase, ME, '2026-08-01')
    expect(state.policyClients).toEqual([supabase])
  })

  it('활동한 날 집합은 활동의 날짜와 체크인한 날의 합집합이다', async () => {
    addActivity(kst('2026-09-14'))
    addActivity(kst('2026-09-15'), { ...RUN, averageSpeedKmh: 61 }) // 탈락
    addCheckin('p1', kst('2026-09-16'))
    const days = await fetchActivityDayKeys(mockSupabase(), ME, '2026-08-01')
    expect([...days].sort()).toEqual(['2026-09-14', '2026-09-16'])
  })

  it('fetchCheckinRows는 활동 날짜가 있는 내 행만 돌려준다', async () => {
    addCheckin('p1', kst('2026-09-14'))
    addCheckin('p2', null)
    addCheckin('p3', kst('2026-09-15'), OTHER)
    const rows = await fetchCheckinRows(mockSupabase(), ME, '2026-08-01')
    expect(rows.map((r) => r.poi_id)).toEqual(['p1'])
  })
})

describe('조회 — 페이징·오류', () => {
  it('2,500행이면 1,000행씩 3페이지를 읽어 마지막 페이지의 날짜까지 센다', async () => {
    // 앞 2,000행은 같은 날, 마지막 500행에 다른 날이 하나 있다 — 3번째 페이지를 읽지 않으면 이 날을 놓친다
    for (let i = 0; i < 2000; i++) addActivity(kst('2026-09-14', '09:00:00'))
    for (let i = 0; i < 499; i++) addActivity(kst('2026-09-14', '10:00:00'))
    addActivity(kst('2026-09-16', '10:00:00'))

    const days = await fetchActivityDayKeys(mockSupabase(), ME, '2026-08-01')
    expect([...days].sort()).toEqual(['2026-09-14', '2026-09-16'])

    const ranges = state.queries.filter((q) => q.table === 'strava_activities').map((q) => q.range)
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('활동 행이 30페이지(30,000행)를 넘으면 던진다 — 잘린 값으로 판정하지 않는다', async () => {
    for (let i = 0; i < 30001; i++) addActivity(kst('2026-09-14'))
    await expect(countWeeklyActiveDays(mockSupabase(), ME)).rejects.toThrow(/30페이지/)
  })

  it('정확히 30,000행이면 통과한다', async () => {
    for (let i = 0; i < 30000; i++) addActivity(kst('2026-09-14'))
    expect(await countWeeklyActiveDays(mockSupabase(), ME)).toBe(1)
  })

  it('체크인 행이 30페이지를 넘으면 던진다', async () => {
    for (let i = 0; i < 30001; i++) addCheckin('p1', kst('2026-09-14'))
    await expect(countSameSpotCheckinDays(mockSupabase(), ME)).rejects.toThrow(/30페이지/)
  })

  it('활동 조회 오류는 0으로 바꾸지 않고 던진다', async () => {
    // 가입 시각 조회는 통과시키고 활동 조회부터 실패시킨다
    const supabase = mockSupabase()
    const failingFrom = (table: string) => {
      if (table === 'strava_activities') {
        const failing: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'gte', 'order', 'range']) failing[m] = () => failing
        failing.then = (resolve: (v: unknown) => void) =>
          Promise.resolve({ data: null, error: { message: 'DB 장애' } }).then(resolve)
        return failing
      }
      return (supabase as unknown as { from: (t: string) => unknown }).from(table)
    }
    const broken = { from: failingFrom } as unknown as SupabaseClient
    await expect(countWeeklyActiveDays(broken, ME)).rejects.toThrow(/활동 기록 조회 오류: DB 장애/)
  })

  it('체크인 조회 오류는 0으로 바꾸지 않고 던진다', async () => {
    const supabase = mockSupabase()
    const failingFrom = (table: string) => {
      if (table === 'user_checkin_badge_earns') {
        const failing: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'not', 'gte', 'order', 'range']) failing[m] = () => failing
        failing.then = (resolve: (v: unknown) => void) =>
          Promise.resolve({ data: null, error: { message: 'DB 장애' } }).then(resolve)
        return failing
      }
      return (supabase as unknown as { from: (t: string) => unknown }).from(table)
    }
    const broken = { from: failingFrom } as unknown as SupabaseClient
    await expect(countSameSpotCheckinDays(broken, ME)).rejects.toThrow(/체크인 기록 조회 오류: DB 장애/)
  })
})
