/**
 * strava/sync — 동기화 조회 커서를 마지막으로 가져온 활동의 시작 시각 기준으로 계산한다
 * (티켓 20260922_2207)
 *
 * 배경: 기존 커서는 `strava_connections.last_synced_at`(동기화를 누른 벽시계 시각)이었다.
 * Strava `after`는 활동 **시작 시각** 기준으로 거르는데, 활동 길이 + 업로드 지연이
 * overlap(15분)보다 길면 "성공(0건)한 동기화"가 커서를 활동 시작 시각보다 앞으로 밀어내
 * 그 활동을 영구 누락시킨다 (실측 사례: 20.1km 러닝, 6회 동기화 모두 0건).
 *
 * 이 파일은 syncStravaActivities()가 실제로 `strava_activities` 최신 start_date를
 * 커서로 쓰는지, 행이 없으면 after 없이 조회하는지, 동시 싱크 잠금(last_synced_at)이
 * 여전히 그대로 동작하는지를 계약으로 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/sync-cursor-last-activity.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaConnectionRow } from '@/types/database'

const { createServiceClientMock, getActivitiesMock, evaluateBadgesMock } = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  getActivitiesMock: vi.fn(async () => [] as unknown[]),
  evaluateBadgesMock: vi.fn(async () => [] as string[]),
}))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: createServiceClientMock }))
vi.mock('@/lib/utils', () => ({
  // 실제 AES 복호화는 ENCRYPTION_KEY·정형화된 "iv:data" 문자열을 요구한다 — 이 파일은
  // 암/복호화 로직이 아니라 커서 계산을 검증하므로 항등 함수로 대체한다.
  decrypt: vi.fn(async (v: string) => v),
  encrypt: vi.fn(async (v: string) => v),
}))
vi.mock('@/lib/strava/api', () => ({
  getActivities: getActivitiesMock,
  getActivityStreams: vi.fn(async () => null),
  refreshStravaToken: vi.fn(),
}))
vi.mock('@/lib/badge-engine/index', () => ({ evaluateBadges: evaluateBadgesMock }))
vi.mock('@/lib/drop-engine/index', () => ({ tryItemDrop: vi.fn(async () => []) }))
vi.mock('@/lib/poi/matcher', () => ({ matchPoisForActivity: vi.fn(async () => []) }))
vi.mock('@/lib/badge-engine/jamActionBadges', () => ({ evaluateJamActionBadges: vi.fn(async () => []) })) // JAM! 행동 지표 판정은 sync-jam-action-hook.test.ts가 따로 확인한다 (티켓 20261001_0633)
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
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: vi.fn(async () => {}) }))

import { syncStravaActivities } from '../sync'

const USER_ID = 'user-cursor-test'
const FAR_FUTURE_TOKEN_EXPIRY = '2099-01-01T00:00:00.000Z'

function baseConnection(lastSyncedAt: string | null): StravaConnectionRow {
  return {
    id: 'conn-1',
    user_id: USER_ID,
    strava_athlete_id: 503337,
    access_token: 'enc-access-token',
    refresh_token: 'enc-refresh-token',
    token_expires_at: FAR_FUTURE_TOKEN_EXPIRY,
    last_synced_at: lastSyncedAt,
    backfill_completed: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

/**
 * `strava_connections`·`strava_activities`·`users` 세 테이블만 지원하는 최소 페이크
 * supabase — syncStravaActivities()가 실제 조회하는 체인 모양(select/eq/order/limit/
 * maybeSingle, update/eq/is/select)을 그대로 흉내낸다.
 *
 * `raceLastSyncedAt`을 주면 "이 요청이 커넥션을 읽은 뒤 — 잠금을 걸기 전 사이(=4단계
 * 커서 조회 시점)에 다른 요청이 이미 last_synced_at을 바꿔놓은" 동시성 경합을 재현한다
 * (4-1 낙관적 잠금 검증용). row.value는 select가 매번 최신값을 읽도록 동적으로 둔다 —
 * 그래야 같은 유저를 연속 2회 호출했을 때 두 번째 호출이 첫 번째 호출의 잠금 결과를
 * 반영한 커넥션을 읽는다(실제 DB와 동일).
 */
