/**
 * 배지 상세 페이지 — 공개 전 배지(정책 0행)는 notFound다 (티켓 20261006_1530)
 *
 * 마이그레이션 216 정책이 공개 전 활동 배지·비공개 컬렉션 소속 배지를 0행으로 돌려준다.
 * 페이지의 `badges` 조회는 `.maybeSingle()`이라 0행이 오류가 아니라 `notFound()`다.
 * `.single()`로 되돌리면 같은 0행이 PGRST116 오류로 서버 로그에 남으므로, 모킹은 `.single()` 0행에 그
 * 오류를 내고 테스트는 `console.error`가 불리지 않았는지도 확인한다.
 *
 * 페이지 함수를 모의 Supabase로 직접 호출한다(저장소 첫 서버 페이지 테스트 본보기).
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/[id]/__tests__/page.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  calls: [] as { table: string; method: string }[],
  notFoundCalls: 0,
}))

/** 어떤 필터 체인이든 받는다. 끝(await·`.single()`·`.maybeSingle()`)에서 테이블 행을 돌려준다. */
function makeBuilder(table: string): unknown {
  const rows = state.tables[table] ?? []
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== 'string') return undefined
        if (method === 'then') {
          return (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null })
        }
        return () => {
          state.calls.push({ table, method })
          if (method === 'maybeSingle') return Promise.resolve({ data: rows[0] ?? null, error: null })
          if (method === 'single') {
            return Promise.resolve({
              data: rows[0] ?? null,
              error: rows.length === 0 ? { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } : null,
            })
          }
          return builder
        }
      },
    }
  )
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table: string) => makeBuilder(table),
  }),
  createServiceClient: () => ({ from: (table: string) => makeBuilder(table) }),
}))

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    state.notFoundCalls += 1
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

import BadgeDetailPage from '../page'

function callPage() {
  return BadgeDetailPage({ params: Promise.resolve({ id: 'badge-1' }), searchParams: Promise.resolve({}) })
}

describe('배지 상세 페이지 — 공개 전 배지', () => {
  let errorSpy: MockInstance

  beforeEach(() => {
    state.tables = {}
    state.calls = []
    state.notFoundCalls = 0
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('정책이 배지를 0행으로 돌려주면 notFound()이고 오류 로그는 남지 않는다', async () => {
    state.tables.badges = []

    await expect(callPage()).rejects.toThrow('NEXT_NOT_FOUND')

    expect(state.notFoundCalls).toBe(1)
    expect(state.calls.filter((c) => c.table === 'badges' && c.method === 'maybeSingle')).toHaveLength(1)
    expect(state.calls.filter((c) => c.table === 'badges' && c.method === 'single')).toHaveLength(0)
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
