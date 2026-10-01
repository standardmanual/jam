/**
 * `TodayCard` — 모양 선택과 새 틀이 그리는 모양 목록 (티켓 20261001_1458, 상위 20260930_1453 b2)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 확인한다.
 * 트래커는 표식 div로 바꿔 「그려졌는가」로 확인한다(`CardFrame.test.tsx`와 같은 방식).
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/app/(main)/TodayCardTracker', () => ({
  default: ({ cardId, children }: { cardId: string; children: ReactNode }) => <div data-tracker={cardId}>{children}</div>,
}))

import TodayCard, { RENDERED_SHAPES, isRenderedShape } from '../TodayCard'
import { CARD_SHAPES } from '@/lib/today/shape'
import type { CardView } from '@/lib/today/cardView'

const TRACKING = { cardId: 'card-1', contentTypeId: 'T05', templateType: 'drop_alert', shape: 'brief' } as const

const briefView = (overrides: Partial<Extract<CardView, { shape: 'brief' }>> = {}): CardView => ({
  shape: 'brief',
  resource: 'drop',
  title: '한강 번개 드랍',
  label: '드랍',
  ...overrides,
})

describe('RENDERED_SHAPES — 새 틀이 그리는 모양 목록', () => {
  it('지금은 brief 하나다(b3~b5가 모양을 더한다)', () => {
    expect([...RENDERED_SHAPES]).toEqual(['brief'])
  })

  it('모든 항목이 카드 모양 5개 안의 값이다', () => {
    for (const shape of RENDERED_SHAPES) expect(CARD_SHAPES).toContain(shape)
  })

  it('isRenderedShape: 목록의 모양만 true다', () => {
    expect(isRenderedShape('brief')).toBe(true)
    for (const shape of CARD_SHAPES.filter((s) => s !== 'brief')) expect(isRenderedShape(shape)).toBe(false)
    for (const value of ['large_thumbnail', 'Brief', ' brief', '', null, undefined, 1]) expect(isRenderedShape(value)).toBe(false)
  })
})

describe('TodayCard — 모양으로 모양 컴포넌트를 고른다', () => {
  it('brief는 짧은 소식 모양으로 그린다', () => {
    const html = renderToStaticMarkup(<TodayCard view={briefView()} />)
    expect(html).toContain('min-h-[88px]')
    expect(html).toContain('한강 번개 드랍')
  })

  it('목록에 없는 모양(hero·poster·square·list)은 아무것도 그리지 않는다', () => {
    const views: CardView[] = [
      { shape: 'hero', resource: 'article', title: '기사', imageUrl: null },
      { shape: 'poster', resource: 'mission', title: '포스터', imageUrl: null },
      { shape: 'square', resource: 'mission', title: '정사각', imageUrl: null },
      { shape: 'list', resource: 'badge', title: '목록', tiles: [{ name: '배지', imageUrl: null }] },
    ]
    for (const view of views) expect(renderToStaticMarkup(<TodayCard view={view} />)).toBe('')
  })

  it('계측 정보와 href가 있으면 틀이 트래커·링크를 걸고 눌림은 한 곳에만 있으며 끝에 ›가 보인다', () => {
    const html = renderToStaticMarkup(<TodayCard view={briefView({ href: '/drops', tracking: TRACKING })} />)
    expect(html).toContain('data-tracker="card-1"')
    expect(html).toContain('<a ')
    expect(html.match(/jam-press/g)).toHaveLength(1)
    expect(html).toContain('›')
  })

  it('계측 정보가 없으면(미리보기) 링크·트래커·눌림이 없고, href가 있으면 ›만 보인다', () => {
    const html = renderToStaticMarkup(<TodayCard view={briefView({ href: '/drops' })} />)
    expect(html).not.toContain('<a')
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('jam-press')
    expect(html).toContain('aria-hidden="true">›</span>')
  })

  it('href가 없으면 ›도 없다', () => {
    expect(renderToStaticMarkup(<TodayCard view={briefView()} />)).not.toContain('›')
  })
})
