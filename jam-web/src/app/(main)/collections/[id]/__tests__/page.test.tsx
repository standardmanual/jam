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
 * 꺼진 컬렉션(비활성·시작 전)은 개체가 한 번이라도 만들어졌으면(`issued_item_books` 행) 열리고, 기록이 없으면 404다
 * (티켓 20261106_1228). 켜진 컬렉션은 기록을 읽지 않는다.
 *
 * 페이지 함수를 모의 Supabase로 직접 호출한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/collections/[id]/__tests__/page.test.tsx"
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'

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
  // 아래 «꺼진 컬렉션» 시험이 SlotGrid를 서버 렌더로 그린다 — 그 안의 useRouter 대용
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

import ItemBookDetailPage from '../page'
import SlotGrid from '../SlotGrid'
import ProgressCountBar from '@/components/ui/ProgressCountBar'
import { deriveCoverTicketHex } from '@/lib/badgeTicket/ticketColor'
import { d } from '@/lib/i18n'

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

/**
 * 페이지가 돌려준 요소 트리에서 조건에 맞는 요소를 모두 모은다(컴포넌트는 펼치지 않는다).
 * 티켓 틀(`BadgeTicket`)은 `photo`·`afterPhoto`·`body` 프롭으로 내용을 받으므로 children만이 아니라 요소를 담은 모든 프롭을 따라간다.
 */
