/**
 * 어드민 투데이 미리보기 목록 (티켓 20261001_2208, 상위 20260930_1453 조각 b6)
 *
 * 확인하는 것:
 * 1. 옛 `layout_type` 카드(`shape` NULL)가 표시 데이터(`toCardView`)를 거쳐 다섯 모양 모두 새 틀로 그려진다.
 * 2. 출력에 트래커·링크·`jam-press`가 없다 — 미리보기가 노출·클릭 수치에 섞이지 않고 눌러도 이동하지 않는다
 *    (티켓 20260930_1645 `TodayCardStack.preview.test.tsx`의 「미리보기는 계측과 이동을 모두 끈다」를 새 경로 기준으로 옮긴 것).
 * 3. 기기 폭 전환 값(360·430)이 카드 폭 328px·398px를 만든다.
 * 4. 유저 정보가 없는 미리보기는 배지 그림이 컬러이고, 보유하지 않은 배지(`earned: false`)만 흑백이다.
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 확인한다.
 * 트래커는 표식 div로 바꿔 「그려졌는가」로 확인한다 — 노출 보고와 클릭 보고는 모두 이 컴포넌트 안에서만 일어난다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/today/__tests__/TodayCardPreview.test.tsx
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

import TodayCardPreview, {
  DEFAULT_PREVIEW_DEVICE_WIDTH,
  PREVIEW_DEVICE_WIDTHS,
  previewCardWidth,
} from '../TodayCardPreview'
import { toCardView } from '@/lib/today/cardView'
import type { ResolvedBadge, TodayCardWithHref } from '@/lib/today/cards'

const NOW = new Date('2026-10-05T03:00:00Z')

function makeCard(overrides: Partial<TodayCardWithHref> = {}): TodayCardWithHref {
  return {
    id: 'card-1',
    template_type: 'badge_spotlight',
    layout_type: 'large_thumbnail',
    title: '성수동 신규 배지',
    subtitle: null,
    description: null,
    cover_image_url: 'https://cdn.example/cover.png',
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
    resolved_href: '/badges',
    resolved_badges: [],
    resolved_ranking: null,
    ...overrides,
  }
}

/** 보유 여부(`earned`)를 싣지 않은 배지 — 날짜 미리보기 조회가 싣는 모양이다 */
function unknownOwnershipBadge(id: string): ResolvedBadge {
  return { id, name: `배지 ${id}`, image_url: `https://cdn.example/${id}.png`, rarity: 'rare' }
}

/** 저장된 `shape` 없이 옛 `layout_type`만 가진 카드 — 대응표(`resolveShape`)로 다섯 모양이 모두 나온다 */
const LEGACY_CARDS: { shape: string; card: TodayCardWithHref }[] = [
  { shape: 'hero', card: makeCard({ id: 'hero', title: '히어로 카드', layout_type: 'large_thumbnail' }) },
  { shape: 'poster', card: makeCard({ id: 'poster', title: '포스터 카드', layout_type: 'banner' }) },
  {
    shape: 'square',
    card: makeCard({ id: 'square', title: '정사각 카드', template_type: 'mission_spotlight', layout_type: 'large_thumbnail' }),
  },
  { shape: 'brief', card: makeCard({ id: 'brief', title: '간단 카드', layout_type: 'shortcut' }) },
  {
    shape: 'list',
    card: makeCard({
      id: 'list',
      title: '배지 모음 카드',
      layout_type: 'badge_gallery',
      resolved_badges: [unknownOwnershipBadge('a'), unknownOwnershipBadge('b')],
    }),
  },
  {
    shape: 'list',
    card: makeCard({
      id: 'ranking',
      title: '이번 주 러너 순위',
      template_type: 'ranking_board',
      layout_type: 'ranking_list',
      resolved_ranking: {
        metricType: 'mission_progress',
        missionType: null,
        conditionFieldKey: null,
        totalParticipants: 2,
        entries: [
          { userId: 'u-1', displayName: '김잼', username: 'kimjam', avatarUrl: null, value: 10, rank: 1 },
          { userId: 'u-2', displayName: '이잼', username: 'leejam', avatarUrl: null, value: 5, rank: 2 },
        ],
      },
    }),
  },
]

const previewViews = (cards: TodayCardWithHref[]) => cards.map((card) => toCardView(card, { now: NOW }))

describe('TodayCardPreview — 옛 카드도 새 틀로 그린다', () => {
  it('shape가 NULL인 옛 layout_type 카드가 대응표대로 다섯 모양이 된다', () => {
    const views = previewViews(LEGACY_CARDS.map((c) => c.card))
    expect(views.map((v) => v.shape)).toEqual(LEGACY_CARDS.map((c) => c.shape))
    expect(new Set(views.map((v) => v.shape))).toEqual(new Set(['hero', 'poster', 'square', 'brief', 'list']))
  })

  it('다섯 모양 모두 제목을 그린다', () => {
    const html = renderToStaticMarkup(<TodayCardPreview views={previewViews(LEGACY_CARDS.map((c) => c.card))} />)
    for (const { card } of LEGACY_CARDS) expect(html).toContain(card.title)
  })
})

