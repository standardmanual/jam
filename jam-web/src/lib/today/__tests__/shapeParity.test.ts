/**
 * 기록 모양 = 화면 모양 (티켓 20261001_2244, 상위 20260930_1453 조각 b7)
 *
 * 같은 카드 행이면 계측이 `today_card_events.card_shape`에 기록하는 모양(`events.ts`의 `assertCardExposable`)과 홈이 그리는 모양
 * (`toCardView`)이 같아야 한다. 이벤트 경로에는 배지 조회가 없어 배지 그림 유무를 모르므로, 두 경로는 같은 입력(카드 행의 `badge_ids`)으로
 * 판정한다. 옛 레이아웃 6종 × 커버 있음/없음 × 배지 0개/그림 있는 배지/그림 없는 배지(× 대표 템플릿 4종)를 전부 맞춰 본다.
 *
 * 피할 수 없는 차이는 홈피드 PRD §9에 허용 차이로 적혀 있고 아래에서 고정한다: `badge_ids`가 있지만 그 배지가 전부 삭제된 타일형 `list`와, 그것과 같은
 * 이유로 후보 배지가 전부 삭제된 공개 뒤 레시피 공개 카드의 `list`. 레시피 공개 카드는 타일이 레시피 슬롯에서 나오므로 계측(`events.ts`)이 `recipe_id`로 읽은
 * 레시피의 공개 상태로 타일 수를 정한다(티켓 20261006_1218) — 공개 뒤·공개 전·레시피 없음·종료는 화면과 기록이 같다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/shapeParity.test.ts
 */
import { describe, it, expect, vi } from 'vitest'

let row: Record<string, unknown> | null = null
/** 카드가 가리키는 레시피 행(`combination_recipes`). null이면 레시피가 없다. */
let recipeRow: Record<string, unknown> | null = null

// `assertCardExposable`이 읽는 체인(`from → select → eq → maybeSingle`)만 흉내 낸다. 카드 행과 레시피 행을 테이블로 가른다.
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: table === 'combination_recipes' ? recipeRow : row, error: null }) }) }),
    }),
  }),
}))

import { assertCardExposable } from '../events'
import { toCardView } from '../cardView'
import type { ResolvedBadge, TodayCardWithHref } from '../cards'
import type { TodayCardLayoutType, TodayCardTemplateType } from '@/types/database'

const NOW = new Date('2026-10-05T03:00:00Z')
const LAYOUTS: TodayCardLayoutType[] = ['large_thumbnail', 'banner', 'badge_gallery', 'shortcut', 'other', 'ranking_list']
const TEMPLATES: TodayCardTemplateType[] = ['badge_spotlight', 'mission_spotlight', 'editorial_article', 'ranking_board']
const COVERS = [
  ['커버 있음', 'https://cdn.example/cover.png'],
  ['커버 없음', null],
] as const

const withImage: ResolvedBadge = { id: 'b1', name: '배지 하나', image_url: 'https://cdn.example/b1.png', rarity: 'rare', earned: true }
const withoutImage: ResolvedBadge = { id: 'b1', name: '배지 하나', image_url: null, rarity: 'rare', earned: true }
const BADGES: readonly (readonly [string, string[], ResolvedBadge[]])[] = [
  ['배지 0개', [], []],
  ['그림 있는 배지', ['b1'], [withImage]],
  ['그림 없는 배지', ['b1'], [withoutImage]],
]

function cardRow(over: Partial<TodayCardWithHref>): TodayCardWithHref {
  return {
    id: 'card-1',
    template_type: 'badge_spotlight',
    layout_type: 'large_thumbnail',
    title: '제목',
    subtitle: null,
    description: null,
    cover_image_url: null,
    badge_ids: [],
    mission_id: null,
    item_book_id: null,
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: ['all'],
    starts_at: '2026-10-01T00:00:00Z',
    ends_at: '2026-10-31T00:00:00Z',
    sort_order: 0,
    is_active: true,
    created_at: '2026-09-30T00:00:00Z',
    created_by: null,
    ranking_mode_id: null,
    recipe_id: null,
    content_type_id: 'T05',
    image_source: null,
    shape: null,
    title_in_image: null,
    resolved_href: '/badges',
    resolved_badges: [],
    resolved_ranking: null,
    resolved_mission: null,
    resolved_collection: null,
    ...over,
  }
}

