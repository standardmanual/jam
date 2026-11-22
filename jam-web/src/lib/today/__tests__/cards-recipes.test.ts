/**
 * 레시피 값: 홈 조회는 읽지 않고, 어드민 미리보기가 쓰는 변환 함수는 그대로다 (티켓 20261006_1217 → 티켓 20261122_1101)
 *
 * 확인하는 것:
 * 1. `getTodayCards`는 레시피 공개 카드(`recipe_reveal`)가 있어도 레시피·슬롯 표를 읽지 않고 `resolved_recipe`를 싣지 않는다(홈이 레시피 공개 카드를 더 내지 않는다, 상위 20261122_1100).
 *    후보 배지도 카드 배지(`badge_ids`)만 읽는다. 처음 보는 템플릿 값의 카드도 던지지 않는다.
 * 2. `toResolvedRecipe`(순수) — 어드민 날짜별 미리보기(`lib/admin/todayPreview.ts`)가 같은 함수로 대표 후보를 고른다. 공개 전·공개 뒤 값과 후보 고르기 규칙을 그대로 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/cards-recipes.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>

const fx = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, { message: string } | null>,
  /** 읽기 기록: 테이블 이름, select 칸, `in` 조건의 값 */
  reads: [] as { table: string; columns: string; ins: Record<string, unknown[]> }[],
}))

