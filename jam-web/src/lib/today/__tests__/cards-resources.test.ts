/**
 * getTodayCards가 표시 데이터용 자원 값(미션 기간·보상, 컬렉션 이름·아이템 수)을 싣는지 (티켓 20261001_1357)
 *
 * 확인하는 것:
 * 1. 미션 소개·자동 카드에 `resolved_mission`, 컬렉션 소식 카드에 `resolved_collection`이 실린다.
 * 2. 같은 자원을 카드 수만큼 읽지 않는다 — 미션 3장(같은 미션 포함)·컬렉션 2장이어도
 *    `missions`·`item_books`를 각각 한 번, 컬렉션 아이템 배지를 한 번 읽는다.
 * 3. 기존 반환 필드(`resolved_href`·`resolved_badges`·`resolved_ranking`)는 그대로고,
 *    미션 소개 카드의 노출 판정(없는 미션은 걸러지고, 미션 행이 하나도 없으면 그대로 둔다)이 이전과 같다.
 * 4. 새 조회가 실패해도 카드는 사라지지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/cards-resources.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>

const fx = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, { message: string } | null>,
  /** 읽기 기록: 테이블 이름 */
  reads: [] as string[],
}))

function fakeSupabase() {
  const from = (table: string) => {
    fx.reads.push(table)
    const builder: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'lte', 'gte', 'overlaps', 'order', 'in', 'is']) builder[op] = () => builder
    builder.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: fx.tables[table] ?? [], error: fx.errors[table] ?? null }).then(resolve)
    return builder
  }
  return { from }
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeSupabase() }))
vi.mock('../exposure', () => ({ computeUserExposureTags: async () => ['all'] }))
vi.mock('@/lib/missions/visibility-server', () => ({
  loadMissionVisibilityContext: async () => ({
    completedMissionIds: new Set<string>(),
    gatedBadges: new Map(),
    ownedTierByBadgeName: new Map(),
    ownedTierByFamilyKey: new Map(),
  }),
}))
vi.mock('@/lib/ranking/rankingDataSource', () => ({ computeRankingModeResult: async () => ({ entries: [] }) }))

import { getTodayCards } from '../cards'

function cardRow(overrides: Row): Row {
  return {
    id: 'c',
    template_type: 'badge_spotlight',
    layout_type: 'other',
    title: '제목',
    subtitle: null,
    cover_image_url: null,
    badge_ids: [],
    mission_id: null,
    item_book_id: null,
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: ['all'],
    starts_at: '2026-10-01T00:00:00Z',
    ends_at: '2026-12-31T00:00:00Z',
    sort_order: 0,
    is_active: true,
    created_at: '2026-09-30T00:00:00Z',
    created_by: null,
    ranking_mode_id: null,
    content_type_id: null,
    image_source: null,
    description: null,
    ...overrides,
  }
}

function missionRow(id: string, overrides: Row = {}): Row {
  return {
    id,
    gated_badge_id: null,
    gate_axis: null,
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: '2026-11-08T14:59:59Z',
    reward_points: 300,
    reward_badge_ids: ['b1'],
    image_url: 'https://cdn.example/m.png',
    exposure_mode: null,
    exposure_at: null,
    ...overrides,
  }
}

const NOW = new Date('2026-10-05T03:00:00Z')

beforeEach(() => {
  fx.tables = {}
  fx.errors = {}
  fx.reads = []
})

