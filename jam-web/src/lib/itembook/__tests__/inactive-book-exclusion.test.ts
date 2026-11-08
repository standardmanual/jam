/**
 * 꺼진 컬렉션을 계속 거르는 모듈의 회귀 고정 (티켓 20261106_1230 S5, T3 게이트 WARN 이관)
 *
 * 2단계(꺼진 컬렉션을 가진 사람이 내 목록·배지 탭·배지 상세에서 본다)에서 «사용자 결정»으로 아래 모듈은
 * 꺼진 컬렉션을 **계속 제외**한다. 가진 사람이라도 홈 현황·소식·승급 후보·코퍼스에는 꺼진 컬렉션이 0건이어야 한다.
 *
 * | 모듈 | 이 파일 | 다른 시험 |
 * |---|---|---|
 * | 오늘의 현황 진행 스트립 `lib/today/status.ts` | 여기 | - |
 * | 완성 가능 소식 `lib/itembook/completable.ts` | 여기 | - |
 * | 컬렉션 배치 알림 `lib/notifications/batch/collections.ts` | 여기 | - |
 * | 홈 투데이 컬렉션 카드 `lib/today/cards.ts` | - | `today/__tests__/cards-resources.test.ts` (비활성·공개 전은 resolved_collection null) |
 * | 티어 승급 컬렉션별 등급 `lib/combine/tierUpCollections.ts` | - | `combine/__tests__/tierUpCollections.test.ts` (비활성 제외) |
 * | 콘텐츠 코퍼스 `lib/content-corpus/active.ts` | - | `content-corpus/__tests__/content-corpus.test.ts` (비활성 컬렉션 id·소속 배지 제외) |
 * | 판정 함수 | - | `itembook/__tests__/visibility.test.ts` (공개됨·노출 중은 발급 기록과 무관) |
 *
 * 이 파일의 가짜 Supabase는 `item_books` 쿼리의 `eq`·`or` 조건을 행에 실제로 적용한다. 꺼진 컬렉션을 거르는
 * 조건이 빠지면 꺼진 컬렉션이 결과에 남아 시험이 실패한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/itembook/__tests__/inactive-book-exclusion.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const NOW = '2026-11-06T03:00:00.000Z'
const USER_ID = 'user-1'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }))

/** `col.op.value`를 쉼표로 이어 붙인 PostgREST `or` 표현식을 행에 적용한다(OR) */
function matchesOr(row: Row, expr: string): boolean {
  return expr.split(',').some((part) => {
    const [column, op, ...rest] = part.split('.')
    const value = rest.join('.')
    const cell = row[column] as string | null | undefined
    if (op === 'is') return value === 'null' && (cell === null || cell === undefined)
    if (cell === null || cell === undefined) return false
    const left = new Date(cell).getTime()
    const right = new Date(value).getTime()
    if (op === 'lte') return left <= right
    if (op === 'gte') return left >= right
    throw new Error(`테스트 모킹이 모르는 or 연산자: ${op}`)
  })
}

function makeBuilder(table: string) {
  let rows = [...(state.tables[table] ?? [])]
  const result = () => ({ data: rows, error: null })
  const builder = {
    select: () => builder,
    order: () => builder,
    in(column: string, values: unknown[]) {
      rows = rows.filter((r) => values.includes(r[column]))
      return builder
    },
    eq(column: string, value: unknown) {
      rows = rows.filter((r) => r[column] === value)
      return builder
    },
    is(column: string, value: null) {
      rows = rows.filter((r) => (r[column] ?? null) === value)
      return builder
    },
    or(expr: string) {
      rows = rows.filter((r) => matchesOr(r, expr))
      return builder
    },
    range: (from: number, to: number) => {
      rows = rows.slice(from, to + 1)
      return Promise.resolve(result())
    },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => resolve(result()),
  }
  return builder
}

const fakeClient = { from: (table: string) => makeBuilder(table) }

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => fakeClient,
}))

import { getTodayLeftStatus } from '@/lib/today/status'
import { findCompletableItemBooks } from '../completable'
import { buildCollectionDrafts } from '@/lib/notifications/batch/collections'
import type { BatchContext } from '@/lib/notifications/batch/shared'

function book(id: string, overrides: Row = {}): Row {
  return { id, name: `컬렉션 ${id}`, tier_mode: false, is_active: true, valid_from: null, valid_until: null, ...overrides }
}

function itemBadge(id: string, bookId: string): Row {
  return { id, item_book_id: bookId, type: 'item', drop_excluded: false, name: `배지 ${id}`, rarity: 'common', deleted_at: null }
}

