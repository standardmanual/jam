/**
 * `toCardView`의 개편 카드 분기 (티켓 20261121_0041, 상위 20261120_2026 4회차-2)
 *
 * 확인하는 것: ① `feed_type`이 NULL·모르는 값·꺼진 `full_image`이거나 4-3 유형의 그릴 값이 없으면 텍스트 박스(티켓 20261122_1101에서 옛 7모양 갈래를 지웠다),
 * ② 지금 그릴 수 있는 유형은 `FeedCardView`(feedType·look·이미지·배지), ③ 계측 `tracking.feedType`이 그려진 유형이다,
 * ④ 값 칩의 입력이 `TodayCardWithHref`가 이미 싣는 값뿐이다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/cardView.feed.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { ResolvedBadge, TodayCardWithHref } from '../cards'
import { toCardView, type FeedCardView } from '../cardView'
import { buildFeedPalette } from '../feedColorOverrides'
import { DEFAULT_FEED_PALETTE } from '../feedAssign'

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
  bg_color_key: 'sky',
  chip_color_key: 'red',
  box_color_key: 'yellow',
  chips: [{ kind: 'phrase', text: '문구' }],
  title_chip_words: ['걷는'],
  show_description: false,
  stamp_enabled: true,
  stamp_slot: 'image-top-left',
  feed_seed: 42,
}

const OPTIONS = { now: NOW, tracking: true } as const

describe('toCardView — feed_type이 비었거나 모르는 값이면 텍스트 박스다 (티켓 20261122_1101)', () => {
  it.each<[string, TodayCardWithHref['feed_type'] | undefined]>([
    ['NULL', null],
    ['칸 자체가 없는 행', undefined],
    ['모르는 값', 'future_type' as never],
    ['꺼져 있는 full_image', 'full_image'],
  ])('feed_type이 %s이면 text_box다(옛 모양 shape가 저장돼 있어도 무시한다)', (_label, feedType) => {
    const view = toCardView(makeCard({ ...NEW_COLUMNS, feed_type: feedType }), OPTIONS)
    expect(view.feedType).toBe('text_box')
    expect(view.shape).toBeUndefined()
    expect(view.look).toBeDefined()
    expect(view.tracking?.feedType).toBe('text_box')
  })

  // 4-3 유형(티켓 20261121_0115)은 그릴 값이 부족한 행을 텍스트 박스로 그린다 — 화면이 비지 않는다. 자세한 경우는 cardView.feed3.test.ts
  it.each<[TodayCardWithHref['feed_type'], Partial<TodayCardWithHref>]>([
    ['collection_intro', { cover_image_url: null }],
    ['drop_pickup', { resolved_badges: [] }],
    ['gallery_list', { list_items: [] }],
  ])('4-3 유형 %s는 그릴 값이 없으면 text_box다', (feedType, lacking) => {
    expect(toCardView(makeCard({ ...NEW_COLUMNS, ...lacking, feed_type: feedType }), OPTIONS).feedType).toBe('text_box')
  })

  it('옛 설명 규칙(배지 소개·컨텐츠 소개만)은 쓰지 않는다: 텍스트 박스는 설명을 싣지 않는다', () => {
    expect(toCardView(makeCard({ feed_type: null }), OPTIONS).description).toBeUndefined()
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
    expect(look.colors).toEqual({ bg: 'sky', chip: 'red', box: 'yellow' })
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

  it('계측: tracking.feedType이 그려진 유형이고 tracking 자체는 옵션이 켜졌을 때만 있다', () => {
    const view = feed({ shape: 'poster' })
    expect(view.tracking).toEqual({
      cardId: 'card-1',
      contentTypeId: 'T05',
      templateType: 'mission_spotlight',
      feedType: 'hero_box',
    })
    expect(toCardView(makeCard({ feed_type: 'hero_box' })).tracking).toBeUndefined()
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

describe('toCardView — 색 덮어쓰기 팔레트 (티켓 20261121_2145)', () => {
  const stored = { feed_type: 'hero_box', feed_seed: 12345, bg_color_key: 'sky', box_color_key: 'yellow' } as const

  it('palette를 안 주면 기본 팔레트라 결과가 이전과 같다', () => {
    const baseline = toCardView(makeCard(stored), OPTIONS) as FeedCardView
    expect((toCardView(makeCard(stored), { ...OPTIONS, palette: DEFAULT_FEED_PALETTE }) as FeedCardView).look).toEqual(baseline.look)
  })

  it('palette를 줘도 저장된 칸은 그대로이고, 그림 색을 읽지 않는 자동 배정은 달라지지 않는다(통합 팔레트 규칙은 그림 색 규칙에서만 hex를 읽는다)', () => {
    const baseline = toCardView(makeCard(stored), OPTIONS) as FeedCardView
    const palette = buildFeedPalette({ [baseline.look.colors.chip]: DEFAULT_FEED_PALETTE.pink })
    const view = toCardView(makeCard(stored), { ...OPTIONS, palette }) as FeedCardView
    expect(view.look.colors.bg).toBe('sky')
    expect(view.look.colors.box).toBe('yellow')
    expect(view.look.colors.chip).toBe(baseline.look.colors.chip)
  })
})