describe('getTodayCards — 표시 데이터용 자원 값', () => {
  it('미션 소개 카드에 미션 기간·보상·이미지, 컬렉션 카드에 이름·아이템 수를 싣는다', async () => {
    fx.tables.today_cards = [
      cardRow({ id: 'a', template_type: 'mission_spotlight', layout_type: 'large_thumbnail', mission_id: 'm1' }),
      cardRow({ id: 'b', template_type: 'itembook_milestone', item_book_id: 'book1' }),
    ]
    fx.tables.missions = [missionRow('m1')]
    fx.tables.item_books = [{ id: 'book1', name: '한강 컬렉션' }]
    fx.tables.badges = [
      { id: 'i1', item_book_id: 'book1', type: 'item', drop_excluded: false },
      { id: 'i2', item_book_id: 'book1', type: 'item', drop_excluded: false },
      { id: 'i3', item_book_id: 'book1', type: 'item', drop_excluded: true },
    ]

    const cards = await getTodayCards('u1', null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['a', 'b'])
    expect(cards[0].resolved_mission).toEqual({
      starts_at: '2026-01-01T00:00:00Z',
      ends_at: '2026-11-08T14:59:59Z',
      reward_points: 300,
      reward_badge_count: 1,
      image_url: 'https://cdn.example/m.png',
    })
    expect(cards[0].resolved_collection).toBeNull()
    // 아이템 수는 컬렉션 목록과 같은 기준(드랍 제외 배지를 뺀 수)이다
    expect(cards[1].resolved_collection).toEqual({ name: '한강 컬렉션', item_count: 2 })
    expect(cards[1].resolved_mission).toBeNull()
  })

  it('미션을 가리키는 자동 카드에도 미션 값을 싣고, 미션을 가리키지 않는 카드는 null이다', async () => {
    fx.tables.today_cards = [
      cardRow({ id: 'a', template_type: 'progress_nudge', layout_type: 'shortcut', mission_id: 'm1' }),
      cardRow({ id: 'b', template_type: 'location_trend', layout_type: 'shortcut', mission_id: null }),
      // 미션 id가 있어도 표시 데이터가 미션 값을 쓰지 않는 템플릿은 읽지 않는다
      cardRow({ id: 'c', template_type: 'editorial_article', mission_id: 'm1' }),
    ]
    fx.tables.missions = [missionRow('m1')]

    const cards = await getTodayCards('u1', null, NOW)

    expect(cards[0].resolved_mission).toMatchObject({ reward_points: 300 })
    expect(cards[1].resolved_mission).toBeNull()
    expect(cards[2].resolved_mission).toBeNull()
  })

  it('같은 자원을 카드 수만큼 읽지 않는다(미션 3장·컬렉션 2장 → 미션 1번, 컬렉션 1번, 컬렉션 아이템 1번)', async () => {
    fx.tables.today_cards = [
      cardRow({ id: 'a', template_type: 'mission_spotlight', layout_type: 'large_thumbnail', mission_id: 'm1' }),
      cardRow({ id: 'b', template_type: 'mission_spotlight', layout_type: 'large_thumbnail', mission_id: 'm2' }),
      cardRow({ id: 'c', template_type: 'progress_nudge', layout_type: 'shortcut', mission_id: 'm1' }),
      cardRow({ id: 'd', template_type: 'itembook_milestone', item_book_id: 'book1' }),
      cardRow({ id: 'e', template_type: 'itembook_milestone', item_book_id: 'book2' }),
    ]
    fx.tables.missions = [missionRow('m1'), missionRow('m2')]
    fx.tables.item_books = [
      { id: 'book1', name: '컬렉션 1' },
      { id: 'book2', name: '컬렉션 2' },
    ]

    await getTodayCards('u1', null, NOW)

    const count = (table: string) => fx.reads.filter((t) => t === table).length
    expect(count('today_cards')).toBe(1)
    expect(count('missions')).toBe(1) // 노출 판정과 표시 값이 같은 읽기를 쓴다
    expect(count('item_books')).toBe(1)
    expect(count('badges')).toBe(1) // 컬렉션 아이템 수 (카드 배지 id가 없어 배지 조회는 없다)
  })

  it('읽을 자원이 없으면 미션·컬렉션을 읽지 않는다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a' }), cardRow({ id: 'b', template_type: 'drop_alert', region_label: '한강' })]

    const cards = await getTodayCards('u1', null, NOW)

    expect(cards).toHaveLength(2)
    expect(fx.reads).toEqual(['today_cards'])
    expect(cards.every((c) => c.resolved_mission === null && c.resolved_collection === null)).toBe(true)
  })

  it('기존 반환 필드가 그대로다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', template_type: 'badge_spotlight', badge_ids: ['b1'], target_href: '/x' })]
    fx.tables.badges = [{ id: 'b1', name: '한강 러너', image_url: null, rarity: 'rare' }]

    const [card] = await getTodayCards('u1', null, NOW)

    expect(card.resolved_href).toBe('/x')
    expect(card.resolved_badges).toEqual([{ id: 'b1', name: '한강 러너', image_url: null, rarity: 'rare', earned: false }])
    expect(card.resolved_ranking).toBeNull()
    expect(card.layout_type).toBe('other')
  })
})

