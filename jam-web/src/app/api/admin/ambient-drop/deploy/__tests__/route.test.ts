/**
 * 어드민 「지금 배포」 라우트 (티켓 20261001_2053)
 *
 *  - 본문이 없거나 빈 객체인 POST는 예전과 같다: 상호 배제 창 안이면 409, 밖이면 `runAmbientDropBatch('manual')`
 *  - 본문이 있으면 지정 배포다: 창과 무관하게 통과하고 `runAmbientDropSpec`이 `manual`로 돌며 설정은 쓰지 않는다
 *  - 입력 오류는 400 해요체, 비관리자는 403, 예기치 못한 오류는 고정 문장 500이다
 *
 * 설정 배포(`runAmbientDropBatch`)는 모킹하고, 지정 배포는 실제 실행기를 가짜 DB(`schedule-test-db.ts`) 위에서 돌린다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/ambient-drop/deploy/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createFakeDb, type FakeDb } from '@/lib/ambient-drop/__tests__/schedule-test-db'
import { B_LIVE, P1, P2, world } from '@/lib/ambient-drop/__tests__/schedule-fixtures'
import { SCHEDULE_FORBIDDEN, SCHEDULE_UNEXPECTED } from '@/lib/ambient-drop/scheduleRoute'

const state = vi.hoisted(() => ({
  admin: { id: 'admin-1', email: 'admin@example.com' } as { id: string; email: string } | null,
  batch: vi.fn(),
  config: {
    auto_enabled: true,
    schedule_hour_kst: 9,
    exclusion_window_minutes: 30,
  } as Record<string, unknown>,
  logged: [] as unknown[][],
}))

let db: FakeDb

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => db.client }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => state.admin,
}))
vi.mock('@/lib/notifications/batch/shared', async () => (await import('@/lib/ambient-drop/__tests__/schedule-test-db')).sharedMock)
vi.mock('@/lib/engine-log', () => ({
  logEngineDecision: (...args: unknown[]) => {
    state.logged.push(args)
  },
}))
// 설정 배포 갈래의 설정 읽기·실행은 모킹한다. 지정 배포는 가짜 DB의 설정 행을 읽는 실제 경로를 쓴다
vi.mock('@/lib/ambient-drop', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/ambient-drop')>()),
  runAmbientDropBatch: (...args: unknown[]) => state.batch(...args),
}))
vi.mock('@/lib/ambient-drop/config', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/ambient-drop/config')>()),
  getAmbientDropConfig: async () => state.config,
}))

import { POST } from '../route'

/** 2026-10-05 09:10 KST — 예약 배포 시각(09시) 전후 30분 창 안 */
const IN_WINDOW = new Date('2026-10-05T00:10:00.000Z')
/** 2026-10-05 13:00 KST — 창 밖 */
const OUT_WINDOW = new Date('2026-10-05T04:00:00.000Z')

const NOW_BODY = { scheduled_at: 'now', poi_ids: [P1, P2], per_poi_count: 1, badge_ids: [B_LIVE] }

function post(body?: unknown): NextRequest {
  return new NextRequest('https://j-a-m.app/api/admin/ambient-drop/deploy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(OUT_WINDOW)
  db = createFakeDb(world())
  state.admin = { id: 'admin-1', email: 'admin@example.com' }
  state.config = { auto_enabled: true, schedule_hour_kst: 9, exclusion_window_minutes: 30 }
  state.batch.mockReset()
  state.batch.mockResolvedValue({ spawned: 3 })
  state.logged = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('본문 없는 POST — 저장된 설정 배포(회귀)', () => {
  it('창 안이면 409이고 배포하지 않는다', async () => {
    vi.setSystemTime(IN_WINDOW)
    const res = await POST(post())
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('지금은 배포할 수 없어요')
    expect(state.batch).not.toHaveBeenCalled()
  })

  it('창 밖이면 runAmbientDropBatch("manual")을 부르고 { result }를 준다', async () => {
    const res = await POST(post())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ result: { spawned: 3 } })
    expect(state.batch).toHaveBeenCalledWith('manual')
  })

  it('빈 객체 본문도 같은 갈래다', async () => {
    vi.setSystemTime(IN_WINDOW)
    const res = await POST(post({}))
    expect(res.status).toBe(409)
    expect(state.batch).not.toHaveBeenCalled()
  })
})

