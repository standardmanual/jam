/**
 * POST /api/admin/badges/list-bulk deactivate — 이미 비활성인 배지는 건너뛰고 `deleted_at`을 다시 쓰지
 * 않는다(티켓 20260924_1404). DB는 기록형 스텁이라 어떤 id에 어떤 갱신이 나갔는지 그대로 확인한다.
 * 오류 경로·묶음 경계·빈 ids와 DB 오류 원문 미노출은 티켓 20260926_1345(1340·0238 일부)에서 채웠고,
 * 트라이브 지정(assign_tribe) 경로의 오류 3곳은 티켓 20260926_1409에서 채웠다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/badges/list-bulk/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { confirmPhraseFor } from '@/lib/admin/bulk/shared'

const ACTIVE = '00000000-0000-4000-8000-000000000001'
const INACTIVE = '00000000-0000-4000-8000-000000000002'
const ORIGINAL_DELETED_AT = '2026-09-01T00:00:00.000Z'

const state = vi.hoisted(() => ({
  updates: [] as { patch: Record<string, unknown>; ids: string[] }[],
  dropCountIds: [] as string[][],
  sideEffectIds: [] as string[][],
  /** badges 조회(`select().in()`)에 주입할 DB 오류 */
  readError: null as { message: string } | null,
  /** poi_drops 집계에 주입할 DB 오류 */
  dropError: null as { message: string } | null,
  /** badges 삭제에 주입할 DB 오류 */
  deleteError: null as { message: string } | null,
  /** tribes 조회(`select().eq().maybeSingle()`)에 주입할 DB 오류 */
  tribeError: null as { message: string } | null,
  /** item_books 전량 조회에 주입할 DB 오류 */
  booksError: null as { message: string } | null,
  /** badges 조회가 받은 id 묶음 — READ_CHUNK_SIZE 경계 확인용 */
  readCalls: [] as string[][],
  /** true면 ROWS에 없는 id도 활성 배지로 돌려준다(묶음 경계 테스트용) */
  unknownAsActive: false,
}))

const ROWS = [
  { id: ACTIVE, name: '활성 배지', deleted_at: null },
  { id: INACTIVE, name: '꺼진 배지', deleted_at: ORIGINAL_DELETED_AT },
]

const fakeClient = {
  from(table: string) {
    return {
      select: (_columns?: string, _options?: unknown) => {
        const query = {
          // 트라이브 존재 확인 — 조회 결과는 「있음」 고정, 오류만 주입한다.
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: state.tribeError ? null : { id: 'tribe-1' }, error: state.tribeError }),
          }),
          in: (_column: string, ids: string[]) => {
            if (table === 'poi_drops') {
              state.dropCountIds.push(ids)
              const result = Promise.resolve({ count: state.dropError ? null : 3, error: state.dropError })
              return { eq: () => ({ is: () => result }) }
            }
            state.readCalls.push(ids)
            if (state.readError) return Promise.resolve({ data: null, error: state.readError })
            const data = state.unknownAsActive
              ? ids.map((id) => ROWS.find((r) => r.id === id) ?? { id, name: `배지 ${id}`, deleted_at: null })
              : ROWS.filter((r) => ids.includes(r.id))
            return Promise.resolve({ data, error: null })
          },
        }
        // item_books는 필터 없이 `select()`를 바로 await한다(전량 조회).
        if (table === 'item_books') {
          return Object.assign(
            Promise.resolve({ data: state.booksError ? null : [], error: state.booksError }),
            query
          )
        }
        return query
      },
      delete: () => ({
        in: () => ({
          select: () => Promise.resolve({ data: state.deleteError ? null : [], error: state.deleteError }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        in: (_column: string, ids: string[]) => {
          state.updates.push({ patch, ids })
          return { select: () => Promise.resolve({ data: ids.map((id) => ({ id })), error: null }) }
        },
      }),
    }
  },
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => ({ id: 'admin-1', email: 'me@jam.app' }),
}))
// 삭제 경로 오류 응답만 보려는 테스트라 참조 카운트는 「참조 없음」으로 고정한다.
vi.mock('@/lib/admin/badge-references', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/badge-references')>()),
  collectBadgeReferences: async () => ({
    counts: {},
    total: 0,
    blockingTotal: 0,
    cascadeTotal: 0,
    error: null,
  }),
}))
vi.mock('@/lib/admin/badge-deactivate', () => ({
  runBadgeDeactivationSideEffects: async (_supabase: unknown, ids: string[]) => {
    state.sideEffectIds.push(ids)
  },
}))

