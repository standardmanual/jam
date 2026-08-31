/**
 * strava/sync — processFetchedActivities() 드랍 처리 순서 회귀 테스트
 *
 * 배경: dropTargets(드랍 대상으로 "선정"된 최신 N건)를 tryItemDrop에 넘기는 "처리 순서"가
 * 내림차순(최신 우선)이면, tryItemDrop이 호출마다 user_drop_state를 새로 읽고 저장하는
 * 특성상 배치의 마지막 호출(=배치 내 가장 오래된 활동)의 결과가 최종 저장돼 버려
 * last_activity_at이 실제 최신 활동을 반영하지 못하는 버그가 있었다
 * (2026-08-11 점검 티켓 20260811_009). 오름차순(오래된 → 최신) 처리로 수정한 뒤,
 * 서로 다른 시각의 활동 여러 건을 한 배치로 넣었을 때 최종 저장된
 * user_drop_state.last_activity_at이 항상 배치 내 가장 최신 활동과 일치하는지 검증한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-drop-order.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity } from '@/types/strava'

// ── 드랍엔진 tryItemDrop 시뮬레이션 ──────────────────────────────────────
// 실제 tryItemDrop은 호출마다 user_drop_state를 DB에서 읽고 다시 저장한다.
// "마지막으로 호출된 활동의 값이 최종 저장된다"는 핵심 동작만 재현해,
// processFetchedActivities가 tryItemDrop을 넘기는 "순서"가 최종 저장 결과에
// 미치는 영향을 검증한다.
const dropState = vi.hoisted(() => ({ current: null as string | null }))

// 20260824_006 — 실제 tryItemDrop은 startDate(진짜 UTC)만 쓰도록 고쳤다(startDateLocal은
// 로컬 벽시계에 Z를 붙인 값이라 timestamptz 오해석 버그의 원인이었다). 이 모킹도 동일하게
// 맞춰야 sync.ts의 last_activity_at 불일치 가드(같은 기준으로 함께 고쳤다)와 어긋나지 않는다.
vi.mock('@/lib/drop-engine/index', () => ({
  tryItemDrop: vi.fn(async (_userId: string, activity: { startDateLocal?: string; startDate: string }) => {
    dropState.current = activity.startDate
    return []
  }),
}))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))
vi.mock('@/lib/poi/matcher', () => ({ matchPoisForActivity: vi.fn(async () => []) }))
vi.mock('@/lib/itembook/checker', () => ({
  checkItemBookCompletion: vi.fn(async () => ({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })),
}))
vi.mock('@/lib/missions/checker', () => ({
  checkMissions: vi.fn(async () => ({ completedMissionIds: [], awardedBadgeIds: [] })),
}))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/strava/api', () => ({
  getActivityStreams: vi.fn(async () => null),
  getActivities: vi.fn(),
  refreshStravaToken: vi.fn(),
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))

import { processFetchedActivities } from '../sync'
import { logEngineDecision } from '@/lib/engine-log'

// ── 픽스처 ──────────────────────────────────────────────────────────────

function makeRawActivity(overrides: Partial<StravaSummaryActivity> = {}): StravaSummaryActivity {
  return {
    id: Math.floor(Math.random() * 1_000_000_000),
    resource_state: 2,
    name: 'Test Run',
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1800,
    total_elevation_gain: 20,
    type: 'Run',
    sport_type: 'Run',
    start_date: '2026-08-01T00:00:00Z',
    start_date_local: '2026-08-01T09:00:00',
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
    map: { id: 'm1', summary_polyline: null, resource_state: 2 },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: null,
    start_latlng: [],
    end_latlng: [],
    average_speed: 2.7, // ≈ 9.7km/h — 차량 속도 필터(기본 60km/h) 통과
    max_speed: 3.5,
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
    ...overrides,
  }
}

/** `abusing_policy` 행 (id=1, 2026-08-31 운영값) */
const ABUSING_POLICY_ROW: Record<string, unknown> = {
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

/** 최소한의 supabase 클라이언트 스텁 — processFetchedActivities가 실제 조회하는
 * abusing_policy / strava_activities / user_drop_state(신규 가드) 테이블만 응답한다. */
function makeFakeSupabase(): SupabaseClient {
  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      limit: () => builder,
      single: async () => {
        if (table === 'abusing_policy') {
          // 20260831_1300 — sync.ts가 정식 로더 getAbusingPolicy()로 `select('*')`을 하므로
          // 행 전체를 돌려준다 (일부 키만 주면 로더가 기본값 폴백 로그를 남긴다)
          return { data: { ...ABUSING_POLICY_ROW }, error: null }
        }
        return { data: null, error: null }
      },
      maybeSingle: async () => {
        if (table === 'user_drop_state') {
          return {
            data: dropState.current !== null ? { last_activity_at: dropState.current } : null,
            error: null,
          }
        }
        return { data: null, error: null }
      },
      upsert: async () => ({ error: null }),
      insert: async () => ({ error: null }),
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

describe('processFetchedActivities — 드랍 처리 순서와 last_activity_at 최종 상태', () => {
  beforeEach(() => {
    dropState.current = null
    vi.clearAllMocks()
  })

  it('시각이 다른 활동 3건을 뒤섞어 넣어도 최종 last_activity_at은 가장 최신 활동과 일치한다', async () => {
    const oldest = makeRawActivity({
      id: 1,
      start_date: '2026-07-20T00:00:00Z',
      start_date_local: '2026-07-20T09:00:00',
    })
    const middle = makeRawActivity({
      id: 2,
      start_date: '2026-07-25T00:00:00Z',
      start_date_local: '2026-07-25T09:00:00',
    })
    const newest = makeRawActivity({
      id: 3,
      start_date: '2026-08-01T00:00:00Z',
      start_date_local: '2026-08-01T09:00:00',
    })

    // 입력 순서를 일부러 뒤섞음(최신 → 중간 → 오래된) — 처리 순서는 sync.ts 내부에서
    // 다시 정렬되어야 하므로 입력 순서에 의존하지 않아야 한다.
    const rawActivities = [newest, oldest, middle]

    const result = await processFetchedActivities(
      makeFakeSupabase(),
      'user-1',
      'fake-access-token',
      rawActivities,
      false,
      'sync'
    )

    expect(result).toBeDefined()
    expect(dropState.current).toBe(newest.start_date)
    // 순서가 정상이면(가드 통과) 불일치 경고 로그가 남지 않는다.
    expect(logEngineDecision).not.toHaveBeenCalledWith(
      'drop',
      'drop_state_last_activity_mismatch',
      expect.anything(),
      expect.anything()
    )
  })

  it('활동 2건 — 최신 활동이 최종 상태에 반영된다', async () => {
    const older = makeRawActivity({
      id: 10,
      start_date: '2026-08-05T00:00:00Z',
      start_date_local: '2026-08-05T09:00:00',
    })
    const newer = makeRawActivity({
      id: 11,
      start_date: '2026-08-09T00:00:00Z',
      start_date_local: '2026-08-09T09:00:00',
    })

    await processFetchedActivities(
      makeFakeSupabase(),
      'user-2',
      'fake-access-token',
      [older, newer],
      false,
      'sync'
    )

    expect(dropState.current).toBe(newer.start_date)
  })
})
