/**
 * 레시피 공개 카드(`recipe_reveal`)가 홈 틀로 그려지는 모습 (티켓 20261006_1217, 상위 20260930_1500 ⑫-a)
 *
 * 표시 데이터(`toCardView`)에서 `TodayCard`까지 이어 그린 출력을 확인한다. 새 모양·새 컴포넌트는 없다 — 공개 전은 `brief`, 공개 뒤는 `list` 타일형,
 * 공개 예고로 운영자가 고른 `poster`가 기존 틀 그대로 그려지는지, 레시피가 없는 카드와 처음 보는 템플릿 값의 카드가 던지지 않는지 본다.
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 클래스·태그 문자열을 단언한다.
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
  default: ({ cardId, children }: { cardId: string; children: ReactNode }) => <div data-tracker={cardId}>{children}</div>,
}))

import TodayCard from '../TodayCard'
import { FlaskIcon } from '@/components/ui/icons'
import { toCardView } from '@/lib/today/cardView'
import type { ResolvedBadge, ResolvedRecipe, TodayCardWithHref } from '@/lib/today/cards'

const NOW = new Date('2026-10-05T03:00:00Z')
const ICON_CLASS = 'w-6 h-6 text-text-inverse/60'
const flask = renderToStaticMarkup(<FlaskIcon className={ICON_CLASS} />)

function makeCard(overrides: Partial<TodayCardWithHref> = {}): TodayCardWithHref {
  return {
    id: 'card-1',
    template_type: 'recipe_reveal',
    layout_type: 'badge_gallery',
    title: '새 레시피가 열려요',
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
    content_type_id: null,
    image_source: null,
    shape: 'list',
    title_in_image: null,
    resolved_href: '/combine',
    resolved_badges: [],
    resolved_ranking: null,
    resolved_mission: null,
    resolved_collection: null,
    ...overrides,
  }
}

const badge = (id: string, overrides: Partial<ResolvedBadge> = {}): ResolvedBadge => ({
  id,
  name: `재료 ${id}`,
  image_url: `https://cdn.example/${id}.png`,
  rarity: 'rare',
  earned: true,
  ...overrides,
})

const scheduled: ResolvedRecipe = { state: 'scheduled', ingredient_count: 4, release_at: '2026-10-12T18:00:00+09:00' }
const released = (tiles: ResolvedBadge[]): ResolvedRecipe => ({
  state: 'released',
  ingredient_count: tiles.length,
  reward_points: 300,
  reward_badge_count: 1,
  tiles,
})

/** 홈이 그리는 방식 그대로: 표시 데이터(계측 정보 포함)를 만들어 `TodayCard`로 그린다. */
const draw = (card: TodayCardWithHref) => renderToStaticMarkup(<TodayCard view={toCardView(card, { now: NOW, tracking: true })} />)

/** 필수 정보 줄(`<p>`)의 글자 */
const factTexts = (html: string, colorClass: string) =>
  [...html.matchAll(new RegExp(`<p class="[^"]*${colorClass}[^"]*">([^<]*)</p>`, 'g'))].map((m) => m[1])

describe('공개 전 — brief (재료 수와 공개일만)', () => {
  const html = draw(makeCard({ resolved_recipe: scheduled }))

  it('64px 칸에 플라스크, 칩 「레시피 공개」, 제목, 두 줄, 이동 화살표가 있다', () => {
    expect(html).toContain('min-h-[88px]')
    expect(html).toContain(flask)
    expect(html).toContain('레시피 공개')
    expect(html).toContain('>새 레시피가 열려요</h3>')
    expect(factTexts(html, 'text-text-inverse/60')).toEqual(['재료 4개', '공개 10월 12일'])
    expect(html).toContain('›')
    // 카드 전체가 믹스 화면으로 가는 링크 하나다
    expect(html).toContain('href="/combine"')
  })

  it('타일·자물쇠·흐린 실루엣·「곧 공개」 표식을 그리지 않는다(레시피 이름·후보·보상도 없다)', () => {
    expect(html).not.toContain('<ul')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('grayscale')
    expect(html).not.toContain('곧 공개')
    expect(html).not.toContain('보상')
  })
})

describe('공개 전 — 운영자가 poster를 고른 경우', () => {
  it('같은 두 줄이 막 위 흰 글자로 보이고 타일은 없다', () => {
    const html = draw(makeCard({ shape: 'poster', cover_image_url: 'https://cdn.example/teaser.png', resolved_recipe: scheduled }))
    expect(factTexts(html, 'text-white')).toEqual(['재료 4개', '공개 10월 12일'])
    expect(html).toContain('레시피 공개')
    expect(html).not.toContain('<ul')
  })

  it('커버가 없으면 자리 표시 판에 플라스크 아이콘이다', () => {
    const html = draw(makeCard({ shape: 'poster', resolved_recipe: scheduled }))
    expect(html).toContain(renderToStaticMarkup(<FlaskIcon className="w-8 h-8 text-text/60" />))
  })
})

