/**
 * 투데이 카드 스택 — 모든 카드를 새 틀로 그린다 (티켓 20261001_2244, 상위 20260930_1453 조각 b7)
 *
 * 옛 렌더러(레이아웃별 카드 컴포넌트 6종)와 어드민 미리보기용 `preview` prop은 이 조각에서 지웠다. 스택은 모든 카드를 표시 데이터(`toCardView`,
 * 계측 정보 포함)로 바꿔 새 틀(`TodayCard`)로 그린다. 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더
 * (`renderToStaticMarkup`)로 고정한다. 트래커는 표식 div로 바꿔 「어떤 카드가 감싸졌는가」로 확인한다.
 *
 * 확인하는 것: (1) `shape`가 NULL인 옛 `layout_type` 카드가 대응표대로 새 모양이 된다 (2) 모든 카드가 트래커로 감싸지고 랭킹 행형만 클릭을 세지 않는다
 * (3) 랭킹 행형만 카드 전체 링크가 없다 (4) `currentUserId`가 랭킹 강조로 간다 (5) 카드 0장이면 아무것도 그리지 않는다
 * (6) 옛 렌더러의 클래스·마크업이 남지 않는다 (7) 섹션 머리와 카드 순서.
 * 어드민 미리보기의 「계측과 이동을 모두 끈다」는 `src/app/admin/today/__tests__/TodayCardPreview.test.tsx`가 맡는다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/today/TodayCardTracker', () => ({
  default: ({ cardId, trackClick, children }: { cardId: string; trackClick?: boolean; children: ReactNode }) => (
    <div data-tracker={cardId} data-track-click={String(trackClick ?? true)}>
      {children}
    </div>
  ),
}))

import TodayCardStack from './TodayCardStack'
import type { TodayCardWithHref } from '@/lib/today/cards'
import type { TodayCardLayoutType } from '@/types/database'

function makeCard(partial: Partial<TodayCardWithHref> = {}): TodayCardWithHref {
  return {
    id: 'card-1',
    template_type: 'badge_spotlight',
    layout_type: 'large_thumbnail',
    title: '성수동 신규 배지',
    subtitle: '이번 주 새로 열렸어요',
    description: null,
    cover_image_url: 'https://example.com/cover.webp',
    badge_ids: [],
    mission_id: null,
    item_book_id: null,
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: ['all'],
    starts_at: '2026-09-29T00:00:00Z',
    ends_at: '2026-12-30T14:59:59Z',
    sort_order: 0,
    is_active: true,
    created_at: '2026-09-29T00:00:00Z',
    created_by: null,
    ranking_mode_id: null,
    content_type_id: null,
    image_source: null,
    shape: null,
    resolved_href: '/badges',
    resolved_badges: [],
    resolved_ranking: null,
    ...partial,
  }
}

const render = (cards: TodayCardWithHref[], currentUserId?: string) =>
  renderToStaticMarkup(<TodayCardStack cards={cards} currentUserId={currentUserId} />)

// 모양은 틀의 마크업으로 알아본다
const BRIEF_FRAME = 'min-h-[88px]'
const HERO_FRAME = 'relative aspect-video overflow-hidden bg-surface'
const POSTER_FRAME = 'relative aspect-[4/5] overflow-hidden bg-surface'
const SQUARE_FRAME = 'relative aspect-square overflow-hidden bg-surface'
const TILE_LIST = 'w-16 shrink-0'
const FRAMES = [BRIEF_FRAME, HERO_FRAME, POSTER_FRAME, SQUARE_FRAME, TILE_LIST]
/** 카드 전체 링크(`CardFrame`)의 클래스 */
const CARD_LINK = 'block rounded-[var(--radius-cards)] jam-press'

const badge = (id: string) => ({ id, name: `배지 ${id}`, image_url: null, rarity: 'rare', earned: true })
const entry = (rank: number, userId: string, username: string | null) => ({
  userId,
  displayName: `이름 ${userId}`,
  username,
  avatarUrl: null,
  value: 100 - rank,
  rank,
})
const rankingCard = (overrides: Partial<TodayCardWithHref> = {}) =>
  makeCard({
    layout_type: 'ranking_list',
    template_type: 'ranking_board',
    title: '이번 주 러너 순위',
    resolved_href: '/missions/m-1/status',
    resolved_ranking: {
      metricType: 'mission_progress',
      missionType: null,
      conditionFieldKey: null,
      totalParticipants: 2,
      entries: [entry(1, 'u1', 'runner1'), entry(2, 'u2', 'runner2')],
    },
    ...overrides,
  })

