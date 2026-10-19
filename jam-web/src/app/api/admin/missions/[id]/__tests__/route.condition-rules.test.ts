/**
 * PATCH /api/admin/missions/[id] — 순위형 금지를 «갱신 후 상태»로 검사하는 배선 (티켓 20261019_1312).
 * 틀과 조건의 조합 규칙이라 둘 중 하나만 바뀌는 요청도 기존 행과 합쳐서 봐야 한다(조건만 보면
 * «틀만 순위형으로 바꾸는» 요청이 통과한다). DB는 기록형 스텁이다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/missions/[id]/__tests__/route.condition-rules.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Row = { mission_type: string; condition_json: unknown; status_display_type: string }

const state = vi.hoisted(() => ({
  /** 기존 미션 행 — null이면 조회 결과 없음 */
  row: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  /** 기존 행 조회 횟수 */
  selects: 0,
  selectedColumns: [] as string[],
}))

const fakeClient = {
  from: () => ({
    select: (columns: string) => ({
      eq: () => ({
        single: () => {
          state.selects += 1
          state.selectedColumns.push(columns)
          return Promise.resolve({ data: state.row, error: null })
        },
        maybeSingle: () => Promise.resolve({ data: state.row, error: null }),
      }),
    }),
    update: (patch: Record<string, unknown>) => {
      state.updates.push(patch)
      return {
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { ...state.row, ...patch }, error: null }),
          }),
        }),
      }
    },
  }),
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  requireAdmin: async () => null,
}))

const { PATCH } = await import('../route')

const patch = (body: Record<string, unknown>) =>
  PATCH(
    new NextRequest('https://j-a-m.app/api/admin/missions/m1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'm1' }) }
  )

const NIGHT = { activity_type: 'running', time_range: { start: '22:00', end: '05:00' } }

function existing(row: Row) {
  state.row = { id: 'm1', ...row }
}

beforeEach(() => {
  state.row = null
  state.updates = []
  state.selects = 0
  state.selectedColumns = []
})

describe('PATCH /api/admin/missions/[id] — 순위형 금지 (갱신 후 상태)', () => {
  it('틀만 순위형으로 바꾸는 요청은 기존 밤 조건 때문에 400이다', async () => {
    existing({ mission_type: 'engine_condition', condition_json: NIGHT, status_display_type: 'achievement' })
    const res = await patch({ status_display_type: 'ranking' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('순위형 미션에는 쓸 수 없는 조건')
    expect(state.updates).toHaveLength(0)
  })

  it('기존 순위형 미션에 밤 조건만 보내도 기존 틀과 합쳐 400이다', async () => {
    existing({ mission_type: 'engine_condition', condition_json: { distance_km: 10 }, status_display_type: 'ranking' })
    const res = await patch({ condition_json: NIGHT })
    expect(res.status).toBe(400)
    expect(state.updates).toHaveLength(0)
  })

  it('기존 달성형 미션에 밤 조건만 보내면 저장된다', async () => {
    existing({ mission_type: 'engine_condition', condition_json: { distance_km: 10 }, status_display_type: 'achievement' })
    const res = await patch({ condition_json: NIGHT })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ condition_json: NIGHT }])
  })

  it('조건과 틀을 함께 보내면 기존 행을 조회하지 않고 그 조합으로 검사한다', async () => {
    const mission = { mission_type: 'engine_condition' }
    const ok = await patch({ ...mission, condition_json: NIGHT, status_display_type: 'individual' })
    expect(ok.status).toBe(200)
    const rejected = await patch({ ...mission, condition_json: NIGHT, status_display_type: 'ranking' })
    expect(rejected.status).toBe(400)
    expect(state.selects).toBe(0)
  })

  it('조건을 순위형 미션에서 밤이 아닌 조건으로 고치는 수정은 막지 않는다', async () => {
    existing({ mission_type: 'engine_condition', condition_json: NIGHT, status_display_type: 'ranking' })
    const res = await patch({ condition_json: { activity_type: 'running', distance_km: 10 } })
    expect(res.status).toBe(200)
  })

  it('틀을 달성형으로 바꾸는 수정은 기존 조건에 옛 문제가 있어도 막지 않는다', async () => {
    // 틀만 바뀔 때는 순위형 금지만 본다 — 기존 행의 다른 문제(옛 키 등)가 틀 변경까지 막지 않는다
    existing({ mission_type: 'engine_condition', condition_json: { ...NIGHT, 옛키: 1 }, status_display_type: 'ranking' })
    const res = await patch({ status_display_type: 'achievement' })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ status_display_type: 'achievement' }])
  })

  it('조건도 틀도 건드리지 않는 수정은 기존 행을 조회하지 않는다', async () => {
    const res = await patch({ title: '이름만 바꿈' })
    expect(res.status).toBe(200)
    expect(state.selects).toBe(0)
  })

  it('수정 대상이 없으면 404다', async () => {
    state.row = null
    const res = await patch({ status_display_type: 'ranking' })
    expect(res.status).toBe(404)
  })

  it('기존 행에서 읽는 컬럼은 타입·조건·틀뿐이다', async () => {
    existing({ mission_type: 'engine_condition', condition_json: NIGHT, status_display_type: 'achievement' })
    await patch({ status_display_type: 'achievement' })
    expect(state.selectedColumns).toEqual(['mission_type, condition_json, status_display_type'])
  })
})

describe('PATCH /api/admin/missions/[id] — 기온 키·경고', () => {
  it('기온 키는 400이다', async () => {
    const res = await patch({ mission_type: 'engine_condition', condition_json: { distance_km: 5, temperature_max_c: 0 }, status_display_type: 'achievement' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('날씨와 기온')
    expect(state.updates).toHaveLength(0)
  })

  it('판정하지 않는 조건이 있으면 저장하고 응답에 경고를 싣는다', async () => {
    existing({ mission_type: 'engine_condition', condition_json: { distance_km: 5 }, status_display_type: 'achievement' })
    const res = await patch({ condition_json: { distance_km: 5, jam_total_earned: 100 } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.warning).toContain('jam_total_earned')
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).not.toHaveProperty('warning')
  })
})
