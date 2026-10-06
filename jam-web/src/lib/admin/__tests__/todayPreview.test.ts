/**
 * 어드민 날짜 미리보기 조회가 표시 데이터용 자원 값을 싣는지 (티켓 20261001_2208, 상위 20260930_1453 조각 b6)
 *
 * 확인하는 것:
 * 1. 미션 소개·자동 카드에 `resolved_mission`, 컬렉션 소식 카드에 `resolved_collection`이 실린다(홈 조회 `getTodayCards`와 같은 판정).
 * 2. 같은 자원을 카드 수만큼 읽지 않는다.
 * 3. 기준 시각 규칙 — 선택한 날짜가 오늘(KST)이면 지금, 아니면 그날 00:00(KST)이고, 컬렉션 공개 판정이 그 값을 쓴다.
 * 4. 배지는 `earned` 없이 실린다(유저 정보가 없는 미리보기).
 * 5. 미션·컬렉션 조회가 실패해도 카드는 사라지지 않는다.
 * 6. 자원 판정 순수 함수(`resourceNeedsMission`·`missionIdsToResolve`·`collectionIdsToResolve`·`toResolvedMission`).
 * 7. 레시피 공개 카드(`recipe_reveal`)에 `resolved_recipe`가 실린다(티켓 20261006_1218, 운영툴 PRD §6 「홈과 미리보기는 같은 값」) — 공개 전은 재료 수·공개일만,
 *    공개 뒤는 슬롯마다 대표 후보 타일(보유 여부 없이 첫 후보)이고, 공개 판정은 미리보기 기준 시각을 쓴다. 레시피를 같은 함수로 한 번에 읽는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/todayPreview.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>

const fx = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, { message: string } | null>,
  /** 읽기 기록: 테이블 이름 */
  reads: [] as string[],
}))

/** `item_books`에 걸린 `or` 조건(`칸.is.null`·`칸.lte.값`)을 행에 실제로 적용한다 — 공개 판정이 걸러내는지 보려는 것이다. */
function matchesOr(row: Row, expression: string): boolean {
  return expression.split(',').some((clause) => {
    const [column, op, ...rest] = clause.split('.')
    const value = rest.join('.')
    const cell = row[column] as string | null | undefined
    if (op === 'is' && value === 'null') return cell == null
    if (op === 'lte') return cell != null && new Date(cell).getTime() <= new Date(value).getTime()
    throw new Error(`테스트가 해석하지 못하는 or 조건: ${clause}`)
  })
}

function fakeSupabase() {
  const from = (table: string) => {
    fx.reads.push(table)
    const builder: Record<string, unknown> = {}
    const filters: ((row: Row) => boolean)[] = []
    for (const op of ['select', 'lte', 'gte', 'order', 'in', 'is']) builder[op] = () => builder
    builder.eq = (column: string, value: unknown) => {
      if (table === 'item_books') filters.push((row) => row[column] === value)
      return builder
    }
    builder.or = (expression: string) => {
      if (table === 'item_books') filters.push((row) => matchesOr(row, expression))
      return builder
    }
    builder.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({
        data: (fx.tables[table] ?? []).filter((row) => filters.every((f) => f(row))),
        error: fx.errors[table] ?? null,
      }).then(resolve)
    return builder
  }
  return { from }
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeSupabase() }))
vi.mock('@/lib/today/exposure', () => ({ computeUserExposureTags: async () => ['all'] }))
vi.mock('@/lib/missions/visibility-server', () => ({
  loadMissionVisibilityContext: async () => ({
    completedMissionIds: new Set<string>(),
    gatedBadges: new Map(),
    ownedTierByBadgeName: new Map(),
    ownedTierByFamilyKey: new Map(),
  }),
}))
vi.mock('@/lib/ranking/rankingDataSource', () => ({ computeRankingModeResult: async () => ({ entries: [] }) }))

import { getAdminTodayPreviewCards } from '../todayPreview'
import { previewBaseTime } from '../today-calendar'
import {
  collectionIdsToResolve,
  missionIdsToResolve,
  resourceNeedsMission,
  toResolvedMission,
} from '@/lib/today/cards'
import { toCardView } from '@/lib/today/cardView'
import type { TodayCardRow } from '@/types/database'

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

function bookRow(id: string, name: string, overrides: Row = {}): Row {
  return { id, name, is_active: true, valid_from: null, valid_until: null, ...overrides }
}

/** 2026-10-05 12:00 KST */
const NOW = new Date('2026-10-05T03:00:00Z')
const TODAY = '2026-10-05'

beforeEach(() => {
  fx.tables = {}
  fx.errors = {}
  fx.reads = []
})

