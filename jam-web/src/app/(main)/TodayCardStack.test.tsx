/**
 * 홈 카드 게재용 설명문(description) 표시 테스트 (티켓 20260929_1335)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 고정한다.
 * 확인하는 것: (1) 5개 레이아웃(large_thumbnail·badge_gallery·other·ranking_list·banner)에서 설명문이
 * 14px·2줄 말줄임으로 부제 아래에 나오는지 (2) shortcut은 그리지 않는지 (3) 값이 null·빈 문자열·공백뿐이면
 * 설명문이 없는 카드와 DOM이 똑같은지 (4) 부제가 없으면 mt-1, 있으면 mt-2인지.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
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
    resolved_href: '/badges',
    resolved_badges: [],
    resolved_ranking: null,
    ...partial,
  }
}

const render = (card: TodayCardWithHref) => renderToStaticMarkup(<TodayCardStack cards={[card]} />)

const DESCRIPTION = '성수동에서 새로 발견된 배지를 만나 보세요'
const DESCRIPTION_CLASS = 'text-[length:var(--text-small)] leading-[var(--leading-small)] line-clamp-2 break-words'

describe('TodayCardStack — 게재용 설명문', () => {
  const visibleLayouts: TodayCardLayoutType[] = ['large_thumbnail', 'badge_gallery', 'other', 'ranking_list', 'banner']

  it.each(visibleLayouts)('%s: 부제 아래 14px·2줄 말줄임으로 그린다', (layout) => {
    const html = render(makeCard({ layout_type: layout, description: DESCRIPTION }))
    expect(html).toContain(DESCRIPTION)
    expect(html).toContain(DESCRIPTION_CLASS)
    expect(html.indexOf('이번 주 새로 열렸어요')).toBeLessThan(html.indexOf(DESCRIPTION))
    expect(html).toContain('mt-2')
  })

  it('밝은 카드는 text-text-inverse/60, 배너(커버 있음)는 text-white/80이다', () => {
    expect(render(makeCard({ layout_type: 'large_thumbnail', description: DESCRIPTION }))).toContain(
      `${DESCRIPTION_CLASS} text-text-inverse/60 mt-2`
    )
    expect(render(makeCard({ layout_type: 'banner', description: DESCRIPTION }))).toContain(`${DESCRIPTION_CLASS} text-white/80 mt-2`)
  })

  it('배너인데 커버가 없으면 기타형 대체라 밝은 카드 색을 쓴다', () => {
    const html = render(makeCard({ layout_type: 'banner', cover_image_url: null, description: DESCRIPTION }))
    expect(html).toContain(`${DESCRIPTION_CLASS} text-text-inverse/60 mt-2`)
    expect(html).not.toContain('text-white/80')
  })

  it('shortcut은 설명문이 있어도 이전과 같은 모양이다', () => {
    const base = render(makeCard({ layout_type: 'shortcut' }))
    const withDescription = render(makeCard({ layout_type: 'shortcut', description: DESCRIPTION }))
    expect(withDescription).not.toContain(DESCRIPTION)
    expect(withDescription).toBe(base)
  })

  it.each(visibleLayouts)('%s: null·빈 문자열·공백뿐이면 설명문이 없는 카드와 DOM이 같다', (layout) => {
    const base = render(makeCard({ layout_type: layout, description: null }))
    expect(render(makeCard({ layout_type: layout, description: '' }))).toBe(base)
    expect(render(makeCard({ layout_type: layout, description: '   ' }))).toBe(base)
    expect(base).not.toContain('line-clamp-2 break-words')
  })

  it('부제가 없으면 제목 바로 아래 mt-1로 붙는다(빈 여백 없음)', () => {
    const html = render(makeCard({ subtitle: null, description: DESCRIPTION }))
    expect(html).toContain(`${DESCRIPTION_CLASS} text-text-inverse/60 mt-1`)
    expect(html).not.toContain(`${DESCRIPTION_CLASS} text-text-inverse/60 mt-2`)
  })

  it('앞뒤 공백은 잘라서 그린다', () => {
    expect(render(makeCard({ description: `  ${DESCRIPTION}  ` }))).toContain(`>${DESCRIPTION}</p>`)
  })
})

describe('TodayCardStack — 새 틀과 옛 렌더러 분기 (티켓 20261001_1458)', () => {
  // 새 틀(`brief`)은 최소 높이 클래스로, 새 틀(`hero`)은 16:9 이미지 칸으로, 눌림 링크는 `rounded-[var(--radius-cards)] jam-press`로 알아본다
  const NEW_FRAME = 'min-h-[88px]'
  const HERO_FRAME = 'relative aspect-video overflow-hidden bg-surface'
  const POSTER_FRAME = 'relative aspect-[4/5] overflow-hidden bg-surface'
  const SQUARE_FRAME = 'relative aspect-square overflow-hidden bg-surface'
  const NEW_LINK = 'block rounded-[var(--radius-cards)] jam-press'
  const badge = (id: string) => ({ id, name: `배지 ${id}`, image_url: null, rarity: 'rare', earned: true })

  it('shape가 brief로 저장된 카드는 새 틀로 그린다(링크·눌림·끝 ›)', () => {
    const html = render(makeCard({ shape: 'brief', template_type: 'drop_alert', title: '한강 번개 드랍', region_label: '한강공원' }))
    expect(html).toContain(NEW_FRAME)
    expect(html).toContain(NEW_LINK)
    expect(html).toContain('href="/badges"')
    expect(html).toContain('한강 번개 드랍')
    expect(html).toContain('›')
    // 옛 렌더러의 부제 줄은 새 틀에 없다
    expect(html).not.toContain('이번 주 새로 열렸어요')
  })

  it('shape가 없는(NULL) 옛 카드는 옛 렌더러가 그린다', () => {
    for (const layout of ['large_thumbnail', 'badge_gallery', 'shortcut', 'banner', 'other'] as const) {
      const html = render(makeCard({ shape: null, layout_type: layout }))
      expect(html).not.toContain(NEW_FRAME)
      expect(html).not.toContain(NEW_LINK)
      expect(html).toContain('href="/badges"')
    }
  })

  it('shape가 hero로 저장된 카드는 새 틀로 그린다(링크·눌림·16:9 이미지 칸·끝 줄)', () => {
    const html = render(makeCard({ shape: 'hero', title: '성수동 신규 배지', subtitle: '이번 주 새로 열렸어요' }))
    expect(html).toContain(HERO_FRAME)
    expect(html).toContain(NEW_LINK)
    expect(html).toContain('href="/badges"')
    expect(html).toContain('성수동 신규 배지')
    expect(html).toContain('자세히 보기')
    expect(html).not.toContain(NEW_FRAME)
    // 옛 렌더러의 눌림은 새 틀에 없다
    expect(html).not.toContain('active:scale-[0.98]')
  })

  it('shape가 hero로 저장된 기사 카드는 「기사 읽기 →」 끝 줄과 게재일을 그린다', () => {
    const html = render(
      makeCard({
        shape: 'hero',
        template_type: 'editorial_article',
        resolved_href: '/today/card-1',
        starts_at: '2026-10-05T03:00:00Z',
      })
    )
    expect(html).toContain(HERO_FRAME)
    expect(html).toContain('href="/today/card-1"')
    expect(html).toContain('기사 읽기')
    expect(html).toContain('>10월 5일</time>')
  })

  it('shape가 poster로 저장된 카드는 새 틀로 그린다(링크·눌림·4:5 이미지 칸·막 위 글자, 요약·끝 줄 없음)', () => {
    const html = render(makeCard({ shape: 'poster', title: '성수동 신규 배지', subtitle: '이번 주 새로 열렸어요' }))
    expect(html).toContain(POSTER_FRAME)
    expect(html).toContain('absolute inset-x-0 bottom-0')
    expect(html).toContain(NEW_LINK)
    expect(html).toContain('href="/badges"')
    expect(html).toContain('성수동 신규 배지')
    expect(html).not.toContain(HERO_FRAME)
    // 요약·끝 줄은 포스터에 없다(옛 렌더러의 부제 줄도 없다)
    expect(html).not.toContain('이번 주 새로 열렸어요')
    expect(html).not.toContain('자세히 보기')
  })

  it('shape가 square로 저장된 카드는 새 틀로 그린다(링크·눌림·1:1 이미지 칸·흰 본문, 설명문·끝 줄 없음)', () => {
    const html = render(makeCard({ shape: 'square', title: '성수동 신규 배지', subtitle: '이번 주 새로 열렸어요', description: DESCRIPTION }))
    expect(html).toContain(SQUARE_FRAME)
    expect(html).toContain('object-contain')
    expect(html).toContain(NEW_LINK)
    expect(html).toContain('href="/badges"')
    expect(html).toContain('성수동 신규 배지')
    // 요약은 정사각 카드에 있고 설명문·끝 줄은 없다
    expect(html).toContain('이번 주 새로 열렸어요')
    expect(html).not.toContain(DESCRIPTION)
    expect(html).not.toContain('자세히 보기')
    expect(html).not.toContain(HERO_FRAME)
    expect(html).not.toContain(POSTER_FRAME)
  })

  const TILE_LIST = 'w-16 shrink-0'
  // 옛 `BadgeGalleryCard`의 타일 줄 클래스 — 새 틀 타일 줄에는 없다
  const OLD_GALLERY = 'flex gap-[var(--spacing-16)] mt-[var(--spacing-16)] overflow-x-auto pb-1'
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
      shape: 'list',
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

  it('shape가 list로 저장된 타일형 카드는 새 틀로 그린다(링크 하나·눌림 하나·타일 줄·전체 보기, 옛 갤러리 아님)', () => {
    const html = render(makeCard({ shape: 'list', layout_type: 'badge_gallery', resolved_badges: [badge('a'), badge('b')] }))
    expect(html).toContain(NEW_LINK)
    expect(html).toContain('href="/badges"')
    expect(html.match(/<a /g)).toHaveLength(1)
    expect(html.match(/jam-press/g)).toHaveLength(1)
    expect(html).toContain(TILE_LIST)
    expect(html).toContain('배지 a')
    expect(html).toContain('전체 보기')
    expect(html).not.toContain(OLD_GALLERY)
    for (const frame of [NEW_FRAME, HERO_FRAME, POSTER_FRAME, SQUARE_FRAME]) expect(html).not.toContain(frame)
  })

  it('shape가 list로 저장된 랭킹 카드는 새 틀로 그린다(카드 전체 링크 없음·제목 링크 하나·행 링크는 행마다·끝 줄 없음)', () => {
    const html = render(rankingCard())
    expect(html).toContain('href="/missions/m-1/status"')
    expect(html).toContain('href="/runner1"')
    expect(html).toContain('href="/runner2"')
    // 제목 링크 하나 + 행 링크 둘, 눌림은 제목 링크 하나
    expect(html.match(/<a /g)).toHaveLength(3)
    expect(html.match(/jam-press/g)).toHaveLength(1)
    expect(html).not.toContain('전체 보기')
    expect(html).not.toContain('active:scale-[0.98] transition-transform duration-100 cursor-pointer jam-press')
  })

  it('랭킹 행형 새 틀은 currentUserId를 받아 내 순위 행만 강조한다(홈)', () => {
    const html = renderToStaticMarkup(<TodayCardStack cards={[rankingCard()]} currentUserId="u2" />)
    // 내 순위 행의 순위 번호·값만 24px(--text-h4) 레드(--color-primary)다
    expect(html.match(/font-size:var\(--text-h4\)/g)).toHaveLength(2)
    expect(html.match(/font-size:var\(--text-h4\);font-weight:bold;color:var\(--color-primary\)/g)).toHaveLength(2)
    const without = renderToStaticMarkup(<TodayCardStack cards={[rankingCard()]} />)
    expect(without).not.toContain('--text-h4')
  })

  it('미리보기(preview)는 새 틀 list도 링크·트래커·눌림·강조가 없다', () => {
    for (const card of [rankingCard(), makeCard({ shape: 'list', layout_type: 'badge_gallery', resolved_badges: [badge('a')] })]) {
      const html = renderToStaticMarkup(<TodayCardStack cards={[card]} currentUserId="u2" preview />)
      expect(html).not.toContain('<a')
      expect(html).not.toContain('jam-press')
      expect(html).not.toContain('--text-h4')
    }
  })

  it('타일이 0개인 list로 저장된 카드는 화면도 brief다(기록 모양과 같다)', () => {
    const html = render(makeCard({ shape: 'list', template_type: 'badge_spotlight', resolved_badges: [] }))
    expect(html).toContain(NEW_FRAME)
    expect(html).toContain(NEW_LINK)
  })

  it('여러 장이 섞여 있어도 장마다 따로 가르고 순서를 지킨다', () => {
    const html = renderToStaticMarkup(
      <TodayCardStack
        cards={[
          makeCard({ id: 'a', shape: null, title: '옛 카드 가' }),
          makeCard({ id: 'b', shape: 'brief', title: '새 카드 나' }),
          makeCard({
            id: 'c',
            shape: 'list',
            layout_type: 'badge_gallery',
            title: '새 카드 다',
            resolved_badges: [{ id: 'a', name: '배지 a', image_url: null, rarity: 'rare', earned: true }],
          }),
        ]}
      />
    )
    expect(html.indexOf('옛 카드 가')).toBeLessThan(html.indexOf('새 카드 나'))
    expect(html.indexOf('새 카드 나')).toBeLessThan(html.indexOf('새 카드 다'))
    expect(html.match(/min-h-\[88px\]/g)).toHaveLength(1)
    expect(html.match(/w-16 shrink-0/g)).toHaveLength(1)
    expect(html).not.toContain(HERO_FRAME)
  })

  it('hero와 옛 카드가 섞여 있어도 장마다 따로 가르고 순서를 지킨다', () => {
    const html = renderToStaticMarkup(
      <TodayCardStack
        cards={[
          makeCard({ id: 'a', shape: 'hero', title: '새 카드 가' }),
          makeCard({ id: 'b', shape: null, title: '옛 카드 나' }),
        ]}
      />
    )
    expect(html.indexOf('새 카드 가')).toBeLessThan(html.indexOf('옛 카드 나'))
    expect(html.match(/relative aspect-video overflow-hidden bg-surface/g)).toHaveLength(1)
  })

  it('새 틀 카드에는 눌림이 링크 하나에만 있고 옛 눌림 문자열이 없다', () => {
    for (const shape of ['brief', 'hero', 'poster', 'square'] as const) {
      const html = render(makeCard({ shape }))
      expect(html.match(/jam-press/g)).toHaveLength(1)
      expect(html).not.toContain('active:scale-[0.98]')
    }
    // list(타일형)는 타일이 있어야 list로 그려진다 — 타일 0개는 brief다
    const list = render(makeCard({ shape: 'list', layout_type: 'badge_gallery', resolved_badges: [badge('a')] }))
    expect(list.match(/jam-press/g)).toHaveLength(1)
    expect(list).not.toContain('active:scale-[0.98]')
  })
})

describe('TodayCardStack — 옛 렌더러의 눌림과 칩 (티켓 20261001_1458)', () => {
  const layouts: TodayCardLayoutType[] = ['large_thumbnail', 'badge_gallery', 'shortcut', 'banner', 'other']

  it.each(layouts)('%s: 눌림은 jam-press 하나이고 예전 눌림 문자열은 남지 않는다', (layout) => {
    const html = render(makeCard({ layout_type: layout }))
    expect(html).toContain('jam-press')
    expect(html).not.toContain('active:scale-[0.98]')
    expect(html).not.toContain('duration-100')
  })

  it('ranking_list: 미션 대상 랭킹의 제목 링크가 jam-press를 쓴다', () => {
    const html = render(
      makeCard({
        layout_type: 'ranking_list',
        template_type: 'ranking_board',
        resolved_href: '/missions/m-1/status',
        resolved_ranking: {
          metricType: 'mission_progress',
          missionType: null,
          conditionFieldKey: null,
          totalParticipants: 0,
          entries: [],
        },
      })
    )
    expect(html).toContain('block jam-press')
    expect(html).not.toContain('active:scale-[0.98]')
  })

  // shortcut은 칩 없이 아이콘·제목 한 줄이라 제외한다
  const chipLayouts = layouts.filter((layout) => layout !== 'shortcut')
  it.each(chipLayouts)('%s: 칩은 MODULAR LabelChip(인라인 6px 10px)이고 예전 칩 클래스는 없다', (layout) => {
    const html = render(makeCard({ layout_type: layout }))
    expect(html).toMatch(/<span class="" style="[^"]*padding:6px 10px[^"]*">배지 소개<\/span>/)
    expect(html).not.toContain('px-2.5 py-1.5')
  })
})
