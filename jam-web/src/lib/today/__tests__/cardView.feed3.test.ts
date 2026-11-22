/**
 * `toCardView`의 4회차-3 분기: 컬렉션 소개·드랍·픽업·목록형 (티켓 20261121_0115, 상위 20261120_2026)
 *
 * 확인하는 것: ① 값이 부족한 행(컬렉션 대표 그림 없음·배지 0개·항목 0개)은 텍스트 박스(티켓 20261122_1101) ② 값이 있으면 `FeedCardView`에 세 유형의 값이 실린다
 * ③ `feed_type` NULL 카드와 4-2 유형의 출력에는 새 값이 번지지 않는다 ④ 목록 항목은 앞 3개·이름·주소가 있는 것만, 대표 페이지 주소는 선택 ⑤ 계측 `tracking.feedType`.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/cardView.feed3.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { ResolvedBadge, TodayCardWithHref } from '../cards'
import { toCardView, type FeedCardView } from '../cardView'

const NOW = new Date('2026-11-21T12:00:00+09:00')
const OPTIONS = { now: NOW, tracking: true } as const

function badge(id: string, overrides: Partial<ResolvedBadge> = {}): ResolvedBadge {
  return { id, name: `배지 ${id}`, image_url: `https://cdn.example/${id}.png`, rarity: 'rare', earned: false, ...overrides }
}

function makeCard(overrides: Partial<TodayCardWithHref> = {}): TodayCardWithHref {
  return {
    id: 'card-1',
    template_type: 'itembook_milestone',
    layout_type: 'large_thumbnail',
    title: '골목길 필름 스냅',
    subtitle: null,
    cover_image_url: 'https://cdn.example/art.png',
    badge_ids: [],
    mission_id: null,
    item_book_id: 'book-1',
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: ['all'],
    starts_at: '2026-11-01T00:00:00+09:00',
    ends_at: '2026-11-30T23:59:59+09:00',
    sort_order: 3,
    is_active: true,
    created_at: '2026-10-30T00:00:00Z',
    created_by: null,
    ranking_mode_id: null,
    content_type_id: 'T08',
    image_source: null,
    description: '활판 골목 끝 현상소의 안쪽 벽.',
    shape: 'hero',
    title_in_image: null,
    resolved_href: '/collections/book-1',
    resolved_badges: [],
    resolved_ranking: null,
    resolved_mission: null,
    resolved_collection: {
      name: '골목길 필름 스냅',
      item_count: 12,
      item_badges: [
        { name: '황동 카메라', image_url: 'https://cdn.example/b1.png' },
        { name: '다 쓴 필름통', image_url: 'https://cdn.example/b2.png' },
      ],
    },
    ...overrides,
  }
}

const feed = (overrides: Partial<TodayCardWithHref>) => toCardView(makeCard(overrides), OPTIONS) as FeedCardView

describe('컬렉션 소개', () => {
  it('대표 그림(커버)이 있으면 FeedCardView이고 컬렉션 이름과 아이템 배지 그림이 실린다', () => {
    const view = feed({ feed_type: 'collection_intro' })
    expect(view.feedType).toBe('collection_intro')
    expect(view.imageUrl).toBe('https://cdn.example/art.png')
    expect(view.collectionName).toBe('골목길 필름 스냅')
    expect(view.collectionBadges).toEqual([
      { name: '황동 카메라', imageUrl: 'https://cdn.example/b1.png' },
      { name: '다 쓴 필름통', imageUrl: 'https://cdn.example/b2.png' },
    ])
    expect(view.look.burst).toHaveLength(4)
    expect(view.description).toBe('활판 골목 끝 현상소의 안쪽 벽.')
    expect(view.tracking?.feedType).toBe('collection_intro')
  })

  it('대표 그림이 없으면 첫 배지 그림으로 대신하지 않고 텍스트 박스로 그린다', () => {
    const lacking = { cover_image_url: null, resolved_badges: [badge('x')] }
    const view = toCardView(makeCard({ ...lacking, feed_type: 'collection_intro' }), OPTIONS)
    expect(view.feedType).toBe('text_box')
    expect(view).not.toHaveProperty('collectionName')
  })

  it('아이템 배지 그림이 없으면 배지 값 없이 대표 그림만 싣는다', () => {
    const view = feed({
      feed_type: 'collection_intro',
      resolved_collection: { name: '골목길 필름 스냅', item_count: 12 },
    })
    expect(view.collectionBadges).toBeUndefined()
    expect(view.imageUrl).toBe('https://cdn.example/art.png')
  })

  it('컬렉션 값을 못 읽었어도(null) 대표 그림은 그린다', () => {
    const view = feed({ feed_type: 'collection_intro', resolved_collection: null })
    expect(view.feedType).toBe('collection_intro')
    expect(view.collectionName).toBeUndefined()
    expect(view.collectionBadges).toBeUndefined()
  })

  it('show_description이 false면 설명을 싣지 않는다', () => {
    expect(feed({ feed_type: 'collection_intro', show_description: false }).description).toBeUndefined()
  })
})

describe('드랍·픽업', () => {
  const badges = [badge('a'), badge('b', { image_url: null }), badge('c'), badge('d')]

  it('카드에 걸린 배지의 앞 3개를 싣는다(그림 없는 배지도 이름과 함께)', () => {
    const view = feed({ feed_type: 'drop_pickup', template_type: 'drop_alert', resolved_badges: badges })
    expect(view.feedType).toBe('drop_pickup')
    expect(view.itemBadges).toEqual([
      { name: '배지 a', imageUrl: 'https://cdn.example/a.png' },
      { name: '배지 b', imageUrl: null },
      { name: '배지 c', imageUrl: 'https://cdn.example/c.png' },
    ])
  })

  it('배지가 1~2개여도 있는 만큼 싣는다', () => {
    expect(feed({ feed_type: 'drop_pickup', resolved_badges: [badge('a')] }).itemBadges).toHaveLength(1)
    expect(feed({ feed_type: 'drop_pickup', resolved_badges: [badge('a'), badge('b')] }).itemBadges).toHaveLength(2)
  })

  it('배지가 0개면 텍스트 박스로 그린다', () => {
    const view = toCardView(makeCard({ feed_type: 'drop_pickup', template_type: 'drop_alert', resolved_badges: [] }), OPTIONS)
    expect(view.feedType).toBe('text_box')
    expect(view).not.toHaveProperty('itemBadges')
  })
})

describe('목록형', () => {
  const items = [
    { name: '산', href: '/drops?place=mountain', image_url: 'https://cdn.example/m.png' },
    { name: '편의점', href: '/drops?place=cvs' },
    { name: '마트', href: '/drops?place=mart', image_url: '  ' },
    { name: '넷째', href: '/drops?place=4th' },
  ]

  it('항목은 앞 3개이고 그림이 없으면 null이다', () => {
    const view = feed({ feed_type: 'gallery_list', list_items: items, list_more_href: '/drops' })
    expect(view.feedType).toBe('gallery_list')
    expect(view.listItems).toEqual([
      { name: '산', href: '/drops?place=mountain', imageUrl: 'https://cdn.example/m.png' },
      { name: '편의점', href: '/drops?place=cvs', imageUrl: null },
      { name: '마트', href: '/drops?place=mart', imageUrl: null },
    ])
    expect(view.listMoreHref).toBe('/drops')
  })

  it('이름이나 주소가 비어 있는 항목은 건너뛴다', () => {
    const view = feed({
      feed_type: 'gallery_list',
      list_items: [{ name: ' ', href: '/a' }, { name: '주소 없음', href: '' }, { name: '정상', href: '/ok' }],
    })
    expect(view.listItems).toEqual([{ name: '정상', href: '/ok', imageUrl: null }])
  })

  it('대표 페이지 주소가 없으면 싣지 않는다', () => {
    expect(feed({ feed_type: 'gallery_list', list_items: items, list_more_href: ' ' }).listMoreHref).toBeUndefined()
    expect(feed({ feed_type: 'gallery_list', list_items: items }).listMoreHref).toBeUndefined()
  })

  it('항목이 0개(또는 NULL)면 텍스트 박스로 그린다', () => {
    for (const list_items of [[], null, [{ name: '', href: '' }]]) {
      const view = toCardView(makeCard({ feed_type: 'gallery_list', list_items }), OPTIONS)
      expect(view.feedType).toBe('text_box')
      expect(view).not.toHaveProperty('listItems')
    }
  })

  it('카드 전체 링크용 href(resolved_href)는 그대로 싣는다(그리는 쪽이 목록형에서는 쓰지 않는다)', () => {
    expect(feed({ feed_type: 'gallery_list', list_items: items }).href).toBe('/collections/book-1')
  })
})

describe('feed_type이 비었으면 텍스트 박스이고 4-2 유형에는 새 값이 번지지 않는다', () => {
  const NEW_VALUES: Partial<TodayCardWithHref> = {
    list_items: [{ name: '산', href: '/a' }],
    list_more_href: '/b',
    collection_burst: [{ x: 0.5, y: 0.5 }],
    resolved_badges: [badge('a')],
  }

  it('feed_type이 NULL이면 새 칸이 있어도 텍스트 박스이고 새 유형의 값이 실리지 않는다', () => {
    const view = toCardView(makeCard({ ...NEW_VALUES, feed_type: null }), OPTIONS)
    expect(view.feedType).toBe('text_box')
    for (const key of ['collectionBadges', 'collectionName', 'itemBadges', 'listItems', 'listMoreHref']) expect(view).not.toHaveProperty(key)
  })

  it('4-2 유형에는 세 유형의 값이 실리지 않고 burst도 없다', () => {
    for (const feedType of ['hero_box', 'text_box', 'badge_intro', 'badge_only'] as const) {
      const view = feed({ ...NEW_VALUES, feed_type: feedType })
      expect(view.feedType).toBe(feedType)
      expect(view).not.toHaveProperty('collectionBadges')
      expect(view).not.toHaveProperty('collectionName')
      expect(view).not.toHaveProperty('itemBadges')
      expect(view).not.toHaveProperty('listItems')
      expect(view).not.toHaveProperty('listMoreHref')
      expect(view.look).not.toHaveProperty('burst')
    }
  })
})
