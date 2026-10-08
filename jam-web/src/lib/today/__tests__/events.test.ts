/**
 * 투데이 카드 이벤트 기록·집계 (티켓 20260924_0004)
 *
 * 확인하는 것:
 * 1. 입력 검증(`parseTodayCardEventInput`) — cardId UUID, event 종류, `followupAction`은
 *    값과 무관하게 무시(받지 않고 저장하지 않는다, 티켓 20260924_0810)
 * 2. `recordTodayCardEvent` — 카드의 content_type_id를 조회해 함께 insert하고,
 *    insert 페이로드에 유저 식별자 키(user_id 등)가 전혀 없다
 * 3. `aggregateTodayCardEvents` — 유형 ID×모양×패턴×이벤트별 건수 집계 형태
 * 4. 그려진 모양(`card_shape`, 티켓 20261001_1431) — 모양 판정 칸을 카드 조회 한 번에 읽고, 기록에 복사한다.
 *    레시피 공개 카드는 `recipe_id`로 레시피의 공개 상태를 읽어 타일 수를 정한다(티켓 20261006_1218)
 *    타일 수가 모양 판정에 쓰이지 않는 카드(모양이 null·`list`가 아닌 모양)는 레시피를 읽지 않는다(티켓 20261006_1344)
 * 5. 패턴 번호(`pattern_no`, 마이그레이션 211, 티켓 20261008_1059) — 카드 조회 한 번에 함께 읽어 기록에 그대로 복사하고, 집계는 패턴별로 가른다
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/events.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const fixtures = vi.hoisted(() => ({
  cardsById: {} as Record<
    string,
    {
      content_type_id?: string | null
      is_active?: boolean
      starts_at?: string
      ends_at?: string
      shape?: string | null
      template_type?: string
      layout_type?: string
      cover_image_url?: string | null
      badge_ids?: string[]
      recipe_id?: string | null
      pattern_no?: string | null
    } | undefined
  >,
  recipesById: {} as Record<string, { valid_from: string | null; valid_until: string | null } | undefined>,
  recipeQueryCount: 0,
  recipeError: null as { message: string } | null,
  insertedPayloads: [] as Record<string, unknown>[],
  eventRows: [] as { content_type_id: string | null; event: string; card_shape?: string | null; pattern_no?: string | null }[],
  selectedColumns: [] as { table: string; columns: string }[],
  cardQueryCount: 0,
  cardError: null as { message: string } | null,
}))

function mockSupabase() {
  const from = (table: string) => {
    const state: { eq?: { col: string; val: unknown }; range?: [number, number] } = {}
    const builder: Record<string, unknown> = {}
    builder.select = (columns: string) => {
      fixtures.selectedColumns.push({ table, columns })
      return builder
    }
    builder.eq = (col: string, val: unknown) => {
      state.eq = { col, val }
      return builder
    }
    builder.gte = () => builder
    builder.lt = () => builder
    builder.order = () => builder
    builder.range = (start: number, end: number) => {
      state.range = [start, end]
      return builder
    }
    builder.maybeSingle = () => {
      if (table === 'combination_recipes') {
        fixtures.recipeQueryCount++
        if (fixtures.recipeError) return Promise.resolve({ data: null, error: fixtures.recipeError })
        return Promise.resolve({ data: fixtures.recipesById[state.eq?.val as string] ?? null, error: null })
      }
      if (table !== 'today_cards') return Promise.resolve({ data: null, error: null })
      fixtures.cardQueryCount++
      if (fixtures.cardError) return Promise.resolve({ data: null, error: fixtures.cardError })
      const id = state.eq?.val as string
      return Promise.resolve({ data: fixtures.cardsById[id] ?? null, error: null })
    }
    builder.insert = (payload: Record<string, unknown>) => {
      fixtures.insertedPayloads.push(payload)
      return Promise.resolve({ error: null })
    }
    builder.then = (resolve: (v: unknown) => void) => {
      if (table === 'today_card_events') {
        const rows = state.range ? fixtures.eventRows.slice(state.range[0], state.range[1] + 1) : fixtures.eventRows
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      }
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
// `LEGACY_SHAPE_CUTOVER`가 켜져 있어 실제 `drawnShape`는 null을 돌려주지 않는다 — 모양이 null로 정해지는 경우(전환 상수 꺼짐)는 한 번만 null로 바꿔 시험한다.
vi.mock('../shape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shape')>()
  return { ...actual, drawnShape: vi.fn(actual.drawnShape) }
})

import { parseTodayCardEventInput, recordTodayCardEvent, aggregateTodayCardEvents, assertCardExposable, checkRateLimit, getRateLimitKeyCount } from '../events'
import { LEGACY_SHAPE_CUTOVER, drawnShape } from '../shape'

const VALID_UUID = '11111111-1111-4111-8111-111111111111'

describe('parseTodayCardEventInput — 입력 검증', () => {
  it('cardId·event가 올바르면 통과한다', () => {
    const result = parseTodayCardEventInput({ cardId: VALID_UUID, event: 'impression' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ cardId: VALID_UUID, event: 'impression' })
    }
  })

  it('cardId가 UUID 형식이 아니면 거부한다', () => {
    const result = parseTodayCardEventInput({ cardId: 'not-a-uuid', event: 'impression' })
    expect(result.ok).toBe(false)
  })

  it('event가 impression/click이 아니면 거부한다', () => {
    const result = parseTodayCardEventInput({ cardId: VALID_UUID, event: 'unknown_event' })
    expect(result.ok).toBe(false)
  })

  it('event가 followup이면 거부한다(후속 행동은 수집하지 않는다, 티켓 20260924_0810)', () => {
    const result = parseTodayCardEventInput({ cardId: VALID_UUID, event: 'followup', followupAction: '트라이브 상세 진입' })
    expect(result.ok).toBe(false)
  })

  it('followupAction이 있어도 무시하고 통과한다(길이와 무관, 값을 저장하지 않는다)', () => {
    const result = parseTodayCardEventInput({
      cardId: VALID_UUID,
      event: 'click',
      followupAction: 'a'.repeat(1000),
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ cardId: VALID_UUID, event: 'click' })
  })

  it('followupAction이 문자열이 아니어도 거부하지 않는다(값과 무관하게 무시한다)', () => {
    const result = parseTodayCardEventInput({ cardId: VALID_UUID, event: 'click', followupAction: 12345 })
    expect(result.ok).toBe(true)
  })
})

describe('recordTodayCardEvent — 카드 유형 ID 동봉 insert, 유저 식별자 미포함', () => {
  it('카드의 content_type_id를 조회해 이벤트와 함께 insert한다', async () => {
    fixtures.insertedPayloads.length = 0
    fixtures.cardsById[VALID_UUID] = { content_type_id: 'T05' }

    const result = await recordTodayCardEvent({ cardId: VALID_UUID, event: 'impression' }, { content_type_id: 'T05', card_shape: 'hero', pattern_no: null })

    expect(result.ok).toBe(true)
    expect(fixtures.insertedPayloads).toHaveLength(1)
    expect(fixtures.insertedPayloads[0]).toEqual({
      card_id: VALID_UUID,
      content_type_id: 'T05',
      card_shape: 'hero',
      pattern_no: null,
      event: 'impression',
      followup_action: null,
    })
  })

  it('그려진 모양이 없는 카드(옛 카드)는 card_shape를 null로 insert한다', async () => {
    fixtures.insertedPayloads.length = 0

    await recordTodayCardEvent({ cardId: VALID_UUID, event: 'click' }, { content_type_id: 'T05', card_shape: null, pattern_no: null })

    expect(fixtures.insertedPayloads[0]).toMatchObject({ card_shape: null })
  })

  it('카드의 패턴 번호를 그대로 복사해 insert하고, 없는 카드는 null을 insert한다(티켓 20261008_1059)', async () => {
    fixtures.insertedPayloads.length = 0

    await recordTodayCardEvent({ cardId: VALID_UUID, event: 'impression' }, { content_type_id: 'T05', card_shape: 'hero', pattern_no: 'P12' })
    await recordTodayCardEvent({ cardId: VALID_UUID, event: 'click' }, { content_type_id: 'T05', card_shape: 'hero', pattern_no: null })

    expect(fixtures.insertedPayloads[0]).toMatchObject({ pattern_no: 'P12' })
    expect(fixtures.insertedPayloads[1]).toMatchObject({ pattern_no: null })
  })

  it('insert 페이로드에 유저 식별자 키가 전혀 없다', async () => {
    fixtures.insertedPayloads.length = 0
    fixtures.cardsById[VALID_UUID] = { content_type_id: 'T05' }

    await recordTodayCardEvent({ cardId: VALID_UUID, event: 'click' }, { content_type_id: 'T05', card_shape: 'hero', pattern_no: 'P12' })

    const keys = Object.keys(fixtures.insertedPayloads[0])
    for (const forbidden of ['user_id', 'userId', 'user', 'email', 'nickname']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})

describe('aggregateTodayCardEvents — 유형 ID×모양×패턴×이벤트별 건수 집계', () => {
  it('같은 유형·이벤트 행을 건수로 묶는다', async () => {
    fixtures.eventRows = [
      { content_type_id: 'T05', event: 'impression' },
      { content_type_id: 'T05', event: 'impression' },
      { content_type_id: 'T05', event: 'click' },
      { content_type_id: 'T01', event: 'impression' },
      { content_type_id: null, event: 'impression' },
    ]

    const rows = await aggregateTodayCardEvents('2026-09-01T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    const byKey = new Map(rows.map((r) => [`${r.contentTypeId}::${r.event}`, r.count]))
    // 모양 칸이 없는 기록(모양 도입 전)은 모두 cardShape null로 읽혀 유형×이벤트당 한 행이다
    expect(rows.every((r) => r.cardShape === null)).toBe(true)
    // 패턴 칸이 없는 기록도 모두 patternNo null로 읽힌다
    expect(rows.every((r) => r.patternNo === null)).toBe(true)

    expect(byKey.get('T05::impression')).toBe(2)
    expect(byKey.get('T05::click')).toBe(1)
    expect(byKey.get('T01::impression')).toBe(1)
    expect(byKey.get('null::impression')).toBe(1)
  })

  it('1,000행을 넘는 이벤트도 페이지를 나눠 정확히 집계한다(PostgREST 기본 상한 대응)', async () => {
    fixtures.eventRows = Array.from({ length: 1500 }, () => ({ content_type_id: 'T05', event: 'impression' }))

    const rows = await aggregateTodayCardEvents('2026-09-01T00:00:00.000Z', '2026-09-08T00:00:00.000Z')

    expect(rows).toEqual([{ contentTypeId: 'T05', cardShape: null, patternNo: null, event: 'impression', count: 1500 }])
  })

  it('같은 유형이라도 그려진 모양이 다르면 따로 세고, 모양 칸이 비면 null로 묶는다', async () => {
    fixtures.eventRows = [
      { content_type_id: 'T05', card_shape: 'hero', event: 'impression' },
      { content_type_id: 'T05', card_shape: 'hero', event: 'impression' },
      { content_type_id: 'T05', card_shape: 'hero', event: 'click' },
      { content_type_id: 'T05', card_shape: 'brief', event: 'impression' },
      { content_type_id: 'T05', card_shape: null, event: 'impression' },
      { content_type_id: 'T05', event: 'click' },
    ]

    const rows = await aggregateTodayCardEvents('2026-09-01T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    const byKey = new Map(rows.map((r) => [`${r.contentTypeId}::${r.cardShape}::${r.event}`, r.count]))

    expect(byKey.get('T05::hero::impression')).toBe(2)
    expect(byKey.get('T05::hero::click')).toBe(1)
    expect(byKey.get('T05::brief::impression')).toBe(1)
    expect(byKey.get('T05::null::impression')).toBe(1)
    expect(byKey.get('T05::null::click')).toBe(1)
    expect(rows).toHaveLength(5)
  })

  it('이벤트 테이블에서 card_shape 칸도 읽는다', async () => {
    fixtures.selectedColumns.length = 0
    fixtures.eventRows = []

    await aggregateTodayCardEvents('2026-09-01T00:00:00.000Z', '2026-09-08T00:00:00.000Z')

    const eventSelect = fixtures.selectedColumns.find((s) => s.table === 'today_card_events')
    expect(eventSelect?.columns).toContain('card_shape')
    expect(eventSelect?.columns).toContain('pattern_no')
  })

  it('같은 유형·모양이라도 패턴 번호가 다르면 다른 행으로 세고, 비면 null로 묶는다(티켓 20261008_1059)', async () => {
    fixtures.eventRows = [
      { content_type_id: 'T05', card_shape: 'hero', pattern_no: 'P12', event: 'impression' },
      { content_type_id: 'T05', card_shape: 'hero', pattern_no: 'P12', event: 'impression' },
      { content_type_id: 'T05', card_shape: 'hero', pattern_no: 'P12', event: 'click' },
      { content_type_id: 'T05', card_shape: 'hero', pattern_no: 'P03', event: 'impression' },
      { content_type_id: 'T05', card_shape: 'hero', pattern_no: null, event: 'impression' },
      { content_type_id: 'T05', card_shape: 'hero', event: 'click' },
    ]

    const rows = await aggregateTodayCardEvents('2026-09-01T00:00:00.000Z', '2026-09-08T00:00:00.000Z')
    const byKey = new Map(rows.map((r) => [`${r.contentTypeId}::${r.cardShape}::${r.patternNo}::${r.event}`, r.count]))

    expect(byKey.get('T05::hero::P12::impression')).toBe(2)
    expect(byKey.get('T05::hero::P12::click')).toBe(1)
    expect(byKey.get('T05::hero::P03::impression')).toBe(1)
    expect(byKey.get('T05::hero::null::impression')).toBe(1)
    expect(byKey.get('T05::hero::null::click')).toBe(1)
    expect(rows).toHaveLength(5)
    // 패턴 칸을 더해도 유형·모양별 합계는 그대로다
    const total = rows.reduce((sum, r) => sum + r.count, 0)
    expect(total).toBe(fixtures.eventRows.length)
    // 집계 행에도 유저 식별자 키가 없다
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['cardShape', 'contentTypeId', 'count', 'event', 'patternNo'])
    }
  })
})

describe('assertCardExposable — 카드 노출 상태 검증', () => {
  const ACTIVE_UUID = '33333333-3333-4333-8333-333333333333'
  const now = new Date('2026-09-24T00:00:00Z')

  it('존재하지 않는 카드는 거부한다', async () => {
    expect((await assertCardExposable('44444444-4444-4444-8444-444444444444', now)).ok).toBe(false)
  })

  it('is_active가 false인 카드는 거부한다', async () => {
    fixtures.cardsById[ACTIVE_UUID] = { is_active: false, starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-10-01T00:00:00Z' }
    expect((await assertCardExposable(ACTIVE_UUID, now)).ok).toBe(false)
  })

  it('노출 기간 밖이면 거부한다', async () => {
    fixtures.cardsById[ACTIVE_UUID] = { is_active: true, starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-09-10T00:00:00Z' }
    expect((await assertCardExposable(ACTIVE_UUID, now)).ok).toBe(false)
  })

  it('노출 종료 시각(ends_at)과 같은 순간이면 통과한다(양끝 포함)', async () => {
    fixtures.cardsById[ACTIVE_UUID] = { is_active: true, starts_at: '2026-09-01T00:00:00Z', ends_at: now.toISOString() }
    expect((await assertCardExposable(ACTIVE_UUID, now)).ok).toBe(true)
  })

  it('DB 조회 오류면 클라이언트에는 일반 문구만 돌려준다', async () => {
    fixtures.cardError = { message: 'connection refused: secret-host' }
    const result = await assertCardExposable(ACTIVE_UUID, now)
    fixtures.cardError = null
    expect(result).toEqual({ ok: false, error: '카드를 확인할 수 없습니다.' })
  })

  it('이벤트 1건(검증+기록)에 today_cards를 1회만 조회한다', async () => {
    fixtures.cardsById[ACTIVE_UUID] = { is_active: true, starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-10-01T00:00:00Z', content_type_id: 'T05' }
    fixtures.cardQueryCount = 0
    const exposure = await assertCardExposable(ACTIVE_UUID, now)
    if (exposure.ok) await recordTodayCardEvent({ cardId: ACTIVE_UUID, event: 'impression' }, exposure.card)
    expect(fixtures.cardQueryCount).toBe(1)
  })
})

describe('assertCardExposable — 패턴 번호(pattern_no) 복사(티켓 20261008_1059)', () => {
  const PATTERN_UUID = '77777777-7777-4777-8777-777777777777'
  const now = new Date('2026-09-24T00:00:00Z')
  const baseCard = {
    is_active: true,
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-10-01T00:00:00Z',
    content_type_id: 'T05',
    shape: 'hero',
    template_type: 'badge_spotlight',
    layout_type: 'large_thumbnail',
    cover_image_url: null,
    badge_ids: [],
  }

  it('카드를 한 번 조회하면서 pattern_no를 함께 select한다', async () => {
    fixtures.cardsById[PATTERN_UUID] = { ...baseCard, pattern_no: 'P12' }
    fixtures.selectedColumns.length = 0
    fixtures.cardQueryCount = 0

    await assertCardExposable(PATTERN_UUID, now)

    const cardSelects = fixtures.selectedColumns.filter((s) => s.table === 'today_cards')
    expect(cardSelects).toHaveLength(1)
    expect(fixtures.cardQueryCount).toBe(1)
    expect(cardSelects[0].columns.split(',').map((c) => c.trim())).toContain('pattern_no')
  })

  it('패턴 번호가 있는 카드는 그 번호를 그대로 돌려준다(형식을 다시 검사하지 않는다)', async () => {
    fixtures.cardsById[PATTERN_UUID] = { ...baseCard, pattern_no: 'P12' }
    const result = await assertCardExposable(PATTERN_UUID, now)
    expect(result.ok && result.card.pattern_no).toBe('P12')
  })

  it('패턴 번호가 비었거나 칸이 없는 카드는 null이다', async () => {
    fixtures.cardsById[PATTERN_UUID] = { ...baseCard, pattern_no: null }
    const empty = await assertCardExposable(PATTERN_UUID, now)
    expect(empty.ok && empty.card.pattern_no).toBeNull()

    fixtures.cardsById[PATTERN_UUID] = { ...baseCard }
    const missing = await assertCardExposable(PATTERN_UUID, now)
    expect(missing.ok && missing.card.pattern_no).toBeNull()
  })

  it('조회한 카드의 패턴 번호가 insert 페이로드까지 이어진다', async () => {
    fixtures.cardsById[PATTERN_UUID] = { ...baseCard, pattern_no: 'P12' }
    fixtures.insertedPayloads.length = 0
    const exposure = await assertCardExposable(PATTERN_UUID, now)
    if (exposure.ok) await recordTodayCardEvent({ cardId: PATTERN_UUID, event: 'click' }, exposure.card)
    expect(fixtures.insertedPayloads[0]).toMatchObject({ card_id: PATTERN_UUID, pattern_no: 'P12' })
  })
})

describe('assertCardExposable — 그려진 모양(card_shape) 판정', () => {
  const SHAPE_UUID = '55555555-5555-4555-8555-555555555555'
  const now = new Date('2026-09-24T00:00:00Z')
  type CardFixture = NonNullable<(typeof fixtures.cardsById)[string]>
  const baseCard: CardFixture = {
    is_active: true,
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-10-01T00:00:00Z',
    content_type_id: 'T05',
    shape: null,
    template_type: 'badge_spotlight',
    layout_type: 'large_thumbnail',
    cover_image_url: null,
    badge_ids: [],
  }
  const exposeWith = async (patch: Partial<CardFixture>) => {
    fixtures.cardsById[SHAPE_UUID] = { ...baseCard, ...patch }
    return assertCardExposable(SHAPE_UUID, now)
  }

  it('카드를 한 번 조회하면서 모양 판정에 필요한 칸을 함께 select한다', async () => {
    fixtures.cardsById[SHAPE_UUID] = { ...baseCard }
    fixtures.selectedColumns.length = 0
    fixtures.cardQueryCount = 0

    await assertCardExposable(SHAPE_UUID, now)

    const cardSelects = fixtures.selectedColumns.filter((s) => s.table === 'today_cards')
    expect(cardSelects).toHaveLength(1)
    expect(fixtures.cardQueryCount).toBe(1)
    const columns = cardSelects[0].columns.split(',').map((c) => c.trim())
    for (const required of ['shape', 'template_type', 'layout_type', 'cover_image_url', 'badge_ids', 'recipe_id']) {
      expect(columns).toContain(required)
    }
  })

  it('shape가 저장된 카드는 그 모양을 그려진 모양으로 돌려준다', async () => {
    for (const shape of ['hero', 'poster', 'square', 'brief'] as const) {
      const result = await exposeWith({ shape })
      expect(result.ok && result.card.card_shape).toBe(shape)
    }
  })

  it('shape가 없는 옛 카드는 전환 뒤(LEGACY_SHAPE_CUTOVER=true) 옛 값 대응표의 모양으로 기록한다(티켓 20261001_2244)', async () => {
    expect(LEGACY_SHAPE_CUTOVER).toBe(true)
    const result = await exposeWith({ shape: null, layout_type: 'large_thumbnail' })
    expect(result.ok && result.card.card_shape).toBe('hero')
  })

  it('저장된 shape가 모양 값이 아니면 옛 카드로 보고 옛 값 대응표로 정한다', async () => {
    const result = await exposeWith({ shape: 'large_thumbnail' })
    expect(result.ok && result.card.card_shape).toBe('hero')
  })

  it('타일형 list는 배지가 있으면 list, 0개면 화면처럼 brief다', async () => {
    const withBadges = await exposeWith({ shape: 'list', template_type: 'badge_spotlight', badge_ids: ['b1', 'b2'] })
    expect(withBadges.ok && withBadges.card.card_shape).toBe('list')

    const empty = await exposeWith({ shape: 'list', template_type: 'badge_spotlight', badge_ids: [] })
    expect(empty.ok && empty.card.card_shape).toBe('brief')
  })

  it('랭킹 행형 list는 배지가 0개여도 list다', async () => {
    const result = await exposeWith({ shape: 'list', template_type: 'ranking_board', badge_ids: [] })
    expect(result.ok && result.card.card_shape).toBe('list')
  })

  it('노출 검증을 통과하지 못한 카드는 모양을 돌려주지 않는다', async () => {
    const result = await exposeWith({ shape: 'hero', is_active: false })
    expect(result.ok).toBe(false)
  })

  describe('레시피 공개 카드 — 타일 수를 레시피의 공개 상태로 정한다(티켓 20261006_1218)', () => {
    const RECIPE_ID = '66666666-6666-4666-8666-666666666666'
    const recipeCard: Partial<CardFixture> = { shape: 'list', template_type: 'recipe_reveal', layout_type: 'badge_gallery', badge_ids: [], recipe_id: RECIPE_ID }
    const withRecipe = async (recipe: { valid_from: string | null; valid_until: string | null } | undefined, patch: Partial<CardFixture> = {}) => {
      fixtures.recipesById = recipe ? { [RECIPE_ID]: recipe } : {}
      fixtures.recipeQueryCount = 0
      fixtures.cardQueryCount = 0
      return exposeWith({ ...recipeCard, ...patch })
    }
    // now = 2026-09-24T00:00Z
    const RELEASED = { valid_from: '2026-09-01T00:00:00Z', valid_until: null }

    afterEach(() => {
      fixtures.recipesById = {}
      fixtures.recipeError = null
    })

    it('레시피가 공개 중이면 list로 기록한다(badge_ids가 비어 있어도)', async () => {
      const result = await withRecipe(RELEASED)
      expect(result.ok && result.card.card_shape).toBe('list')
      expect(fixtures.cardQueryCount).toBe(1)
      expect(fixtures.recipeQueryCount).toBe(1)
    })

    it('공개 시각이 비어 있으면 처음부터 공개이므로 list다', async () => {
      const result = await withRecipe({ valid_from: null, valid_until: null })
      expect(result.ok && result.card.card_shape).toBe('list')
    })

    it('공개 전(valid_from이 미래)이면 brief다', async () => {
      const result = await withRecipe({ valid_from: '2026-10-12T00:00:00Z', valid_until: null })
      expect(result.ok && result.card.card_shape).toBe('brief')
    })

    it('종료된 레시피(valid_until이 지났다)와 읽을 수 없는 공개 시각은 brief다', async () => {
      const ended = await withRecipe({ valid_from: '2026-08-01T00:00:00Z', valid_until: '2026-09-10T00:00:00Z' })
      expect(ended.ok && ended.card.card_shape).toBe('brief')
      const unreadable = await withRecipe({ valid_from: 'not-a-date', valid_until: null })
      expect(unreadable.ok && unreadable.card.card_shape).toBe('brief')
    })

    it('레시피 행이 없으면(지워졌다) brief다', async () => {
      const result = await withRecipe(undefined)
      expect(result.ok && result.card.card_shape).toBe('brief')
    })

    it('recipe_id가 비어 있으면 레시피를 읽지 않고 brief다', async () => {
      const result = await withRecipe(RELEASED, { recipe_id: null })
      expect(result.ok && result.card.card_shape).toBe('brief')
      expect(fixtures.recipeQueryCount).toBe(0)
    })

    it('레시피 공개 카드가 아니면 recipe_id가 있어도 레시피를 읽지 않고 badge_ids 개수로 정한다', async () => {
      const result = await withRecipe(RELEASED, { template_type: 'badge_spotlight', badge_ids: ['b1'] })
      expect(result.ok && result.card.card_shape).toBe('list')
      expect(fixtures.recipeQueryCount).toBe(0)
    })

    it('저장된 모양이 brief·poster면 레시피 상태와 무관하게 그 모양이다', async () => {
      for (const shape of ['brief', 'poster'] as const) {
        const result = await withRecipe(RELEASED, { shape })
        expect(result.ok && result.card.card_shape).toBe(shape)
      }
    })

    it('모양이 null로 정해지는 카드(shape가 없고 전환 상수가 꺼짐)는 레시피를 읽지 않고 기록 모양 null로 끝낸다(티켓 20261006_1344)', async () => {
      vi.mocked(drawnShape).mockReturnValueOnce(null)
      const result = await withRecipe(RELEASED, { shape: null })
      expect(result.ok && result.card.card_shape).toBeNull()
      expect(fixtures.recipeQueryCount).toBe(0)
    })

    it('저장된 모양이 list가 아니면 타일 수가 쓰이지 않으므로 레시피를 읽지 않는다(티켓 20261006_1344)', async () => {
      for (const shape of ['hero', 'poster', 'square', 'brief'] as const) {
        const result = await withRecipe(RELEASED, { shape })
        expect(result.ok && result.card.card_shape).toBe(shape)
        expect(fixtures.recipeQueryCount).toBe(0)
      }
    })

    it('저장된 모양이 list면 타일 수가 쓰이므로 레시피를 읽는다(티켓 20261006_1344)', async () => {
      const result = await withRecipe(RELEASED, { shape: 'list' })
      expect(result.ok && result.card.card_shape).toBe('list')
      expect(fixtures.recipeQueryCount).toBe(1)
    })

    it('레시피를 읽지 못해도 이벤트 기록은 막히지 않는다 — 그 카드는 brief로 기록하고 오류는 로그에만 남긴다', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      fixtures.recipeError = { message: 'connection refused: secret-host' }
      const result = await withRecipe(RELEASED)
      expect(result.ok && result.card.card_shape).toBe('brief')
      expect(JSON.stringify(result)).not.toContain('secret-host')
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('노출 검증을 통과하지 못한 카드는 레시피를 읽지 않는다', async () => {
      const result = await withRecipe(RELEASED, { is_active: false })
      expect(result.ok).toBe(false)
      expect(fixtures.recipeQueryCount).toBe(0)
    })
  })
})

describe('checkRateLimit — 유저별 분당 요청 상한', () => {
  it('상한 초과 요청을 거부한다', () => {
    const key = 'rate-limit-test-user'
    for (let i = 0; i < 3; i++) expect(checkRateLimit(key, 3, 60_000).ok).toBe(true)
    expect(checkRateLimit(key, 3, 60_000).ok).toBe(false)
  })

  it('요청이 창 밖으로 밀린 유저 키는 다른 요청 시점에 Map에서 지운다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    checkRateLimit('sweep-user-a', 3, 60_000)
    expect(getRateLimitKeyCount()).toBe(1)
    vi.setSystemTime(new Date('2030-01-01T00:01:01Z'))
    checkRateLimit('sweep-user-b', 3, 60_000)
    expect(getRateLimitKeyCount()).toBe(1)
  })

  afterEach(() => vi.useRealTimers())
})
