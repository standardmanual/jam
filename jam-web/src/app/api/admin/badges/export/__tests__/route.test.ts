/**
 * POST /api/admin/badges/export — 정상 경로(CSV)·CHUNK_SIZE 경계·빈 입력, 그리고 배지 조회 DB 오류는
 * 500과 한국어 안내로 알린다(티켓 20260924_1405, 20260926_1345).
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badges/export/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  /** badges 조회에 주입할 DB 오류 */
  dbError: null as { message: string } | null,
  /** badges 조회가 받은 id 묶음 */
  badgeCalls: [] as string[][],
  /** 조회된 id마다 돌려줄 행을 만든다 */
  makeRow: (id: string): Record<string, unknown> => ({
    id,
    name: `배지 ${id}`,
    type: 'activity',
    rarity: null,
    tribe_id: null,
    activity_types: null,
    patch_available: false,
    patch_price_krw: null,
    deleted_at: null,
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: (_column: string, ids: string[]) => {
          if (table === 'tribes') return Promise.resolve({ data: [], error: null })
          state.badgeCalls.push(ids)
          if (state.dbError) return Promise.resolve({ data: null, error: state.dbError })
          return Promise.resolve({ data: ids.map(state.makeRow), error: null })
        },
      }),
    }),
  }),
}))
vi.mock('@/lib/admin/auth', () => ({ requireAdmin: async () => null }))

const { POST } = await import('../route')

const uid = (n: number | string) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const A = uid('a'.charCodeAt(0))
const B = uid('b'.charCodeAt(0))

const post = (body: unknown) =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/badges/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

beforeEach(() => {
  state.dbError = null
  state.badgeCalls = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/admin/badges/export', () => {
  it('DB 오류면 500과 한국어 안내를 돌려주고 DB 원문은 노출하지 않는다', async () => {
    state.dbError = { message: 'connection reset' }
    const res = await post({ ids: [A] })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/^배지를 내보내지 못했어요\./)
    expect(body.error).not.toContain('connection reset')
  })

  it('정상 경로: CSV 첨부로 헤더와 선택한 배지 행을 돌려준다', async () => {
    const res = await post({ ids: [A, B] })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="badges_\d{8}\.csv"$/)
    const csv = await res.text()
    expect(csv).toContain('ID')
    expect(csv).toContain(`배지 ${A}`)
    expect(csv).toContain(`배지 ${B}`)
    expect(csv).toContain('활성')
  })

  it('중복 id는 한 번만 조회한다', async () => {
    await post({ ids: [A, A, B] })
    expect(state.badgeCalls).toEqual([[A, B]])
  })

  it('CHUNK_SIZE(200) 경계: 200건은 한 묶음, 201건은 두 묶음으로 읽고 모든 행을 내보낸다', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => uid(i))

    await post({ ids: ids.slice(0, 200) })
    expect(state.badgeCalls.map((c) => c.length)).toEqual([200])

    state.badgeCalls = []
    const res = await post({ ids })
    expect(state.badgeCalls.map((c) => c.length)).toEqual([200, 1])
    const csv = await res.text()
    expect(csv).toContain(`배지 ${uid(0)}`)
    expect(csv).toContain(`배지 ${uid(200)}`)
  })

  it('빈 ids·잘못된 본문은 DB를 읽기 전에 400이다', async () => {
    const empty = await post({ ids: [] })
    expect(empty.status).toBe(400)
    expect((await empty.json()).error).toBe('내보낼 배지를 선택해주세요.')

    const wrong = await post({ ids: [1, 2] })
    expect(wrong.status).toBe(400)
    expect(state.badgeCalls).toEqual([])
  })
})