/** 이 모양의 틀만 있고 다른 모양의 틀은 없다 */
function expectOnlyFrame(html: string, frame: string) {
  expect(html).toContain(frame)
  for (const other of FRAMES.filter((f) => f !== frame)) expect(html).not.toContain(other)
}

describe('TodayCardStack — shape가 NULL인 옛 카드는 대응표대로 새 모양이 된다 (1453 확정 설계 6절)', () => {
  it('large_thumbnail은 hero다(링크 하나·눌림 하나·끝 줄)', () => {
    const html = render([makeCard({ layout_type: 'large_thumbnail' })])
    expectOnlyFrame(html, HERO_FRAME)
    expect(html).toContain(CARD_LINK)
    expect(html).toContain('href="/badges"')
    expect(html).toContain('자세히 보기')
    expect(html.match(/jam-press/g)).toHaveLength(1)
  })

  it('large_thumbnail인 미션 소개 카드는 square다', () => {
    const html = render([makeCard({ layout_type: 'large_thumbnail', template_type: 'mission_spotlight' })])
    expectOnlyFrame(html, SQUARE_FRAME)
  })

  it('large_thumbnail인데 커버가 없고 배지가 걸려 있으면 square다(그림 없는 배지도, 이미지 칸에 자리 표시)', () => {
    const withImage = render([
      makeCard({
        cover_image_url: null,
        badge_ids: ['a'],
        resolved_badges: [{ id: 'a', name: '배지 a', image_url: 'https://example.com/a.png', rarity: 'rare', earned: true }],
      }),
    ])
    expectOnlyFrame(withImage, SQUARE_FRAME)
    const withoutImage = render([makeCard({ cover_image_url: null, badge_ids: ['a'], resolved_badges: [badge('a')] })])
    expectOnlyFrame(withoutImage, SQUARE_FRAME)
  })

  it('banner는 커버가 있으면 poster, 없으면 brief다', () => {
    expectOnlyFrame(render([makeCard({ layout_type: 'banner' })]), POSTER_FRAME)
    expectOnlyFrame(render([makeCard({ layout_type: 'banner', cover_image_url: null })]), BRIEF_FRAME)
  })

  it('shortcut·other는 brief다(끝 ›)', () => {
    for (const layout of ['shortcut', 'other'] as const) {
      const html = render([makeCard({ layout_type: layout })])
      expectOnlyFrame(html, BRIEF_FRAME)
      expect(html).toContain('›')
    }
  })

  it('badge_gallery는 list 타일형이다(배지가 있으면 타일 줄과 「전체 보기」, 없으면 brief)', () => {
    const html = render([makeCard({ layout_type: 'badge_gallery', badge_ids: ['a', 'b'], resolved_badges: [badge('a'), badge('b')] })])
    expectOnlyFrame(html, TILE_LIST)
    expect(html).toContain('배지 a')
    expect(html).toContain('전체 보기')
    expectOnlyFrame(render([makeCard({ layout_type: 'badge_gallery' })]), BRIEF_FRAME)
  })

  it('ranking_list는 list 행형이다(순위 행)', () => {
    const html = render([rankingCard()])
    expect(html).toContain('이름 u1')
    expect(html).toContain('이름 u2')
    for (const frame of [BRIEF_FRAME, HERO_FRAME, POSTER_FRAME, SQUARE_FRAME]) expect(html).not.toContain(frame)
  })

  it('기사는 레이아웃과 상관없이 hero이고 기사 화면으로 이동한다(「기사 읽기」·게재일)', () => {
    const html = render([
      makeCard({
        layout_type: 'other',
        template_type: 'editorial_article',
        resolved_href: '/today/card-1',
        starts_at: '2026-10-05T03:00:00Z',
      }),
    ])
    expectOnlyFrame(html, HERO_FRAME)
    expect(html).toContain('href="/today/card-1"')
    expect(html).toContain('기사 읽기')
    expect(html).toContain('>10월 5일</time>')
  })

  it('저장된 shape는 레이아웃보다 먼저다', () => {
    expectOnlyFrame(render([makeCard({ layout_type: 'shortcut', shape: 'poster' })]), POSTER_FRAME)
  })
})

