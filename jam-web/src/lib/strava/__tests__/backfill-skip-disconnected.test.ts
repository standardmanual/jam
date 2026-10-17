/**
 * 백필 — 끊김 행은 복호화·Strava 호출 없이 건너뛴다 (티켓 20261017_1422 서버 보정 d)
 *
 * 끊김 행(`disconnected_at`)은 토큰이 빈 문자열이라 복호화할 수 없다. 어드민 백필이 이 행을
 * 만나도 `decrypt`·Strava 호출이 일어나지 않고, 연결 중인 다른 유저의 처리는 그대로 이어진다.
 *
 * 실제 Strava·공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/backfill-skip-disconnected.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StravaConnectionRow } from '@/types/database'

const { decryptMock, getActivitiesMock, refreshMock } = vi.hoisted(() => ({
  decryptMock: vi.fn(async (v: string) => {
    if (v === '') throw new Error('복호화할 수 없는 빈 토큰')
    return v
  }),
  getActivitiesMock: vi.fn(async () => []),
  refreshMock: vi.fn(),
}))

vi.mock('@/lib/utils', () => ({ decrypt: decryptMock, encrypt: vi.fn(async (v: string) => v) }))
vi.mock('@/lib/strava/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/strava/api')>('@/lib/strava/api')
  return { ...actual, getActivities: getActivitiesMock, refreshStravaToken: refreshMock }
})

import { backfillExtendedFields, backfillUserExtendedFields } from '../backfill'

const FUTURE = '2099-01-01T00:00:00.000Z'

function conn(overrides: Partial<StravaConnectionRow>): StravaConnectionRow {
  return {
    id: 'c',
    user_id: 'u',
    strava_athlete_id: 1,
    access_token: 'access',
    refresh_token: 'refresh',
    token_expires_at: FUTURE,
    last_synced_at: null,
    backfill_completed: true,
    first_sync_pending: false,
    disconnected_at: null,
    disconnect_reason: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** strava_connections 전체 조회와 strava_activities 조회(빈 목록)만 흉내 낸다 */
function fakeSupabase(connections: StravaConnectionRow[]): SupabaseClient {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.in = () => builder
    builder.eq = () => builder
    builder.order = () => builder
    builder.range = async () => ({ data: [], error: null })
    builder.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: table === 'strava_connections' ? connections : [], error: null }).then(resolve)
    return builder
  }
  return { from } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('백필 — 끊김 행 건너뜀', () => {
  it('전체 백필은 끊김 행을 복호화하지 않고 대상에서 뺀다', async () => {
    const supabase = fakeSupabase([
      conn({ user_id: 'u-live' }),
      conn({
        user_id: 'u-cut',
        access_token: '',
        refresh_token: '',
        disconnected_at: '2026-10-10T00:00:00.000Z',
        disconnect_reason: 'user_disconnected',
      }),
    ])

    const summary = await backfillExtendedFields(supabase, { requestDelayMs: 0, log: () => {} })

    expect(summary.users.map((u) => u.userId)).toEqual(['u-live'])
    expect(decryptMock).not.toHaveBeenCalledWith('')
    expect(getActivitiesMock).toHaveBeenCalledTimes(1)
  })

  it('유저 한 명 백필도 끊김 행이면 복호화·Strava 호출 없이 건너뛴 결과를 돌려준다', async () => {
    const supabase = fakeSupabase([])

    const result = await backfillUserExtendedFields(
      supabase,
      conn({ user_id: 'u-cut', access_token: '', refresh_token: '', disconnected_at: '2026-10-10T00:00:00.000Z' }),
      { requestBudget: 10, requestDelayMs: 0, log: () => {} }
    )

    expect(result.error).toBeTruthy()
    expect(result.requests).toBe(0)
    expect(decryptMock).not.toHaveBeenCalled()
    expect(getActivitiesMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
