/**
 * 걷기 배지 v4 — 축1 게이트 + day_of_week + active_days_count + season_count_all +
 * 하루 1회 상한 + 버그 회귀(getProgressionKey 크로스배지 충돌, temperature+total_count 누수) 테스트
 *
 * 참고 문서: .kkirikkiri/TEAM_PLAN.md, .kkirikkiri/TEAM_FINDINGS.md
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/walking-badges-v4.test.ts
 */
import {
  evaluateConditionDetailed,
  passesWalkingGate,
  evaluateBadgesDetailed,
  WALKING_GATE_MIN_DISTANCE_KM,
  WALKING_GATE_MIN_DURATION_MIN,
  WALKING_GATE_MIN_SPEED_KMH,
  WALKING_GATE_MAX_SPEED_KMH,
} from '../index'
import { rollBonusDrop } from '@/lib/drop-engine/layers'
import { DEFAULT_DROP_POLICY } from '@/lib/drop-engine/policy'
import type { NormalizedActivity } from '@/types/strava'
import type { BadgeCondition, BadgeRow } from '@/types/database'

// ── 활동 팩토리 ──────────────────────────────────────────────────────────

function makeActivity(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    stravaId: Math.floor(Math.random() * 1_000_000_000),
    name: 'Test Walk',
    distanceKm: 3,
    movingTimeSec: 30 * 60, // 30분
    elevationGainM: 10,
    jamActivityType: 'walking',
    startDate: '2026-07-20T05:30:00Z', // 2026-07-20 = 월요일
    startDateLocal: '2026-07-20T05:30:00',
    averageSpeedKmh: 5, // 3km / 0.5h = 6km/h 이지만 명시값 사용, 게이트 범위(2~8) 내
    startLatLng: null,
    endLatLng: null,
    weatherTempC: null,
    ...overrides,
  }
}

/** 축1 게이트를 확실히 통과하는 걷기 활동 (거리/시간/속도 모두 정상 범위) */
function makeGatedWalk(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return makeActivity({
    distanceKm: 3,
    movingTimeSec: 36 * 60, // 36분 → 5km/h
    averageSpeedKmh: 5,
    ...overrides,
  })
}

// ═══════════════════════════════════════════════════════════════════════
// 1. 축1 게이트 — passesWalkingGate
// ═══════════════════════════════════════════════════════════════════════

