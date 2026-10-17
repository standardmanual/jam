/**
 * strava/sync — 인정 활동 입구 필터와 처리 순서 (티켓 20261017_1421, 운영 로직 3.3·3.4절)
 *
 * 고정하는 것:
 * - 인정 기준을 못 갖춘 활동(가상·종목 밖·수동·파일 업로드·경로 없음·10분 미만)은 체크인·드랍·배지·미션·
 *   Streams 조회 어디에도 들어가지 않고, 사유(`filter_reason`)와 함께 기록만 된다.
 * - 체크인은 어뷰징 필터(차량 속도) **뒤**에 돈다 — 차량 속도로 걸러진 활동은 체크인 배지를 받지 못한다.
 * - 첫 동기화는 인정 활동 가운데 가장 최근 1건만 정산하고, 인정 활동이 없으면 첫 동기화를 마치지 않는다.
 *
 * 실제 Strava·공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-qualification.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaSummaryActivity, NormalizedActivity } from '@/types/strava'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/drop-engine/index', () => ({ tryItemDrop: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/jamActionBadges', () => ({ evaluateJamActionBadges: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/usageBadges', () => ({
  recordDailySyncAndEvaluate: vi.fn(async () => []),
  evaluateCheckinUsageBadges: vi.fn(async () => []),
}))
vi.mock('@/lib/itembook/checker', () => ({
  checkItemBookCompletion: vi.fn(async () => ({ completedIds: [], rewardBadgesIssued: 0, rewardBadgeIds: [] })),
}))
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
  getActivityStreams: vi.fn(async () => ({ route: [[37.5, 127.0]], velocitySmooth: [], time: [] })),
  getAllActivities: vi.fn(),
  refreshStravaToken: vi.fn(),
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))
vi.mock('@/lib/poi/matcher', () => ({
  matchPoisForActivity: vi.fn(async () => [{ id: 'poi-1', name: '북한산', linked_badge_id: 'badge-1' }]),
}))

import { processFetchedActivities } from '../sync'
import { evaluateBadges } from '@/lib/badge-engine/index'
import { tryItemDrop } from '@/lib/drop-engine/index'
import { checkMissions } from '@/lib/missions/checker'
import { matchPoisForActivity } from '@/lib/poi/matcher'
import { getActivityStreams } from '@/lib/strava/api'

/** upsert로 들어간 strava_activities 행과 insert된 행을 모은다 */
interface Captured {
  upsertedRows: Record<string, unknown>[]
  inserts: { table: string; payload: Record<string, unknown> }[]
}

