/**
 * 잠긴 개체는 목록·컬렉션 조회에서 서버가 뺀다 (티켓 20261018_0054 2회, 운영 로직 7.3절)
 *
 * 열기 전의 아이템 배지는 이름·그림·설명·컬렉션·트라이브·일련번호가 어느 화면에도 보이면 안 된다. 개체 행에서 배지 id를 읽어 컬렉션을 찾거나
 * 일련번호를 후보로 나열하는 조회가 잠긴 개체를 걸러내지 않으면 «어떤 컬렉션의 배지를 얻었는지»나 일련번호가 드러난다.
 * 아래 조회들이 `inventory_items`를 읽을 때 `locked = false` 조건을 거는지(= 서버에서 거르는지) 확인한다. 화면에서 숨기는 방식이 아니다.
 *
 * 대상: 타인·내 컬렉션 목록(`/{username}/collections`), 컬렉션 상세의 장착 후보(`/collections/[id]`), 믹스 재료(`/combine`),
 * 내 배지 목록의 컬렉션 발견 판정(`/badges`), `GET /api/itembooks`, `GET /api/users/[username]/itembooks`.
 * (`/{username}`의 카운트·레거시 피드는 `[username]/__tests__/page.test.tsx`, 배지 상세는 `badges/[id]/__tests__/page.locked.test.tsx`가 확인한다.)
 *
 * 모의 DB는 어떤 필터 체인이든 받고, 호출한 `eq` 인자를 표별로 기록한다. 조회가 끝까지 가지 않아도(모의 데이터가 얇아서) 기록은 남으므로
 * 페이지·핸들러가 중간에 던져도 기록만 본다.
 *
 * 실행: cd jam-web && npx vitest run src/app/__tests__/lockedItemExclusion.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  /** 표별 `single`·`maybeSingle` 응답 */
  single: {} as Record<string, Row | null>,
  /** 표별 목록 응답 */
  list: {} as Record<string, Row[]>,
  /** 호출 기록 — 표, 메서드, 인자 */
  calls: [] as { table: string; method: string; args: unknown[] }[],
}))

function makeBuilder(table: string): unknown {
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, method) {
        if (typeof method !== 'string') return undefined
        if (method === 'then') {
          return (resolve: (value: { data: Row[]; count: number; error: null }) => unknown) =>
            resolve({ data: state.list[table] ?? [], count: (state.list[table] ?? []).length, error: null })
        }
        return (...args: unknown[]) => {
          state.calls.push({ table, method, args })
          if (method === 'single' || method === 'maybeSingle') return Promise.resolve({ data: state.single[table] ?? null, error: null })
          return builder
        }
      },
    }
  )
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'viewer-1', email: 'viewer@example.com' } }, error: null }) },
    from: (table: string) => makeBuilder(table),
  }),
  createServiceClient: () => ({ from: (table: string) => makeBuilder(table) }),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

vi.mock('@/lib/admin/auth', () => ({ hasAdminAccess: async () => false }))
vi.mock('@/lib/onboarding-quest/screen-gate', () => ({ getOnboardingQuestGate: async () => null }))

/** 표 이름과 `eq('locked', false)` 호출이 있었는지 — 해당 표를 읽은 쿼리마다 따로 보지 못하므로 «표 기준 하나라도»가 아니라 개수로 본다 */
function lockedFilterCount(table: string): number {
  return state.calls.filter((c) => c.table === table && c.method === 'eq' && c.args[0] === 'locked' && c.args[1] === false).length
}

function selectCount(table: string): number {
  return state.calls.filter((c) => c.table === table && c.method === 'select').length
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  state.calls = []
  state.single = {
    users: { id: 'target-1', username: 'target', display_name: '타겟' },
    inventory: { id: 'inv-1' },
  }
  state.list = {}
})

describe('잠긴 개체는 컬렉션·후보 조회에서 서버가 뺀다', () => {
  it('/{username}/collections — 컬렉션 발견 판정에서 뺀다', async () => {
    const { default: Page } = await import('../(main)/[username]/collections/page')

    await Page({ params: Promise.resolve({ username: 'target' }) }).catch(() => undefined)

    expect(selectCount('inventory_items')).toBe(1)
    expect(lockedFilterCount('inventory_items')).toBe(1)
  })

  it('GET /api/users/[username]/itembooks — 컬렉션 발견 판정에서 뺀다', async () => {
    const { GET } = await import('../api/users/[username]/itembooks/route')

    await GET(new Request('http://localhost/api/users/target/itembooks'), { params: Promise.resolve({ username: 'target' }) }).catch(() => undefined)

    expect(selectCount('inventory_items')).toBe(1)
    expect(lockedFilterCount('inventory_items')).toBe(1)
  })

  it('GET /api/itembooks — 내 컬렉션 발견 판정에서 뺀다', async () => {
    const { GET } = await import('../api/itembooks/route')

    await GET().catch(() => undefined)

    expect(selectCount('inventory_items')).toBe(1)
    expect(lockedFilterCount('inventory_items')).toBe(1)
  })

  it('/combine — 믹스 재료 후보에서 뺀다(잠긴 개체는 재료로 쓸 수 없고 이름이 드러난다)', async () => {
    const { default: Page } = await import('../(main)/combine/page')

    await Page().catch(() => undefined)

    expect(selectCount('inventory_items')).toBe(1)
    expect(lockedFilterCount('inventory_items')).toBe(1)
  })

  it('/collections/[id] — 장착 후보에서 뺀다(잠긴 개체의 일련번호가 후보 목록에 실리지 않는다)', async () => {
    state.single.item_books = {
      id: 'book-1',
      name: '새벽 컬렉션',
      is_active: true,
      valid_from: null,
      valid_until: null,
      tier_mode: false,
      tribe: null,
      background_color: null,
    }
    state.list.badges = [{ id: 'badge-1', type: 'item', item_book_id: 'book-1', name: 'b', rarity: 'common', deleted_at: null, drop_excluded: false }]
    const { default: Page } = await import('../(main)/collections/[id]/page')

    await Page({ params: Promise.resolve({ id: 'book-1' }), searchParams: Promise.resolve({}) }).catch(() => undefined)

    expect(selectCount('inventory_items')).toBe(1)
    expect(lockedFilterCount('inventory_items')).toBe(1)
  })

  it('/badges — 내 아이템 배지 탭의 컬렉션 발견 판정(보유 배지 id)에서 뺀다', async () => {
    const badge = { id: 'x', name: '이름', image_url: null, rarity: 'common', deleted_at: null }
    state.single.inventory = {
      id: 'inv-1',
      inventory_items: [
        { id: 'item-locked', badge_id: 'badge-locked', serial_number: 1, expires_at: null, dropped_at: null, locked: true, badge },
        { id: 'item-open', badge_id: 'badge-open', serial_number: 2, expires_at: null, dropped_at: null, locked: false, badge },
        { id: 'item-old', badge_id: 'badge-old', serial_number: 3, expires_at: null, dropped_at: null, badge },
      ],
    }
    const { default: Page } = await import('../(main)/badges/page')

    await Page({ searchParams: Promise.resolve({}) }).catch(() => undefined)

    const ownedLookup = state.calls.find((c) => c.table === 'badges' && c.method === 'in' && c.args[0] === 'id')
    expect(ownedLookup, '보유 배지로 아이템북을 찾는 조회가 없다').toBeTruthy()
    expect((ownedLookup?.args[1] as string[]).sort()).toEqual(['badge-old', 'badge-open'])
  })
})
