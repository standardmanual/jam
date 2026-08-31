/**
 * strava/sync — 차량 속도 필터 임계값 조회 회귀 테스트 (티켓 20260831_1300)
 *
 * 배경: `processFetchedActivities`가 `abusing_policy.vehicle_speed_filter_kmh`를
 * 정식 로더 `getAbusingPolicy()`를 **우회해 직접 select**했고, 그 조회에 결함이 세 가지 겹쳤다.
 * 1. truthy 검사라 임계값 `0`이 falsy로 떨어져 하드코딩 기본값 60이 **조용히** 적용됐다.
 * 2. 반환 `error`를 구조분해조차 하지 않아 조회 실패도 무음으로 60이 됐다.
 * 3. 정식 경로의 NUMERIC 정규화·관측·`id = 1` 조건이 이 경로엔 하나도 적용되지 않았다.
 *
 * 이 필터가 만든 `activitiesFiltered`는 배지 평가만이 아니라 아이템 드랍·미션까지 흘러가므로,
 * 임계값이 틀리면 핵심 보상 루프 전체가 멈춘다. 따라서 아래를 고정한다.
 * - DB 값이 실제로 필터에 쓰인다 (하드코딩 60이 아니다)
 * - 임계값이 degenerate(`<= 0`)여도 무음이 아니라 로그를 남기고 기본값으로 폴백한다
 * - 정책 조회가 실패해도 로그를 남기고 기본값으로 폴백한다
 * - 정책 조회에 **주입된 supabase 클라이언트**를 쓴다 (`createServiceClient()`를 새로 만들지 않는다)
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-vehicle-speed-filter.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity, NormalizedActivity } from '@/types/strava'

const stub = vi.hoisted(() => ({
  /** abusing_policy 조회가 돌려줄 행 (null이면 행 없음) */
  policyRow: null as Record<string, unknown> | null,
  /** abusing_policy 조회가 돌려줄 에러 */
  policyError: null as { code: string; message: string } | null,
  /** createServiceClient 호출 횟수 — 주입 사슬이 끊겼는지 감시한다 */
  serviceClientCalls: 0,
}))

// 주입된 클라이언트를 쓰지 않고 새 service_role 클라이언트를 만들면 즉시 드러나도록 던진다.
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    stub.serviceClientCalls++
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))