function makeFakeSupabase(captured: Captured): SupabaseClient {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {
      select: (_cols?: string, selectOpts?: { count?: string; head?: boolean }) => {
        if (table === 'user_checkin_badge_earns' && selectOpts?.head) {
          const chain = {
            eq: () => chain,
            then: (onFulfilled: (v: { count: number; error: null }) => unknown) =>
              Promise.resolve({ count: 0, error: null }).then(onFulfilled),
          }
          return chain
        }
        return builder
      },
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      upsert: async (rows: Record<string, unknown>[]) => {
        if (table === 'strava_activities') captured.upsertedRows.push(...rows)
        return { error: null }
      },
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      insert: async (payload: Record<string, unknown>) => {
        captured.inserts.push({ table, payload })
        return { error: null }
      },
      then(onFulfilled: (v: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) {
        if (table === 'badges') {
          return Promise.resolve({
            data: [{ id: 'badge-1', type: 'checkin', name: '북한산 체크인', image_url: null, rarity: 'common', category: null }],
            error: null,
          }).then(onFulfilled, onRejected)
        }
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
      },
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

/** 인정 기준을 모두 갖춘 활동(기본값). 필요한 칸만 덮어써서 한 기준씩 깬다 */
function makeRaw(id: number, overrides: Partial<StravaSummaryActivity> = {}): StravaSummaryActivity {
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
    start_date: `2026-09-${String(10 + id).padStart(2, '0')}T00:00:00Z`,
    start_date_local: `2026-09-${String(10 + id).padStart(2, '0')}T09:00:00`,
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
    map: { id: `m${id}`, summary_polyline: 'SECRET-ENCODED-POLYLINE', resource_state: 2 },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: null,
    start_latlng: [37.5123, 127.0456],
    end_latlng: [],
    average_speed: 2.7, // 약 9.7km/h
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

let captured: Captured

beforeEach(() => {
  vi.clearAllMocks()
  captured = { upsertedRows: [], inserts: [] }
})

const REJECTED_CASES: { name: string; reason: string; raw: StravaSummaryActivity }[] = [
  { name: '가상 활동(VirtualRide)', reason: 'virtual', raw: makeRaw(1, { type: 'VirtualRide', sport_type: 'VirtualRide' }) },
  { name: '다섯 종목 밖(Swim)', reason: 'unsupported_sport', raw: makeRaw(2, { type: 'Swim', sport_type: 'Swim' }) },
  { name: '수동 입력', reason: 'manual_entry', raw: makeRaw(3, { manual: true }) },
  {
    name: '파일 업로드(추정 기준)',
    reason: 'file_upload',
    raw: makeRaw(4, { upload_id: 123456, upload_id_str: '123456', external_id: 'morning_run.gpx' }),
  },
  { name: '시작 좌표 없음', reason: 'no_gps', raw: makeRaw(5, { start_latlng: [] }) },
  {
    name: '경로 요약 없음',
    reason: 'no_gps',
    raw: makeRaw(6, { map: { id: 'm6', summary_polyline: null, resource_state: 2 } }),
  },
  { name: '움직인 시간 10분 미만', reason: 'too_short', raw: makeRaw(7, { moving_time: 599 }) },
]

describe('processFetchedActivities — 인정 기준을 못 갖춘 활동은 어떤 보상에도 들어가지 않는다', () => {
  for (const { name, reason, raw } of REJECTED_CASES) {
    it(`${name} → 체크인·드랍·배지·미션·Streams 조회 없음, 사유 ${reason}로 기록`, async () => {
      const result = await processFetchedActivities(makeFakeSupabase(captured), 'user-1', 'token', [raw], false, 'sync')

      expect(getActivityStreams).not.toHaveBeenCalled()
      expect(matchPoisForActivity).not.toHaveBeenCalled()
      expect(captured.inserts.filter((i) => i.table === 'user_checkin_badge_earns')).toEqual([])
      expect(tryItemDrop).not.toHaveBeenCalled()
      expect(checkMissions).not.toHaveBeenCalled()
      // 배지 엔진은 «새 활동 없음» 평가(빈 배열)로만 돈다 — 걸러진 활동은 넘어가지 않는다
      expect(vi.mocked(evaluateBadges).mock.calls).toEqual([[ 'user-1', [] ]])
      expect(result.settledCount).toBe(0)
      expect(result.earnedBadgeIds).toEqual([])

      // 사유와 함께 저장만 된다
      expect(captured.upsertedRows).toHaveLength(1)
      expect(captured.upsertedRows[0]).toMatchObject({ strava_id: raw.id, filter_reason: reason })
    })
  }

  it('인정 활동은 filter_reason 없이(NULL) 저장되고 모든 단계에 들어간다', async () => {
    const raw = makeRaw(8)
    const result = await processFetchedActivities(makeFakeSupabase(captured), 'user-1', 'token', [raw], false, 'sync')

    expect(result.settledCount).toBe(1)
    expect(vi.mocked(tryItemDrop)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(checkMissions)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(evaluateBadges).mock.calls[0][1]).toHaveLength(1)
    expect(captured.upsertedRows).toHaveLength(1)
    expect(captured.upsertedRows[0]).toMatchObject({ strava_id: 8, filter_reason: null })
  })

  it('source_meta에는 유무·모양만 담고 경로 요약 본문·좌표·외부 ID 원문은 담지 않는다', async () => {
    const raw = makeRaw(9, { upload_id: 1, upload_id_str: '1', external_id: 'garmin_push_998877' })
    await processFetchedActivities(makeFakeSupabase(captured), 'user-1', 'token', [raw], false, 'sync')

    const meta = captured.upsertedRows[0].source_meta as Record<string, unknown>
    expect(meta).toEqual({
      type: 'Run',
      sportType: 'Run',
      manual: false,
      hasUploadId: true,
      externalIdShape: 'other',
      hasStartLatLng: true,
      hasSummaryPolyline: true,
    })
    const serialized = JSON.stringify(meta)
    expect(serialized).not.toContain('SECRET-ENCODED-POLYLINE')
    expect(serialized).not.toContain('37.5123')
    expect(serialized).not.toContain('garmin_push_998877')
  })

  it('걸러진 활동과 인정 활동이 섞여도 인정 활동만 정산하고 둘 다 기록한다', async () => {
    const manual = makeRaw(1, { manual: true })
    const ok = makeRaw(2)
    const result = await processFetchedActivities(makeFakeSupabase(captured), 'user-1', 'token', [manual, ok], false, 'sync')

    expect(result.settledCount).toBe(1)
    expect(vi.mocked(tryItemDrop).mock.calls.map((c) => (c[1] as NormalizedActivity).stravaId)).toEqual([2])
    expect(captured.upsertedRows.map((r) => [r.strava_id, r.filter_reason]).sort()).toEqual([
      [1, 'manual_entry'],
      [2, null],
    ])
  })
})

describe('processFetchedActivities — 체크인은 어뷰징 필터(차량 속도) 뒤에 돈다', () => {
  it('차량 속도로 걸러진 활동은 체크인 배지를 받지 못하고, vehicle_speed로 저장된다', async () => {
    const car = makeRaw(1, { average_speed: 100 / 3.6 }) // 100km/h > 기본 60km/h
    const result = await processFetchedActivities(makeFakeSupabase(captured), 'user-1', 'token', [car], false, 'sync')

    expect(matchPoisForActivity).not.toHaveBeenCalled()
    expect(captured.inserts.filter((i) => i.table === 'user_checkin_badge_earns')).toEqual([])
    expect(result.earnedBadgeIds).toEqual([])
    expect(tryItemDrop).not.toHaveBeenCalled()
    expect(captured.upsertedRows[0]).toMatchObject({ strava_id: 1, filter_reason: 'vehicle_speed' })
  })

  it('같은 지점을 지나도 속도 필터를 통과한 활동만 체크인 배지를 받는다', async () => {
    const car = makeRaw(1, { average_speed: 100 / 3.6 })
    const runner = makeRaw(2)
    const result = await processFetchedActivities(makeFakeSupabase(captured), 'user-1', 'token', [car, runner], false, 'sync')

    const checkins = captured.inserts.filter((i) => i.table === 'user_checkin_badge_earns')
    expect(checkins.map((c) => c.payload.triggered_by_strava_id)).toEqual([2])
    expect(result.earnedBadgeIds).toContain('badge-1')
    expect(captured.upsertedRows.map((r) => [r.strava_id, r.filter_reason]).sort()).toEqual([
      [1, 'vehicle_speed'],
      [2, null],
    ])
  })
})

describe('processFetchedActivities — 첫 동기화', () => {
  it('인정 활동 가운데 가장 최근 1건만 정산한다 — 가장 최근 활동이 걸러지면 그 전 활동을 본다', async () => {
    const newestButManual = makeRaw(5, { manual: true })
    const okNewer = makeRaw(4)
    const okOlder = makeRaw(3)
    const result = await processFetchedActivities(
      makeFakeSupabase(captured),
      'user-1',
      'token',
      [okOlder, newestButManual, okNewer],
      true,
      'sync'
    )

    expect(result.settledCount).toBe(1)
    expect(vi.mocked(tryItemDrop).mock.calls.map((c) => (c[1] as NormalizedActivity).stravaId)).toEqual([4])
    // 정산한 1건과 걸러진 1건만 기록한다 — 정산하지 않은 옛 활동(3)은 지금처럼 기록하지 않는다
    expect(captured.upsertedRows.map((r) => [r.strava_id, r.filter_reason]).sort()).toEqual([
      [4, null],
      [5, 'manual_entry'],
    ])
  })

  it('인정 활동이 하나도 없으면 첫 동기화를 마친 것으로 보지 않는다(users.initial_sync_done 갱신 건너뜀)', async () => {
    const result = await processFetchedActivities(
      makeFakeSupabase(captured),
      'user-1',
      'token',
      [makeRaw(1, { manual: true }), makeRaw(2, { start_latlng: [] })],
      true,
      'sync'
    )

    expect(result.settledCount).toBe(0)
    expect(vi.mocked(evaluateBadges).mock.calls).toEqual([['user-1', [], { skipInitialSyncFlagUpdate: true }]])
    // 걸러진 활동은 기록된다 — 다음 동기화에서 다시 가져와 다시 거르지 않는다
    expect(captured.upsertedRows.map((r) => r.filter_reason).sort()).toEqual(['manual_entry', 'no_gps'])
  })

  it('새 활동이 아예 없는 첫 동기화도 첫 동기화를 마친 것으로 보지 않는다', async () => {
    await processFetchedActivities(makeFakeSupabase(captured), 'user-1', 'token', [], true, 'sync')

    expect(vi.mocked(evaluateBadges).mock.calls).toEqual([['user-1', [], { skipInitialSyncFlagUpdate: true }]])
  })

  it('첫 동기화가 아닌 동기화는 옛 호출 모양 그대로다(갱신 건너뜀 옵션 없음)', async () => {
    await processFetchedActivities(makeFakeSupabase(captured), 'user-1', 'token', [], false, 'sync')

    expect(vi.mocked(evaluateBadges).mock.calls).toEqual([['user-1', []]])
  })
})
