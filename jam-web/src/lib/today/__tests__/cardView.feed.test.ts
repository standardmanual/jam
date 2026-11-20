/**
 * `toCardView`의 개편 카드 분기 (티켓 20261121_0041, 상위 20261120_2026 4회차-2)
 *
 * 확인하는 것: ① `feed_type`이 NULL인 기존 카드·4-3 유형·모르는 값·꺼진 `full_image`는 새 칸이 있어도 옛 `CardView`와 같은 출력(기존 카드 회귀 방지),
 * ② 다섯 유형은 `FeedCardView`(feedType·look·이미지·배지), ③ 계측 `tracking.shape`는 옛 값이고 `tracking.feedType`이 새 갈래에만 있으며 GA 파라미터는 바꾸지 않는다,
 * ④ 값 칩의 입력이 `TodayCardWithHref`가 이미 싣는 값뿐이다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/cardView.feed.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { ResolvedBadge, TodayCardWithHref } from '../cards'
import { toCardView, type FeedCardView } from '../cardView'

const NOW = new Date('2026-11-21T12:00:00+09:00')

function badge(id: string, overrides: Partial<ResolvedBadge> = {}): ResolvedBadge {
  return { id, name: `배지 ${id}`, image_url: `https://cdn.example/${id}.png`, rarity: 'rare', earned: true, ...overrides }
}

function makeCard(overrides: Partial<TodayCardWithHref> = {}): TodayCardWithHref {
  return {
    id: 'card-1',
    template_type: 'mission_spotlight',
    layout_type: 'large_thumbnail',
    title: '낙엽 소리 따라 걷는 한 주',
    subtitle: null,
    cover_image_url: 'https://cdn.example/cover.png',
    badge_ids: [],
    mission_id: 'm1',
    item_book_id: null,
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
    content_type_id: 'T05',
    image_source: null,
    description: '먼저 참가하고 바스락 소리를 따라 걸어 봐요.',
    shape: 'hero',
    title_in_image: null,
    resolved_href: '/missions/m1',
    resolved_badges: [],
    resolved_ranking: null,
    resolved_mission: {
      starts_at: '2026-11-01T00:00:00+09:00',
      ends_at: '2026-11-23T12:00:00+09:00',
      reward_points: 300,
      reward_badge_count: 0,
      image_url: null,
    },
    resolved_collection: null,
    ...overrides,
  }
}

const NEW_COLUMNS: Partial<TodayCardWithHref> = {
  box_shape: 'wave',
  box_kind: 'image_mask',
  bg_color_key: 'red-soft',
  chip_color_key: 'red',
  box_color_key: 'ref-lime',
  chips: [{ kind: 'phrase', text: '문구' }],
  title_chip_words: ['걷는'],
  show_description: false,
  stamp_enabled: true,
  stamp_slot: 'image-top-left',
  feed_seed: 42,
}

const OPTIONS = { now: NOW, tracking: true } as const

describe('toCardView — 기존 카드는 한 글자도 바뀌지 않는다', () => {
  const legacy = toCardView(makeCard(), OPTIONS)

  it('feed_type이 NULL이면 새 칸이 채워져 있어도 옛 출력 그대로다', () => {
    expect(toCardView(makeCard({ ...NEW_COLUMNS, feed_type: null }), OPTIONS)).toEqual(legacy)
    expect(toCardView(makeCard({ ...NEW_COLUMNS, feed_type: undefined }), OPTIONS)).toEqual(legacy)
  })

  it('새 칸이 모두 없는 행도 같다(feed_type 칸 자체가 없는 행)', () => {
    expect(toCardView(makeCard(), OPTIONS)).toEqual(legacy)
    expect(legacy).not.toHaveProperty('feedType')
    expect(legacy).not.toHaveProperty('look')
  })

  // 4-3 유형(티켓 20261121_0115)은 그릴 값이 있으면 새 갈래다. 값이 부족한 행은 옛 경로 — 자세한 경우는 cardView.feed3.test.ts
  it.each<[TodayCardWithHref['feed_type'], Partial<TodayCardWithHref>]>([
    ['collection_intro', { cover_image_url: null }],
    ['drop_pickup', { resolved_badges: [] }],
    ['gallery_list', { list_items: [] }],
  ])('4-3 유형 %s는 그릴 값이 없으면 옛 경로가 그린다', (feedType, lacking) => {
    const lackingLegacy = toCardView(makeCard({ ...lacking }), OPTIONS)
    expect(toCardView(makeCard({ ...NEW_COLUMNS, ...lacking, feed_type: feedType }), OPTIONS)).toEqual(lackingLegacy)
  })

  it('모르는 feed_type 값도 옛 경로다', () => {
    expect(toCardView(makeCard({ ...NEW_COLUMNS, feed_type: 'future_type' as never }), OPTIONS)).toEqual(legacy)
  })

  it('full_image는 꺼져 있는 동안 옛 경로다', () => {
    expect(toCardView(makeCard({ ...NEW_COLUMNS, feed_type: 'full_image' }), OPTIONS)).toEqual(legacy)
  })

  it('옛 설명 규칙(배지 소개·컨텐츠 소개만)은 그대로다: 미션 소개 카드의 설명은 싣지 않는다', () => {
    expect(legacy.description).toBeUndefined()
  })
})

describe('toCardView — 개편 카드', () => {
  const feed = (overrides: Partial<TodayCardWithHref>) => toCardView(makeCard({ feed_type: 'hero_box', ...overrides }), OPTIONS) as FeedCardView

  it('다섯 유형 중 지금 그릴 수 있는 네 유형은 FeedCardView다', () => {
    for (const feedType of ['hero_box', 'text_box', 'badge_intro', 'badge_only'] as const) {
      const view = feed({ feed_type: feedType })
      expect(view.feedType).toBe(feedType)
      expect(view.look).toBeDefined()
      expect(view.shape).toBeUndefined()
      expect(view.title).toBe('낙엽 소리 따라 걷는 한 주')
      expect(view.href).toBe('/missions/m1')
    }
  })

  it('새 칸은 look에 반영된다(지정한 값 보존)', () => {
    const { look } = feed({ ...NEW_COLUMNS })
    expect(look.colors).toEqual({ bg: 'red-soft', chip: 'red', box: 'ref-lime' })
    expect(look.seed).toBe(42)
    expect(look.boxShape).toBe('wave')
    expect(look.boxKind).toBe('image_mask')
    expect(look.chips.map((chip) => chip.text)).toEqual(['문구'])
    expect(look.titleChips.words).toEqual(['걷는'])
    expect(look.stamp?.slot).toBe('image-top-left')
  })

  it('같은 행은 두 번 변환해도 같다', () => {
    expect(feed({ ...NEW_COLUMNS })).toEqual(feed({ ...NEW_COLUMNS }))
    expect(feed({})).toEqual(feed({}))
  })

  it('계측: tracking.feedType이 있고 tracking.shape는 행의 옛 모양 값이다(GA 파라미터 불변)', () => {
    const view = feed({ shape: 'poster' })
    expect(view.tracking).toEqual({
      cardId: 'card-1',
      contentTypeId: 'T05',
      templateType: 'mission_spotlight',
      shape: 'poster',
      feedType: 'hero_box',
    })
    expect(toCardView(makeCard({ feed_type: 'hero_box' })).tracking).toBeUndefined()
  })

  it('계측: 옛 갈래(feed_type NULL·4-3 유형·꺼진 full_image)의 tracking에는 feedType이 생기지 않는다', () => {
    for (const feedType of [null, 'unknown_type', 'full_image'] as const) {
      const view = toCardView(makeCard({ feed_type: feedType as never, shape: 'poster' }), OPTIONS)
      expect(view.tracking).toBeDefined()
      expect(view.tracking).not.toHaveProperty('feedType')
      expect(view.tracking?.shape).toBe('poster')
    }
  })

  it('이미지는 커버 → 미션 대표 이미지(미션 소개) → 첫 배지 그림 순서다', () => {
    expect(feed({}).imageUrl).toBe('https://cdn.example/cover.png')
    const mission = { ...makeCard().resolved_mission!, image_url: 'https://cdn.example/mission.png' }
    expect(feed({ cover_image_url: null, resolved_mission: mission }).imageUrl).toBe('https://cdn.example/mission.png')
    expect(feed({ cover_image_url: null, resolved_badges: [badge('b1')] }).imageUrl).toBe('https://cdn.example/b1.png')
    expect(feed({ cover_image_url: null }).imageUrl).toBeNull()
  })

  it('배지 그림과 이름은 카드에 걸린 첫 배지다', () => {
    const view = feed({ feed_type: 'badge_intro', resolved_badges: [badge('b1'), badge('b2')] })
    expect(view.badgeImageUrl).toBe('https://cdn.example/b1.png')
    expect(view.badgeName).toBe('배지 b1')
    expect(feed({ feed_type: 'badge_intro' }).badgeImageUrl).toBeUndefined()
  })

  it('설명은 유형·show_description이 정한다: 히어로는 보이고, 숨김 유형은 값이 있어도 싣지 않는다', () => {
    expect(feed({ feed_type: 'hero_box' }).description).toBe('먼저 참가하고 바스락 소리를 따라 걸어 봐요.')
    expect(feed({ feed_type: 'hero_box', show_description: false }).description).toBeUndefined()
    expect(feed({ feed_type: 'text_box' }).description).toBeUndefined()
    expect(feed({ feed_type: 'badge_only' }).description).toBeUndefined()
    expect(feed({ feed_type: 'hero_box', description: '   ' }).description).toBeUndefined()
  })

  it('값 칩은 카드가 이미 싣고 있는 값으로 만든다: 미션은 남은 기간(구분 칩 «미션»)', () => {
    expect(feed({}).look.chips.map((chip) => chip.text)).toEqual(['2일 남음', '미션'])
  })

  it('컬렉션 소식은 아이템 수, 지역 트렌드는 체크인 구분 칩과 장소·배지 수다', () => {
    const collection = feed({
      template_type: 'itembook_milestone',
      resolved_mission: null,
      resolved_collection: { name: '가을 컬렉션', item_count: 12 },
    })
    expect(collection.look.chips.map((chip) => chip.text)).toEqual(['아이템 12개', '컬렉션'])
    const checkin = feed({
      template_type: 'location_trend',
      resolved_mission: null,
      region_label: '문경',
      resolved_badges: [badge('b1'), badge('b2'), badge('b3')],
    })
    expect(checkin.look.chips.map((chip) => chip.text)).toEqual(['배지 3종류', '체크인'])
  })

  it('칩을 내지 않는 자원(기사)은 칩이 없다', () => {
    expect(feed({ template_type: 'editorial_article', resolved_mission: null }).look.chips).toEqual([])
  })
})
