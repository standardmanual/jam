/**
 * GET /api/admin/recipes/badge-bundles — 등급 대응형 레시피 양식의 아이템 배지 묶음 검색 (티켓 20261114_1705 2회차)
 * 같은 컬렉션·같은 이름의 아이템 배지를 묶음으로 돌려주고, 4등급이 모두 갖춰진 묶음만 `complete`로 표시한다(갖춰지지 않은 묶음은 이유와 함께 내려
 * 양식이 «왜 못 고르는지» 보여 준다). 검색어·필터가 하나도 없으면 빈 목록이고, 관리자가 아니면 403이다. DB는 메모리 표 스텁이다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/recipes/badge-bundles/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

interface Row {
  id: string
  name: string
  rarity: string
  item_book_id: string | null
  type: string
  tribe_id: string | null
  deleted_at: string | null
}

const state = vi.hoisted(() => ({
  admin: true,
  rows: [] as Row[],
  /** 실제로 건 필터 기록 — 검색어·컬렉션이 쿼리까지 갔는지 본다 */
  seen: [] as string[],
}))

function row(id: string, name: string, rarity: string, extra: Partial<Row> = {}): Row {
  return { id, name, rarity, item_book_id: 'book-1', type: 'item', tribe_id: 'tribe-1', deleted_at: null, ...extra }
}

function badgesBuilder() {
  const filters: ((r: Row) => boolean)[] = []
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      state.seen.push(`eq:${col}`)
      filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val)
      return builder
    },
    not: (col: string, _op: string, val: unknown) => {
      filters.push((r) => (r as unknown as Record<string, unknown>)[col] !== val)
      return builder
    },
    is: (col: string, val: unknown) => {
      filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val)
      return builder
    },
    ilike: (col: string, pattern: string) => {
      state.seen.push(`ilike:${pattern}`)
      const needle = pattern.replace(/%/g, '')
      filters.push((r) => String((r as unknown as Record<string, unknown>)[col]).includes(needle))
      return builder
    },
    in: (col: string, vals: string[]) => {
      filters.push((r) => vals.includes((r as unknown as Record<string, string>)[col]))
      return builder
    },
    order: () => builder,
    limit: () => builder,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve({ data: state.rows.filter((r) => filters.every((f) => f(r))), error: null }).then(onFulfilled, onRejected),
  }
  return builder
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ from: () => badgesBuilder() }) }))
vi.mock('@/lib/admin/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/admin/auth')>()),
  getAdminUser: async () => (state.admin ? { id: 'admin-1' } : null),
}))

const { GET } = await import('../route')

const call = (query: string) => GET(new NextRequest(`https://j-a-m.app/api/admin/recipes/badge-bundles${query}`))

beforeEach(() => {
  state.admin = true
  state.seen = []
  state.rows = [
    row('sign-c', '팻말', 'common'),
    row('sign-r', '팻말', 'rare'),
    row('sign-e', '팻말', 'epic'),
    row('sign-m', '팻말', 'mystic'),
    row('flag-c', '깃발', 'common'),
    row('flag-r', '깃발', 'rare'),
    row('lone-c', '낱개', 'common', { item_book_id: null }),
    row('gone-c', '지운 묶음', 'common', { deleted_at: '2026-11-01T00:00:00Z' }),
  ]
})

describe('GET /api/admin/recipes/badge-bundles', () => {
  it('관리자가 아니면 403이다', async () => {
    state.admin = false
    const res = await call('?query=팻말')
    expect(res.status).toBe(403)
  })

  it('검색어와 필터가 하나도 없으면 빈 목록이다(전체 조회 금지)', async () => {
    const res = await call('')
    expect(await res.json()).toEqual({ bundles: [] })
  })

  it('이름으로 찾으면 4등급이 갖춰진 묶음은 complete와 common → mystic 순 배지 id를 준다', async () => {
    const res = await call('?query=팻말')
    const body = await res.json()

    expect(body.bundles).toEqual([
      {
        key: 'book-1:팻말',
        name: '팻말',
        itemBookId: 'book-1',
        complete: true,
        badgeIds: ['sign-c', 'sign-r', 'sign-e', 'sign-m'],
        reason: '',
      },
    ])
  })

  it('4등급이 모자란 묶음은 complete가 false이고 빈 등급을 이유로 알리며 배지 id는 비운다', async () => {
    const res = await call('?query=깃발')
    const [bundle] = (await res.json()).bundles

    expect(bundle.complete).toBe(false)
    expect(bundle.badgeIds).toEqual([])
    expect(bundle.reason).toBe('Epic·Mystic 등급이 없어요')
  })

  it('완비된 묶음이 앞에 오고, 컬렉션이 없는 배지와 삭제된 배지는 결과에 없다', async () => {
    const res = await call('?item_book_id=book-1')
    const names = (await res.json()).bundles.map((b: { name: string }) => b.name)

    expect(names).toEqual(['팻말', '깃발'])
  })

  it('검색어를 이름 필터로 거는데 와일드카드 문자는 지운다', async () => {
    await call('?query=' + encodeURIComponent('팻%말'))

    expect(state.seen).toContain('ilike:%팻 말%')
  })
})
