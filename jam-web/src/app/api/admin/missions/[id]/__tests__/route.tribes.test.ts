/**
 * PATCH /api/admin/missions/[id] — 참가할 수 있는 트라이브 저장과 «접근을 줄이는 변경» 거절 (티켓 20261019_1318 1회)
 * - `scope`가 있을 때만 트라이브를 건드린다. 참가·완료 기록이 있는 미션은 공통 → 트라이브 제한과 허용 트라이브 빼기를 409로 거절한다.
 * - 거절·검증은 미션 내용을 저장하기 전에 끝낸다. 미션 저장 뒤 트라이브 저장이 실패하면 그 사실을 알린다.
 * DB는 메모리 스텁이다(`lib/admin/__tests__/fakeMissionDb.ts`).
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/missions/[id]/__tests__/route.tribes.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createFakeMissionDb, type FakeMissionDb } from '@/lib/admin/__tests__/fakeMissionDb'
import { READ_ERROR_MESSAGE, SAVE_ERROR_MESSAGE } from '@/lib/admin/mission-save-messages'
import {
  TRIBE_NARROWING_BLOCKED_MESSAGE,
  TRIBE_NOT_FOUND_MESSAGE,
  TRIBE_REQUIRED_MESSAGE,
  TRIBE_SAVE_PARTIAL_MESSAGE,
} from '@/lib/admin/mission-tribes'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const MISSING = '99999999-9999-4999-8999-999999999999'
const ID = 'm1'

const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => (holder.db as FakeMissionDb).client }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () => null,
}))

const { PATCH } = await import('../route')

let db: FakeMissionDb

const patch = (body: Record<string, unknown>) =>
  PATCH(
    new NextRequest(`https://j-a-m.app/api/admin/missions/${ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ID }) }
  )

function setup(opts: { allowed?: string[]; participations?: number; completions?: number } = {}) {
  db = createFakeMissionDb({
    missions: [{ id: ID, title: '원래 제목' }],
    tribes: [{ id: A }, { id: B }, { id: C }],
    mission_allowed_tribes: (opts.allowed ?? []).map((tribe_id) => ({ mission_id: ID, tribe_id })),
    user_mission_participations: Array.from({ length: opts.participations ?? 0 }, (_, i) => ({ mission_id: ID, user_id: `u${i}` })),
    user_mission_completions: Array.from({ length: opts.completions ?? 0 }, (_, i) => ({ mission_id: ID, user_id: `c${i}` })),
  })
  holder.db = db
}

const allowedIds = () =>
  (db.tables.mission_allowed_tribes ?? [])
    .filter((r) => r.mission_id === ID)
    .map((r) => r.tribe_id)
    .sort()

const missionUpdates = () => db.calls.filter((c) => c === 'missions.update')

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('PATCH — 접근을 줄이는 변경은 참가·완료 기록이 있으면 409', () => {
  it('공통 → 트라이브 제한: 참가 기록이 있으면 409이고 미션도 트라이브도 바꾸지 않는다', async () => {
    setup({ participations: 1 })
    const res = await patch({ title: '새 제목', scope: 'tribe', allowed_tribe_ids: [A] })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(TRIBE_NARROWING_BLOCKED_MESSAGE)
    expect(missionUpdates()).toEqual([])
    expect(db.tables.missions[0].title).toBe('원래 제목')
    expect(allowedIds()).toEqual([])
  })

  it('허용 트라이브를 빼거나 바꿔치기하면 완료 기록만 있어도 409이다', async () => {
    for (const next of [[A], [C]]) {
      setup({ allowed: [A, B], completions: 1 })
      const res = await patch({ scope: 'tribe', allowed_tribe_ids: next })
      expect(res.status).toBe(409)
      expect(allowedIds()).toEqual([A, B].sort())
    }
  })

  it('기록이 없으면 줄이는 변경도 저장한다', async () => {
    setup({ allowed: [A, B] })
    const res = await patch({ scope: 'tribe', allowed_tribe_ids: [A] })
    expect(res.status).toBe(200)
    expect(allowedIds()).toEqual([A])
  })

  it('공통 → 트라이브 제한도 기록이 없으면 저장한다', async () => {
    setup()
    const res = await patch({ title: '새 제목', scope: 'tribe', allowed_tribe_ids: [B, C] })
    expect(res.status).toBe(200)
    expect(allowedIds()).toEqual([B, C].sort())
    expect(db.tables.missions[0].title).toBe('새 제목')
  })
})

describe('PATCH — 기록이 있어도 넓히는 변경은 저장한다', () => {
  it('트라이브를 더하는 변경', async () => {
    setup({ allowed: [A], participations: 3, completions: 2 })
    const res = await patch({ scope: 'tribe', allowed_tribe_ids: [A, B] })
    expect(res.status).toBe(200)
    expect(allowedIds()).toEqual([A, B].sort())
  })

  it('트라이브 제한 → 공통', async () => {
    setup({ allowed: [A, B], participations: 3 })
    const res = await patch({ scope: 'common' })
    expect(res.status).toBe(200)
    expect(allowedIds()).toEqual([])
  })

  it('넓히는 변경은 참가·완료 기록 표를 읽지 않는다', async () => {
    setup({ allowed: [A], participations: 3 })
    await patch({ scope: 'tribe', allowed_tribe_ids: [A, B] })
    expect(db.calls).not.toContain('user_mission_participations.select')
    expect(db.calls).not.toContain('user_mission_completions.select')
  })
})

describe('PATCH — scope가 없으면 트라이브를 건드리지 않는다', () => {
  it('트라이브 표를 읽지도 쓰지도 않고 미션 칸만 저장한다', async () => {
    setup({ allowed: [A], participations: 1 })
    const res = await patch({ title: '새 제목' })
    expect(res.status).toBe(200)
    expect(db.calls).toEqual(['missions.update'])
    expect(allowedIds()).toEqual([A])
  })

  it('목록만 보내도 무시하고 미션 칸으로 저장하지 않는다', async () => {
    setup()
    await patch({ title: '새 제목', allowed_tribe_ids: [A] })
    expect(db.tables.missions[0]).not.toHaveProperty('allowed_tribe_ids')
    expect(allowedIds()).toEqual([])
  })

  it('scope·allowed_tribe_ids는 미션 행에 들어가지 않는다', async () => {
    setup()
    await patch({ title: '새 제목', scope: 'tribe', allowed_tribe_ids: [A] })
    expect(db.tables.missions[0]).not.toHaveProperty('scope')
    expect(db.tables.missions[0]).not.toHaveProperty('allowed_tribe_ids')
  })

  it('트라이브만 바꾸는 요청은 빈 갱신을 보내지 않고 행을 읽어 응답한다', async () => {
    setup()
    const res = await patch({ scope: 'tribe', allowed_tribe_ids: [A] })
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe(ID)
    expect(missionUpdates()).toEqual([])
    expect(allowedIds()).toEqual([A])
  })
})

describe('PATCH — 입력 검증은 미션을 저장하기 전에 끝낸다', () => {
  it('트라이브 미션인데 트라이브가 없으면 400', async () => {
    setup()
    const res = await patch({ title: '새 제목', scope: 'tribe', allowed_tribe_ids: [] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(TRIBE_REQUIRED_MESSAGE)
    expect(db.calls).toEqual([])
  })

  it('존재하지 않는 트라이브가 있으면 400이고 미션을 바꾸지 않는다', async () => {
    setup()
    const res = await patch({ title: '새 제목', scope: 'tribe', allowed_tribe_ids: [A, MISSING] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(TRIBE_NOT_FOUND_MESSAGE)
    expect(missionUpdates()).toEqual([])
    expect(db.tables.missions[0].title).toBe('원래 제목')
  })
})

describe('PATCH — 읽기·쓰기 실패', () => {
  it('허용 트라이브를 읽지 못하면 확인 없이 저장하지 않고 고정 문구로 500', async () => {
    setup({ allowed: [A] })
    db.failOn.add('mission_allowed_tribes.select')
    const res = await patch({ title: '새 제목', scope: 'common' })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe(READ_ERROR_MESSAGE)
    expect(JSON.stringify(body)).not.toContain('mission_allowed_tribes.select')
    expect(missionUpdates()).toEqual([])
    expect(allowedIds()).toEqual([A])
  })

  it('참가·완료 기록을 읽지 못하면 줄이는 변경을 진행하지 않는다', async () => {
    setup({ allowed: [A, B] })
    db.failOn.add('user_mission_participations.select')
    const res = await patch({ scope: 'tribe', allowed_tribe_ids: [A] })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe(READ_ERROR_MESSAGE)
    expect(allowedIds()).toEqual([A, B].sort())
  })

  it('미션 저장이 실패하면 트라이브를 바꾸지 않는다', async () => {
    setup()
    db.failOn.add('missions.update')
    const res = await patch({ title: '새 제목', scope: 'tribe', allowed_tribe_ids: [A] })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe(SAVE_ERROR_MESSAGE)
    expect(allowedIds()).toEqual([])
  })

  it('미션은 저장했지만 트라이브 저장이 실패하면 그 사실을 알린다(다시 저장하면 이어서 맞춘다)', async () => {
    setup()
    db.failOn.add('mission_allowed_tribes.insert')
    const res = await patch({ title: '새 제목', scope: 'tribe', allowed_tribe_ids: [A] })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe(TRIBE_SAVE_PARTIAL_MESSAGE)
    expect(db.tables.missions[0].title).toBe('새 제목')

    db.failOn.clear()
    const retry = await patch({ title: '새 제목', scope: 'tribe', allowed_tribe_ids: [A] })
    expect(retry.status).toBe(200)
    expect(allowedIds()).toEqual([A])
  })
})