const { POST } = await import('../route')

const post = (body: unknown) =>
  POST(
    new NextRequest('https://j-a-m.app/api/admin/badges/list-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

beforeEach(() => {
  state.updates = []
  state.dropCountIds = []
  state.sideEffectIds = []
  state.readError = null
  state.dropError = null
  state.deleteError = null
  state.tribeError = null
  state.booksError = null
  state.readCalls = []
  state.unknownAsActive = false
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('deactivate — 이미 비활성인 배지', () => {
  it('실행: 활성 배지만 갱신하고 이미 비활성은 건너뜀으로 보고하며 그 배지의 deleted_at은 쓰지 않는다', async () => {
    const res = await post({ ids: [ACTIVE, INACTIVE], action: 'deactivate' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.processed).toEqual([ACTIVE])
    expect(data.skipped).toEqual([{ id: INACTIVE, label: '꺼진 배지', reason: '이미 비활성 상태입니다.' }])

    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].ids).toEqual([ACTIVE])
    expect(state.updates[0].ids).not.toContain(INACTIVE)
    expect(state.sideEffectIds).toEqual([[ACTIVE]])
  })

  it('전부 이미 비활성이면 아무것도 갱신하지 않는다', async () => {
    const res = await post({ ids: [INACTIVE], action: 'deactivate' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.processed).toEqual([])
    expect(data.skipped).toHaveLength(1)
    expect(state.updates).toEqual([])
  })

  it('미리보기: 건너뜀을 함께 보여 주고 드랍 수는 비활성화될 배지만 센다', async () => {
    const res = await post({ ids: [ACTIVE, INACTIVE], action: 'deactivate', dry_run: true })
    const data = await res.json()
    expect(data.dryRun).toBe(true)
    expect(data.processed).toEqual([ACTIVE])
    expect(data.skipped).toEqual([{ id: INACTIVE, label: '꺼진 배지', reason: '이미 비활성 상태입니다.' }])
    expect(data.impact).toEqual({ droppableCount: 3 })
    expect(state.dropCountIds).toEqual([[ACTIVE]])
    expect(state.updates).toEqual([])
  })
})

describe('오류 경로 — DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다', () => {
  const RAW = 'connection reset by peer'

  it('deactivate 사전 조회 오류: 500과 고정 한국어 문장, 갱신 없음, 원문은 로그', async () => {
    state.readError = { message: RAW }
    const res = await post({ ids: [ACTIVE], action: 'deactivate' })
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toMatch(/^배지 정보를 불러오지 못했어요\./)
    expect(JSON.stringify(data)).not.toContain(RAW)
    expect(state.updates).toEqual([])
    expect(console.error).toHaveBeenCalledWith('[badges list-bulk] 비활성화 대상 조회 오류:', RAW)
  })

  it('deactivate 미리보기의 드랍 수 집계 오류: 500과 고정 한국어 문장', async () => {
    state.dropError = { message: RAW }
    const res = await post({ ids: [ACTIVE], action: 'deactivate', dry_run: true })
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toMatch(/^영향받는 드랍 수를 세지 못했어요\./)
    expect(JSON.stringify(data)).not.toContain(RAW)
    expect(console.error).toHaveBeenCalledWith('[badges list-bulk] 무효화될 드랍 수 집계 오류:', RAW)
  })

  it('delete 삭제 오류: 500과 고정 한국어 문장', async () => {
    state.deleteError = { message: RAW }
    const res = await post({
      ids: [ACTIVE],
      action: 'delete',
      confirm_phrase: confirmPhraseFor('삭제', 1),
    })
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toMatch(/^배지를 삭제하지 못했어요\./)
    expect(JSON.stringify(data)).not.toContain(RAW)
    expect(console.error).toHaveBeenCalledWith('[badges list-bulk delete] 삭제 실패:', RAW)
  })

  describe('assign_tribe — 트라이브 지정 경로(티켓 20260926_1409)', () => {
    const assign = (dry_run = false) =>
      post({ ids: [ACTIVE], action: 'assign_tribe', payload: { tribe_id: 'tribe-1' }, dry_run })

    it('트라이브 조회 오류: 500과 고정 한국어 문장, 갱신 없음, 원문은 로그', async () => {
      state.tribeError = { message: RAW }
      const res = await assign()
      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toMatch(/^배지 정보를 불러오지 못했어요\./)
      expect(JSON.stringify(data)).not.toContain(RAW)
      expect(state.readCalls).toEqual([])
      expect(state.updates).toEqual([])
      expect(console.error).toHaveBeenCalledWith('[badges list-bulk] 트라이브 조회 오류:', RAW)
    })

    it('대상 배지 조회(.in) 오류: 500과 고정 한국어 문장, 갱신 없음, 원문은 로그', async () => {
      state.readError = { message: RAW }
      const res = await assign()
      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toMatch(/^배지 정보를 불러오지 못했어요\./)
      expect(JSON.stringify(data)).not.toContain(RAW)
      expect(state.updates).toEqual([])
      expect(console.error).toHaveBeenCalledWith('[badges list-bulk] 트라이브 지정 대상 조회 오류:', RAW)
    })

    it('item_books 전량 조회 오류: 500과 고정 한국어 문장, 갱신 없음, 원문은 로그', async () => {
      state.booksError = { message: RAW }
      const res = await assign()
      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toMatch(/^배지 정보를 불러오지 못했어요\./)
      expect(JSON.stringify(data)).not.toContain(RAW)
      expect(state.updates).toEqual([])
      expect(console.error).toHaveBeenCalledWith('[badges list-bulk] 컬렉션 조회 오류:', RAW)
    })

    it('오류가 없으면 같은 스텁으로 200(미리보기)까지 간다 — 스텁이 오류 3곳 밖에서는 정상임을 확인', async () => {
      const res = await assign(true)
      expect(res.status).toBe(200)
      expect((await res.json()).dryRun).toBe(true)
      expect(console.error).not.toHaveBeenCalled()
    })
  })
})

describe('경계 입력', () => {
  it('사전 조회는 200건씩 묶어 읽는다(201건이면 두 묶음)', async () => {
    state.unknownAsActive = true
    const ids = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i + 100).padStart(12, '0')}`)
    const res = await post({ ids, action: 'deactivate', dry_run: true })
    expect(res.status).toBe(200)
    expect(state.readCalls.map((c) => c.length)).toEqual([200, 1])
    const data = await res.json()
    expect(data.processed).toHaveLength(201)
  })

  it('정확히 200건이면 한 묶음이다', async () => {
    state.unknownAsActive = true
    const ids = Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i + 100).padStart(12, '0')}`)
    const res = await post({ ids, action: 'deactivate', dry_run: true })
    expect(res.status).toBe(200)
    expect(state.readCalls.map((c) => c.length)).toEqual([200])
  })

  it('빈 ids는 DB를 읽기 전에 400으로 막는다', async () => {
    const res = await post({ ids: [], action: 'deactivate' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('대상 ID가 없습니다.')
    expect(state.readCalls).toEqual([])
    expect(state.updates).toEqual([])
  })
})