function findElements(node: ReactNode, match: (el: ReactElement) => boolean, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    node.forEach((child) => findElements(child, match, out))
    return out
  }
  if (!isValidElement(node)) return out
  if (match(node)) out.push(node)
  for (const value of Object.values(node.props as Record<string, unknown>)) {
    if (Array.isArray(value) || isValidElement(value)) findElements(value as ReactNode, match, out)
  }
  return out
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
  const bar = findElements(tree, (el) => el.type === ProgressCountBar)[0]
  const gridProps = grid?.props as React.ComponentProps<typeof SlotGrid> | undefined
  // 모으는 중에만 진행 바를 그린다(완성이면 초록 완성 알림이 대신한다) — 분모·분자는 바의 프롭이다
  const progress = bar ? (bar.props as React.ComponentProps<typeof ProgressCountBar>) : undefined
  return { tree, gridProps, progress }
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

  it('Rare를 처음 장착했으면 Rare 배지 9칸만 나오고 격자에 등급 고정을 알린다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-rare')]
    state.tables.inventory_items = [itemRow('이름2-rare', 1), itemRow('이름3-epic', 2)]

    const { gridProps, progress } = await renderGrid()

    expect(gridProps?.badgeSlots).toHaveLength(9)
    expect(gridProps?.badgeSlots.every((s) => s.badge.rarity === 'rare')).toBe(true)
    expect(gridProps?.tierUndecided).toBe(false)
    expect(gridProps?.readOnly).toBe(false)
    // Epic만 가진 이름3은 Rare 칸에 후보가 없어 미발견 칸이 된다
    expect(gridProps?.badgeSlots[1].candidates).toHaveLength(1)
    expect(gridProps?.badgeSlots[2].candidates).toHaveLength(0)
    expect(progress?.total).toBe(9)
    expect(progress?.current).toBe(1)
    // 진행 바 채움은 홈 캡슐 게이지와 같은 색이다(2026-11-25 사용자 지시)
    expect(progress?.color).toBe('var(--capsule-fill)')
    expect(gridProps?.tierFixed).toBe(true)
  })

  it('Common을 고정해도 격자에 등급 고정을 알린다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-common')]

    const { gridProps } = await renderGrid()

    expect(gridProps?.badgeSlots).toHaveLength(9)
    expect(gridProps?.tierFixed).toBe(true)
  })

  // 컬렉션 이름 위의 등급 칩(2026-11-25 사용자 지시): 지금 장착한 배지의 등급, Common은 칩이 없다
  function titleChipHtml(html: string) {
    return html.match(/titleTop[^"]*">(.*?)<h1/)?.[1] ?? ''
  }

  it('Rare를 장착했으면 이름 위에 Rare 칩을 그린다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-rare')]

    const html = renderToStaticMarkup(await callPage())

    expect(titleChipHtml(html)).toContain('Rare')
  })

  it('Common을 장착했으면 이름 위에 칩이 없다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-common')]

    const html = renderToStaticMarkup(await callPage())

    expect(titleChipHtml(html)).toBe('')
  })

  it('아무것도 장착하지 않았으면 등급이 없어 이름 위에 칩이 없다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = []

    const html = renderToStaticMarkup(await callPage())

    expect(titleChipHtml(html)).toBe('')
  })

  it('아무것도 장착하지 않았으면 칸이 36개가 아니라 진행도 분모(9)와 같고 등급 고정 표시가 없다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = []
    state.tables.inventory_items = [itemRow('이름1-epic', 1), itemRow('이름1-rare', 2)]

    const { gridProps, progress } = await renderGrid()

    expect(gridProps?.badgeSlots).toHaveLength(9)
    expect(gridProps?.badgeSlots).toHaveLength(progress?.total ?? -1)
    expect(gridProps?.tierUndecided).toBe(true)
    expect(gridProps?.tierFixed).toBe(false)
    // 가진 이름은 낮은 등급 순 후보와 대표 그림, 못 가진 이름은 후보 없는 칸이다
    expect(gridProps?.badgeSlots[0].badge.id).toBe('이름1-rare')
    expect(gridProps?.badgeSlots[0].candidates.map((c) => c.rarity)).toEqual(['rare', 'epic'])
    expect(gridProps?.badgeSlots[1].candidates).toEqual([])
  })

  it('장착을 모두 빼면(슬롯 0개) 같은 자리의 등급 없는 칸으로 돌아온다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-rare')]
    const fixed = await renderGrid()

    state.tables.user_item_book_slots = []
    const released = await renderGrid()

    expect(released.gridProps?.tierUndecided).toBe(true)
    expect(released.gridProps?.tierFixed).toBe(false)
    expect(released.gridProps?.badgeSlots.map((s) => s.cellKey)).toEqual(fixed.gridProps?.badgeSlots.map((s) => s.cellKey))
  })

  it('tier_mode가 꺼진 컬렉션은 이전과 같이 소속 아이템 배지 전부를 칸으로 그리고 등급 고정 표시가 없다', async () => {
    setBook(false)
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-rare')]

    const { gridProps } = await renderGrid()

    expect(gridProps?.badgeSlots).toHaveLength(36)
    expect(gridProps?.badgeSlots.every((s) => !('cellKey' in s))).toBe(true)
    expect(gridProps?.tierUndecided).toBe(false)
    expect(gridProps?.tierFixed).toBe(false)
  })

  it('타인 열람은 그 유저의 등급 기준 칸을 보여 준다', async () => {
    state.tables.users = [{ id: 'user-2', username: 'other' }]
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = [slotRow('이름1-epic')]

    const { gridProps } = await renderGrid({ u: 'other' })

    expect(gridProps?.readOnly).toBe(true)
    expect(gridProps?.badgeSlots).toHaveLength(9)
    expect(gridProps?.badgeSlots.every((s) => s.badge.rarity === 'epic')).toBe(true)
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

    const { gridProps, progress } = await renderGrid()

    expect(gridProps?.tierUndecided).toBe(false)
    expect(gridProps?.badgeSlots).toHaveLength(9)
    expect(gridProps?.badgeSlots.every((s) => s.badge.rarity === 'rare')).toBe(true)
    expect(gridProps?.badgeSlots.some((s) => s.badge.id === deleted.id)).toBe(false)
    // 장착한 칸이 없는 칸이라 Epic을 가진 이름2는 후보가 없다
    expect(gridProps?.badgeSlots[1].candidates).toEqual([])
    // 분모·분자는 삭제 배지를 계속 뺀다
    expect(progress?.total).toBe(9)
    expect(progress?.current).toBe(0)
    expect(gridProps?.tierFixed).toBe(true)
  })

  it('삭제 배지를 조회에서 빼지 않고(.is 필터 없음) 화면 쪽에서 거른다', async () => {
    state.tables.badges = fullBookRows()
    state.tables.user_item_book_slots = []

    await renderGrid()

    expect(state.calls.filter((c) => c.table === 'badges' && c.method === 'is')).toHaveLength(0)
  })

  it('등급 컬렉션에 아이템 배지가 하나도 없으면 격자를 그리지 않는다', async () => {
    state.tables.badges = []
    state.tables.user_item_book_slots = []

    const { gridProps } = await renderGrid()

    expect(gridProps).toBeUndefined()
  })
})

// ── «모두 빼기» 버튼에 내려보내는 값 (티켓 20261028_1420) ───────────────────────────────

