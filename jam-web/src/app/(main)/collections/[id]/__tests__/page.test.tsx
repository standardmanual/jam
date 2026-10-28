/**
 * 컬렉션 상세 페이지 — 공개 전 컬렉션(정책 0행)은 notFound다 (티켓 20261006_1530)
 *
 * 마이그레이션 215 정책이 비활성·공개 전 컬렉션을 0행으로 돌려준다. 페이지의 `item_books` 조회는
 * `.maybeSingle()`이라 0행이 오류가 아니라 `notFound()`다. `.single()`로 되돌리면 같은 0행이 PGRST116
 * 오류로 서버 로그에 남으므로, 모킹은 `.single()` 0행에 그 오류를 내고 테스트는 `console.error`가
 * 불리지 않았는지도 확인한다. 404가 나면 그 뒤 소속 배지 조회는 하지 않는다.
 *
 * 4등급 컬렉션(`tier_mode`)은 이름 수만큼의 칸을 그린다(티켓 20261028_1408): 등급이 정해졌으면 그 등급의 배지만, 아무것도 장착하지
 * 않았으면 등급 없는 칸이다. 모의 Supabase는 필터를 무시하므로 소프트 삭제 배지도 조회 결과에 그대로 들어온다.
 *
 * 페이지 함수를 모의 Supabase로 직접 호출한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/collections/[id]/__tests__/page.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

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

import ItemBookDetailPage from '../page'
import SlotGrid from '../SlotGrid'
import ItemBookHeroSection from '../ItemBookHeroSection'

function callPage(searchParams: Record<string, string> = {}) {
  return ItemBookDetailPage({ params: Promise.resolve({ id: 'book-1' }), searchParams: Promise.resolve(searchParams) })
}

describe('컬렉션 상세 페이지 — 공개 전 컬렉션', () => {
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

  it('정책이 컬렉션을 0행으로 돌려주면 notFound()이고 오류 로그는 남지 않는다', async () => {
    state.tables.item_books = []

    await expect(callPage()).rejects.toThrow('NEXT_NOT_FOUND')

    expect(state.notFoundCalls).toBe(1)
    expect(state.calls.filter((c) => c.table === 'item_books' && c.method === 'maybeSingle')).toHaveLength(1)
    expect(state.calls.filter((c) => c.table === 'item_books' && c.method === 'single')).toHaveLength(0)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('404가 나면 소속 배지 조회까지 가지 않는다', async () => {
    state.tables.item_books = []

    await expect(callPage()).rejects.toThrow('NEXT_NOT_FOUND')

    expect(state.calls.filter((c) => c.table === 'badges')).toHaveLength(0)
  })
})

// ── 4등급 컬렉션 칸 (티켓 20261028_1408) ─────────────────────────────────────────────────

/** 페이지가 돌려준 요소 트리에서 조건에 맞는 요소를 모두 모은다(컴포넌트는 펼치지 않는다) */
function findElements(node: ReactNode, match: (el: ReactElement) => boolean, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    node.forEach((child) => findElements(child, match, out))
    return out
  }
  if (!isValidElement(node)) return out
  if (match(node)) out.push(node)
  findElements((node.props as { children?: ReactNode }).children, match, out)
  return out
}

/** 트리 안의 문자열을 이어 붙인다(컴포넌트는 펼치지 않는다) */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (!isValidElement(node)) return ''
  return textOf((node.props as { children?: ReactNode }).children)
}

const NAMES = Array.from({ length: 9 }, (_, i) => `이름${i + 1}`)
const RARITIES = ['common', 'rare', 'epic', 'mystic'] as const

function badgeRow(name: string, rarity: string, extra: Row = {}): Row {
  return {
    id: `${name}-${rarity}`,
    item_book_id: 'book-1',
    type: 'item',
    name,
    rarity,
    image_url: `img/${name}-${rarity}`,
    drop_excluded: false,
    created_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
    ...extra,
  }
}

function fullBookRows(): Row[] {
  return NAMES.flatMap((name) => RARITIES.map((rarity) => badgeRow(name, rarity)))
}

function slotRow(badgeId: string): Row {
  return { id: `slot-${badgeId}`, badge_id: badgeId, slotted_at: '2026-10-28T00:00:00Z', inventory_item_id: `inv-${badgeId}` }
}

function itemRow(badgeId: string, serial: number): Row {
  return {
    id: `${badgeId}#${serial}`,
    badge_id: badgeId,
    serial_number: serial,
    serial_prefix: 'AAAA',
    slotted_in: null,
    obtained_at: '2026-10-02T00:00:00Z',
    expires_at: null,
  }
}

function setBook(tierMode: boolean) {
  state.tables.item_books = [
    { id: 'book-1', name: '한강 컬렉션', description: null, image_url: null, story_text: null, is_active: true, valid_from: null, valid_until: null, tier_mode: tierMode, tribe: null },
  ]
  state.tables.inventory = [{ id: 'inventory-1' }]
}

