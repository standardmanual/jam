/**
 * 배지 목록 페이지 — 임베드 `badge`가 null인 행은 빠지고 화면 데이터가 만들어진다 (티켓 20261006_1530)
 *
 * 마이그레이션 216 정책이 공개 전 배지를 0행으로 돌려주면 `user_activity_badges(*, badge:badges(*))`와
 * `inventory_items(…, badge:badges(…))` 임베드의 `badge`가 null로 온다. 페이지는 `r.badge &&`·
 * `item.badge &&`로 그 행을 거르므로, 거르지 않으면 `r.badge.deleted_at`에서 TypeError로 화면이 죽는다.
 * 화면(BadgesClient)은 모의 컴포넌트로 바꿔 **페이지가 넘기는 값**만 본다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/__tests__/page.test.tsx"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  /** `in(column, ids)`에 실제 넘어온 id 목록 */
  inCalls: [] as { table: string; column: string; ids: unknown[] }[],
}))

/** 어떤 필터 체인이든 받는다. 끝(await·`.maybeSingle()`)에서 테이블 행을 돌려준다. */
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
        return (...args: unknown[]) => {
          if (method === 'in') state.inCalls.push({ table, column: String(args[0]), ids: args[1] as unknown[] })
          if (method === 'maybeSingle') return Promise.resolve({ data: rows[0] ?? null, error: null })
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
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

vi.mock('../BadgesClient', () => ({ default: () => null }))

import BadgesPage from '../page'

const OK_BADGE = { id: 'badge-ok', name: '살아있는 배지', type: 'activity', deleted_at: null }

async function renderProps() {
  const element = (await BadgesPage({ searchParams: Promise.resolve({}) })) as ReactElement<{
    badges: { badge: { id: string }; earned: { id: string } }[]
    itemBooks: unknown[]
    itemBookProgress: unknown[]
    checkinBadges: unknown[]
  }>
  return element.props
}

describe('배지 목록 페이지 — 임베드 badge가 null인 행', () => {
  beforeEach(() => {
    state.tables = {}
    state.inCalls = []
  })

  it('액티비티 탭: badge가 null인 획득 행은 빠지고 나머지는 남는다', async () => {
    state.tables.user_activity_badges = [
      { id: 'earn-hidden', badge_id: 'badge-hidden', badge: null },
      { id: 'earn-ok', badge_id: 'badge-ok', badge: OK_BADGE },
    ]

    const props = await renderProps()

    expect(props.badges.map((b) => b.earned.id)).toEqual(['earn-ok'])
    expect(props.badges[0].badge.id).toBe('badge-ok')
  })

  it('아이템배지 탭: badge가 null인 인벤토리 행은 빠져 컬렉션 조회에 id가 실리지 않는다', async () => {
    state.tables.inventory = [
      {
        id: 'inv-1',
        inventory_items: [
          { id: 'item-hidden', badge_id: 'badge-hidden', serial_number: 1, expires_at: null, dropped_at: null, badge: null },
          {
            id: 'item-ok',
            badge_id: 'badge-ok',
            serial_number: 2,
            expires_at: null,
            dropped_at: null,
            badge: { id: 'badge-ok', name: '살아있는 배지', image_url: null, rarity: 'common', deleted_at: null },
          },
        ],
      },
    ]

    const props = await renderProps()

    expect(state.inCalls.filter((c) => c.table === 'badges' && c.column === 'id')).toEqual([
      { table: 'badges', column: 'id', ids: ['badge-ok'] },
    ])
    expect(props.itemBooks).toEqual([])
    expect(props.itemBookProgress).toEqual([])
  })

  it('모든 행의 badge가 null이면 오류 없이 빈 목록으로 그려진다', async () => {
    state.tables.user_activity_badges = [{ id: 'earn-hidden', badge_id: 'badge-hidden', badge: null }]
    state.tables.inventory = [
      {
        id: 'inv-1',
        inventory_items: [
          { id: 'item-hidden', badge_id: 'badge-hidden', serial_number: 1, expires_at: null, dropped_at: null, badge: null },
        ],
      },
    ]

    const props = await renderProps()

    expect(props.badges).toEqual([])
    expect(props.itemBooks).toEqual([])
    expect(props.itemBookProgress).toEqual([])
    expect(state.inCalls.filter((c) => c.table === 'badges')).toHaveLength(0)
  })
})