describe('previewBaseTime — 기준 시각 규칙', () => {
  it('선택한 날짜가 오늘(KST)이면 지금이다', () => {
    expect(previewBaseTime(TODAY, NOW).toISOString()).toBe('2026-10-05T03:00:00.000Z')
  })

  it('오늘이 아니면 선택한 날짜의 00:00(KST)이다 — 미래도 과거도', () => {
    expect(previewBaseTime('2026-10-12', NOW).toISOString()).toBe('2026-10-11T15:00:00.000Z')
    expect(previewBaseTime('2026-09-30', NOW).toISOString()).toBe('2026-09-29T15:00:00.000Z')
  })

  it('UTC로는 어제여도 KST로 오늘이면 지금이다(KST 날짜 경계)', () => {
    // 2026-10-05 00:30 KST = 2026-10-04T15:30Z
    const justAfterKstMidnight = new Date('2026-10-04T15:30:00Z')
    expect(previewBaseTime('2026-10-05', justAfterKstMidnight).toISOString()).toBe('2026-10-04T15:30:00.000Z')
    expect(previewBaseTime('2026-10-04', justAfterKstMidnight).toISOString()).toBe('2026-10-03T15:00:00.000Z')
  })

  it('「N일 남음」은 이 기준 시각으로 계산된다 — 같은 미션이 날짜에 따라 다르게 보인다', () => {
    const card = {
      ...(cardRow({ template_type: 'mission_spotlight', layout_type: 'large_thumbnail', mission_id: 'm1' }) as unknown as TodayCardRow),
      resolved_href: '/missions/m1',
      resolved_badges: [],
      resolved_ranking: null,
      // 2026-10-10 00:00 KST에 끝나는 미션
      resolved_mission: {
        starts_at: '2026-10-01T00:00:00+09:00',
        ends_at: '2026-10-09T15:00:00Z',
        reward_points: null,
        reward_badge_count: 0,
        image_url: null,
      },
    }
    const onToday = toCardView(card, { now: previewBaseTime(TODAY, NOW) })
    const onTheDay = toCardView(card, { now: previewBaseTime('2026-10-08', NOW) })
    // 오늘 12:00 KST → 종료까지 4.5일(내림 4일), 10월 8일 00:00 KST → 2일
    expect(onToday.facts?.[0]).toBe('4일 남음')
    expect(onTheDay.facts?.[0]).toBe('2일 남음')
  })
})