async function renderGrid(searchParams: Record<string, string> = {}) {
  const tree = await callPage(searchParams)
  const grid = findElements(tree, (el) => el.type === SlotGrid)[0]
  const hero = findElements(tree, (el) => el.type === ItemBookHeroSection)[0]
  const gridProps = grid?.props as React.ComponentProps<typeof SlotGrid> | undefined
  const heroProps = hero.props as React.ComponentProps<typeof ItemBookHeroSection>
  const hint = findElements(tree, (el) => el.type === 'p' && textOf(el).includes('등급으로 모으고 있어요'))
  return { tree, gridProps, heroProps, hintTexts: hint.map(textOf) }
}

describe('컬렉션 상세 페이지 — 4등급 컬렉션의 칸', () => {
  let errorSpy: MockInstance

  beforeEach(() => {
    state.tables = {}
    state.calls = []
    state.notFoundCalls = 0
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setBook(true)
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('Rare를 처음 장착했으면 Rare 배지 9칸만 나오고 안내 한 줄이 한 번 보인다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-rare')]
    state.tables.inventory_items = [itemRow('이름2-rare', 1), itemRow('이름3-epic', 2)]

    const { gridProps, heroProps, hintTexts } = await renderGrid()

    expect(gridProps?.badgeSlots).toHaveLength(9)
    expect(gridProps?.badgeSlots.every((s) => s.badge.rarity === 'rare')).toBe(true)
    expect(gridProps?.tierUndecided).toBe(false)
    expect(gridProps?.readOnly).toBe(false)
    // Epic만 가진 이름3은 Rare 칸에 후보가 없어 «???» 칸이 된다
    expect(gridProps?.badgeSlots[1].candidates).toHaveLength(1)
    expect(gridProps?.badgeSlots[2].candidates).toHaveLength(0)
    expect(heroProps.totalBadgeCount).toBe(9)
    expect(heroProps.slottedCount).toBe(1)
    expect(hintTexts).toEqual(['Rare 등급으로 모으고 있어요. 장착한 배지를 모두 해제하면 다른 등급으로 다시 정할 수 있어요.'])
  })

  it('Common을 고정해도 안내에 등급 이름이 나온다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-common')]

    const { gridProps, hintTexts } = await renderGrid()

    expect(gridProps?.badgeSlots).toHaveLength(9)
    expect(hintTexts).toEqual(['Common 등급으로 모으고 있어요. 장착한 배지를 모두 해제하면 다른 등급으로 다시 정할 수 있어요.'])
  })

  it('아무것도 장착하지 않았으면 칸이 36개가 아니라 진행도 분모(9)와 같고 안내 한 줄이 없다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = []
    state.tables.inventory_items = [itemRow('이름1-epic', 1), itemRow('이름1-rare', 2)]

    const { gridProps, heroProps, hintTexts } = await renderGrid()

    expect(gridProps?.badgeSlots).toHaveLength(9)
    expect(gridProps?.badgeSlots).toHaveLength(heroProps.totalBadgeCount)
    expect(gridProps?.tierUndecided).toBe(true)
    expect(hintTexts).toEqual([])
    // 가진 이름은 낮은 등급 순 후보와 대표 그림, 못 가진 이름은 후보 없는 칸이다
    expect(gridProps?.badgeSlots[0].badge.id).toBe('이름1-rare')
    expect(gridProps?.badgeSlots[0].candidates.map((c) => c.rarity)).toEqual(['rare', 'epic'])
    expect(gridProps?.badgeSlots[1].candidates).toEqual([])
  })

  it('장착을 모두 해제하면(슬롯 0개) 같은 자리의 등급 없는 칸으로 돌아온다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-rare')]
    const fixed = await renderGrid()

    state.tables.user_item_book_slots = []
    const released = await renderGrid()

    expect(released.gridProps?.tierUndecided).toBe(true)
    expect(released.hintTexts).toEqual([])
    expect(released.gridProps?.badgeSlots.map((s) => s.cellKey)).toEqual(fixed.gridProps?.badgeSlots.map((s) => s.cellKey))
  })

  it('tier_mode가 꺼진 컬렉션은 이전과 같이 소속 아이템 배지 전부를 칸으로 그리고 안내가 없다', async () => {
    setBook(false)
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-rare')]

    const { gridProps, hintTexts } = await renderGrid()

    expect(gridProps?.badgeSlots).toHaveLength(36)
    expect(gridProps?.badgeSlots.every((s) => !('cellKey' in s))).toBe(true)
    expect(gridProps?.tierUndecided).toBe(false)
    expect(hintTexts).toEqual([])
  })

  it('타인 열람은 그 유저의 등급 기준 칸을 보여 주고 안내 한 줄이 없다', async () => {
    state.tables.users = [{ id: 'user-2', username: 'other' }]
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-epic')]

    const { gridProps, hintTexts } = await renderGrid({ u: 'other' })

    expect(gridProps?.readOnly).toBe(true)
    expect(gridProps?.badgeSlots).toHaveLength(9)
    expect(gridProps?.badgeSlots.every((s) => s.badge.rarity === 'epic')).toBe(true)
    expect(hintTexts).toEqual([])
  })

  it('타인 열람에서 슬롯이 0개이면 지금처럼 notFound다', async () => {
    state.tables.users = [{ id: 'user-2', username: 'other' }]
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = []

    await expect(renderGrid({ u: 'other' })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('소프트 삭제 배지에 꽂힌 슬롯의 등급을 컬렉션 등급으로 읽는다(서버의 tier_mismatch 판정과 같다)', async () => {
    const deleted = badgeRow('삭제된배지', 'rare', { deleted_at: '2026-10-20T00:00:00Z' })
    state.tables.badges = [deleted, ...fullBookRows()]
    state.tables.user_item_book_slots = [slotRow(deleted.id as string)]
    state.tables.inventory_items = [itemRow('이름1-rare', 1), itemRow('이름2-epic', 2)]

    const { gridProps, heroProps, hintTexts } = await renderGrid()

    expect(gridProps?.tierUndecided).toBe(false)
    expect(gridProps?.badgeSlots).toHaveLength(9)
    expect(gridProps?.badgeSlots.every((s) => s.badge.rarity === 'rare')).toBe(true)
    expect(gridProps?.badgeSlots.some((s) => s.badge.id === deleted.id)).toBe(false)
    // 장착한 칸이 없는 칸이라 Epic을 가진 이름2는 후보가 없다
    expect(gridProps?.badgeSlots[1].candidates).toEqual([])
    // 분모·분자는 삭제 배지를 계속 뺀다
    expect(heroProps.totalBadgeCount).toBe(9)
    expect(heroProps.slottedCount).toBe(0)
    expect(hintTexts).toHaveLength(1)
    expect(hintTexts[0]).toContain('Rare 등급으로')
  })

  it('삭제 배지를 조회에서 빼지 않고(.is 필터 없음) 화면 쪽에서 거른다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = []

    await renderGrid()

    expect(state.calls.filter((c) => c.table === 'badges' && c.method === 'is')).toHaveLength(0)
  })

  it('등급 컬렉션에 아이템 배지가 하나도 없으면 안내 한 줄과 격자를 그리지 않는다', async () => {
    state.tables.badges = []
    state.tables.user_item_book_slots = []

    const { gridProps, hintTexts } = await renderGrid()

    expect(gridProps).toBeUndefined()
    expect(hintTexts).toEqual([])
  })
})