describe('passesWalkingGate — 축1 게이트', () => {
  it('거리 0.5km 미만이면 탈락', () => {
    const a = makeGatedWalk({ distanceKm: WALKING_GATE_MIN_DISTANCE_KM - 0.01 })
    expect(passesWalkingGate(a)).toBe(false)
  })

  it('거리 정확히 0.5km(경계)이면 통과', () => {
    const a = makeGatedWalk({ distanceKm: WALKING_GATE_MIN_DISTANCE_KM })
    expect(passesWalkingGate(a)).toBe(true)
  })

  it('이동시간 10분 미만이면 탈락', () => {
    const a = makeGatedWalk({ movingTimeSec: (WALKING_GATE_MIN_DURATION_MIN - 1) * 60 })
    expect(passesWalkingGate(a)).toBe(false)
  })

  it('이동시간 정확히 10분(경계)이면 통과', () => {
    const a = makeGatedWalk({ movingTimeSec: WALKING_GATE_MIN_DURATION_MIN * 60 })
    expect(passesWalkingGate(a)).toBe(true)
  })

  it('평균속도 2.0km/h 미만이면 탈락', () => {
    const a = makeGatedWalk({ averageSpeedKmh: WALKING_GATE_MIN_SPEED_KMH - 0.1 })
    expect(passesWalkingGate(a)).toBe(false)
  })

  it('평균속도 8.0km/h 초과이면 탈락', () => {
    const a = makeGatedWalk({ averageSpeedKmh: WALKING_GATE_MAX_SPEED_KMH + 0.1 })
    expect(passesWalkingGate(a)).toBe(false)
  })

  it('평균속도 경계값(2.0, 8.0)은 통과', () => {
    expect(passesWalkingGate(makeGatedWalk({ averageSpeedKmh: WALKING_GATE_MIN_SPEED_KMH }))).toBe(true)
    expect(passesWalkingGate(makeGatedWalk({ averageSpeedKmh: WALKING_GATE_MAX_SPEED_KMH }))).toBe(true)
  })

  it('거리/시간/속도 모두 정상 범위이면 통과', () => {
    expect(passesWalkingGate(makeGatedWalk())).toBe(true)
  })

  it('걷기가 아닌 종목은 게이트 조건과 무관하게 항상 true', () => {
    const badButNotWalking = makeActivity({
      jamActivityType: 'running',
      distanceKm: 0.01,
      movingTimeSec: 60,
      averageSpeedKmh: 30,
    })
    expect(passesWalkingGate(badButNotWalking)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. active_days_count — 고유일수 카운트 + 축1 게이트 배제
// ═══════════════════════════════════════════════════════════════════════

describe('active_days_count', () => {
  it('같은 날 여러 번 걸어도 고유일수는 1로 카운트', () => {
    const cond: BadgeCondition = { activity_type: 'walking', active_days_count: 1 }
    const acts = [
      makeGatedWalk({ startDate: '2026-07-20T05:00:00Z', startDateLocal: '2026-07-20T05:00:00' }),
      makeGatedWalk({ startDate: '2026-07-20T18:00:00Z', startDateLocal: '2026-07-20T18:00:00' }),
      makeGatedWalk({ startDate: '2026-07-20T20:00:00Z', startDateLocal: '2026-07-20T20:00:00' }),
    ]
    // 하루에 3번 걸었어도 active_days_count=2는 미달이어야 함
    const failCond: BadgeCondition = { activity_type: 'walking', active_days_count: 2 }
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
    const failResult = evaluateConditionDetailed(failCond, acts)
    expect(failResult.pass).toBe(false)
    expect(failResult.actual).toContain('1일')
  })

  it('서로 다른 날 걸으면 고유일수만큼 누적', () => {
    const cond: BadgeCondition = { activity_type: 'walking', active_days_count: 3 }
    const acts = [
      makeGatedWalk({ startDate: '2026-07-18T05:00:00Z', startDateLocal: '2026-07-18T05:00:00' }),
      makeGatedWalk({ startDate: '2026-07-19T05:00:00Z', startDateLocal: '2026-07-19T05:00:00' }),
      makeGatedWalk({ startDate: '2026-07-20T05:00:00Z', startDateLocal: '2026-07-20T05:00:00' }),
    ]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('연속이 아니어도(하루 빠져도) 깎이지 않는다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', active_days_count: 3 }
    const acts = [
      makeGatedWalk({ startDate: '2026-07-01T05:00:00Z', startDateLocal: '2026-07-01T05:00:00' }),
      makeGatedWalk({ startDate: '2026-07-10T05:00:00Z', startDateLocal: '2026-07-10T05:00:00' }), // 갭
      makeGatedWalk({ startDate: '2026-07-25T05:00:00Z', startDateLocal: '2026-07-25T05:00:00' }), // 갭
    ]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('축1 게이트 미통과 활동은 고유일수 카운트에서 제외', () => {
    const cond: BadgeCondition = { activity_type: 'walking', active_days_count: 2 }
    const acts = [
      makeGatedWalk({ startDate: '2026-07-18T05:00:00Z', startDateLocal: '2026-07-18T05:00:00' }), // 유효
      // 게이트 미통과 (거리 0.1km) — 카운트되면 안 됨
      makeGatedWalk({
        startDate: '2026-07-19T05:00:00Z',
        startDateLocal: '2026-07-19T05:00:00',
        distanceKm: 0.1,
      }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.actual).toContain('1일')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. day_of_week 단일값 — T05~T07 스타일
// ═══════════════════════════════════════════════════════════════════════

describe('day_of_week (단일값)', () => {
  it('지정 요일(일요일) 활동만 카운트되어 조건 충족', () => {
    const cond: BadgeCondition = { activity_type: 'walking', day_of_week: 'sunday', total_count: 2 }
    const acts = [
      // 2026-07-19 = 일요일
      makeGatedWalk({ startDate: '2026-07-19T05:00:00Z', startDateLocal: '2026-07-19T05:00:00' }),
      makeGatedWalk({ startDate: '2026-07-26T05:00:00Z', startDateLocal: '2026-07-26T05:00:00' }), // 다음 일요일
    ]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('지정 요일이 아닌 활동은 제외되어 카운트 미달 → fail', () => {
    const cond: BadgeCondition = { activity_type: 'walking', day_of_week: 'sunday', total_count: 2 }
    const acts = [
      makeGatedWalk({ startDate: '2026-07-19T05:00:00Z', startDateLocal: '2026-07-19T05:00:00' }), // 일요일 (유효)
      makeGatedWalk({ startDate: '2026-07-20T05:00:00Z', startDateLocal: '2026-07-20T05:00:00' }), // 월요일 (제외)
      makeGatedWalk({ startDate: '2026-07-21T05:00:00Z', startDateLocal: '2026-07-21T05:00:00' }), // 화요일 (제외)
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.actual).toContain('1회')
  })

  it('월요일 지정 — 월요일 활동만 통과', () => {
    const cond: BadgeCondition = { activity_type: 'walking', day_of_week: 'monday', total_count: 1 }
    const acts = [
      makeGatedWalk({ startDate: '2026-07-19T05:00:00Z', startDateLocal: '2026-07-19T05:00:00' }), // 일
    ]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(false)

    const acts2 = [
      makeGatedWalk({ startDate: '2026-07-20T05:00:00Z', startDateLocal: '2026-07-20T05:00:00' }), // 월
    ]
    expect(evaluateConditionDetailed(cond, acts2).pass).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. day_of_week 배열 + total_count — T08 특수모드 (요일별 독립 카운터)
// ═══════════════════════════════════════════════════════════════════════

describe('day_of_week (배열) + total_count — T08 요일별 독립 카운터', () => {
  const WEEKDAYS: BadgeCondition['day_of_week'] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

  it('5개 요일 각각 조건을 만족하면 pass', () => {
    const cond: BadgeCondition = { activity_type: 'walking', day_of_week: WEEKDAYS, total_count: 2 }
    // 2026-07-20(월) ~ 07-24(금) 각 요일 2주치(2회)씩
    const dates = [
      '2026-07-20', '2026-07-27', // 월 x2
      '2026-07-21', '2026-07-28', // 화 x2
      '2026-07-22', '2026-07-29', // 수 x2
      '2026-07-23', '2026-07-30', // 목 x2
      '2026-07-24', '2026-07-31', // 금 x2
    ]
    const acts = dates.map((d) =>
      makeGatedWalk({ startDate: `${d}T05:00:00Z`, startDateLocal: `${d}T05:00:00` })
    )
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('한 요일만 채우고 나머지 요일이 부족하면 fail', () => {
    const cond: BadgeCondition = { activity_type: 'walking', day_of_week: WEEKDAYS, total_count: 2 }
    // 월요일만 2회, 나머지 요일 0회
    const acts = [
      makeGatedWalk({ startDate: '2026-07-20T05:00:00Z', startDateLocal: '2026-07-20T05:00:00' }),
      makeGatedWalk({ startDate: '2026-07-27T05:00:00Z', startDateLocal: '2026-07-27T05:00:00' }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('요일별')
    // 월요일은 2회로 충족, 화~금은 0회로 미달이 함께 드러나야 함
    expect(result.actual).toContain('월: 2회')
    expect(result.actual).toContain('화: 0회')
  })

  it('요일별 서브풀에도 하루 1회 상한이 적용된다', () => {
    const cond: BadgeCondition = { activity_type: 'walking', day_of_week: WEEKDAYS, total_count: 2 }
    // 같은 월요일에 3번 걸어도 1회로만 카운트 → 2회 조건 미달
    const acts = [
      makeGatedWalk({ startDate: '2026-07-20T05:00:00Z', startDateLocal: '2026-07-20T05:00:00' }),
      makeGatedWalk({ startDate: '2026-07-20T12:00:00Z', startDateLocal: '2026-07-20T12:00:00' }),
      makeGatedWalk({ startDate: '2026-07-20T18:00:00Z', startDateLocal: '2026-07-20T18:00:00' }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.actual).toContain('월: 1회')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. season_count_all — T15 (4계절 각각 독립 카운터)
// ═══════════════════════════════════════════════════════════════════════

describe('season_count_all — T15 사계절의 발걸음', () => {
  it('4계절 각각 조건을 만족하면 pass', () => {
    const cond: BadgeCondition = { activity_type: 'walking', season_count_all: 2 }
    const acts = [
      // 봄 (3,4,5월) x2
      makeGatedWalk({ startDate: '2026-03-10T05:00:00Z', startDateLocal: '2026-03-10T05:00:00' }),
      makeGatedWalk({ startDate: '2026-04-10T05:00:00Z', startDateLocal: '2026-04-10T05:00:00' }),
      // 여름 (6,7,8월) x2
      makeGatedWalk({ startDate: '2026-06-10T05:00:00Z', startDateLocal: '2026-06-10T05:00:00' }),
      makeGatedWalk({ startDate: '2026-07-10T05:00:00Z', startDateLocal: '2026-07-10T05:00:00' }),
      // 가을 (9,10,11월) x2
      makeGatedWalk({ startDate: '2026-09-10T05:00:00Z', startDateLocal: '2026-09-10T05:00:00' }),
      makeGatedWalk({ startDate: '2026-10-10T05:00:00Z', startDateLocal: '2026-10-10T05:00:00' }),
      // 겨울 (12,1,2월) x2
      makeGatedWalk({ startDate: '2026-12-10T05:00:00Z', startDateLocal: '2026-12-10T05:00:00' }),
      makeGatedWalk({ startDate: '2026-01-10T05:00:00Z', startDateLocal: '2026-01-10T05:00:00' }),
    ]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })

  it('3계절만 채우고 한 계절이 부족하면 fail', () => {
    const cond: BadgeCondition = { activity_type: 'walking', season_count_all: 2 }
    const acts = [
      makeGatedWalk({ startDate: '2026-03-10T05:00:00Z', startDateLocal: '2026-03-10T05:00:00' }),
      makeGatedWalk({ startDate: '2026-04-10T05:00:00Z', startDateLocal: '2026-04-10T05:00:00' }),
      makeGatedWalk({ startDate: '2026-06-10T05:00:00Z', startDateLocal: '2026-06-10T05:00:00' }),
      makeGatedWalk({ startDate: '2026-07-10T05:00:00Z', startDateLocal: '2026-07-10T05:00:00' }),
      makeGatedWalk({ startDate: '2026-09-10T05:00:00Z', startDateLocal: '2026-09-10T05:00:00' }),
      makeGatedWalk({ startDate: '2026-10-10T05:00:00Z', startDateLocal: '2026-10-10T05:00:00' }),
      // 겨울 활동 없음 (0회) — 미달
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('계절별')
    expect(result.actual).toContain('겨울: 0회')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. 하루 1회 상한 — weekly_count (W3 회귀)
// ═══════════════════════════════════════════════════════════════════════

describe('하루 1회 상한 — weekly_count (W3 회귀)', () => {
  it('같은 날 여러 번 걸어도 weekly_count는 1회로만 카운트', () => {
    const cond: BadgeCondition = { activity_type: 'walking', weekly_count: 2 }
    // 2026-07-20(월) 하루에 3번 — 하루 1회 상한 적용 시 그 주는 1회만 인정되어 미달
    const acts = [
      makeGatedWalk({ startDate: '2026-07-20T05:00:00Z', startDateLocal: '2026-07-20T05:00:00' }),
      makeGatedWalk({ startDate: '2026-07-20T12:00:00Z', startDateLocal: '2026-07-20T12:00:00' }),
      makeGatedWalk({ startDate: '2026-07-20T18:00:00Z', startDateLocal: '2026-07-20T18:00:00' }),
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.actual).toContain('1회')
  })

  it('서로 다른 날 2회면 weekly_count=2 충족', () => {
    const cond: BadgeCondition = { activity_type: 'walking', weekly_count: 2 }
    const acts = [
      makeGatedWalk({ startDate: '2026-07-20T05:00:00Z', startDateLocal: '2026-07-20T05:00:00' }), // 월
      makeGatedWalk({ startDate: '2026-07-21T05:00:00Z', startDateLocal: '2026-07-21T05:00:00' }), // 화
    ]
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. 버그 회귀 테스트 (TEAM_FINDINGS.md "버그 발견 및 수정" 섹션)
// ═══════════════════════════════════════════════════════════════════════

// getProgressionKey는 badge-engine/index.ts 내부(비공개) 함수라 evaluateBadgesDetailed를
// 통해 간접 검증한다. DB 접근(createServiceClient/getActivityHistory)은 모두 모킹한다.

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => mockSupabase(),
}))

vi.mock('@/lib/strava/activity-history', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/strava/activity-history')>()
  return {
    ...actual,
    getActivityHistory: vi.fn(async () => []),
  }
})

vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => true) }))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))

/** 테스트 전용 초경량 supabase 체인 모킹 — dryRun:true 경로만 사용하므로
 *  badges/user_activity_badges/users 조회만 지원하면 충분하다. */
let mockBadges: BadgeRow[] = []
function mockSupabase() {
  const chain = (table: string) => {
    const builder: Record<string, unknown> = {}
    const self = () => builder
    builder.select = self
    builder.eq = self
    builder.is = self
    builder.or = self
    builder.order = self
    builder.maybeSingle = () =>
      Promise.resolve(
        table === 'users' ? { data: { initial_sync_done: true }, error: null } : { data: null, error: null }
      )
    // supabase-js 쿼리 빌더는 thenable — await 시 many-row 결과로 해석
    builder.then = (resolve: (v: unknown) => void) => {
      if (table === 'badges') return Promise.resolve({ data: mockBadges, error: null }).then(resolve)
      if (table === 'user_activity_badges') return Promise.resolve({ data: [], error: null }).then(resolve)
      return Promise.resolve({ data: [], error: null }).then(resolve)
    }
    return builder
  }
  return { from: (table: string) => chain(table) }
}

function makeBadge(overrides: Partial<BadgeRow>): BadgeRow {
  return {
    id: `badge-${Math.random()}`,
    name: 'Test Badge',
    description: '',
    type: 'activity',
    rarity: 'common',
    image_url: null,
    condition_json: {},
    activity_types: ['walking'],
    patch_available: false,
    patch_price_krw: null,
    faction_id: null,
    item_book_id: null,
    drop_weight: 0,
    drop_condition_json: null,
    valid_from: null,
    valid_until: null,
    point_reward: 0,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
    background_color: null,
    background_shader_id: null,
    background_image_url: null,
    background_video_url: null,
    ...overrides,
  }
}

describe('버그 회귀 — getProgressionKey 크로스배지 충돌 (T01~T04)', () => {
  it('activity_type+total_count만 같고 이름이 다른 배지 4개가 전부 개별 발급된다', async () => {
    mockBadges = [
      makeBadge({ id: 'T01', name: '숫자의 노예', rarity: 'common', condition_json: { activity_type: 'walking', total_count: 5 } }),
      makeBadge({ id: 'T02', name: '그냥 좀 걸었을 뿐', rarity: 'common', condition_json: { activity_type: 'walking', total_count: 10 } }),
      makeBadge({ id: 'T03', name: '만보왕', rarity: 'rare', condition_json: { activity_type: 'walking', total_count: 15 } }),
      makeBadge({ id: 'T04', name: '걸음의 구도자', rarity: 'legend', condition_json: { activity_type: 'walking', total_count: 20 } }),
    ]
    // 4개 배지의 최댓값(20)을 넘는 걷기 활동 25건 생성 (하루 상한 미적용 조건이므로 같은 날짜라도 무방하나
    // 명확성을 위해 날짜를 분산)
    const acts = Array.from({ length: 25 }, (_, i) =>
      makeGatedWalk({ startDate: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T05:00:00Z` })
    )

    const { earned, missed } = await evaluateBadgesDetailed('test-user', acts, { dryRun: true })

    const earnedNames = earned.map((b) => b.name)
    expect(earnedNames).toContain('숫자의 노예')
    expect(earnedNames).toContain('그냥 좀 걸었을 뿐')
    expect(earnedNames).toContain('만보왕')
    expect(earnedNames).toContain('걸음의 구도자')
    expect(earned.length).toBe(4)
    // 조용히 사라지면 안 됨 — missed에도 없어야(발급됐으니) 정상
    const missedNames = missed.map((b) => b.name)
    for (const n of ['숫자의 노예', '그냥 좀 걸었을 뿐', '만보왕', '걸음의 구도자']) {
      expect(missedNames).not.toContain(n)
    }
  })
})

describe('버그 회귀 — T23(그냥 나갔다 옴)이 W1과 트랙 충돌로 묻히지 않는다', () => {
  it('activity_type+distance_km 트랙이 같아도 두 독립 배지가 모두 발급된다', async () => {
    mockBadges = [
      makeBadge({ id: 'W1', name: '동네 산책러', rarity: 'common', condition_json: { activity_type: 'walking', distance_km: 5 } }),
      makeBadge({ id: 'T23', name: '그냥 나갔다 옴', rarity: 'legend', condition_json: { activity_type: 'walking', distance_km: 0.6 } }),
    ]
    const acts = [makeGatedWalk({ distanceKm: 10, movingTimeSec: 120 * 60, averageSpeedKmh: 5 })]

    const { earned } = await evaluateBadgesDetailed('test-user', acts, { dryRun: true })
    const earnedNames = earned.map((b) => b.name)
    expect(earnedNames).toContain('동네 산책러')
    expect(earnedNames).toContain('그냥 나갔다 옴')
    expect(earned.length).toBe(2)
  })
})

// ── T12 (폭염 33도+ 5회) — temperature_min_c + total_count 누수 회귀 ────────
// evaluateConditionDetailed 레벨에서 직접 검증 (DB 모킹 불필요)

describe('버그 회귀 — temperature_min_c + total_count 누수 (T12)', () => {
  it('33도+ 활동 4회 + 20도 활동 1회로는 실패해야 한다 (온도 미달 활동이 total_count를 채우면 안 됨)', () => {
    const cond: BadgeCondition = { activity_type: 'walking', temperature_min_c: 33, total_count: 5 }
    const acts = [
      makeGatedWalk({ weatherTempC: 34 }),
      makeGatedWalk({ weatherTempC: 35 }),
      makeGatedWalk({ weatherTempC: 33 }),
      makeGatedWalk({ weatherTempC: 36 }),
      makeGatedWalk({ weatherTempC: 20 }), // 온도 미달 — 카운트에서 제외되어야 함
    ]
    const result = evaluateConditionDetailed(cond, acts)
    expect(result.pass).toBe(false)
    expect(result.reason).toContain('활동 횟수 부족')
  })

  it('33도+ 활동이 5회 모두 충족되면 pass', () => {
    const cond: BadgeCondition = { activity_type: 'walking', temperature_min_c: 33, total_count: 5 }
    const acts = Array.from({ length: 5 }, () => makeGatedWalk({ weatherTempC: 34 }))
    expect(evaluateConditionDetailed(cond, acts).pass).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 8. 드랍엔진 걷기 가중치 — rollBonusDrop activityWeight
// ═══════════════════════════════════════════════════════════════════════

describe('rollBonusDrop — activity_type 가중치', () => {
  const P = DEFAULT_DROP_POLICY
  const seq = (...values: number[]) => {
    let i = 0
    return () => values[Math.min(i++, values.length - 1)]
  }

  it('activityWeight 생략 시 기존 동작(1.0)과 동일 — 기본 15% 경계', () => {
    expect(rollBonusDrop(P, false, seq(0.1))).toBe(true) // 0.1 < 0.15
    expect(rollBonusDrop(P, false, seq(0.2))).toBe(false) // 0.2 >= 0.15
  })

  it('activityWeight=0.4 적용 시 유효 확률이 0.15*0.4=0.06으로 감쇠', () => {
    expect(rollBonusDrop(P, false, seq(0.05), 0.4)).toBe(true) // 0.05 < 0.06
    expect(rollBonusDrop(P, false, seq(0.1), 0.4)).toBe(false) // 0.1 >= 0.06 (가중치 없으면 true였을 값)
  })

  it('고강도 활동 + activityWeight=0.4 — 0.3*0.4=0.12로 감쇠', () => {
    expect(rollBonusDrop(P, true, seq(0.1), 0.4)).toBe(true) // 0.1 < 0.12
    expect(rollBonusDrop(P, true, seq(0.2), 0.4)).toBe(false) // 0.2 >= 0.12 (가중치 없으면 true였을 값)
  })

  it('activityWeight=1.0을 명시해도 기본값과 동일하게 동작 (하위호환)', () => {
    expect(rollBonusDrop(P, false, seq(0.1), 1.0)).toBe(rollBonusDrop(P, false, seq(0.1)))
    expect(rollBonusDrop(P, false, seq(0.2), 1.0)).toBe(rollBonusDrop(P, false, seq(0.2)))
  })
})