/** 켜진 컬렉션 1개와 꺼진 컬렉션 3종(비활성·시작 전·종료 후)을 만든다 */
function setupBooks() {
  state.tables.item_books = [
    book('book-on'),
    book('book-inactive', { is_active: false }),
    book('book-future', { valid_from: '2026-12-01T00:00:00+00:00' }),
    book('book-ended', { valid_until: '2026-10-01T00:00:00+00:00' }),
  ]
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  state.tables = {}
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('오늘의 현황 진행 스트립(getTodayLeftStatus) — 꺼진 컬렉션 제외', () => {
  /** 컬렉션마다 배지 2개 중 1개를 장착했다. 꺼진 컬렉션은 3개 중 2개라 켜진 쪽보다 진행도가 높다 */
  function setupProgress(bookIds: string[]) {
    state.tables.badges = bookIds.flatMap((id) => [itemBadge(`${id}-a`, id), itemBadge(`${id}-b`, id)])
    state.tables.user_item_book_slots = bookIds.map((id) => ({
      user_id: USER_ID,
      item_book_id: id,
      badge_id: `${id}-a`,
      slotted_at: '2026-11-01T00:00:00Z',
    }))
    state.tables.user_item_book_completions = []
    state.tables.user_mission_participations = []
  }

  it('꺼진 컬렉션의 진행도는 진행도가 더 높아도 뽑히지 않고 켜진 컬렉션이 뽑힌다', async () => {
    setupBooks()
    setupProgress(['book-on', 'book-inactive', 'book-future', 'book-ended'])
    // 꺼진 컬렉션을 더 앞서게 만든다 — 거르는 조건이 빠지면 이 컬렉션이 뽑힌다
    state.tables.user_item_book_slots.push({
      user_id: USER_ID,
      item_book_id: 'book-inactive',
      badge_id: 'book-inactive-b',
      slotted_at: '2026-11-02T00:00:00Z',
    })
    state.tables.user_item_book_slots.push({
      user_id: USER_ID,
      item_book_id: 'book-future',
      badge_id: 'book-future-b',
      slotted_at: '2026-11-02T00:00:00Z',
    })
    state.tables.badges.push(itemBadge('book-inactive-c', 'book-inactive'), itemBadge('book-future-c', 'book-future'))

    const status = await getTodayLeftStatus(USER_ID)

    expect(status).toMatchObject({ kind: 'progress', name: '컬렉션 book-on', current: 1, total: 2 })
  })

  it('가진 컬렉션이 모두 꺼져 있으면 진행도 대신 안내가 나온다', async () => {
    setupBooks()
    setupProgress(['book-inactive', 'book-future', 'book-ended'])

    const status = await getTodayLeftStatus(USER_ID)

    expect(status.kind).toBe('suggestion')
  })
})

describe('완성 가능 소식(findCompletableItemBooks) — 꺼진 컬렉션 제외', () => {
  function setupOwnedUnslotted(bookIds: string[]) {
    state.tables.badges = bookIds.map((id) => itemBadge(`${id}-a`, id))
    state.tables.user_item_book_slots = []
    state.tables.inventory = [{ id: 'inv-1', user_id: USER_ID }]
    // 컬렉션마다 남은 칸 1개를 미장착 개체로 이미 가졌다 — 켜진 컬렉션이었다면 전부 완성 가능이다
    state.tables.inventory_items = bookIds.map((id) => ({
      inventory_id: 'inv-1',
      badge_id: `${id}-a`,
      dropped_at: null,
      slotted_in: null,
      locked: false,
    }))
  }

  it('켜진 컬렉션만 완성 가능으로 나오고 꺼진 컬렉션(비활성·시작 전·종료 후)은 나오지 않는다', async () => {
    setupBooks()
    setupOwnedUnslotted(['book-on', 'book-inactive', 'book-future', 'book-ended'])

    const result = await findCompletableItemBooks(USER_ID)

    expect(result.map((b) => b.id)).toEqual(['book-on'])
  })

  it('가진 컬렉션이 모두 꺼져 있으면 빈 목록이다', async () => {
    setupBooks()
    setupOwnedUnslotted(['book-inactive', 'book-future', 'book-ended'])

    expect(await findCompletableItemBooks(USER_ID)).toEqual([])
  })
})

describe('컬렉션 배치 알림(buildCollectionDrafts) — 꺼진 컬렉션 제외', () => {
  const ctx = { supabase: fakeClient, startedAt: new Date(NOW), today: '2026-11-06' } as unknown as BatchContext

  function setupOwnedUnslotted(bookIds: string[]) {
    state.tables.badges = bookIds.map((id) => itemBadge(`${id}-a`, id))
    state.tables.user_item_book_slots = []
    state.tables.user_checkin_badge_earns = []
    state.tables.inventory = [{ id: 'inv-1', user_id: USER_ID }]
    state.tables.inventory_items = bookIds.map((id) => ({
      inventory_id: 'inv-1',
      badge_id: `${id}-a`,
      obtained_at: '2026-11-05T00:00:00Z',
      dropped_at: null,
      slotted_in: null,
      locked: false,
    }))
  }

  it('소식은 켜진 컬렉션에 대해서만 만들어지고 꺼진 컬렉션은 이름도 id도 실리지 않는다', async () => {
    setupBooks()
    setupOwnedUnslotted(['book-on', 'book-inactive', 'book-future', 'book-ended'])

    const { drafts } = await buildCollectionDrafts(ctx)

    expect(drafts.length).toBeGreaterThan(0)
    const serialized = JSON.stringify(drafts)
    expect(serialized).toContain('book-on')
    for (const off of ['book-inactive', 'book-future', 'book-ended']) {
      expect(serialized).not.toContain(off)
    }
  })

  it('가진 컬렉션이 모두 꺼져 있으면 소식도 판정 대상 유저도 0이다', async () => {
    setupBooks()
    setupOwnedUnslotted(['book-inactive', 'book-future', 'book-ended'])

    expect(await buildCollectionDrafts(ctx)).toEqual({ drafts: [], scanned: 0 })
  })
})
