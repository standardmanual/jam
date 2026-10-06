/**
 * 기록 모양 = 화면 모양 (티켓 20261001_2244, 상위 20260930_1453 조각 b7)
 *
 * 같은 카드 행이면 계측이 `today_card_events.card_shape`에 기록하는 모양(`events.ts`의 `assertCardExposable`)과 홈이 그리는 모양
 * (`toCardView`)이 같아야 한다. 이벤트 경로에는 배지 조회가 없어 배지 그림 유무를 모르므로, 두 경로는 같은 입력(카드 행의 `badge_ids`)으로
 * 판정한다. 옛 레이아웃 6종 × 커버 있음/없음 × 배지 0개/그림 있는 배지/그림 없는 배지(× 대표 템플릿 4종)를 전부 맞춰 본다.
 *
 * 피할 수 없는 차이 둘은 홈피드 PRD §9에 허용 차이로 적혀 있고 아래에서 고정한다: `badge_ids`가 있지만 그 배지가 전부 삭제된 타일형 `list`,
 * 그리고 공개 뒤 레시피 공개 카드의 `list`(타일이 레시피 슬롯에서 나와 `badge_ids`가 비어 있다, 티켓 20261006_1217).
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/shapeParity.test.ts
 */
import { describe, it, expect, vi } from 'vitest'

let row: Record<string, unknown> | null = null

// `assertCardExposable`이 읽는 체인(`from → select → eq → maybeSingle`)만 흉내 낸다.
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }) }),
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

/** 계측이 기록하는 모양 — 카드 행(배지 조회 결과 없음)만으로 정한다. */
async function recordedShape(card: TodayCardWithHref): Promise<string | null | undefined> {
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

describe('허용 차이 — 레시피 공개 카드(recipe_reveal)의 공개 뒤 list (홈피드 PRD §9, 티켓 20261006_1217)', () => {
  // 레시피 공개 카드는 `badge_ids`가 비어 있고 타일이 레시피 슬롯에서 나온다. 계측(`events.ts`)은 타일 수를 `badge_ids` 개수로 갈음하므로 늘 0개이고,
  // 그래서 위 입력 묶음(4개 템플릿)이 `badge_ids` 비어 있는 경우를 «우연히» 통과시키지 않도록 이 경우를 명시한다. ⑫-b(티켓 20261006_1218)가
  // `events.ts`가 `recipe_id`·공개 상태로 타일 수를 판정하게 하면 이 차이가 사라지고 이 시험은 «둘 다 list»로 바뀐다.
  const recipeCard = (overrides: Partial<TodayCardWithHref> = {}) =>
    cardRow({ template_type: 'recipe_reveal', layout_type: 'badge_gallery', shape: 'list', resolved_href: '/combine', ...overrides })

  const releasedRecipe: TodayCardWithHref['resolved_recipe'] = {
    state: 'released',
    ingredient_count: 2,
    reward_points: 100,
    reward_badge_count: 0,
    tiles: [withImage, { ...withImage, id: 'b2' }],
  }
  const scheduledRecipe: TodayCardWithHref['resolved_recipe'] = { state: 'scheduled', ingredient_count: 2, release_at: '2026-10-12T00:00:00Z' }

  it('공개 뒤: 화면은 슬롯 타일이 있어 list, 기록은 badge_ids가 비어 brief다(허용 차이 둘째)', async () => {
    const card = recipeCard({ resolved_recipe: releasedRecipe })
    expect(toCardView(card).shape).toBe('list')
    expect(await recordedShape(card)).toBe('brief')
  })

  it('공개 전: 화면도 기록도 brief다(타일 없음)', async () => {
    const card = recipeCard({ resolved_recipe: scheduledRecipe })
    expect(toCardView(card).shape).toBe('brief')
    expect(await recordedShape(card)).toBe('brief')
  })

  it('레시피 줄이 없는 카드(레시피 없음·끝남·조회 실패)도 화면과 기록이 brief로 같다', async () => {
    const card = recipeCard({ resolved_recipe: null })
    expect(toCardView(card).shape).toBe('brief')
    expect(await recordedShape(card)).toBe('brief')
  })

  it.each(['poster', 'hero', 'square', 'brief'] as const)('저장된 모양이 %s이면 공개 전·뒤 모두 화면과 기록이 같다', async (shape) => {
    for (const resolved_recipe of [releasedRecipe, scheduledRecipe, null]) {
      const card = recipeCard({ shape, resolved_recipe })
      expect(toCardView(card).shape).toBe(shape)
      expect(await recordedShape(card)).toBe(shape)
    }
  })
})