describe('getAdminTodayPreviewCards — 표시 데이터용 자원 값', () => {
  it('미션 소개 카드에 미션 기간·보상·이미지, 컬렉션 카드에 이름·아이템 수를 싣는다', async () => {
    fx.tables.today_cards = [
      cardRow({ id: 'a', template_type: 'mission_spotlight', layout_type: 'large_thumbnail', mission_id: 'm1' }),
      cardRow({ id: 'b', template_type: 'itembook_milestone', item_book_id: 'book1' }),
    ]
    fx.tables.missions = [missionRow('m1')]
    fx.tables.item_books = [bookRow('book1', '한강 컬렉션')]
    fx.tables.badges = [
      { id: 'i1', item_book_id: 'book1', type: 'item', drop_excluded: false },
      { id: 'i2', item_book_id: 'book1', type: 'item', drop_excluded: false },
      { id: 'i3', item_book_id: 'book1', type: 'item', drop_excluded: true },
    ]

    const cards = await getAdminTodayPreviewCards(TODAY, NOW)

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

  it('미션을 가리키는 자동 카드에도 미션 값을 싣고, 미션을 가리키지 않거나 미션 값을 쓰지 않는 카드는 null이다', async () => {
    fx.tables.today_cards = [
      cardRow({ id: 'a', template_type: 'progress_nudge', layout_type: 'shortcut', mission_id: 'm1' }),
      cardRow({ id: 'b', template_type: 'location_trend', layout_type: 'shortcut', mission_id: null }),
      cardRow({ id: 'c', template_type: 'editorial_article', mission_id: 'm1' }),
    ]
    fx.tables.missions = [missionRow('m1')]

    const cards = await getAdminTodayPreviewCards(TODAY, NOW)

    expect(cards[0].resolved_mission).toMatchObject({ reward_points: 300 })
    expect(cards[1].resolved_mission).toBeNull()
    expect(cards[2].resolved_mission).toBeNull()
  })

  it('같은 자원을 카드 수만큼 읽지 않는다(미션 3장·컬렉션 2장 → 미션 1번, 컬렉션 1번)', async () => {
    fx.tables.today_cards = [
      cardRow({ id: 'a', template_type: 'mission_spotlight', layout_type: 'large_thumbnail', mission_id: 'm1' }),
      cardRow({ id: 'b', template_type: 'mission_spotlight', layout_type: 'large_thumbnail', mission_id: 'm2' }),
      cardRow({ id: 'c', template_type: 'progress_nudge', layout_type: 'shortcut', mission_id: 'm1' }),
      cardRow({ id: 'd', template_type: 'itembook_milestone', item_book_id: 'book1' }),
      cardRow({ id: 'e', template_type: 'itembook_milestone', item_book_id: 'book2' }),
    ]
    fx.tables.missions = [missionRow('m1'), missionRow('m2')]
    fx.tables.item_books = [bookRow('book1', '컬렉션 1'), bookRow('book2', '컬렉션 2')]

    await getAdminTodayPreviewCards(TODAY, NOW)

    expect(fx.reads.filter((t) => t === 'missions')).toHaveLength(1)
    expect(fx.reads.filter((t) => t === 'item_books')).toHaveLength(1)
  })

  it('미션·컬렉션을 쓰는 카드가 없으면 그 테이블을 읽지 않는다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a' })]

    await getAdminTodayPreviewCards(TODAY, NOW)

    expect(fx.reads).not.toContain('missions')
    expect(fx.reads).not.toContain('item_books')
  })

  it('배지는 보유 여부(earned) 없이 싣는다 — 유저 정보가 없는 미리보기', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', badge_ids: ['b1'] })]
    fx.tables.badges = [{ id: 'b1', name: '한강 러너', image_url: 'https://cdn.example/b1.png', rarity: 'rare' }]

    const [card] = await getAdminTodayPreviewCards(TODAY, NOW)

    expect(card.resolved_badges).toHaveLength(1)
    expect(card.resolved_badges[0]).not.toHaveProperty('earned')
    // 표시 데이터는 이 배지를 컬러로 그린다
    expect(toCardView(card, { now: NOW })).not.toHaveProperty('imageDimmed')
  })

  it('옛 layout_type 카드(shape NULL)도 표시 데이터로 바꾸면 새 모양이 된다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', layout_type: 'shortcut' })]

    const [card] = await getAdminTodayPreviewCards(TODAY, NOW)

    expect(toCardView(card, { now: NOW }).shape).toBe('brief')
  })

  it('미션·컬렉션 조회가 실패해도 카드는 사라지지 않고 그 자원 값만 null이다', async () => {
    fx.tables.today_cards = [
      cardRow({ id: 'a', template_type: 'mission_spotlight', layout_type: 'large_thumbnail', mission_id: 'm1' }),
      cardRow({ id: 'b', template_type: 'itembook_milestone', item_book_id: 'book1' }),
    ]
    fx.errors.missions = { message: 'boom' }
    fx.errors.item_books = { message: 'boom' }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const cards = await getAdminTodayPreviewCards(TODAY, NOW)
    spy.mockRestore()

    expect(cards.map((c) => c.id)).toEqual(['a', 'b'])
    expect(cards[0].resolved_mission).toBeNull()
    expect(cards[1].resolved_collection).toBeNull()
  })
})