/** `eq`·`in`·`is(null)` 조건을 행에 실제로 적용하는 가짜 클라이언트. 점이 있는 칸(`inventory.user_id`)과 그 밖의 조건은 따지지 않는다. */
function fakeSupabase() {
  const from = (table: string) => {
    const read = { table, columns: '', ins: {} as Record<string, unknown[]> }
    fx.reads.push(read)
    const builder: Record<string, unknown> = {}
    const filters: ((row: Row) => boolean)[] = []
    for (const op of ['lte', 'gte', 'overlaps', 'order', 'or']) builder[op] = () => builder
    builder.select = (columns: string) => {
      read.columns = columns
      return builder
    }
    builder.eq = (column: string, value: unknown) => {
      if (!column.includes('.')) filters.push((row) => row[column] === value)
      return builder
    }
    builder.in = (column: string, values: unknown[]) => {
      read.ins[column] = values
      filters.push((row) => values.includes(row[column]))
      return builder
    }
    builder.is = (column: string, value: null) => {
      if (value === null) filters.push((row) => row[column] == null)
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

import { getTodayCards, toResolvedRecipe, type FetchedRecipe, type ResolvedBadge } from '../cards'
import { toCardView } from '../cardView'

const NOW = new Date('2026-10-05T03:00:00Z')
const USER = 'u1'

/** 홈 정렬은 유저·날짜 씨앗으로 섞이므로(티켓 20261102_1720) 순서가 주제가 아닌 시험은 카드 id 순으로 받는다 */
async function getCardsById(...args: Parameters<typeof getTodayCards>) {
  return (await getTodayCards(...args)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function cardRow(overrides: Row): Row {
  return {
    id: 'c',
    template_type: 'recipe_reveal',
    layout_type: 'badge_gallery',
    title: '새 레시피가 공개돼요',
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
    shape: 'list',
    ...overrides,
  }
}

function recipeRow(id: string, overrides: Row = {}): Row {
  return {
    id,
    name: `${id} 비밀 이름`,
    reward_points: 300,
    reward_badge_ids: ['reward-badge'],
    valid_from: null,
    valid_until: null,
    ...overrides,
  }
}

function slotRow(recipeId: string, slotOrder: number, allowed: string[]): Row {
  return { id: `${recipeId}-s${slotOrder}`, recipe_id: recipeId, slot_order: slotOrder, badge_type: 'item', allowed_badge_ids: allowed }
}

function badgeRow(id: string, overrides: Row = {}): Row {
  // 삭제된 배지는 이 표에 두지 않는다(가짜 클라이언트가 `deleted_at IS NULL`을 적용하지만 칸을 골라 읽지는 않으므로 값이 결과에 그대로 실린다)
  return { id, name: `배지 ${id}`, image_url: `https://cdn.example/${id}.png`, rarity: 'rare', ...overrides }
}

const count = (table: string) => fx.reads.filter((r) => r.table === table).length

beforeEach(() => {
  fx.tables = {}
  fx.errors = {}
  fx.reads = []
  vi.restoreAllMocks()
})

describe('getTodayCards — 레시피 공개 카드는 레시피를 읽지 않는다 (티켓 20261122_1101)', () => {
  beforeEach(() => {
    fx.tables.today_cards = [cardRow({ id: 'a', recipe_id: 'r1', badge_ids: ['k1'] })]
    fx.tables.combination_recipes = [recipeRow('r1', { valid_from: '2026-10-01T00:00:00Z', reward_badge_ids: ['x', 'y'] })]
    fx.tables.combination_recipe_slots = [slotRow('r1', 1, ['a1', 'a2'])]
    fx.tables.badges = ['k1', 'a1', 'a2', 'x', 'y'].map((id) => badgeRow(id))
  })

  it('레시피·슬롯 표를 읽지 않고 resolved_recipe를 싣지 않는다', async () => {
    const [card] = await getCardsById(USER, null, NOW)

    expect(card.id).toBe('a')
    expect(card.resolved_recipe).toBeUndefined()
    expect(count('combination_recipes')).toBe(0)
    expect(count('combination_recipe_slots')).toBe(0)
  })

  it('배지는 카드에 걸린 배지(badge_ids)만 읽는다 — 레시피 후보 배지를 더하지 않는다', async () => {
    const [card] = await getCardsById(USER, null, NOW)

    const badgeReads = fx.reads.filter((r) => r.table === 'badges')
    expect(badgeReads).toHaveLength(1)
    expect(badgeReads[0].ins.id).toEqual(['k1'])
    expect(card.resolved_badges.map((b) => b.id)).toEqual(['k1'])
  })

  it('랭킹 보드 카드도 순위를 읽지 않는다 — resolved_ranking은 null이다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'r', template_type: 'ranking_board', layout_type: 'ranking_list', ranking_mode_id: 'm1', shape: 'list' })]
    const [card] = await getCardsById(USER, null, NOW)

    expect(card.resolved_ranking).toBeNull()
  })
})

describe('getTodayCards — 처음 보는 템플릿 값', () => {
  it('던지지 않고 카드 목록에 남는다(미션·컬렉션 값은 null이다)', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', template_type: 'future_template', layout_type: 'other', shape: null, recipe_id: 'r1' })]

    const cards = await getCardsById(USER, null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['a'])
    expect(cards[0]).toMatchObject({ resolved_mission: null, resolved_collection: null })
    expect(() => toCardView(cards[0], { now: NOW })).not.toThrow()
  })
})

describe('toResolvedRecipe — 대표 후보 고르기(순수)', () => {
  const badge = (id: string, earned: boolean): ResolvedBadge => ({ id, name: id, image_url: null, rarity: null, earned })
  const released = (slot_candidates: string[][]): FetchedRecipe => ({
    state: 'released',
    ingredient_count: slot_candidates.length,
    reward_points: 0,
    reward_badge_count: 0,
    slot_candidates,
  })

  it('레시피를 읽지 못했으면(undefined) null이다', () => {
    expect(toResolvedRecipe(undefined, new Map())).toBeNull()
  })

  it('공개 전 값은 그대로 돌려준다(후보 배지 맵을 보지 않는다)', () => {
    const scheduled: FetchedRecipe = { state: 'scheduled', ingredient_count: 2, release_at: '2026-10-12T00:00:00Z' }
    expect(toResolvedRecipe(scheduled, new Map())).toBe(scheduled)
  })

  it('가진 후보가 있으면 그 후보, 없으면 첫 후보, 후보가 전부 없으면 슬롯을 건너뛴다', () => {
    const map = new Map([badge('a', false), badge('b', true), badge('c', true), badge('d', false)].map((b) => [b.id, b]))
    const result = toResolvedRecipe(released([['a', 'b', 'c'], ['d', 'x'], ['x', 'y']]), map)
    expect(result?.state === 'released' && result.tiles.map((t) => t.id)).toEqual(['b', 'd'])
    expect(result?.ingredient_count).toBe(3)
  })

  it('같은 배지가 두 슬롯의 후보여도 슬롯마다 타일 하나다', () => {
    const map = new Map([['a', badge('a', true)]])
    const result = toResolvedRecipe(released([['a'], ['a']]), map)
    expect(result?.state === 'released' && result.tiles).toHaveLength(2)
  })
})