describe('본문 있는 POST — 지정 배포', () => {
  it('창 안에서도 통과하고 runAmbientDropSpec이 manual로 돌며 설정을 쓰지 않는다', async () => {
    vi.setSystemTime(IN_WINDOW)
    const configBefore = structuredClone(db.tables.ambient_drop_config)

    const res = await POST(post(NOW_BODY))
    expect(res.status).toBe(200)
    const { outcome } = await res.json()
    expect(outcome).toMatchObject({ status: 'done', requested: 2, spawned: 2 })

    expect(state.batch).not.toHaveBeenCalled()
    expect(db.rpcCalls.map((c) => c.name)).toEqual(['mint_and_place_ambient_drop', 'mint_and_place_ambient_drop'])
    expect(db.rpcCalls.map((c) => c.args.p_poi_id).sort()).toEqual([P1, P2].sort())
    expect(state.logged.at(-1)?.[3]).toMatchObject({ trigger: 'manual', spawned: 2 })
    // 설정·예약 행에 쓰지 않는다
    expect(db.writesTo('ambient_drop_config')).toEqual([])
    expect(db.writesTo('ambient_drop_schedules')).toEqual([])
    expect(db.tables.ambient_drop_config).toEqual(configBefore)
  })

  it('scheduled_at이 빠져 있어도 지정 배포로 받는다(등록 라우트와 달리)', async () => {
    const withoutAt: Record<string, unknown> = { ...NOW_BODY }
    delete withoutAt.scheduled_at
    const res = await POST(post(withoutAt))
    expect(res.status).toBe(200)
    expect((await res.json()).outcome.status).toBe('done')
  })

  it('입력 오류는 400 해요체 문장이고 아무것도 놓지 않는다', async () => {
    const res = await POST(post({ ...NOW_BODY, total_count: 3 }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/요\.?/)
    expect(db.rpcCalls).toEqual([])
  })

  it('깨진 JSON은 400이다', async () => {
    const res = await POST(post('{not json'))
    expect(res.status).toBe(400)
    expect(db.rpcCalls).toEqual([])
  })

  it('미래 ISO 시각은 400이고 아무것도 놓지 않는다', async () => {
    const res = await POST(post({ ...NOW_BODY, scheduled_at: '2026-12-25T09:00:00+09:00' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('시각을 정할 수 없어요')
    expect(db.rpcCalls).toEqual([])
    expect(state.batch).not.toHaveBeenCalled()
  })

  it('scheduled_at이 null이나 빈 문자열이어도 400이다', async () => {
    for (const value of [null, '']) {
      const res = await POST(post({ ...NOW_BODY, scheduled_at: value }))
      expect(res.status).toBe(400)
    }
    expect(db.rpcCalls).toEqual([])
  })

  it('지난 시각은 400이다', async () => {
    const res = await POST(post({ ...NOW_BODY, scheduled_at: '2026-01-01T09:00:00+09:00' }))
    expect(res.status).toBe(400)
  })

  it('없는 지점 종류는 400이다', async () => {
    const res = await POST(
      post({ scheduled_at: 'now', poi_category: 'nowhere', total_count: 2, badge_ids: [B_LIVE] })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('지점 종류를 찾을 수 없어요')
    expect(db.rpcCalls).toEqual([])
  })
})

describe('권한·오류', () => {
  it('비관리자는 403이고 어떤 갈래도 실행하지 않는다', async () => {
    state.admin = null
    for (const req of [post(), post(NOW_BODY)]) {
      const res = await POST(req)
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: SCHEDULE_FORBIDDEN })
    }
    expect(state.batch).not.toHaveBeenCalled()
    expect(db.calls).toEqual([])
  })

  it('예기치 못한 오류는 고정 문장 500이고 원문이 없다', async () => {
    state.batch.mockRejectedValue(new Error('secret-detail'))
    const res = await POST(post())
    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toContain(SCHEDULE_UNEXPECTED)
    expect(text).not.toContain('secret-detail')
  })
})