describe('getAdminTodayPreviewCards — 레시피 공개 카드의 레시피 값 (티켓 20261006_1218)', () => {
  const recipeCard = (overrides: Row = {}) =>
    cardRow({ id: 'a', template_type: 'recipe_reveal', layout_type: 'badge_gallery', shape: 'list', recipe_id: 'r1', resolved_href: '/combine', ...overrides })
  const slot = (order: number, allowed: string[]): Row => ({ id: `s${order}`, recipe_id: 'r1', slot_order: order, allowed_badge_ids: allowed })
  const badge = (id: string): Row => ({ id, name: `배지 ${id}`, image_url: `https://cdn.example/${id}.png`, rarity: 'rare' })

  // 공개 시각: 2026-10-10 00:00 KST(= 10-09T15:00Z)
  const RELEASE_AT = '2026-10-09T15:00:00Z'
  const seed = (validFrom: string | null) => {
    fx.tables.today_cards = [recipeCard()]
    fx.tables.combination_recipes = [{ id: 'r1', reward_points: 300, reward_badge_ids: ['x', 'y'], valid_from: validFrom, valid_until: null }]
    fx.tables.combination_recipe_slots = [slot(2, ['b1', 'b2']), slot(1, ['a1'])]
    fx.tables.badges = [badge('a1'), badge('b1'), badge('b2')]
  }

  it('공개 뒤 레시피는 재료 수·보상과 슬롯마다 대표 후보 타일을 싣는다. 보유 여부(earned)는 싣지 않는다', async () => {
    seed('2026-10-01T00:00:00Z')

    const [card] = await getAdminTodayPreviewCards(TODAY, NOW)

    expect(card.resolved_recipe).toEqual({
      state: 'released',
      ingredient_count: 2,
      reward_points: 300,
      reward_badge_count: 2,
      tiles: [
        { id: 'a1', name: '배지 a1', image_url: 'https://cdn.example/a1.png', rarity: 'rare' },
        { id: 'b1', name: '배지 b1', image_url: 'https://cdn.example/b1.png', rarity: 'rare' },
      ],
    })
    // 표시 데이터는 홈과 같은 모양(타일이 있는 list)으로 그린다
    expect(toCardView(card, { now: NOW }).shape).toBe('list')
  })

  it('공개 전 레시피는 재료 수와 공개 시각만 싣고 후보 배지는 읽지 않는다', async () => {
    seed(RELEASE_AT)

    const [card] = await getAdminTodayPreviewCards(TODAY, NOW)

    expect(card.resolved_recipe).toEqual({ state: 'scheduled', ingredient_count: 2, release_at: RELEASE_AT })
    expect(fx.reads).not.toContain('badges')
    expect(toCardView(card, { now: NOW }).shape).toBe('brief')
  })

  it('공개 판정은 미리보기 기준 시각을 쓴다 — 공개일 뒤 날짜를 고르면 같은 카드가 공개 뒤 값이다', async () => {
    seed(RELEASE_AT)

    const [before] = await getAdminTodayPreviewCards('2026-10-09', NOW)
    const [onDay] = await getAdminTodayPreviewCards('2026-10-10', NOW)

    expect(before.resolved_recipe).toMatchObject({ state: 'scheduled' })
    expect(onDay.resolved_recipe).toMatchObject({ state: 'released', ingredient_count: 2 })
  })

  it('레시피 공개 카드가 여럿이어도 레시피는 한 번만 읽는다. 레시피 공개 카드가 없으면 읽지 않는다', async () => {
    seed('2026-10-01T00:00:00Z')
    fx.tables.today_cards = [recipeCard({ id: 'a' }), recipeCard({ id: 'b' }), recipeCard({ id: 'c', recipe_id: null })]

    const cards = await getAdminTodayPreviewCards(TODAY, NOW)

    expect(fx.reads.filter((t) => t === 'combination_recipes')).toHaveLength(1)
    expect(fx.reads.filter((t) => t === 'combination_recipe_slots')).toHaveLength(1)
    expect(cards.map((c) => c.resolved_recipe?.state ?? null)).toEqual(['released', 'released', null])

    fx.reads = []
    fx.tables.today_cards = [cardRow({ id: 'x' })]
    await getAdminTodayPreviewCards(TODAY, NOW)
    expect(fx.reads).not.toContain('combination_recipes')
  })

  it('recipe_id가 있어도 레시피 공개 카드가 아니면 읽지 않고 null이다', async () => {
    seed('2026-10-01T00:00:00Z')
    fx.tables.today_cards = [cardRow({ id: 'a', template_type: 'badge_spotlight', recipe_id: 'r1' })]

    const [card] = await getAdminTodayPreviewCards(TODAY, NOW)

    expect(card.resolved_recipe).toBeNull()
    expect(fx.reads).not.toContain('combination_recipes')
  })

  it('끝났거나 없는 레시피, 읽기 실패는 카드를 지우지 않고 레시피 값만 null이다', async () => {
    seed('2026-09-01T00:00:00Z')
    ;(fx.tables.combination_recipes[0] as Row).valid_until = '2026-10-04T00:00:00Z'
    const [ended] = await getAdminTodayPreviewCards(TODAY, NOW)
    expect(ended.resolved_recipe).toBeNull()

    fx.tables.combination_recipes = []
    const [gone] = await getAdminTodayPreviewCards(TODAY, NOW)
    expect(gone.resolved_recipe).toBeNull()

    seed('2026-10-01T00:00:00Z')
    fx.errors.combination_recipes = { message: 'boom' }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cards = await getAdminTodayPreviewCards(TODAY, NOW)
    spy.mockRestore()
    expect(cards.map((c) => c.id)).toEqual(['a'])
    expect(cards[0].resolved_recipe).toBeNull()
  })
})