describe('TodayCardPreview — 계측과 이동을 모두 끈다', () => {
  it.each(LEGACY_CARDS.map((c) => [c.card.id, c.card] as const))(
    '%s: 트래커·링크·눌림이 없다',
    (_id, card) => {
      const html = renderToStaticMarkup(<TodayCardPreview views={previewViews([card])} />)
      expect(html).not.toContain('data-tracker')
      expect(html).not.toContain('<a')
      expect(html).not.toContain('href=')
      expect(html).not.toContain('jam-press')
    },
  )

  it('다섯 모양을 한꺼번에 그려도 트래커·링크·눌림이 하나도 없다(href가 있는 카드 포함)', () => {
    const html = renderToStaticMarkup(<TodayCardPreview views={previewViews(LEGACY_CARDS.map((c) => c.card))} />)
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('jam-press')
  })

  it('랭킹 행형은 순위를 그대로 그리되 순위 행에 프로필 링크가 없다', () => {
    const ranking = LEGACY_CARDS.find((c) => c.card.id === 'ranking')!.card
    const html = renderToStaticMarkup(<TodayCardPreview views={previewViews([ranking])} />)
    expect(html).toContain('김잼')
    expect(html).toContain('이잼')
    expect(html).not.toContain('href=')
  })

  it('표시 데이터에 계측 정보(tracking)가 없다', () => {
    for (const view of previewViews(LEGACY_CARDS.map((c) => c.card))) expect(view.tracking).toBeUndefined()
  })
})

describe('TodayCardPreview — 기기 폭 전환 (360·430)', () => {
  it('전환 값은 360과 430이고 기본은 360이다', () => {
    expect([...PREVIEW_DEVICE_WIDTHS]).toEqual([360, 430])
    expect(DEFAULT_PREVIEW_DEVICE_WIDTH).toBe(360)
  })

  it('카드 폭은 기기 폭에서 홈의 좌우 여백(16px씩)을 뺀 값이다 — 360은 328px, 430은 398px', () => {
    expect(previewCardWidth(360)).toBe(328)
    expect(previewCardWidth(430)).toBe(398)
  })

  it('처음에는 360이 선택돼 있고 카드 판 폭이 328px다', () => {
    const html = renderToStaticMarkup(<TodayCardPreview views={previewViews([LEGACY_CARDS[0].card])} />)
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>360</)
    expect(html).toMatch(/role="tab"[^>]*aria-selected="false"[^>]*>430</)
    expect(html).toContain('data-preview-board')
    expect(html).toContain('width:328px')
  })

  it('430을 고르면 카드 판 폭이 398px다', () => {
    const html = renderToStaticMarkup(
      <TodayCardPreview views={previewViews([LEGACY_CARDS[0].card])} defaultWidth={430} />,
    )
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>430</)
    expect(html).toContain('width:398px')
    expect(html).not.toContain('width:328px')
  })
})

describe('TodayCardPreview — 유저 정보가 없는 미리보기는 배지 그림이 컬러다', () => {
  it('보유 여부를 모르는(earned 없음) 배지는 승격 이미지·썸네일·타일 모두 흑백이 아니다', () => {
    const promoted = makeCard({
      id: 'promoted',
      layout_type: 'large_thumbnail',
      cover_image_url: null,
      resolved_badges: [unknownOwnershipBadge('a')],
    })
    const thumb = makeCard({
      id: 'thumb',
      layout_type: 'shortcut',
      cover_image_url: null,
      resolved_badges: [unknownOwnershipBadge('b')],
    })
    const tiles = LEGACY_CARDS.find((c) => c.card.id === 'list')!.card
    const html = renderToStaticMarkup(<TodayCardPreview views={previewViews([promoted, thumb, tiles])} />)
    expect(html).toContain('https://cdn.example/a.png')
    expect(html).toContain('https://cdn.example/b.png')
    expect(html).not.toContain('grayscale')
  })

  it('보유하지 않은 배지(earned: false)는 승격 이미지·썸네일이 흑백이다(홈과 같은 규칙)', () => {
    const owned = (id: string): ResolvedBadge => ({ ...unknownOwnershipBadge(id), earned: false })
    const promoted = makeCard({ id: 'promoted', cover_image_url: null, resolved_badges: [owned('a')] })
    const thumb = makeCard({ id: 'thumb', layout_type: 'shortcut', cover_image_url: null, resolved_badges: [owned('b')] })
    const html = renderToStaticMarkup(<TodayCardPreview views={previewViews([promoted, thumb])} />)
    expect(html.match(/grayscale/g)).toHaveLength(2)
  })
})