describe('TodayCardStack — 모든 카드가 트래커로 감싸지고 랭킹 행형만 클릭을 세지 않는다', () => {
  const layouts: TodayCardLayoutType[] = ['large_thumbnail', 'banner', 'badge_gallery', 'shortcut', 'other', 'ranking_list']

  it.each(layouts)('%s: 카드 id로 트래커가 하나 감싼다', (layout) => {
    const card = layout === 'ranking_list' ? rankingCard({ id: 'c-x' }) : makeCard({ id: 'c-x', layout_type: layout, resolved_badges: [badge('a')], badge_ids: ['a'] })
    const html = render([card])
    expect(html.match(/data-tracker=/g)).toHaveLength(1)
    expect(html).toContain('data-tracker="c-x"')
  })

  it('랭킹 행형만 클릭을 세지 않는다(노출만)', () => {
    expect(render([rankingCard({ id: 'r' })])).toContain('data-track-click="false"')
    for (const layout of ['large_thumbnail', 'banner', 'badge_gallery', 'shortcut', 'other'] as const) {
      const html = render([makeCard({ layout_type: layout, badge_ids: ['a'], resolved_badges: [badge('a')] })])
      expect(html).toContain('data-track-click="true"')
      expect(html).not.toContain('data-track-click="false"')
    }
  })

  it('여러 장이면 장마다 트래커가 하나씩 있다', () => {
    const html = render([
      makeCard({ id: 'a' }),
      makeCard({ id: 'b', layout_type: 'shortcut' }),
      rankingCard({ id: 'c' }),
    ])
    expect(html.match(/data-tracker=/g)).toHaveLength(3)
    for (const id of ['a', 'b', 'c']) expect(html).toContain(`data-tracker="${id}"`)
  })
})

describe('TodayCardStack — 랭킹 행형만 카드 전체 링크가 없다', () => {
  it('랭킹 행형: 카드 전체 링크가 없고 제목 링크 하나·행 링크는 행마다·끝 줄 없음', () => {
    const html = render([rankingCard()])
    expect(html).toContain('href="/missions/m-1/status"')
    expect(html).toContain('href="/runner1"')
    expect(html).toContain('href="/runner2"')
    // 제목 링크 하나 + 행 링크 둘
    expect(html.match(/<a /g)).toHaveLength(3)
    // 눌림은 제목 링크 하나와 순위 행 둘(행이 링크일 때 `ListRowCard`가 `.jam-press`를 붙인다) — 카드 전체에는 없다
    expect(html.match(/jam-press/g)).toHaveLength(3)
    expect(html).not.toContain('전체 보기')
  })

  it('그 밖의 카드는 카드 전체가 링크 하나다(앵커 안에 앵커가 없다)', () => {
    const cards = [
      makeCard({ layout_type: 'large_thumbnail' }),
      makeCard({ layout_type: 'banner' }),
      makeCard({ layout_type: 'shortcut' }),
      makeCard({ layout_type: 'badge_gallery', badge_ids: ['a'], resolved_badges: [badge('a')] }),
      makeCard({ layout_type: 'large_thumbnail', template_type: 'mission_spotlight' }),
    ]
    for (const card of cards) {
      const html = render([card])
      expect(html.match(/<a /g)).toHaveLength(1)
      expect(html.match(/jam-press/g)).toHaveLength(1)
      expect(html).toContain(CARD_LINK)
    }
  })

  it('카드 전체 링크가 있는 카드는 href가 이동 경로이고, href가 없는 값이 오지 않는다', () => {
    const html = render([makeCard({ resolved_href: '/missions/m-9' })])
    expect(html).toContain('href="/missions/m-9"')
  })
})

describe('TodayCardStack — 홈에서 보는 사람(currentUserId)', () => {
  it('랭킹 행형은 currentUserId를 받아 내 순위 행만 강조한다', () => {
    const html = render([rankingCard()], 'u2')
    // 내 순위 행의 순위 번호·값만 24px(--text-h4) 레드(--color-primary)다
    expect(html.match(/font-size:var\(--text-h4\)/g)).toHaveLength(2)
    expect(html.match(/font-size:var\(--text-h4\);font-weight:bold;color:var\(--color-primary\)/g)).toHaveLength(2)
  })

  it('currentUserId가 없거나 목록에 없으면 강조가 없다', () => {
    expect(render([rankingCard()])).not.toContain('--text-h4')
    expect(render([rankingCard()], 'someone-else')).not.toContain('--text-h4')
  })
})

