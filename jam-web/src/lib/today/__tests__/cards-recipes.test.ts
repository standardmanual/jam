/**
 * getTodayCards가 레시피 공개 카드(`recipe_reveal`)의 레시피 값을 싣는지 (티켓 20261006_1217, 상위 20260930_1500 ⑫-a)
 *
 * 확인하는 것:
 * 1. 공개 뒤 레시피: 슬롯 순서(`slot_order`)대로 슬롯마다 대표 후보 하나를 싣는다 — 유저가 가진 후보가 있으면 그것(`earned: true`),
 *    없으면 `allowed_badge_ids` 순서의 첫 번째로 삭제되지 않은 후보(`earned: false`). 후보가 전부 삭제된 슬롯은 타일만 빠지고 재료 수에는 든다.
 * 2. 공개 전 레시피: 재료 수와 공개 시각 두 값뿐이다. 이름·슬롯 후보·보상은 읽은 자리에서 버리고, 후보 배지를 조회하지도 않는다(사용자 결정 Q3).
 * 3. 끝났거나 없는 레시피, `recipe_id`가 비었거나 레시피 공개 카드가 아닌 카드는 null이다.
 * 4. 읽기 횟수: 레시피 공개 카드가 여럿이어도 레시피 1번·슬롯 1번이고, 후보 배지는 카드 배지와 함께 1번에 읽는다. 레시피 공개 카드가 없으면 읽지 않는다.
 * 5. 조회가 실패해도 카드는 사라지지 않는다. 처음 보는 템플릿 값의 카드도 던지지 않는다.
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

describe('getTodayCards — 공개 뒤 레시피 (재료 타일)', () => {
  beforeEach(() => {
    fx.tables.today_cards = [cardRow({ id: 'a', recipe_id: 'r1' })]
    fx.tables.combination_recipes = [recipeRow('r1', { valid_from: '2026-10-01T00:00:00Z', reward_points: 300, reward_badge_ids: ['x', 'y'] })]
    fx.tables.badges = ['a1', 'a2', 'b1', 'b2', 'c1', 'd1', 'd2'].map((id) => badgeRow(id))
  })

  it('슬롯 순서대로 슬롯마다 타일 하나 — 가진 후보가 없으면 첫 후보의 흑백(earned: false)이다', async () => {
    // 슬롯을 일부러 뒤섞어 둔다 — 순서는 slot_order가 정한다
    fx.tables.combination_recipe_slots = [
      slotRow('r1', 3, ['c1']),
      slotRow('r1', 1, ['a1', 'a2']),
      slotRow('r1', 2, ['b1', 'b2']),
    ]
    const [card] = await getTodayCards(USER, null, NOW)

    expect(card.resolved_recipe).toEqual({
      state: 'released',
      ingredient_count: 3,
      reward_points: 300,
      reward_badge_count: 2,
      tiles: [
        { id: 'a1', name: '배지 a1', image_url: 'https://cdn.example/a1.png', rarity: 'rare', earned: false },
        { id: 'b1', name: '배지 b1', image_url: 'https://cdn.example/b1.png', rarity: 'rare', earned: false },
        { id: 'c1', name: '배지 c1', image_url: 'https://cdn.example/c1.png', rarity: 'rare', earned: false },
      ],
    })
  })

  it('유저가 가진 후보가 있으면 그 후보가 대표다(컬러) — 둘 이상 가졌으면 allowed_badge_ids 순서의 첫 번째', async () => {
    fx.tables.combination_recipe_slots = [slotRow('r1', 1, ['a1', 'a2']), slotRow('r1', 2, ['b1', 'b2', 'd1'])]
    // 슬롯 1은 두 번째 후보만, 슬롯 2는 두 번째·세 번째 후보를 가졌다(활동 배지와 인벤토리 아이템 — 3원 판정)
    fx.tables.user_activity_badges = [{ user_id: USER, badge_id: 'a2' }, { user_id: USER, badge_id: 'b2' }]
    fx.tables.inventory_items = [{ badge_id: 'd1' }]

    const [card] = await getTodayCards(USER, null, NOW)

    expect(card.resolved_recipe).toMatchObject({
      tiles: [
        { id: 'a2', earned: true },
        { id: 'b2', earned: true },
      ],
    })
  })

  it('다른 유저가 가진 배지는 보유로 치지 않는다', async () => {
    fx.tables.combination_recipe_slots = [slotRow('r1', 1, ['a1', 'a2'])]
    fx.tables.user_activity_badges = [{ user_id: 'someone-else', badge_id: 'a2' }]

    const [card] = await getTodayCards(USER, null, NOW)

    expect(card.resolved_recipe).toMatchObject({ tiles: [{ id: 'a1', earned: false }] })
  })

  it('삭제된 후보는 건너뛴다 — 첫 후보가 삭제돼 있으면 다음 후보가 대표다', async () => {
    fx.tables.combination_recipe_slots = [slotRow('r1', 1, ['gone', 'a2'])]

    const [card] = await getTodayCards(USER, null, NOW)

    expect(card.resolved_recipe).toMatchObject({ tiles: [{ id: 'a2', earned: false }] })
  })

  it('후보가 전부 삭제된 슬롯은 타일만 빠지고 재료 수에는 든다', async () => {
    fx.tables.combination_recipe_slots = [slotRow('r1', 1, ['a1']), slotRow('r1', 2, ['gone1', 'gone2'])]

    const [card] = await getTodayCards(USER, null, NOW)

    expect(card.resolved_recipe).toMatchObject({ state: 'released', ingredient_count: 2 })
    expect(card.resolved_recipe?.state === 'released' && card.resolved_recipe.tiles.map((t) => t.id)).toEqual(['a1'])
  })

  it('공개 시각 정각은 공개다(경계 포함), 종료 시각이 없으면 상시다', async () => {
    fx.tables.combination_recipes = [recipeRow('r1', { valid_from: NOW.toISOString(), valid_until: null })]
    fx.tables.combination_recipe_slots = [slotRow('r1', 1, ['a1'])]

    const [card] = await getTodayCards(USER, null, NOW)

    expect(card.resolved_recipe?.state).toBe('released')
  })

  it('홈 표시 데이터까지 이어 보면 list이고 슬롯 수만큼 타일, 정보 줄은 「재료 N개」·「보상 …」이다', async () => {
    fx.tables.combination_recipe_slots = [slotRow('r1', 1, ['a1']), slotRow('r1', 2, ['b1'])]
    fx.tables.user_activity_badges = [{ user_id: USER, badge_id: 'b1' }]

    const [card] = await getTodayCards(USER, null, NOW)
    const view = toCardView(card, { now: NOW, tracking: true })

    expect(card.resolved_href).toBe('/combine')
    expect(view.shape).toBe('list')
    if (view.shape !== 'list') throw new Error('list여야 한다')
    expect(view.facts).toEqual(['재료 2개', '보상 300 포인트 · 배지 2개'])
    expect(view.tiles.map((t) => [t.name, t.earned])).toEqual([
      ['배지 a1', false],
      ['배지 b1', true],
    ])
  })
})

describe('getTodayCards — 공개 전 레시피 (재료 수·공개 시각만)', () => {
  beforeEach(() => {
    fx.tables.today_cards = [cardRow({ id: 'a', recipe_id: 'r1' })]
    fx.tables.combination_recipes = [
      recipeRow('r1', { valid_from: '2026-10-12T09:00:00Z', reward_points: 999, reward_badge_ids: ['x', 'y', 'z'] }),
    ]
    fx.tables.combination_recipe_slots = [slotRow('r1', 1, ['secret-a', 'secret-b']), slotRow('r1', 2, ['secret-c']), slotRow('r1', 3, ['secret-d'])]
    fx.tables.badges = ['secret-a', 'secret-b', 'secret-c', 'secret-d'].map((id) => badgeRow(id))
  })

  it('재료 수와 공개 시각 두 값뿐이다 — 이름·슬롯 후보·보상 값이 응답에 없다(객체 키 단위)', async () => {
    const [card] = await getTodayCards(USER, null, NOW)

    expect(card.resolved_recipe).toEqual({ state: 'scheduled', ingredient_count: 3, release_at: '2026-10-12T09:00:00Z' })
    expect(Object.keys(card.resolved_recipe ?? {}).sort()).toEqual(['ingredient_count', 'release_at', 'state'])
    // 카드 행 전체를 직렬화해도 레시피 이름·후보·보상 값이 어디에도 없다
    const json = JSON.stringify(card)
    for (const secret of ['비밀 이름', 'secret-', '999', 'reward_points']) expect(json).not.toContain(secret)
  })

  it('후보 배지를 읽지도 않는다(배지 조회가 없다)', async () => {
    await getTodayCards(USER, null, NOW)

    expect(count('badges')).toBe(0)
    expect(count('user_activity_badges')).toBe(0)
  })

  it('홈 표시 데이터까지 이어 보면 brief이고 「재료 3개」·「공개 10월 12일」 두 줄이다(KST)', async () => {
    const [card] = await getTodayCards(USER, null, NOW)
    const view = toCardView(card, { now: NOW, tracking: true })

    expect(view.shape).toBe('brief')
    expect(view.facts).toEqual(['재료 3개', '공개 10월 12일'])
    expect(view.href).toBe('/combine')
  })

  it('공개 시각을 해석할 수 없으면 공개 전(fail-closed)이고 공개일 줄만 생략된다', async () => {
    fx.tables.combination_recipes = [recipeRow('r1', { valid_from: 'not-a-date' })]

    const [card] = await getTodayCards(USER, null, NOW)
    const view = toCardView(card, { now: NOW })

    expect(card.resolved_recipe).toMatchObject({ state: 'scheduled' })
    expect(view.facts).toEqual(['재료 3개'])
  })
})

describe('getTodayCards — 레시피 줄이 없는 경우', () => {
  it('종료 시각이 지난 레시피는 null이다(종료 시각 정각도 끝)', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', recipe_id: 'r1' }), cardRow({ id: 'b', recipe_id: 'r2' })]
    fx.tables.combination_recipes = [
      recipeRow('r1', { valid_from: '2026-09-01T00:00:00Z', valid_until: '2026-10-04T00:00:00Z' }),
      recipeRow('r2', { valid_from: '2026-09-01T00:00:00Z', valid_until: NOW.toISOString() }),
    ]
    fx.tables.combination_recipe_slots = [slotRow('r1', 1, ['a1']), slotRow('r2', 1, ['a1'])]

    const cards = await getTodayCards(USER, null, NOW)

    expect(cards.map((c) => c.resolved_recipe)).toEqual([null, null])
    expect(count('combination_recipe_slots')).toBe(0)
  })

  it('레시피 행이 없으면(삭제됨) null이다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', recipe_id: 'gone' })]

    const [card] = await getTodayCards(USER, null, NOW)

    expect(card.resolved_recipe).toBeNull()
  })

  it('recipe_id가 비었거나 없으면(null·undefined·빈 문자열) 레시피 테이블을 읽지 않고 null이다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', recipe_id: null }), cardRow({ id: 'b' }), cardRow({ id: 'c', recipe_id: '' })]

    const cards = await getTodayCards(USER, null, NOW)

    expect(cards.map((c) => c.resolved_recipe)).toEqual([null, null, null])
    expect(fx.reads.map((r) => r.table)).toEqual(['today_cards'])
  })

  it('레시피 공개 카드가 아닌 카드는 recipe_id가 있어도 읽지 않고 null이다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', template_type: 'badge_spotlight', layout_type: 'other', recipe_id: 'r1' })]
    fx.tables.combination_recipes = [recipeRow('r1')]

    const [card] = await getTodayCards(USER, null, NOW)

    expect(card.resolved_recipe).toBeNull()
    expect(fx.reads.map((r) => r.table)).toEqual(['today_cards'])
  })
})

describe('getTodayCards — 읽기 횟수', () => {
  it('레시피 공개 카드가 셋(레시피 둘, 같은 레시피 포함)이어도 레시피 1번·슬롯 1번이고, 후보 배지는 카드 배지와 함께 1번에 읽는다', async () => {
    fx.tables.today_cards = [
      cardRow({ id: 'a', recipe_id: 'r1' }),
      cardRow({ id: 'b', recipe_id: 'r2' }),
      cardRow({ id: 'c', recipe_id: 'r1' }),
      cardRow({ id: 'd', template_type: 'badge_spotlight', layout_type: 'other', shape: null, badge_ids: ['solo'] }),
    ]
    fx.tables.combination_recipes = [recipeRow('r1'), recipeRow('r2', { valid_from: '2026-10-20T00:00:00Z' })]
    fx.tables.combination_recipe_slots = [slotRow('r1', 1, ['a1']), slotRow('r1', 2, ['b1']), slotRow('r2', 1, ['c1'])]
    fx.tables.badges = ['a1', 'b1', 'c1', 'solo'].map((id) => badgeRow(id))

    const cards = await getTodayCards(USER, null, NOW)

    expect(count('combination_recipes')).toBe(1)
    expect(count('combination_recipe_slots')).toBe(1)
    expect(count('badges')).toBe(1)
    expect(count('user_activity_badges')).toBe(1)
    expect(cards.map((c) => c.resolved_recipe?.state ?? null)).toEqual(['released', 'scheduled', 'released', null])
    // 카드 배지와 후보 배지가 한 번의 조회에서 모두 풀렸다
    expect(cards[3].resolved_badges.map((b) => b.id)).toEqual(['solo'])
    expect(cards[0].resolved_recipe).toMatchObject({ tiles: [{ id: 'a1' }, { id: 'b1' }] })
  })

  it('공개 뒤 레시피의 후보만 배지 조회에 합친다(공개 전 레시피의 후보는 조회에도 없다)', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', recipe_id: 'r1' }), cardRow({ id: 'b', recipe_id: 'r2' })]
    fx.tables.combination_recipes = [recipeRow('r1'), recipeRow('r2', { valid_from: '2026-10-20T00:00:00Z' })]
    fx.tables.combination_recipe_slots = [slotRow('r1', 1, ['open-a']), slotRow('r2', 1, ['hidden-a'])]
    fx.tables.badges = ['open-a', 'hidden-a'].map((id) => badgeRow(id))

    const cards = await getTodayCards(USER, null, NOW)

    const badgeRead = fx.reads.find((r) => r.table === 'badges')
    expect(badgeRead?.ins.id).toEqual(['open-a'])
    expect(JSON.stringify(cards)).not.toContain('hidden-a')
    expect(cards[0].resolved_recipe).toMatchObject({ tiles: [{ id: 'open-a' }] })
  })

  it('조회 칸은 필요한 것만 읽는다(레시피 이름은 읽지 않는다)', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', recipe_id: 'r1' })]
    fx.tables.combination_recipes = [recipeRow('r1')]
    fx.tables.combination_recipe_slots = [slotRow('r1', 1, ['a1'])]

    await getTodayCards(USER, null, NOW)

    const recipeRead = fx.reads.find((r) => r.table === 'combination_recipes')
    expect(recipeRead?.columns).not.toContain('name')
    expect(recipeRead?.columns).not.toContain('*')
  })
})

describe('getTodayCards — 조회가 실패해도 카드와 홈은 막히지 않는다', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fx.tables.today_cards = [cardRow({ id: 'a', recipe_id: 'r1' }), cardRow({ id: 'z', template_type: 'drop_alert', layout_type: 'shortcut', shape: null })]
    fx.tables.combination_recipes = [recipeRow('r1')]
    fx.tables.combination_recipe_slots = [slotRow('r1', 1, ['a1'])]
  })

  it('레시피 조회가 실패하면 카드는 남고 레시피 값만 null이다(오류를 기록한다)', async () => {
    fx.errors.combination_recipes = { message: 'boom' }

    const cards = await getTodayCards(USER, null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['a', 'z'])
    expect(cards[0].resolved_recipe).toBeNull()
    expect(console.error).toHaveBeenCalledWith('[fetchRecipesById] 레시피 조회 오류:', 'boom')
    expect(toCardView(cards[0], { now: NOW }).shape).toBe('brief')
  })

  it('슬롯 조회가 실패하면 재료 수를 알 수 없어 레시피 값이 null이다(공개 전·뒤 모두)', async () => {
    fx.errors.combination_recipe_slots = { message: 'boom' }

    const [card] = await getTodayCards(USER, null, NOW)

    expect(card.resolved_recipe).toBeNull()
    expect(console.error).toHaveBeenCalledWith('[fetchRecipesById] 레시피 슬롯 조회 오류:', 'boom')
  })

  it('보유 여부 조회가 실패해도 타일은 그려지고 미보유(흑백)로 본다', async () => {
    fx.tables.badges = [badgeRow('a1')]
    fx.errors.user_activity_badges = { message: 'boom' }

    const [card] = await getTodayCards(USER, null, NOW)

    expect(card.resolved_recipe).toMatchObject({ tiles: [{ id: 'a1', earned: false }] })
  })
})

describe('getTodayCards — 처음 보는 템플릿 값', () => {
  it('던지지 않고 카드 목록에 남는다(레시피·미션·컬렉션 값은 null이다)', async () => {
    fx.tables.today_cards = [cardRow({ id: 'a', template_type: 'future_template', layout_type: 'other', shape: null, recipe_id: 'r1' })]

    const cards = await getTodayCards(USER, null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['a'])
    expect(cards[0]).toMatchObject({ resolved_recipe: null, resolved_mission: null, resolved_collection: null })
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