describe('공개 뒤 — list 타일형', () => {
  const tiles = [badge('a'), badge('b', { earned: false }), badge('c', { image_url: null }), badge('d', { earned: false })]
  const html = draw(makeCard({ resolved_recipe: released(tiles) }))

  it('타일이 슬롯 수만큼 있고, 이름은 대표 후보의 이름이다', () => {
    expect(html.match(/<li /g)).toHaveLength(4)
    for (const name of ['재료 a', '재료 b', '재료 c', '재료 d']) expect(html).toContain(`>${name}</p>`)
  })

  it('가진 후보의 슬롯은 컬러, 없는 슬롯은 첫 후보의 흑백이고 이름은 컬러다', () => {
    expect(html.match(/grayscale/g)).toHaveLength(2)
    expect(html).not.toMatch(/grayscale[^>]*>[^<]*<\/p>/)
  })

  it('그림이 없는 타일은 같은 칸에 플라스크 아이콘이다', () => {
    expect(html).toContain(flask)
  })

  it('정보 줄은 「재료 4개」·「보상 300 포인트 · 배지 1개」이고 「전체 보기」 끝 줄이 있다', () => {
    expect(factTexts(html, 'font-bold')).toEqual(['재료 4개', '보상 300 포인트 · 배지 1개'])
    expect(html).toContain('전체 보기')
    expect(html).toContain('href="/combine"')
  })

  it('「외 N개」·「+N」·겹침 표시를 만들지 않는다', () => {
    expect(html).not.toMatch(/외 \d+개|\+\d+/)
  })

  it('슬롯 10개도 자르지 않고 모두 그린다', () => {
    const ten = Array.from({ length: 10 }, (_, i) => badge(`t${i}`))
    const tenHtml = draw(makeCard({ resolved_recipe: released(ten) }))
    expect(tenHtml.match(/<li /g)).toHaveLength(10)
    expect(tenHtml).toContain('재료 10개')
  })
})

describe('공개 뒤 — poster·hero·square', () => {
  it.each(['poster', 'hero', 'square'] as const)('%s: 타일 줄 없이 정보 줄만 「재료 N개」·「보상 …」이다', (shape) => {
    const html = draw(makeCard({ shape, cover_image_url: 'https://cdn.example/c.png', resolved_recipe: released([badge('a'), badge('b')]) }))
    expect(html).not.toContain('<ul')
    expect(html).toContain('재료 2개')
    expect(html).toContain('보상 300 포인트 · 배지 1개')
  })
})

describe('레시피 줄이 없는 카드', () => {
  it.each([
    ['recipe_id 없음·레시피 없음·끝남·조회 실패(resolved_recipe가 null)', null],
    ['칼럼이 없는 환경(resolved_recipe가 undefined)', undefined],
  ])('%s: 정보 줄과 타일 없이 brief로 그려지고 홈이 던지지 않는다', (_label, value) => {
    const html = draw(makeCard({ resolved_recipe: value }))
    expect(html).toContain('min-h-[88px]')
    expect(html).toContain('레시피 공개')
    expect(html).toContain('>새 레시피가 열려요</h3>')
    expect(html).not.toContain('<ul')
    expect(html).not.toContain('재료')
    // 정보 줄 묶음(`mt-[var(--spacing-4)]` 아래 `<p>`)이 없다
    expect(html).not.toMatch(/<p class="[^"]*text-\[length:var\(--text-small\)\]/)
  })
})

describe('처음 보는 템플릿 값 (안전망)', () => {
  const unknown = (shape: string | null) =>
    makeCard({ template_type: 'future_template' as never, layout_type: 'other', title: '미래 카드', shape, cover_image_url: 'https://cdn.example/c.png' })

  it.each(['brief', 'hero', 'poster', 'square', 'list', null])('shape %s: 던지지 않고 제목이 그려진다', (shape) => {
    let html = ''
    expect(() => {
      html = draw(unknown(shape))
    }).not.toThrow()
    expect(html).toContain('미래 카드')
  })

  it('brief: 64px 칸은 빈 칸으로 남아 높이를 지키고, 비어 있는 칩 줄이 아래 여백만 남기지 않는다', () => {
    const html = draw(unknown('brief'))
    expect(html).toContain('w-16 h-16 shrink-0')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('mb-[var(--spacing-8)]')
  })
})