/** 계측이 기록하는 모양 — 카드 행(배지 조회 결과 없음)과 카드가 가리키는 레시피 행만으로 정한다. */
async function recordedShape(card: TodayCardWithHref, recipe: Record<string, unknown> | null = null): Promise<string | null | undefined> {
  recipeRow = recipe
  row = {
    is_active: card.is_active,
    starts_at: card.starts_at,
    ends_at: card.ends_at,
    content_type_id: card.content_type_id,
    shape: card.shape,
    template_type: card.template_type,
    layout_type: card.layout_type,
    cover_image_url: card.cover_image_url,
    badge_ids: card.badge_ids,
    recipe_id: card.recipe_id ?? null,
  }
  const result = await assertCardExposable(card.id, NOW)
  return result.ok ? result.card.card_shape : undefined
}

describe('기록 모양 = 화면 모양 — shape가 NULL인 옛 카드 입력 묶음', () => {
  const cases = LAYOUTS.flatMap((layout) =>
    TEMPLATES.flatMap((template) =>
      COVERS.flatMap(([coverLabel, cover]) =>
        BADGES.map(([badgeLabel, badgeIds, resolved]) => ({
          name: `${layout} · ${template} · ${coverLabel} · ${badgeLabel}`,
          card: cardRow({
            layout_type: layout,
            template_type: template,
            cover_image_url: cover,
            badge_ids: [...badgeIds],
            resolved_badges: [...resolved],
          }),
        })),
      ),
    ),
  )

  it('입력 묶음이 6 × 4 × 2 × 3 = 144건이다', () => {
    expect(cases).toHaveLength(144)
  })

  it.each(cases.map((c) => [c.name, c.card] as const))('%s', async (_name, card) => {
    const drawn = toCardView(card, { now: NOW, tracking: true })
    expect(await recordedShape(card)).toBe(drawn.shape)
    // 계측 정보(GA로 가는 모양)도 같은 값이다
    expect(drawn.tracking?.shape).toBe(drawn.shape)
  })
})

describe('기록 모양 = 화면 모양 — 저장된 shape', () => {
  it.each(['hero', 'poster', 'square', 'brief'] as const)('%s로 저장된 카드는 그 모양이다', async (shape) => {
    const card = cardRow({ shape, badge_ids: ['b1'], resolved_badges: [withImage] })
    expect(await recordedShape(card)).toBe(shape)
    expect(toCardView(card).shape).toBe(shape)
  })

  it('타일이 있는 list는 list, 랭킹 행형 list는 배지가 없어도 list다', async () => {
    const tiles = cardRow({ shape: 'list', badge_ids: ['b1'], resolved_badges: [withImage] })
    expect(await recordedShape(tiles)).toBe('list')
    expect(toCardView(tiles).shape).toBe('list')

    const ranking = cardRow({ shape: 'list', template_type: 'ranking_board' })
    expect(await recordedShape(ranking)).toBe('list')
    expect(toCardView(ranking).shape).toBe('list')
  })

  it('배지가 없는 타일형 list는 화면도 기록도 brief다', async () => {
    const card = cardRow({ shape: 'list', template_type: 'badge_spotlight', badge_ids: [], resolved_badges: [] })
    expect(await recordedShape(card)).toBe('brief')
    expect(toCardView(card).shape).toBe('brief')
  })
})

describe('허용 차이 — badge_ids가 전부 삭제된 배지인 타일형 list (홈피드 PRD §9)', () => {
  it('화면은 조회된 배지가 없어 brief, 기록은 badge_ids가 있어 list다(이벤트 경로에 배지 조회를 더하지 않기 위한 차이)', async () => {
    const card = cardRow({ layout_type: 'badge_gallery', badge_ids: ['gone'], resolved_badges: [] })
    expect(toCardView(card).shape).toBe('brief')
    expect(await recordedShape(card)).toBe('list')
  })
})

