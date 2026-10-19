/**
 * POST·PATCH /api/admin/ranking-modes — 기간 동안 모은 잼 미션 연결 거절의 라우트 배선 (티켓 20261019_1445 3-B)
 * 순수 함수 시험만으로는 라우트가 검사를 부르지 않아도 통과하므로 라우트 단위로 고정한다. DB는 기록형 스텁이다.
 * 4회(티켓 20261019_1445): PATCH는 본문에 미션이 없어도 기존 연결을 검사한다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/ranking-modes/route.mission-guard.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  missions: [] as Record<string, unknown>[],
  missionsError: null as { message: string } | null,
  /** PATCH 대상의 기존 모드 행 — null이면 없는 모드 */
  existingMode: null as Record<string, unknown> | null,
  existingModeError: null as { message: string } | null,
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
}))

const fakeClient = {
  from: (table: string) => {
    if (table === 'missions') {
      let id: unknown
      const builder = {
        select: () => builder,
        eq: (_column: string, value: unknown) => {
          id = value
          return builder
        },
        maybeSingle: () =>
          Promise.resolve({
            data: state.missionsError ? null : (state.missions.find((m) => m.id === id) ?? null),
            error: state.missionsError,
          }),
      }
      return builder
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: state.existingModeError ? null : state.existingMode,
              error: state.existingModeError,
            }),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        state.inserts.push(row)
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'new', ...row }, error: null }) }) }
      },
      update: (row: Record<string, unknown>) => {
        state.updates.push(row)
        return {
          eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'mode-1', ...row }, error: null }) }) }),
        }
      },
    }
  },
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () => null,
  getAdminUser: async () => ({ id: 'admin-1' }),
}))

const { POST } = await import('./route')
const { PATCH } = await import('./[id]/route')

const payload = {
  title: '테스트 규칙',
  target_type: 'mission_participants',
  target_mission_id: 'm-plain',
  target_user_ids: [],
  metric_type: 'mission_progress',
  metric_field_key: null,
  metric_badge_type: null,
  starts_at: '2026-10-20T00:00:00.000Z',
  ends_at: '2026-10-31T00:00:00.000Z',
  visible_rank_count: null,
}

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/ranking-modes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

const patch = (body: Record<string, unknown>) =>
  PATCH(
    new NextRequest('https://j-a-m.app/api/admin/ranking-modes/mode-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'mode-1' }) }
  )

beforeEach(() => {
  state.missions = [
    { id: 'm-plain', condition_json: { distance_km: 5 } },
    { id: 'm-period', condition_json: { jam_period_earned: 500 } },
  ]
  state.missionsError = null
  state.existingMode = { target_type: 'mission_participants', target_mission_id: 'm-plain' }
  state.existingModeError = null
  state.inserts = []
  state.updates = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/admin/ranking-modes — 기간 동안 모은 잼 미션 연결', () => {
  it('기간 동안 모은 잼 미션을 연결하면 400이고 저장하지 않는다', async () => {
    const res = await post({ ...payload, target_mission_id: 'm-period' })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('연결할 수 없어요')
    expect(body.error).toContain('기간 동안 모은 잼')
    expect(state.inserts).toEqual([])
  })

  it('다른 미션은 그대로 저장한다', async () => {
    const res = await post(payload)

    expect(res.status).toBe(200)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ target_mission_id: 'm-plain', created_by: 'admin-1' })
  })

  it('수동 지정 유저 모드(미션 없음)는 미션을 읽지 않고 저장한다', async () => {
    state.missionsError = { message: '읽으면 안 된다' }
    const res = await post({ ...payload, target_type: 'manual_users', target_mission_id: null, target_user_ids: ['u1'] })

    expect(res.status).toBe(200)
    expect(state.inserts).toHaveLength(1)
  })

  it('미션 조건을 읽지 못하면 저장하지 않고 500이다(fail-closed)', async () => {
    state.missionsError = { message: 'connection reset' }
    const res = await post({ ...payload, target_mission_id: 'm-period' })

    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('확인하지 못했어요')
    expect(state.inserts).toEqual([])
  })
})

describe('PATCH /api/admin/ranking-modes/[id] — 기간 동안 모은 잼 미션 연결', () => {
  it('기간 동안 모은 잼 미션으로 바꾸면 400이고 수정하지 않는다', async () => {
    const res = await patch({ ...payload, target_mission_id: 'm-period' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('기간 동안 모은 잼')
    expect(state.updates).toEqual([])
  })

  it('다른 미션으로 바꾸는 수정은 저장한다', async () => {
    const res = await patch(payload)

    expect(res.status).toBe(200)
    expect(state.updates).toHaveLength(1)
  })

  it('본문에 미션이 없는 수정(제목만)은 기존 연결이 일반 미션이면 저장한다', async () => {
    const res = await patch({ title: '새 제목' })

    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ title: '새 제목' }])
  })

  it('본문에 미션이 없는 수정도 기존 연결이 기간 동안 모은 잼 미션이면 400이고 수정하지 않는다 (직접 API 호출)', async () => {
    state.existingMode = { target_type: 'mission_participants', target_mission_id: 'm-period' }
    const res = await patch({ title: '새 제목' })

    expect(res.status).toBe(400)
    const error = (await res.json()).error as string
    expect(error).toContain('수정을 저장하지 못했어요')
    expect(error).toContain('기간 동안 모은 잼')
    expect(error).toContain('다른 랭킹형 미션으로 바꿔 저장하거나')
    expect(state.updates).toEqual([])
  })

  it('기존 연결이 나빠도 대상 미션을 일반 미션으로 바꾸거나 유저 직접 지정으로 바꾸는 수정은 저장한다 (복구 경로)', async () => {
    state.existingMode = { target_type: 'mission_participants', target_mission_id: 'm-period' }
    const toPlain = await patch({ target_mission_id: 'm-plain' })
    expect(toPlain.status).toBe(200)
    const toManual = await patch({ target_type: 'manual_users', target_user_ids: ['u1'] })
    expect(toManual.status).toBe(200)
    expect(state.updates).toHaveLength(2)
  })

  it('수동 지정 유저 모드의 제목 수정은 미션을 읽지 않고 저장한다', async () => {
    state.existingMode = { target_type: 'manual_users', target_mission_id: null }
    state.missionsError = { message: '읽으면 안 된다' }
    const res = await patch({ title: '새 제목' })

    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ title: '새 제목' }])
  })

  it('본문에 미션이 없을 때 기존 모드를 읽지 못하면 수정하지 않고 500이다(fail-closed)', async () => {
    state.existingModeError = { message: 'connection reset' }
    const res = await patch({ title: '새 제목' })

    expect(res.status).toBe(500)
    expect(state.updates).toEqual([])
  })

  it('미션 조건을 읽지 못하면 수정하지 않고 500이다(fail-closed)', async () => {
    state.missionsError = { message: 'connection reset' }
    const res = await patch({ ...payload, target_mission_id: 'm-plain' })

    expect(res.status).toBe(500)
    expect(state.updates).toEqual([])
  })
})
