/**
 * toCardViews — 카드 배열의 칩 배치를 피드 순서로 계산해 `look.chipPlan`에 싣는다 (티켓 20261122_2228 R5)
 *
 * 확인하는 것: view 수·순서 유지, `chipPlan` 적재, 단건은 «앞 카드 없음»과 같다, 칩 초안 어댑터(분류·값 구분, 어드민 지정 자리), 기존 `toCardView`는 `chipPlan`을 싣지 않고 `look.chips`는 그대로다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/cardView.chain.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { TodayCardWithHref } from '../cards'
import { toCardView, toCardViews } from '../cardView'
import { chainInputOf, planFeedChips } from '../feedChipChain'
import { signatureOf } from '../feedChipPlan'

const NOW = new Date('2026-11-21T12:00:00+09:00')
const OPTIONS = { now: NOW, tracking: true } as const

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
    feed_type: 'hero_box',
    ...overrides,
  }
}

const FEED = Array.from({ length: 8 }, (_, index) => makeCard({ id: `card-${index}`, feed_seed: 100 + index * 13, title: `제목 ${index}` }))

describe('toCardViews', () => {
  it('view 수와 순서를 입력과 같게 유지한다', () => {
    const views = toCardViews(FEED, OPTIONS)
    expect(views).toHaveLength(FEED.length)
    views.forEach((view, index) => {
      expect(view.title).toBe(`제목 ${index}`)
      expect(view.tracking?.cardId).toBe(`card-${index}`)
    })
  })

  it('모든 view의 look에 chipPlan을 싣고, 카드 값과 같은 순서로 planFeedChips 결과와 같다', () => {
    const views = toCardViews(FEED, OPTIONS)
    const expected = planFeedChips(FEED.map((card) => chainInputOf(toCardView(card, OPTIONS))))
    views.forEach((view, index) => {
      expect(view.look.chipPlan).toBeDefined()
      expect(view.look.chipPlan).toEqual(expected[index])
    })
  })

  it('chipPlan 외의 값은 단건 toCardView와 같다(look.chips 포함)', () => {
    const views = toCardViews(FEED, OPTIONS)
    views.forEach((view, index) => {
      const single = toCardView(FEED[index], OPTIONS)
      const { chipPlan: _chipPlan, ...look } = view.look
      void _chipPlan
      expect({ ...view, look }).toEqual(single)
    })
  })

  it('단건 toCardView는 chipPlan을 싣지 않는다', () => {
    expect(toCardView(FEED[0], OPTIONS).look.chipPlan).toBeUndefined()
  })

  it('한 장짜리 배열은 앞 카드 없음과 같다', () => {
    const [view] = toCardViews([FEED[3]], OPTIONS)
    expect(view.look.chipPlan).toEqual(planFeedChips([chainInputOf(toCardView(FEED[3], OPTIONS))])[0])
  })

  it('같은 입력이면 같은 결과이고, 앞부분이 같으면 뒤가 달라도 앞 결과는 같다', () => {
    expect(toCardViews(FEED, OPTIONS)).toEqual(toCardViews(FEED, OPTIONS))
    const other = [...FEED.slice(0, 4), ...FEED.slice(4).reverse()]
    const a = toCardViews(FEED, OPTIONS).slice(0, 4)
    const b = toCardViews(other, OPTIONS).slice(0, 4)
    expect(b.map((view) => view.look.chipPlan)).toEqual(a.map((view) => view.look.chipPlan))
  })

  it('같은 카드가 이어져도 바로 앞 카드와 같은 배치(서명)가 되지 않는다', () => {
    const twin = Array.from({ length: 6 }, () => FEED[0])
    const signatures = toCardViews(twin, OPTIONS).map((view) => signatureOf(view.look.chipPlan!))
    for (let i = 1; i < signatures.length; i += 1) expect(signatures[i]).not.toBe(signatures[i - 1])
  })

  it('빈 배열은 빈 배열이다', () => {
    expect(toCardViews([], OPTIONS)).toEqual([])
  })

  it('칩이 없는 카드(칩 [])는 빈 계획이고 앞 카드 비교에서 건너뛴다', () => {
    const empty = makeCard({ id: 'empty', chips: [] })
    const views = toCardViews([FEED[0], empty, FEED[0]], OPTIONS)
    expect(views[1].look.chipPlan?.chips).toEqual([])
    expect(signatureOf(views[2].look.chipPlan!)).not.toBe(signatureOf(views[0].look.chipPlan!))
  })

  it('목록형은 흐름 줄이라 chipPlan이 있어도 칩을 배치하지 않는다', () => {
    const list = makeCard({
      id: 'list',
      feed_type: 'gallery_list',
      list_items: [{ name: '항목', href: '/missions/m1', image_url: null }],
    })
    const [view] = toCardViews([list], OPTIONS)
    expect(view.feedType).toBe('gallery_list')
    expect(view.look.chipPlan?.flow).toBe(true)
    expect(view.look.chipPlan?.chips).toEqual([])
  })
})

describe('chainInputOf (칩 초안 어댑터)', () => {
  it('값 칩·문구 칩은 값(value), 분류 칩은 분류(label)로 넘기고 크기·카드 시드를 그대로 싣는다', () => {
    const view = toCardView(makeCard({ feed_seed: 55 }), OPTIONS)
    const input = chainInputOf(view)
    expect(input.plan.seed).toBe(55)
    expect(input.plan.feedType).toBe('hero_box')
    expect(input.plan.chips.map((chip) => [chip.kind, chip.text, chip.size])).toEqual(view.look.chips.map((chip) => [chip.kind === 'label' ? 'label' : 'value', chip.text, chip.size]))
    expect(input.plan.chips.some((chip) => chip.kind === 'label')).toBe(true)
    expect(input.bg).toBe(view.look.colors.bg)
    expect(input.box).toBe(view.look.colors.box)
  })

  it('문구 칩은 값 칩(알약만)으로, «드랍» 문구 칩은 분류 칩으로 넘긴다', () => {
    const view = toCardView(
      makeCard({ chips: [{ kind: 'phrase', text: '오늘만' }, { kind: 'phrase', text: '드랍' }] }),
      OPTIONS,
    )
    const kinds = chainInputOf(view).plan.chips.map((chip) => [chip.kind, chip.text])
    expect(kinds).toEqual([
      ['value', '오늘만'],
      ['label', 'DROP'],
    ])
  })

  it('어드민이 정한 자리·기울기는 fixed로 넘기고, 정하지 않은 칩에는 fixed가 없다', () => {
    const view = toCardView(
      makeCard({
        chips: [
          { kind: 'phrase', text: '문구', slot: 'image-top-right', tilt: -6 },
          { kind: 'label', text: '미션' },
        ],
      }),
      OPTIONS,
    )
    const [first, second] = chainInputOf(view).plan.chips
    expect(first.fixed).toEqual({ corner: 'top-right', tilt: -6 })
    expect(second.fixed).toBeUndefined()
  })

  it('목록형은 목록 항목 수와 상관없이 입력이 만들어진다(칩 줄은 연쇄가 건너뛴다)', () => {
    const view = toCardView(
      makeCard({ feed_type: 'gallery_list', list_items: [{ name: '항목', href: '/missions/m1', image_url: null }] }),
      OPTIONS,
    )
    expect(chainInputOf(view).plan.feedType).toBe('gallery_list')
  })
})