// ── «모두 해제하기» 버튼에 내려보내는 값 (티켓 20261028_1420) ───────────────────────────────

describe('컬렉션 상세 페이지 — 모두 해제하기에 내려보내는 값', () => {
  let errorSpy: MockInstance

  beforeEach(() => {
    state.tables = {}
    state.calls = []
    state.notFoundCalls = 0
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setBook(true)
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('장착 개수는 이 컬렉션의 장착 행 수이고 등급이 정해졌으면 tierFixed다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-rare'), slotRow('이름2-rare')]

    const { gridProps } = await renderGrid()

    expect(gridProps?.slotCount).toBe(2)
    expect(gridProps?.tierFixed).toBe(true)
    expect(gridProps?.completed).toBe(false)
    expect(gridProps?.readOnly).toBe(false)
  })

  it('장착이 없으면 개수 0이고 tierFixed도 꺼져 있다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = []

    const { gridProps } = await renderGrid()

    expect(gridProps?.slotCount).toBe(0)
    expect(gridProps?.tierFixed).toBe(false)
  })

  it('소프트 삭제된 배지에 꽂힌 장착만 있어도 개수에 센다 — 격자에는 장착된 칸이 하나도 없다', async () => {
    const deleted = badgeRow('삭제된배지', 'rare', { deleted_at: '2026-10-20T00:00:00Z' })
    state.tables.badges = [deleted, ...fullBookRows()]
    state.tables.user_item_book_slots = [slotRow(deleted.id as string)]

    const { gridProps } = await renderGrid()

    // badgeSlots에서 slot != null을 세면 0이라 버튼이 사라진다 — 칸별 «해제»로 풀 수 없는 장착이 막다른 길이 된다
    expect(gridProps?.badgeSlots.filter((s) => s.slot != null)).toHaveLength(0)
    expect(gridProps?.slotCount).toBe(1)
    expect(gridProps?.tierFixed).toBe(true)
  })

  it('옛 완성 기록이 있는 컬렉션은 completed다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-rare')]
    state.tables.user_item_book_completions = [{ item_book_id: 'book-1' }]

    const { gridProps } = await renderGrid()

    expect(gridProps?.completed).toBe(true)
  })

  it('tier_mode가 꺼진 컬렉션은 개수만 있고 tierFixed는 꺼져 있다', async () => {
    setBook(false)
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-rare')]

    const { gridProps } = await renderGrid()

    expect(gridProps?.slotCount).toBe(1)
    expect(gridProps?.tierFixed).toBe(false)
  })

  it('타인 열람은 readOnly로 내려간다 — 그러면 SlotGrid가 개수와 관계없이 버튼을 그리지 않는다(SlotGrid.test.tsx)', async () => {
    state.tables.users = [{ id: 'user-2', username: 'other' }]
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-epic')]

    const { gridProps } = await renderGrid({ u: 'other' })

    expect(gridProps?.readOnly).toBe(true)
  })
})