describe('기록 모양 = 화면 모양 — 레시피 공개 카드(recipe_reveal, 티켓 20261006_1218)', () => {
  // 레시피 공개 카드는 `badge_ids`가 비어 있고 타일이 레시피 슬롯에서 나온다. 계측(`events.ts`)은 카드의 `recipe_id`로 레시피 행을 읽어 공개 상태로 타일 수를 정한다.
  const RECIPE_ID = 'recipe-1'
  const recipeCard = (overrides: Partial<TodayCardWithHref> = {}) =>
    cardRow({ template_type: 'recipe_reveal', layout_type: 'badge_gallery', shape: 'list', resolved_href: '/combine', recipe_id: RECIPE_ID, ...overrides })

  const releasedRecipe: TodayCardWithHref['resolved_recipe'] = {
    state: 'released',
    ingredient_count: 2,
    reward_points: 100,
    reward_badge_count: 0,
    tiles: [withImage, { ...withImage, id: 'b2' }],
  }
  const scheduledRecipe: TodayCardWithHref['resolved_recipe'] = { state: 'scheduled', ingredient_count: 2, release_at: '2026-10-12T00:00:00Z' }

  // 기록 쪽에 주는 레시피 행: 기준 시각(NOW = 2026-10-05T03:00Z)에 공개 중 / 공개 전 / 종료
  const RELEASED_ROW = { valid_from: '2026-10-01T00:00:00Z', valid_until: null }
  const NO_START_ROW = { valid_from: null, valid_until: null }
  const SCHEDULED_ROW = { valid_from: '2026-10-12T00:00:00Z', valid_until: null }
  const ENDED_ROW = { valid_from: '2026-09-01T00:00:00Z', valid_until: '2026-10-04T00:00:00Z' }

  it('공개 뒤: 화면은 슬롯 타일이 있어 list, 기록도 레시피가 공개 중이라 list다(옛 허용 차이가 사라졌다)', async () => {
    const card = recipeCard({ resolved_recipe: releasedRecipe })
    expect(toCardView(card).shape).toBe('list')
    expect(await recordedShape(card, RELEASED_ROW)).toBe('list')
    expect(await recordedShape(card, NO_START_ROW)).toBe('list') // valid_from이 없으면 처음부터 공개다
  })

  it('공개 전: 화면도 기록도 brief다(타일 없음)', async () => {
    const card = recipeCard({ resolved_recipe: scheduledRecipe })
    expect(toCardView(card).shape).toBe('brief')
    expect(await recordedShape(card, SCHEDULED_ROW)).toBe('brief')
  })

  it('레시피 줄이 없는 카드(레시피 칸이 비었다·레시피가 지워졌다·종료됐다)도 화면과 기록이 brief로 같다', async () => {
    const empty = recipeCard({ recipe_id: null, resolved_recipe: null })
    expect(toCardView(empty).shape).toBe('brief')
    expect(await recordedShape(empty)).toBe('brief')

    const gone = recipeCard({ resolved_recipe: null })
    expect(toCardView(gone).shape).toBe('brief')
    expect(await recordedShape(gone, null)).toBe('brief') // 레시피 행을 못 찾았다

    const ended = recipeCard({ resolved_recipe: null }) // 홈 조회는 종료된 레시피를 읽지 않는다
    expect(toCardView(ended).shape).toBe('brief')
    expect(await recordedShape(ended, ENDED_ROW)).toBe('brief')
  })

  it.each(['poster', 'hero', 'square', 'brief'] as const)('저장된 모양이 %s이면 공개 전·뒤 모두 화면과 기록이 같다', async (shape) => {
    for (const [resolved_recipe, recipe] of [
      [releasedRecipe, RELEASED_ROW],
      [scheduledRecipe, SCHEDULED_ROW],
      [null, null],
    ] as const) {
      const card = recipeCard({ shape, resolved_recipe })
      expect(toCardView(card).shape).toBe(shape)
      expect(await recordedShape(card, recipe)).toBe(shape)
    }
  })

  it('shape가 없는 옛 모양의 레시피 공개 카드(badge_gallery)도 공개 뒤는 list, 공개 전은 brief로 화면과 기록이 같다', async () => {
    const released = recipeCard({ shape: null, resolved_recipe: releasedRecipe })
    expect(toCardView(released).shape).toBe('list')
    expect(await recordedShape(released, RELEASED_ROW)).toBe('list')

    const scheduled = recipeCard({ shape: null, resolved_recipe: scheduledRecipe })
    expect(toCardView(scheduled).shape).toBe('brief')
    expect(await recordedShape(scheduled, SCHEDULED_ROW)).toBe('brief')
  })

  it('화면과 기록이 갈리는 드문 경우 하나(허용 차이, 홈피드 PRD §9): 공개 뒤 레시피의 후보 배지가 전부 삭제돼 타일이 0개이면 화면은 brief, 기록은 list다', async () => {
    const card = recipeCard({ resolved_recipe: { ...(releasedRecipe as NonNullable<typeof releasedRecipe> & { state: 'released' }), tiles: [] } })
    expect(toCardView(card).shape).toBe('brief')
    expect(await recordedShape(card, RELEASED_ROW)).toBe('list')
  })
})