function makeFakeSupabase(opts: {
  connectionLastSyncedAt: string | null
  raceLastSyncedAt?: string
  latestActivityStartDate: string | null
  latestActivityError?: { message: string }
  initialSyncDone?: boolean
}): SupabaseClient {
  const row = { value: opts.connectionLastSyncedAt }

  const from = (table: string) => {
    if (table === 'strava_connections') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: baseConnection(row.value), error: null }),
          }),
        }),
        update: (payload: { last_synced_at: string }) => {
          let matchIsNull = false
          let matchValue: string | undefined
          const chain = {
            eq: (col: string, val: unknown) => {
              if (col === 'last_synced_at') matchValue = val as string
              return chain
            },
            is: (col: string, val: unknown) => {
              if (col === 'last_synced_at' && val === null) matchIsNull = true
              return chain
            },
            select: async () => {
              const matches = matchIsNull ? row.value === null : row.value === matchValue
              if (!matches) return { data: [], error: null }
              row.value = payload.last_synced_at
              return { data: [{ user_id: USER_ID }], error: null }
            },
          }
          return chain
        },
      }
    }
    if (table === 'strava_activities') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => {
                  // 커넥션을 읽은 뒤·잠금을 걸기 전 사이에 다른 요청이 끼어든 상황 재현
                  if (opts.raceLastSyncedAt !== undefined) row.value = opts.raceLastSyncedAt
                  if (opts.latestActivityError) {
                    return { data: null, error: opts.latestActivityError }
                  }
                  return {
                    data: opts.latestActivityStartDate ? { start_date: opts.latestActivityStartDate } : null,
                    error: null,
                  }
                },
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'users') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { initial_sync_done: opts.initialSyncDone ?? true },
              error: null,
            }),
          }),
        }),
      }
    }
    throw new Error(`makeFakeSupabase: 예상치 못한 테이블 — ${table}`)
  }

  return { from } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.clearAllMocks()
  getActivitiesMock.mockResolvedValue([])
  evaluateBadgesMock.mockResolvedValue([])
})

describe('syncStravaActivities — 조회 커서는 마지막으로 가져온 활동의 시작 시각 기준이다', () => {
  it('직전 동기화가 0건이어도 두 번째 호출의 after가 여전히 max(start_date) − 900초다', async () => {
    // 실측 사례와 같은 날짜(9/14) — 두 번의 동기화 모두 Strava가 0건을 반환해도
    // strava_activities에 새 행이 쌓이지 않으므로 max(start_date)는 그대로다.
    const latestStartDate = '2026-09-14T10:00:00.000Z'
    const expectedAfter = Math.floor(new Date(latestStartDate).getTime() / 1000) - 15 * 60

    const supabase = makeFakeSupabase({
      connectionLastSyncedAt: null,
      latestActivityStartDate: latestStartDate,
    })
    createServiceClientMock.mockReturnValue(supabase)

    await syncStravaActivities(USER_ID)
    await syncStravaActivities(USER_ID)

    expect(getActivitiesMock).toHaveBeenCalledTimes(2)
    expect(getActivitiesMock.mock.calls[0]).toEqual(['enc-access-token', expectedAfter])
    expect(getActivitiesMock.mock.calls[1]).toEqual(['enc-access-token', expectedAfter])
  })

  it('strava_activities 행이 없는 유저는 getActivities가 after 없이 호출된다', async () => {
    const supabase = makeFakeSupabase({
      connectionLastSyncedAt: null,
      latestActivityStartDate: null,
    })
    createServiceClientMock.mockReturnValue(supabase)

    await syncStravaActivities(USER_ID)

    expect(getActivitiesMock).toHaveBeenCalledTimes(1)
    expect(getActivitiesMock).toHaveBeenCalledWith('enc-access-token', undefined)
  })

  it('last_synced_at이 이미 바뀐 두 번째 요청은 synced: 0으로 조기 종료한다 (기존 동작 유지)', async () => {
    // 이 요청이 커넥션을 읽었을 때는 last_synced_at이 null이었지만, 잠금을 걸기 전에
    // 다른 요청이 이미 값을 바꿔놓은 상황을 재현한다 — 낙관적 잠금은 0행 갱신으로 막는다.
    const supabase = makeFakeSupabase({
      connectionLastSyncedAt: null,
      raceLastSyncedAt: '2026-09-22T12:00:00.000Z',
      latestActivityStartDate: '2026-09-14T10:00:00.000Z',
    })
    createServiceClientMock.mockReturnValue(supabase)

    const result = await syncStravaActivities(USER_ID)

    expect(result).toEqual({
      synced: 0,
      badges: 0,
      itemBooksCompleted: 0,
      missionsCompleted: 0,
      earnedBadges: [],
      earnedBadgesMore: 0,
      isFirstBadgeEver: false,
      completedMissionIds: [],
    })
    // 잠금에서 이미 조기 종료했으므로 Strava API 조회까지 가지 않는다
    expect(getActivitiesMock).not.toHaveBeenCalled()
  })

  it('커서 조회가 오류를 반환하면 로그를 남기고 after 없이 정상 진행한다 (티켓 20260922_2324)', async () => {
    const queryError = { message: 'connection reset' }
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const supabase = makeFakeSupabase({
      connectionLastSyncedAt: null,
      latestActivityStartDate: null,
      latestActivityError: queryError,
    })
    createServiceClientMock.mockReturnValue(supabase)

    await syncStravaActivities(USER_ID)

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `[syncStravaActivities] 커서 조회 실패 — userId: ${USER_ID}:`,
      queryError,
    )
    expect(getActivitiesMock).toHaveBeenCalledTimes(1)
    expect(getActivitiesMock).toHaveBeenCalledWith('enc-access-token', undefined)

    consoleErrorSpy.mockRestore()
  })
})