describe('컬렉션 상세 페이지 — 모두 빼기에 내려보내는 값', () => {
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

    // badgeSlots에서 slot != null을 세면 0이라 버튼이 사라진다 — 칸별 «빼기»로 풀 수 없는 장착이 막다른 길이 된다
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
    // 완성하면 진행 바 자리에 검정 완성 알림이 온다(글자 상자 아래, 티켓 20261124_2253). «완성» 칩은 없다(2026-11-25 사용자 지시)
    const tree = await callPage()
    expect(findElements(tree, (el) => el.type === ProgressCountBar)).toHaveLength(0)
    const html = renderToStaticMarkup(tree)
    expect(html).toContain(d.itembooks.completedTitle)
    expect(html).toMatch(/bg-accent[^"]*"[^>]*><p[^>]*>컬렉션 완성!/)
    expect(html).not.toContain('bg-jam-green')
    expect(html).not.toContain(`>${d.itembooks.completed}<`)
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

// ── 꺼진 컬렉션의 열람 (티켓 20261106_1228) ─────────────────────────────────────────────

// ── 티켓 틀과 표지색 파생 티켓색 (티켓 20261124_2253) ───────────────────────────────────

describe('컬렉션 상세 페이지 — 티켓 틀', () => {
  let errorSpy: MockInstance
  const BG = '#99fff3'

  function setTicketBook(extra: Row = {}) {
    state.tables.item_books = [
      {
        id: 'book-1', name: '유리 칸 닦는 아침', description: '창을 닦아요. 오늘도 맑아요.', image_url: 'https://example.com/cover.png',
        story_text: '이야기 한 줄', is_active: true, valid_from: null, valid_until: null, tier_mode: false, tribe: null,
        cover_params: { bgHex: BG }, ...extra,
      },
    ]
    state.tables.inventory = [{ id: 'inventory-1' }]
    state.tables.badges = [
      badgeRow('이름1', 'common', { image_url: null }),
      badgeRow('체크인1', 'common', { id: 'checkin-1', type: 'checkin' }),
    ]
    state.tables.user_item_book_slots = []
  }

  beforeEach(() => {
    state.tables = {}
    state.calls = []
    state.notFoundCalls = 0
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setTicketBook()
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('첫 HTML에 data-ticket-color="cover"와 표지색에서 파생한 --ticket이 들어 있다', async () => {
    const html = renderToStaticMarkup(await callPage())

    expect(html).toContain('data-ticket-color="cover"')
    expect(html).toContain(`--ticket:${deriveCoverTicketHex(BG)}`)
    expect(html).toContain('--ticket-text:')
    expect(html).toContain('--card-mix:')
  })

  it('cover_params가 없거나 형식이 틀려도 통합 팔레트 색으로 그린다', async () => {
    for (const cover of [null, {}, { bgHex: 'red' }, { bgHex: 12 }]) {
      setTicketBook({ cover_params: cover })
      const html = renderToStaticMarkup(await callPage())
      expect(html).toContain('data-ticket-color="cover"')
      expect(html).toMatch(/--ticket:#[0-9a-f]{6}/)
    }
  })

  it('머리는 로고와 COLLECTION이고 날짜 줄이 없다', async () => {
    const html = renderToStaticMarkup(await callPage())

    expect(html).toContain('COLLECTION')
    expect(html).not.toMatch(/\d{4}\.\d{2}\.\d{2}/)
  })

  it('머리 → 표지 → 글자 상자 → 진행 바 → 이야기 글 → 슬롯 칸 → 체크인 배지 순서로 그린다', async () => {
    const html = renderToStaticMarkup(await callPage())
    const order = ['COLLECTION', 'alt="유리 칸 닦는 아침"', 'text-3xl font-bold', '0/2', '이야기 한 줄', '이름1', d.itembooks.checkinSectionTitle].map((needle) => html.indexOf(needle))

    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('글자 상자는 이름 h1 한 개와 설명이고 칩이 없다', async () => {
    const html = renderToStaticMarkup(await callPage())

    // 상단 내비게이션의 제목과 별개로, 글자 상자의 h1(text-3xl)은 한 개다
    expect(html.match(/<h1 class="[^"]*text-3xl/g)).toHaveLength(1)
    expect(html).toContain('창을 닦아요.')
    expect(html).toContain('오늘도 맑아요.')
  })

  it('설명이 없으면 아래 칸을 그리지 않고, 이야기 글이 없으면 그 줄이 없다', async () => {
    setTicketBook({ description: null, story_text: null })
    const html = renderToStaticMarkup(await callPage())

    expect(html).not.toContain('titleDesc')
    expect(html).not.toContain('이야기 한 줄')
  })

  it('표지가 없으면 MagicBookIcon을 둔 1:1 칸을 그린다', async () => {
    setTicketBook({ image_url: null })
    const html = renderToStaticMarkup(await callPage())

    expect(html).not.toContain('alt="유리 칸 닦는 아침"')
    expect(html).toContain('aspect-square')
    expect(html).toContain('bg-card-bg')
  })

  it('옛 전체 화면 배경 레이어·블롭 영상 타일·히어로 카드를 쓰지 않는다', () => {
    const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf-8')

    for (const gone of ['backgroundLayer', 'themedBackground', 'BadgeBackgroundVideoTiles', 'getBadgeThemedTextStyle', 'bookCardAnimation']) {
      expect(page).not.toContain(gone)
    }
    expect(page).not.toContain('useEffect')
  })

  it('타인 보기·장착 모드도 같은 티켓 틀 안이다', async () => {
    state.tables.users = [{ id: 'user-2', username: 'other' }]
    state.tables.user_item_book_slots = [slotRow('이름1-common')]
    const other = renderToStaticMarkup(await callPage({ u: 'other' }))
    const slot = renderToStaticMarkup(await callPage({ slot: '1' }))

    for (const html of [other, slot]) {
      expect(html).toContain('data-ticket-color="cover"')
      expect(html).toContain('COLLECTION')
    }
  })
})

describe('컬렉션 상세 페이지 — 꺼진 컬렉션', () => {
  let errorSpy: MockInstance

  const offBook = (extra: Row = {}): Row[] => [
    { id: 'book-1', name: '꺼진 컬렉션', description: null, image_url: null, story_text: null, is_active: false, valid_from: null, valid_until: null, tier_mode: false, tribe: null, ...extra },
  ]

  beforeEach(() => {
    state.tables = {}
    state.calls = []
    state.notFoundCalls = 0
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.tables.inventory = [{ id: 'inventory-1' }]
    state.tables.badges = NAMES.map((name) => badgeRow(name, 'common', { image_url: null }))
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('비활성 + 발급 기록 있음: 열리고 소속 배지 전체가 칸으로 그려진다', async () => {
    state.tables.item_books = offBook()
    state.tables.issued_item_books = [{ item_book_id: 'book-1', first_issued_at: '2026-11-01T00:00:00Z' }]

    const { gridProps, progress } = await renderGrid()

    expect(state.notFoundCalls).toBe(0)
    expect(gridProps?.badgeSlots).toHaveLength(NAMES.length)
    expect(progress?.total).toBe(NAMES.length)
    expect(state.calls.filter((c) => c.table === 'issued_item_books' && c.method === 'maybeSingle')).toHaveLength(1)
  })

  it('시작 전(valid_from이 미래) + 발급 기록 있음도 열린다', async () => {
    state.tables.item_books = offBook({ is_active: true, valid_from: '2999-01-01T00:00:00Z' })
    state.tables.issued_item_books = [{ item_book_id: 'book-1', first_issued_at: '2026-11-01T00:00:00Z' }]

    const { gridProps } = await renderGrid()

    expect(gridProps?.badgeSlots).toHaveLength(NAMES.length)
  })

  it('가진 개체가 없는 칸은 켜진 컬렉션과 같이 이미지 없이 윤곽 점선 + 이름이고 흐림·흑백·«???»가 없다', async () => {
    state.tables.item_books = offBook()
    state.tables.issued_item_books = [{ item_book_id: 'book-1', first_issued_at: '2026-11-01T00:00:00Z' }]
    state.tables.badges = [badgeRow('이름1', 'common', { image_url: 'https://example.com/a.png' })]
    state.tables.user_item_book_slots = []
    state.tables.inventory_items = []

    const { gridProps } = await renderGrid()
    const html = renderToStaticMarkup(<SlotGrid {...(gridProps as React.ComponentProps<typeof SlotGrid>)} />)

    // 이미지를 그리지 않고 점선 svg만 둔다(티켓 20261112_1627). 예전 회색 실루엣 필터는 남아 있지 않다
    expect(html).not.toContain('<img')
    expect(html).toContain('data-outline-state')
    expect(html).not.toContain('brightness-0')
    expect(html).not.toContain('invert-[.64]')
    expect(html).not.toMatch(/\bgrayscale\b/)
    expect(html).toContain('>이름1<')
    expect(html).not.toContain('???')
    expect(html).not.toContain('opacity-30')
    expect(html).not.toContain('opacity-40')
  })

  it('비활성 + 발급 기록 없음: 지금처럼 404이고 소속 배지 조회까지 가지 않는다', async () => {
    state.tables.item_books = offBook()
    state.tables.issued_item_books = []

    await expect(callPage()).rejects.toThrow('NEXT_NOT_FOUND')

    expect(state.notFoundCalls).toBe(1)
    expect(state.calls.filter((c) => c.table === 'badges')).toHaveLength(0)
  })

  it('켜진 컬렉션은 발급 기록을 읽지 않고 열린다', async () => {
    state.tables.item_books = offBook({ is_active: true })

    await callPage()

    expect(state.notFoundCalls).toBe(0)
    expect(state.calls.filter((c) => c.table === 'issued_item_books')).toHaveLength(0)
  })

  it('기록이 있어도 타인 열람에서 그 사람의 슬롯이 0개이면 지금처럼 404다', async () => {
    state.tables.item_books = offBook()
    state.tables.issued_item_books = [{ item_book_id: 'book-1', first_issued_at: '2026-11-01T00:00:00Z' }]
    state.tables.users = [{ id: 'user-2', username: 'other' }]
    state.tables.user_item_book_slots = []

    await expect(callPage({ u: 'other' })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