describe('TodayCardStack — 섹션 머리와 카드 0장', () => {
  it('카드가 0장이면 아무것도 그리지 않는다', () => {
    expect(render([])).toBe('')
  })

  it('카드가 있으면 섹션 머리(「투데이」·부제)가 먼저 나온다', () => {
    const html = render([makeCard()])
    expect(html).toContain('<h2')
    expect(html.indexOf('<h2')).toBeLessThan(html.indexOf('data-tracker='))
  })

  it('여러 장이 섞여 있어도 장마다 따로 가르고 순서를 지킨다', () => {
    const html = render([
      makeCard({ id: 'a', layout_type: 'shortcut', title: '카드 가' }),
      makeCard({ id: 'b', layout_type: 'large_thumbnail', title: '카드 나' }),
      makeCard({ id: 'c', layout_type: 'badge_gallery', title: '카드 다', badge_ids: ['a'], resolved_badges: [badge('a')] }),
    ])
    expect(html.indexOf('카드 가')).toBeLessThan(html.indexOf('카드 나'))
    expect(html.indexOf('카드 나')).toBeLessThan(html.indexOf('카드 다'))
    expect(html.match(/min-h-\[88px\]/g)).toHaveLength(1)
    expect(html.match(/relative aspect-video overflow-hidden bg-surface/g)).toHaveLength(1)
    expect(html.match(/w-16 shrink-0/g)).toHaveLength(1)
  })
})

describe('TodayCardStack — 옛 렌더러의 클래스·마크업이 남지 않는다', () => {
  const all: TodayCardWithHref[] = [
    makeCard({ layout_type: 'large_thumbnail' }),
    makeCard({ layout_type: 'banner' }),
    makeCard({ layout_type: 'banner', cover_image_url: null }),
    makeCard({ layout_type: 'badge_gallery', badge_ids: ['a'], resolved_badges: [badge('a')] }),
    makeCard({ layout_type: 'shortcut' }),
    makeCard({ layout_type: 'other' }),
    rankingCard(),
  ]

  it('예전 눌림 문자열(active:scale-[0.98]·duration-100)이 없다(순위 행 포함)', () => {
    for (const card of all) {
      const html = render([card])
      expect(html).not.toContain('active:scale-[0.98]')
      expect(html).not.toContain('duration-100')
    }
  })

  it('옛 렌더러의 레이아웃 클래스가 없다(옛 갤러리 줄·옛 배너 막·옛 부제 줄)', () => {
    for (const card of all) {
      const html = render([card])
      // 옛 `BadgeGalleryCard`의 타일 줄
      expect(html).not.toContain('flex gap-[var(--spacing-16)] mt-[var(--spacing-16)] overflow-x-auto pb-1')
      // 옛 `BannerCard`의 퍼센트 정지점 막과 4:5 틀
      expect(html).not.toContain('from-black/70')
      expect(html).not.toContain('relative rounded-[var(--radius-cards)] overflow-hidden aspect-[4/5] jam-press')
      // 옛 큰 썸네일 틀과 옛 칩 클래스
      expect(html).not.toContain('aspect-[16/9]')
      expect(html).not.toContain('px-2.5 py-1.5')
    }
  })

  it('칩은 MODULAR LabelChip(인라인 6px 10px)이다', () => {
    const html = render([makeCard({ layout_type: 'large_thumbnail' })])
    expect(html).toMatch(/<span class="shrink-0" style="[^"]*padding:6px 10px[^"]*">배지 소개<\/span>/)
    expect(html).not.toContain('px-2.5 py-1.5')
  })

  it('`preview` prop은 스택이 받지 않는다 — 넘겨도 계측과 링크가 그대로다', () => {
    const props = { cards: [makeCard()], preview: true } as unknown as React.ComponentProps<typeof TodayCardStack>
    const html = renderToStaticMarkup(<TodayCardStack {...props} />)
    expect(html).toContain('data-tracker="card-1"')
    expect(html).toContain('href="/badges"')
  })
})
