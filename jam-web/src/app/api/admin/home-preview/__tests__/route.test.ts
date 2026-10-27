/**
 * 어드민 홈피드 미리보기 API (티켓 20261026_2025 1회차) — 관리자 검사, 쿼리 검증, 정상 응답.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/home-preview/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const fx = vi.hoisted(() => ({
  admin: true,
  load: vi.fn(),
  tribes: { data: [] as { id: string; name: string }[] | null, error: null as { message: string } | null },
  tribeOrder: vi.fn(),
}))

vi.mock('@/lib/admin/auth', () => ({
  requireAdmin: async () => (fx.admin ? null : NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        order: (column: string, options: unknown) => {
          fx.tribeOrder(table, column, options)
          return Promise.resolve(fx.tribes)
        },
      }),
    }),
  }),
}))
vi.mock('@/lib/admin/homePreview/load', () => ({ loadHomePreview: fx.load }))

import { GET } from '../route'

const UUID = '11111111-1111-4111-8111-111111111111'

function call(query = '') {
  return GET(new NextRequest(`https://j-a-m.app/api/admin/home-preview${query}`))
}

beforeEach(() => {
  fx.admin = true
  fx.load.mockReset()
  fx.load.mockResolvedValue({ days: [] })
  fx.tribeOrder.mockReset()
  fx.tribes = { data: [], error: null }
})

describe('GET /api/admin/home-preview', () => {
  it('관리자가 아니면 403이고 조회하지 않는다', async () => {
    fx.admin = false
    const res = await call('?date=2026-10-05')
    expect(res.status).toBe(403)
    expect(fx.load).not.toHaveBeenCalled()
  })

  it.each([
    ['날짜 형식', '?date=2026/10/05'],
    ['없는 날짜', '?date=2026-02-30'],
    ['days 0', '?days=0'],
    ['days 8', '?days=8'],
    ['days 소수', '?days=2.5'],
    ['days 글자', '?days=abc'],
    ['tribe', '?tribe=not-uuid'],
    ['time', '?time=time_noon'],
    ['weather', '?weather=snow'],
    ['special 허용값 밖', '?special=holiday_today,birthday'],
    ['bundle', '?bundle=xyz'],
  ])('쿼리 %s이 틀리면 400이고 조회하지 않는다', async (_name, query) => {
    const res = await call(query)
    expect(res.status).toBe(400)
    expect(typeof (await res.json()).error).toBe('string')
    expect(fx.load).not.toHaveBeenCalled()
  })

  it('쿼리가 없으면 오늘부터 7일, 오전, 트라이브 없음으로 조회한다', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    const arg = fx.load.mock.calls[0][0]
    expect(arg.days).toBe(7)
    expect(arg.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(arg.viewer).toEqual({ tribeId: null, timeOfDay: 'time_morning', weather: undefined, specialDays: undefined, newUser: false })
    expect(arg.bundleId).toBeNull()
  })

  it('모든 쿼리를 가상 유저와 조회 조건으로 넘긴다', async () => {
    const payload = { days: [{ date: '2026-10-05', entries: [] }] }
    fx.load.mockResolvedValue(payload)
    const res = await call(`?date=2026-10-05&days=3&tribe=${UUID}&time=time_night&weather=rain&special=holiday_today,anniversary_today&newUser=1&bundle=${UUID}`)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ...payload, tribes: [] })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(fx.load).toHaveBeenCalledWith({
      fromDate: '2026-10-05',
      days: 3,
      viewer: { tribeId: UUID, timeOfDay: 'time_night', weather: 'rain', specialDays: ['holiday_today', 'anniversary_today'], newUser: true },
      bundleId: UUID,
    })
  })

  it('빈 값(tribe=, weather=, special=)은 «고르지 않음»이다', async () => {
    await call('?date=2026-10-05&tribe=&weather=&special=&newUser=0')
    expect(fx.load.mock.calls[0][0].viewer).toEqual({
      tribeId: null,
      timeOfDay: 'time_morning',
      weather: undefined,
      specialDays: undefined,
      newUser: false,
    })
  })

  it('special=none은 «특일 없음»으로 넘긴다(저장된 값을 쓰지 않는다)', async () => {
    await call('?date=2026-10-05&special=none')
    expect(fx.load.mock.calls[0][0].viewer.specialDays).toEqual([])
  })

  it('트라이브 목록을 이름순으로 읽어 응답에 싣는다', async () => {
    fx.tribes = { data: [{ id: UUID, name: '러너' }], error: null }
    const res = await call('?date=2026-10-05')
    expect((await res.json()).tribes).toEqual([{ id: UUID, name: '러너' }])
    expect(fx.tribeOrder).toHaveBeenCalledWith('tribes', 'name', { ascending: true })
  })

  it('트라이브 읽기가 실패하면 빈 배열이 아니라 500이다', async () => {
    fx.tribes = { data: null, error: { message: 'secret detail' } }
    const res = await call('?date=2026-10-05')
    expect(res.status).toBe(500)
    const body = JSON.stringify(await res.json())
    expect(body).not.toContain('secret detail')
    expect(body).not.toContain('tribes')
  })

  it('조회가 실패하면 500이고 내부 오류 문구를 응답에 싣지 않는다', async () => {
    fx.load.mockRejectedValue(new Error('홈피드 미리보기 카드 조회 실패: secret detail'))
    const res = await call('?date=2026-10-05')
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret detail')
  })
})
