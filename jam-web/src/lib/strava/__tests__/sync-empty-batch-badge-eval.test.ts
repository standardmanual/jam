/**
 * strava/sync — 새 활동 0건이어도 배지 평가는 항상 실행한다 (티켓 20260906_1430)
 *
 * 배경: 배지 평가는 원래 「새 활동이 1건 이상 동기화될 때」에만 실행됐다. 실제로는
 * 두 지점이 겹쳐서 막고 있었다.
 *   ① `processFetchedActivities` 최상단의 `rawActivities.length === 0` 이른 반환 —
 *      Strava가 새 활동을 하나도 돌려주지 않으면 함수 전체(POI 매칭·드랍·아이템북·미션·
 *      배지 평가)가 통째로 스킵된다. 실제 프로덕션 사고(jamfather, 티켓 20260906_1426)의
 *      진원지가 이쪽이다 — `engine_decision_log`에 `sync_result`가 한 건도 안 남았다.
 *   ② 그 아래 "일반 배지 엔진 호출" 지점의 `activitiesFiltered.length > 0` 삼항 게이트 —
 *      새 활동은 있었지만 차량 속도 필터로 전부 걸러진 경우.
 *
 * evaluateBadgesDetailed는 내부에서 이력 전체(getActivityHistory)를 다시 읽으므로, 빈
 * 배치를 넘겨도 "카탈로그가 늘어난 뒤 조건은 충족인데 미발급"인 배지를 잡아낼 수 있다
 * (badge-engine-v5.test.ts가 이미 evaluateBadgesDetailed(USER_ID, [], ...) 형태로 이
 * 계약을 광범위하게 검증한다). 이 파일은 그 위에서 "sync.ts가 실제로 그 호출을
 * 빼먹지 않는지"만 계약으로 고정한다.
 *
 * 드랍(tryItemDrop)·미션(checkMissions)은 "활동 1건마다 시도"가 전제라 이번 티켓
 * 대상이 아니다 — 새 활동 0건에서는 여전히 건드리지 않아야 한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-empty-batch-badge-eval.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity } from '@/types/strava'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))

const { dropSpy, missionsSpy, evaluateBadgesSpy, recordActivityRecapSpy } = vi.hoisted(() => ({
  dropSpy: vi.fn(async () => []),
  missionsSpy: vi.fn(async () => ({ completedMissionIds: [], awardedBadgeIds: [] })),
  evaluateBadgesSpy: vi.fn(async () => [] as string[]),
  recordActivityRecapSpy: vi.fn(async () => {}),
}))

vi.mock('@/lib/drop-engine/index', () => ({ tryItemDrop: dropSpy }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: evaluateBadgesSpy }))
vi.mock('@/lib/poi/matcher', () => ({ matchPoisForActivity: vi.fn(async () => []) }))
vi.mock('@/lib/itembook/checker', () => ({
  checkItemBookCompletion: vi.fn(async () => ({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })),
}))
vi.mock('@/lib/itembook/completable', () => ({ findCompletableItemBooks: vi.fn(async () => []) }))
vi.mock('@/lib/missions/checker', () => ({ checkMissions: missionsSpy }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async () => {}),
  dailyGroupKey: vi.fn(() => 'group-key'),
}))
vi.mock('@/lib/notifications/recap', () => ({ recordActivityRecap: recordActivityRecapSpy }))
vi.mock('@/lib/notifications/batch/collections', () => ({ selectCompletableDrafts: vi.fn(() => []) }))
vi.mock('@/lib/strava/api', () => ({
  getActivityStreams: vi.fn(async () => null),
  getActivities: vi.fn(),
  refreshStravaToken: vi.fn(),
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))

import { processFetchedActivities } from '../sync'

/** `badges` 테이블 조회(notifyActivityBadgesEarned)까지 지원하는 최소 페이크 supabase */
function makeFakeSupabase(badgeRows: { id: string; name: string; rarity: string }[]): SupabaseClient {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      limit: () => builder,
      order: () => builder,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      upsert: async () => ({ error: null }),
      insert: async () => ({ error: null }),
      then(
        onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
        onRejected?: (e: unknown) => unknown
      ) {
        const payload =
          table === 'badges' ? { data: badgeRows, error: null } : { data: null, error: null }
        return Promise.resolve(payload).then(onFulfilled, onRejected)
      },
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

function makeRawActivity(id: number): StravaSummaryActivity {
  return {
    id,
    resource_state: 2,
    name: `Run ${id}`,
    distance: 5000,
    moving_time: 1800,
    elapsed_time: 1800,
    total_elevation_gain: 20,
    type: 'Run',
    sport_type: 'Run',
    start_date: '2026-09-01T00:00:00Z',
    start_date_local: '2026-09-01T09:00:00',
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
    average_speed: 2.7,
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
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('processFetchedActivities — 새 활동 0건이어도 배지 평가는 실행된다', () => {
  it('rawActivities가 빈 배열이면 evaluateBadges를 빈 배열로 호출한다 (이른 반환에 막히지 않는다)', async () => {
    evaluateBadgesSpy.mockResolvedValueOnce([])
    const supabase = makeFakeSupabase([])

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [], false, 'sync')

    expect(evaluateBadgesSpy).toHaveBeenCalledTimes(1)
    expect(evaluateBadgesSpy).toHaveBeenCalledWith('user-1', [])
    expect(result).toEqual({
      badges: 0,
      itemBooksCompleted: 0,
      missionsCompleted: 0,
      earnedBadgeIds: [],
      completedMissionIds: [],
    })
  })

  it('rawActivities가 빈 배열이어도 evaluateBadges가 미발급 배지를 돌려주면 그대로 발급 결과에 실린다', async () => {
    evaluateBadgesSpy.mockResolvedValueOnce(['badge-common-1'])
    const supabase = makeFakeSupabase([{ id: 'badge-common-1', name: '테스트배지', rarity: 'common' }])

    const result = await processFetchedActivities(supabase, 'user-1', 'token', [], false, 'sync')

    expect(result.badges).toBe(1)
    expect(result.earnedBadgeIds).toEqual(['badge-common-1'])
    // 결산 소식(recap)에도 실린다 — 유저가 화면에서 확인할 수 있어야 한다
    expect(recordActivityRecapSpy).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        activity_badges: [{ id: 'badge-common-1', name: '테스트배지', rarity: 'common' }],
      })
    )
  })

  it('rawActivities가 빈 배열이면 드랍(tryItemDrop)·미션(checkMissions)은 여전히 건드리지 않는다', async () => {
    evaluateBadgesSpy.mockResolvedValueOnce(['badge-common-1'])
    const supabase = makeFakeSupabase([{ id: 'badge-common-1', name: '테스트배지', rarity: 'common' }])

    await processFetchedActivities(supabase, 'user-1', 'token', [], false, 'sync')

    expect(dropSpy).not.toHaveBeenCalled()
    expect(missionsSpy).not.toHaveBeenCalled()
  })

  it('활동은 있었지만 전부 필터로 걸러져도(activitiesFiltered=0) evaluateBadges는 실행된다', async () => {
    // vehicle_speed_filter_kmh 기본값(60km/h)보다 훨씬 빠른 평균 속도 → 필터 탈락
    const fast = { ...makeRawActivity(1), average_speed: 50 } // 180km/h
    evaluateBadgesSpy.mockResolvedValueOnce([])
    const supabase = makeFakeSupabase([])
    // abusing_policy 조회를 위한 single() 스텁 보강
    const from = supabase.from.bind(supabase)
    supabase.from = ((table: string) => {
      const builder = from(table) as unknown as Record<string, unknown>
      if (table === 'abusing_policy') {
        builder.single = async () => ({
          data: {
            id: 1,
            soft_common_rate: 1,
            soft_rare_rate: 1,
            soft_epic_rate: 1,
            soft_mystic_rate: 0,
            hard_common_rate: 1,
            hard_rare_rate: 0,
            hard_epic_rate: 1,
            hard_mystic_rate: 0,
            gps_max_speed_kmh: 300,
            poi_block_hours: 72,
            vehicle_speed_filter_kmh: 60,
            gps_daily_distance_cap_km: 3000,
            transit_walk_max_speed_kmh: 20,
            transit_run_max_speed_kmh: 27,
            transit_cycling_max_speed_kmh: 55,
            transit_segment_min_duration_sec: 30,
            updated_at: '2026-08-31T03:48:29+00:00',
          },
          error: null,
        })
      }
      return builder
    }) as unknown as typeof supabase.from

    await processFetchedActivities(supabase, 'user-1', 'token', [fast], false, 'sync')

    expect(evaluateBadgesSpy).toHaveBeenCalledTimes(1)
    expect(evaluateBadgesSpy).toHaveBeenCalledWith('user-1', [])
    // 필터로 걸러진 활동은 드랍 대상에도 들지 않는다 — 게이트 유지 확인
    expect(dropSpy).not.toHaveBeenCalled()
  })
})
