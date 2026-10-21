/**
 * POST·GET /api/admin/missions — 참가할 수 있는 트라이브 저장과 고정 오류 문구 (티켓 20261019_1318 1회)
 * 트라이브 필드는 missions 칸이 아니라 `mission_allowed_tribes`에 따로 저장하고, 저장이 실패하면 방금 만든 미션을 지운다.
 * DB는 메모리 스텁이다(`lib/admin/__tests__/fakeMissionDb.ts`).
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/missions/route.tribes.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createFakeMissionDb, type FakeMissionDb } from '@/lib/admin/__tests__/fakeMissionDb'
import { READ_ERROR_MESSAGE, SAVE_ERROR_MESSAGE } from '@/lib/admin/mission-save-messages'
import {
  TRIBE_CREATE_CLEANUP_FAILED_MESSAGE,
  TRIBE_NOT_FOUND_MESSAGE,
  TRIBE_REQUIRED_MESSAGE,
  TRIBE_SCOPE_INVALID_MESSAGE,
} from '@/lib/admin/mission-tribes'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const MISSING = '99999999-9999-4999-8999-999999999999'

const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => (holder.db as FakeMissionDb).client }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () => null,
  requireAdminRead: async () => null,
}))

const { GET, POST } = await import('./route')

let db: FakeMissionDb

const base = {
  title: '트라이브 테스트 미션',
  mission_type: 'distance',
  condition_json: { distance_km: 10 },
  status_display_type: 'achievement',
  reward_badge_ids: [],
  starts_at: '2026-10-21T00:00:00.000Z',
}

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

const allowedRows = () => db.tables.mission_allowed_tribes ?? []

beforeEach(() => {
  db = createFakeMissionDb({ tribes: [{ id: A }, { id: B }], missions: [], mission_allowed_tribes: [] })
  holder.db = db
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/admin/missions — 참가할 수 있는 트라이브', () => {
  it('트라이브 미션은 미션을 저장한 뒤 고른 트라이브를 그 미션 id로 저장한다', async () => {
    const res = await post({ ...base, scope: 'tribe', allowed_tribe_ids: [A, B, A] })
    expect(res.status).toBe(200)
    const created = await res.json()
    expect(allowedRows().map((r) => [r.mission_id, r.tribe_id]).sort()).toEqual([[created.id, A], [created.id, B]].sort())
    // 순서: 트라이브 존재 확인 → 미션 저장 → 트라이브 저장
    expect(db.calls).toEqual(['tribes.select', 'missions.insert', 'mission_allowed_tribes.insert'])
  })

  it('scope와 allowed_tribe_ids는 missions 칸이 아니라서 미션 행에 넣지 않는다', async () => {
    await post({ ...base, scope: 'tribe', allowed_tribe_ids: [A] })
    const row = db.tables.missions[0]
    expect(row).not.toHaveProperty('scope')
    expect(row).not.toHaveProperty('allowed_tribe_ids')
    expect(row.title).toBe(base.title)
  })

  it('공통 미션은 트라이브 표를 읽지도 쓰지도 않는다(같이 온 목록은 무시)', async () => {
    const res = await post({ ...base, scope: 'common', allowed_tribe_ids: [A] })
    expect(res.status).toBe(200)
    expect(db.calls).toEqual(['missions.insert'])
    expect(allowedRows()).toEqual([])
    expect(db.tables.missions[0]).not.toHaveProperty('allowed_tribe_ids')
  })

  it('scope를 보내지 않으면 트라이브를 건드리지 않고, 남은 목록 필드도 미션 행에 넣지 않는다', async () => {
    const res = await post({ ...base, allowed_tribe_ids: [A] })
    expect(res.status).toBe(200)
    expect(db.calls).toEqual(['missions.insert'])
    expect(db.tables.missions[0]).not.toHaveProperty('allowed_tribe_ids')
  })

  it('트라이브 미션인데 트라이브를 하나도 안 골랐으면 400이고 아무것도 저장하지 않는다', async () => {
    for (const ids of [[], undefined]) {
      const res = await post({ ...base, scope: 'tribe', allowed_tribe_ids: ids })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe(TRIBE_REQUIRED_MESSAGE)
    }
    expect(db.calls).toEqual([])
  })

  it('scope 값이 잘못되면 400이다', async () => {
    const res = await post({ ...base, scope: 'everyone' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(TRIBE_SCOPE_INVALID_MESSAGE)
    expect(db.calls).toEqual([])
  })

  it('존재하지 않는 트라이브가 섞여 있으면 400이고 미션을 만들지 않는다', async () => {
    const res = await post({ ...base, scope: 'tribe', allowed_tribe_ids: [A, MISSING] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(TRIBE_NOT_FOUND_MESSAGE)
    expect(db.tables.missions).toEqual([])
  })

  it('트라이브를 읽지 못하면 확인 없이 만들지 않고 고정 문구로 500이다', async () => {
    db.failOn.add('tribes.select')
    const res = await post({ ...base, scope: 'tribe', allowed_tribe_ids: [A] })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe(READ_ERROR_MESSAGE)
    expect(JSON.stringify(body)).not.toContain('tribes.select')
    expect(db.tables.missions).toEqual([])
  })

  it('트라이브 저장이 실패하면 방금 만든 미션을 지우고 500이다', async () => {
    db.failOn.add('mission_allowed_tribes.insert')
    const res = await post({ ...base, scope: 'tribe', allowed_tribe_ids: [A] })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe(SAVE_ERROR_MESSAGE)
    expect(db.tables.missions).toEqual([])
    expect(db.calls).toContain('missions.delete')
  })

  it('트라이브 저장도 정리도 실패하면 공통 미션으로 남았을 수 있다고 알린다', async () => {
    db.failOn.add('mission_allowed_tribes.insert')
    db.failOn.add('missions.delete')
    const res = await post({ ...base, scope: 'tribe', allowed_tribe_ids: [A] })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe(TRIBE_CREATE_CLEANUP_FAILED_MESSAGE)
    expect(db.tables.missions).toHaveLength(1)
  })
})

describe('고정 오류 문구 — DB 오류 원문을 응답에 싣지 않는다', () => {
  it('POST 저장이 실패하면 고정 문구와 로그만 남긴다', async () => {
    db.failOn.add('missions.insert')
    const res = await post(base)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe(SAVE_ERROR_MESSAGE)
    expect(JSON.stringify(body)).not.toContain('missions.insert')
    expect(console.error).toHaveBeenCalled()
  })

  it('GET 조회가 실패하면 고정 문구로 500이다', async () => {
    db.failOn.add('missions.select')
    const res = await GET(new NextRequest('https://j-a-m.app/api/admin/missions'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe(READ_ERROR_MESSAGE)
    expect(JSON.stringify(body)).not.toContain('missions.select')
  })

  it('GET은 미션 목록을 그대로 돌려준다', async () => {
    db.tables.missions = [{ id: 'm1', title: '하나' }]
    const res = await GET(new NextRequest('https://j-a-m.app/api/admin/missions'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 'm1', title: '하나' }])
  })
})