describe('getTodayCards — 미션 소개 카드 노출 판정은 이전과 같다', () => {
  it('열린 미션의 카드는 남고, 미션이 숨김이면 카드가 빠진다', async () => {
    fx.tables.today_cards = [
      cardRow({ id: 'open', template_type: 'mission_spotlight', layout_type: 'large_thumbnail', mission_id: 'm1' }),
      cardRow({ id: 'hidden', template_type: 'mission_spotlight', layout_type: 'large_thumbnail', mission_id: 'm2' }),
    ]
    fx.tables.missions = [missionRow('m1'), missionRow('m2', { exposure_mode: 'hidden' })]

    const cards = await getTodayCards('u1', null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['open'])
  })

  it('미션 행을 하나도 읽지 못하면 미션 소개 카드를 걸러내지 않는다(이전 동작)', async () => {
    fx.tables.today_cards = [
      cardRow({ id: 'a', template_type: 'mission_spotlight', layout_type: 'large_thumbnail', mission_id: 'gone' }),
    ]
    fx.tables.missions = []

    const cards = await getTodayCards('u1', null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['a'])
    expect(cards[0].resolved_mission).toBeNull()
  })

  it('다른 미션 행이 하나라도 있으면 없는 미션의 카드는 빠진다(이전 동작)', async () => {
    fx.tables.today_cards = [
      cardRow({ id: 'a', template_type: 'mission_spotlight', layout_type: 'large_thumbnail', mission_id: 'm1' }),
      cardRow({ id: 'gone', template_type: 'mission_spotlight', layout_type: 'large_thumbnail', mission_id: 'gone' }),
    ]
    fx.tables.missions = [missionRow('m1')]

    const cards = await getTodayCards('u1', null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['a'])
  })
})

describe('getTodayCards — 새 조회가 실패해도 카드는 사라지지 않는다', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('컬렉션 조회가 실패하면 카드는 남고 컬렉션 값만 null이다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', template_type: 'itembook_milestone', item_book_id: 'book1' })]
    fx.errors.item_books = { message: 'boom' }

    const cards = await getTodayCards('u1', null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['a'])
    expect(cards[0].resolved_collection).toBeNull()
  })

  it('컬렉션 아이템 조회만 실패하면 이름은 싣고 아이템 수는 null이다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', template_type: 'itembook_milestone', item_book_id: 'book1' })]
    fx.tables.item_books = [{ id: 'book1', name: '한강 컬렉션' }]
    fx.errors.badges = { message: 'boom' }

    const [card] = await getTodayCards('u1', null, NOW)

    expect(card.resolved_collection).toEqual({ name: '한강 컬렉션', item_count: null })
  })

  it('아이템 배지가 하나도 없는 컬렉션은 아이템 수가 0이다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', template_type: 'itembook_milestone', item_book_id: 'book1' })]
    fx.tables.item_books = [{ id: 'book1', name: '빈 컬렉션' }]

    const [card] = await getTodayCards('u1', null, NOW)

    expect(card.resolved_collection).toEqual({ name: '빈 컬렉션', item_count: 0 })
  })

  it('미션 조회가 실패하면 자동 카드는 남고 미션 값만 null이다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', template_type: 'progress_nudge', layout_type: 'shortcut', mission_id: 'm1' })]
    fx.errors.missions = { message: 'boom' }

    const cards = await getTodayCards('u1', null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['a'])
    expect(cards[0].resolved_mission).toBeNull()
  })
})