describe('getAdminTodayPreviewCards — 컬렉션 공개 판정이 기준 시각을 쓴다', () => {
  const collectionCard = () => cardRow({ id: 'a', template_type: 'itembook_milestone', item_book_id: 'book1' })

  it('아직 공개 전인 컬렉션은 그 날짜 00:00(KST) 기준으로 판정한다 — 공개 시각 뒤 날짜면 이름이 실린다', async () => {
    // 공개 시각: 2026-10-10 00:00 KST(= 10-09T15:00Z)
    fx.tables.today_cards = [collectionCard()]
    fx.tables.item_books = [bookRow('book1', '곧 열리는 컬렉션', { valid_from: '2026-10-09T15:00:00Z' })]

    const [before] = await getAdminTodayPreviewCards('2026-10-09', NOW)
    const [onDay] = await getAdminTodayPreviewCards('2026-10-10', NOW)

    expect(before.resolved_collection).toBeNull()
    expect(onDay.resolved_collection).toMatchObject({ name: '곧 열리는 컬렉션' })
  })

  it('선택한 날짜가 오늘이면 지금 기준이다 — 오늘 00:00 뒤 공개 시각이라도 지금 이전이면 이름이 실린다', async () => {
    // 공개 시각: 오늘 10:00 KST(= 01:00Z). 지금은 12:00 KST이고 오늘 00:00 KST는 공개 시각보다 이르다.
    fx.tables.today_cards = [collectionCard()]
    fx.tables.item_books = [bookRow('book1', '오늘 열린 컬렉션', { valid_from: '2026-10-05T01:00:00Z' })]

    const [today] = await getAdminTodayPreviewCards(TODAY, NOW)

    expect(today.resolved_collection).toMatchObject({ name: '오늘 열린 컬렉션' })
  })

  it('선택한 날짜가 오늘이어도 공개 시각이 지금보다 뒤면 이름이 없다', async () => {
    fx.tables.today_cards = [collectionCard()]
    fx.tables.item_books = [bookRow('book1', '오늘 저녁 열리는 컬렉션', { valid_from: '2026-10-05T10:00:00Z' })]

    const [today] = await getAdminTodayPreviewCards(TODAY, NOW)

    expect(today.resolved_collection).toBeNull()
  })
})

describe('자원 판정 순수 함수', () => {
  const row = (overrides: Row) => cardRow(overrides) as unknown as TodayCardRow

  it('resourceNeedsMission: 미션 소개·자동 카드만 미션 값을 쓰고, 미션 id가 없으면 쓰지 않는다', () => {
    expect(resourceNeedsMission(row({ template_type: 'mission_spotlight', mission_id: 'm1' }))).toBe(true)
    expect(resourceNeedsMission(row({ template_type: 'progress_nudge', mission_id: 'm1' }))).toBe(true)
    expect(resourceNeedsMission(row({ template_type: 'location_trend', mission_id: 'm1' }))).toBe(true)
    expect(resourceNeedsMission(row({ template_type: 'mission_spotlight', mission_id: null }))).toBe(false)
    expect(resourceNeedsMission(row({ template_type: 'editorial_article', mission_id: 'm1' }))).toBe(false)
    expect(resourceNeedsMission(row({ template_type: 'badge_spotlight', mission_id: 'm1' }))).toBe(false)
  })

  it('missionIdsToResolve: 읽어야 하는 카드의 미션 id를 중복 없이 모은다', () => {
    const cards = [
      row({ template_type: 'mission_spotlight', mission_id: 'm1' }),
      row({ template_type: 'progress_nudge', mission_id: 'm1' }),
      row({ template_type: 'mission_spotlight', mission_id: 'm2' }),
      row({ template_type: 'editorial_article', mission_id: 'm3' }),
    ]
    expect(missionIdsToResolve(cards)).toEqual(['m1', 'm2'])
  })

  it('collectionIdsToResolve: 컬렉션 소식 카드의 컬렉션 id만 중복 없이 모은다', () => {
    const cards = [
      row({ template_type: 'itembook_milestone', item_book_id: 'book1' }),
      row({ template_type: 'itembook_milestone', item_book_id: 'book1' }),
      row({ template_type: 'itembook_milestone', item_book_id: null }),
      row({ template_type: 'badge_spotlight', item_book_id: 'book2' }),
    ]
    expect(collectionIdsToResolve(cards)).toEqual(['book1'])
  })

  it('toResolvedMission: 화면 변환에 쓰는 값만 담고 보상 배지는 개수로 센다', () => {
    const mission = missionRow('m1', { ends_at: null, reward_points: null, reward_badge_ids: null, image_url: null })
    expect(toResolvedMission(mission as unknown as Parameters<typeof toResolvedMission>[0])).toEqual({
      starts_at: '2026-01-01T00:00:00Z',
      ends_at: null,
      reward_points: null,
      reward_badge_count: 0,
      image_url: null,
    })
  })
})
