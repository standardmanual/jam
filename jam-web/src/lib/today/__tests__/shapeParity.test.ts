/**
 * 기록 유형 = 화면 유형 (티켓 20261001_2244, 새 유형 기준으로 고침: 티켓 20261122_1101)
 *
 * 같은 카드 행이면 계측이 `today_card_events.card_shape`에 기록하는 유형(`events.ts`의 `assertCardExposable`)과 홈이 그리는 유형(`toCardView`의 `feedType`)이 같아야 한다.
 * 두 경로는 같은 판정 함수(`feedType.ts`의 `resolveFeedType`)에 같은 카드 행의 값(`feed_type`·`cover_image_url`·`badge_ids`·`list_items`)을 넣는다.
 * 이벤트 경로에는 배지 조회가 없어 배지 그림·삭제 여부를 모르므로 드랍·픽업의 배지 수는 카드 행의 `badge_ids` 개수로 갈음한다.
 *
 * 피할 수 없는 차이는 홈피드 PRD §9에 허용 차이로 적혀 있고 아래에서 고정한다: `badge_ids`가 있지만 그 배지가 전부 삭제된 드랍·픽업 카드는
 * 화면이 `text_box`, 기록은 `drop_pickup`이다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/shapeParity.test.ts
 */
import { describe, it, expect, vi } from 'vitest'

let row: Record<string, unknown> | null = null

// `assertCardExposable`이 읽는 체인(`from → select → eq → maybeSingle`)만 흉내 낸다.
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
    }),
  }),
}))

import { assertCardExposable } from '../events'
import { toCardView } from '../cardView'
import type { ResolvedBadge, TodayCardWithHref } from '../cards'
import { FEED_RENDERED_TYPES } from '../feedLook'
import type { TodayListItem } from '@/types/database'

const NOW = new Date('2026-10-05T03:00:00Z')
const FEED_TYPES: (TodayCardWithHref['feed_type'])[] = [...FEED_RENDERED_TYPES, null, undefined, 'future_type' as never]
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
const ITEMS: readonly (readonly [string, TodayListItem[] | null])[] = [
  ['목록 없음', null],
  ['빈 목록', []],
  ['이름·주소가 빈 항목뿐', [{ name: '', href: '' }]],
  ['항목 있음', [{ name: '산', href: '/drops?place=mountain' }]],
]

function cardRow(over: Partial<TodayCardWithHref>): TodayCardWithHref {
  return {
    id: 'card-1',
    template_type: 'drop_alert',
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
    resolved_href: '/drops',
    resolved_badges: [],
    resolved_ranking: null,
    resolved_mission: null,
    resolved_collection: null,
    ...over,
  }
}

/** 계측이 기록하는 유형 — 카드 행(배지 조회 결과 없음)만으로 정한다. */
async function recordedType(card: TodayCardWithHref): Promise<string | undefined> {
  row = {
    is_active: card.is_active,
    starts_at: card.starts_at,
    ends_at: card.ends_at,
    content_type_id: card.content_type_id,
    feed_type: card.feed_type,
    cover_image_url: card.cover_image_url,
    badge_ids: card.badge_ids,
    list_items: card.list_items,
    pattern_no: null,
  }
  const result = await assertCardExposable(card.id, NOW)
  return result.ok ? result.card.card_shape : undefined
}

describe('기록 유형 = 화면 유형 — feed_type × 커버 × 배지 × 목록 입력 묶음', () => {
  const cases = FEED_TYPES.flatMap((feedType) =>
    COVERS.flatMap(([coverLabel, cover]) =>
      BADGES.flatMap(([badgeLabel, badgeIds, resolved]) =>
        ITEMS.map(([itemsLabel, items]) => ({
          name: `${String(feedType)} · ${coverLabel} · ${badgeLabel} · ${itemsLabel}`,
          card: cardRow({ feed_type: feedType, cover_image_url: cover, badge_ids: [...badgeIds], resolved_badges: [...resolved], list_items: items }),
        })),
      ),
    ),
  )

  it('입력 묶음이 (8 + 3) × 2 × 3 × 4 = 264건이다', () => {
    expect(cases).toHaveLength(264)
  })

  it.each(cases.map((c) => [c.name, c.card] as const))('%s', async (_name, card) => {
    const drawn = toCardView(card, { now: NOW, tracking: true })
    expect(await recordedType(card)).toBe(drawn.feedType)
    // 계측 정보(GA로 가는 유형)도 같은 값이다
    expect(drawn.tracking?.feedType).toBe(drawn.feedType)
  })
})

describe('기록 유형 = 화면 유형 — 대표 경우', () => {
  it('feed_type이 비었거나 모르는 값이면 화면도 기록도 text_box다', async () => {
    for (const feed_type of [null, undefined, 'future_type' as never, 'full_image' as const]) {
      const card = cardRow({ feed_type, cover_image_url: 'https://cdn.example/cover.png' })
      expect(toCardView(card).feedType).toBe('text_box')
      expect(await recordedType(card)).toBe('text_box')
    }
  })

  it('그릴 값이 있으면 화면도 기록도 그 유형이다', async () => {
    const cases: [Partial<TodayCardWithHref>, string][] = [
      [{ feed_type: 'hero_box' }, 'hero_box'],
      [{ feed_type: 'collection_intro', cover_image_url: 'https://cdn.example/c.png' }, 'collection_intro'],
      [{ feed_type: 'drop_pickup', badge_ids: ['b1'], resolved_badges: [withImage] }, 'drop_pickup'],
      [{ feed_type: 'gallery_list', list_items: [{ name: '산', href: '/drops' }] }, 'gallery_list'],
    ]
    for (const [patch, expected] of cases) {
      const card = cardRow(patch)
      expect(toCardView(card).feedType).toBe(expected)
      expect(await recordedType(card)).toBe(expected)
    }
  })

  it('저장된 옛 모양 값(shape)과 옛 레이아웃은 유형에 영향이 없다', async () => {
    for (const shape of ['hero', 'poster', 'square', 'brief', 'list', 'dome', 'ticket'] as const) {
      const card = cardRow({ shape, layout_type: 'ranking_list', template_type: 'ranking_board', feed_type: 'hero_box' })
      expect(toCardView(card).feedType).toBe('hero_box')
      expect(await recordedType(card)).toBe('hero_box')
    }
  })
})

describe('허용 차이 — badge_ids가 전부 삭제된 배지인 드랍·픽업 (홈피드 PRD §9)', () => {
  it('화면은 조회된 배지가 없어 text_box, 기록은 badge_ids가 있어 drop_pickup이다(이벤트 경로에 배지 조회를 더하지 않기 위한 차이)', async () => {
    const card = cardRow({ feed_type: 'drop_pickup', badge_ids: ['gone'], resolved_badges: [] })
    expect(toCardView(card).feedType).toBe('text_box')
    expect(await recordedType(card)).toBe('drop_pickup')
  })
})