vi.mock('@/lib/drop-engine/index', () => ({ tryItemDrop: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))
vi.mock('@/lib/poi/matcher', () => ({ matchPoisForActivity: vi.fn(async () => []) }))
vi.mock('@/lib/itembook/checker', () => ({
  checkItemBookCompletion: vi.fn(async () => ({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })),
}))
// sync-drop-order.test.ts가 상시 red인 원인(내부에서 createServiceClient 호출)을 여기서는 모킹으로 차단한다
vi.mock('@/lib/itembook/completable', () => ({ findCompletableItemBooks: vi.fn(async () => []) }))
vi.mock('@/lib/missions/checker', () => ({
  checkMissions: vi.fn(async () => ({ completedMissionIds: [], awardedBadgeIds: [] })),
}))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async () => {}),
  dailyGroupKey: vi.fn(() => 'group-key'),
}))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/batch/collections', () => ({ selectCompletableDrafts: vi.fn(() => []) }))
vi.mock('@/lib/strava/api', () => ({
  getActivityStreams: vi.fn(async () => null),
  getActivities: vi.fn(),
  refreshStravaToken: vi.fn(),
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))

import { processFetchedActivities } from '../sync'
import { evaluateBadges } from '@/lib/badge-engine/index'
import { tryItemDrop } from '@/lib/drop-engine/index'
import { checkMissions } from '@/lib/missions/checker'
import { DEFAULT_POLICY } from '@/lib/abusing/policy'

/** 마이그레이션 115 적용 후의 `abusing_policy` 행 */
const POLICY_ROW: Record<string, unknown> = {
  id: 1,
  soft_common_rate: 1.0,
  soft_rare_rate: 1.0,
  soft_epic_rate: 1.0,
  soft_mystic_rate: 0.0,
  hard_common_rate: 1.0,
  hard_rare_rate: 0.0,
  hard_epic_rate: 1.0,
  hard_mystic_rate: 0.0,
  gps_max_speed_kmh: 300,
  poi_block_hours: 72,
  vehicle_speed_filter_kmh: 60,
  gps_daily_distance_cap_km: 3000,
  updated_at: '2026-08-31T03:48:29+00:00',
}

/** km/h → m/s (Strava의 average_speed 단위) */
const kmhToMps = (kmh: number) => kmh / 3.6

function makeRawActivity(id: number, averageSpeedKmh: number): StravaSummaryActivity {
  return {
    id,
    resource_state: 2,
    name: `Activity ${id}`,
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1800,
    total_elevation_gain: 20,
    type: 'Ride',
    sport_type: 'Ride',
    start_date: `2026-08-0${id}T00:00:00Z`,
    start_date_local: `2026-08-0${id}T09:00:00`,
    timezone: '(GMT+09:00) Asia/Seoul',
    utc_offset: 32400,
    location_city: null,
    location_state: null,
    location_country: null,
    achievement_count: 0,
    kudos_count: 0,
    comment_count: 0,
    athlete_count: 1,
    photo_count: 0,
    map: { id: `m${id}`, summary_polyline: null, resource_state: 2 },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: null,
    start_latlng: [],
    end_latlng: [],
    average_speed: kmhToMps(averageSpeedKmh),
    max_speed: kmhToMps(averageSpeedKmh) * 1.2,
    has_heartrate: false,
    heartrate_opt_out: false,
    display_hide_heartrate_option: false,
    upload_id: null,
    upload_id_str: null,
    external_id: null,
    pr_count: 0,
    total_photo_count: 0,
    has_kudoed: false,
    workout_type: null,
    suffer_score: null,
  }
}

/** processFetchedActivities가 실제로 조회하는 테이블만 응답하는 최소 스텁 */
function makeFakeSupabase(): SupabaseClient {
  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      limit: () => builder,
      single: async () => {
        if (table === 'abusing_policy') {
          return { data: stub.policyRow, error: stub.policyError }
        }
        return { data: null, error: null }
      },
      maybeSingle: async () => ({ data: null, error: null }),
      upsert: async () => ({ error: null }),
      insert: async () => ({ error: null }),
      then: undefined,
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

/** evaluateBadges에 실제로 넘어간(=필터를 통과한) 활동의 strava_id 목록 */
function filteredIdsPassedToBadgeEngine(): number[] {
  const call = vi.mocked(evaluateBadges).mock.calls[0]
  if (!call) return []
  return (call[1] as NormalizedActivity[]).map((a) => a.stravaId)
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  stub.policyRow = { ...POLICY_ROW }
  stub.policyError = null
  stub.serviceClientCalls = 0
  vi.clearAllMocks()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('processFetchedActivities — 차량 속도 필터 임계값', () => {
  it('DB에 저장된 임계값을 그대로 적용한다 (하드코딩 60이 아니다)', async () => {
    stub.policyRow = { ...POLICY_ROW, vehicle_speed_filter_kmh: 25 }
    const slow = makeRawActivity(1, 10) // 통과
    const fast = makeRawActivity(2, 30) // 25km/h 초과 → 제외

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [slow, fast], false, 'sync')

    expect(filteredIdsPassedToBadgeEngine()).toEqual([slow.id])
    // 드랍·미션도 같은 필터 결과를 쓴다 — 임계값이 틀리면 보상 루프 전체가 어긋난다
    expect(vi.mocked(tryItemDrop).mock.calls.map((c) => (c[1] as NormalizedActivity).stravaId)).toEqual([slow.id])
    expect((vi.mocked(checkMissions).mock.calls[0][1] as NormalizedActivity[]).map((a) => a.stravaId)).toEqual([slow.id])
  })

  it('NUMERIC이 문자열로 내려와도 숫자 임계값으로 적용한다', async () => {
    stub.policyRow = { ...POLICY_ROW, vehicle_speed_filter_kmh: '25' }
    const slow = makeRawActivity(1, 10)
    const fast = makeRawActivity(2, 30)

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [slow, fast], false, 'sync')

    // 문자열 '25'가 그대로 비교에 쓰이면 '10' <= '25' 같은 사전식 비교로 결과가 뒤틀린다
    expect(filteredIdsPassedToBadgeEngine()).toEqual([slow.id])
  })

  it('임계값 0을 무음으로 60으로 둔갑시키지 않는다 — 로그를 남기고 기본값으로 폴백한다', async () => {
    stub.policyRow = { ...POLICY_ROW, vehicle_speed_filter_kmh: 0 }
    const activity = makeRawActivity(1, 10)

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [activity], false, 'sync')

    // 폴백 방향은 "핵심 루프를 살리는 쪽" — 0을 그대로 쓰면 모든 활동이 탈락한다
    expect(filteredIdsPassedToBadgeEngine()).toEqual([activity.id])
    const logged = errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')
    expect(logged).toContain('vehicle_speed_filter_kmh')
    expect(logged).toContain(String(DEFAULT_POLICY.vehicle_speed_filter_kmh))
  })

  it('임계값이 음수여도 로그를 남기고 기본값으로 폴백한다', async () => {
    stub.policyRow = { ...POLICY_ROW, vehicle_speed_filter_kmh: -10 }
    const activity = makeRawActivity(1, 10)

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [activity], false, 'sync')

    expect(filteredIdsPassedToBadgeEngine()).toEqual([activity.id])
    expect(errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')).toContain('vehicle_speed_filter_kmh')
  })

  it('정책 조회가 실패하면 로그를 남기고 기본 임계값(60)으로 폴백한다', async () => {
    stub.policyError = { code: 'PGRST116', message: 'no rows' }
    stub.policyRow = null
    const slow = makeRawActivity(1, 10) // 60 이하 → 통과
    const fast = makeRawActivity(2, 90) // 60 초과 → 제외

    await processFetchedActivities(makeFakeSupabase(), 'user-1', 'token', [slow, fast], false, 'sync')

    expect(filteredIdsPassedToBadgeEngine()).toEqual([slow.id])
    // 우회 조회 시절에는 error를 구조분해조차 하지 않아 실패가 무음이었다
    expect(errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n')).toContain('[abusing-policy]')
  })

  it('정책 조회에 주입된 supabase 클라이언트를 쓴다', async () => {
    await processFetchedActivities(
      makeFakeSupabase(),
      'user-1',
      'token',
      [makeRawActivity(1, 10)],
      false,
      'sync'
    )
    expect(stub.serviceClientCalls).toBe(0)
  })
})
