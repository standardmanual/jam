/**
 * 배지 연출 오버레이의 요약 한 줄(`summaryMessage`) — 헤더와 라이브 리전 (티켓 20261025_2050)
 *
 * 동기화로 배지를 받았을 때 «이번에 잼 {n}만큼 받았어요»를 카드 위 헤더 패널에 얹는다. 배지 개수 공지를 대신하지 않고 뒤에 잇는다.
 * `resultMessage`(캡슐 열기 결과)의 뜻은 바꾸지 않는다.
 *
 * 저장소에 jsdom이 없어(vitest `environment: 'node'`) 서버 렌더로 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/BadgeRevealOverlay.summary.test.tsx
 */
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))

import BadgeRevealOverlay, { type RevealBadge } from '@/components/BadgeRevealOverlay'
import { d, t } from '@/lib/i18n'

const ITEMS: RevealBadge[] = [
  { id: 'a', name: '들꽃', description: '길가에서 만났어요', imageUrl: null, rarity: 'common' },
  { id: 'b', name: '바람의 깃', description: '바람이 부는 날', imageUrl: null, rarity: 'rare' },
]
const SUMMARY = '이번에 잼 1,240만큼 받았어요'
/** 헤더 패널만 가진 모서리 값(카드도 `--surface` 면을 쓰므로 면 색으로는 가를 수 없다) */
const HEADER_PANEL = 'border-radius:0 0 var(--radius-2xl) var(--radius-2xl)'

interface RenderOptions {
  summaryMessage?: string
  resultMessage?: string
  emptyMessage?: string
  items?: RevealBadge[]
  moreCount?: number
  open?: boolean
}

const render = ({ items = ITEMS, open = true, ...over }: RenderOptions = {}) =>
  renderToStaticMarkup(<BadgeRevealOverlay open={open} items={items} profileHref="/profile" onClose={() => {}} {...over} />)

/** 라이브 리전(`aria-live`) 안의 글자만 꺼낸다 */
const liveRegionText = (html: string) => /<div aria-live="polite" aria-atomic="true" class="sr-only">([^<]*)<\/div>/.exec(html)?.[1] ?? null

describe('BadgeRevealOverlay summaryMessage — 헤더', () => {
  it('요약 줄을 카드 위 헤더 패널 한 줄로 그린다', () => {
    const html = render({ summaryMessage: SUMMARY })
    expect(html).toContain(`>${SUMMARY}</p>`)
    expect(html).toContain(HEADER_PANEL)
    expect(html).toContain('break-keep wrap-break-word text-balance')
  })

  it('요약 줄이 없으면 헤더 패널이 없다(지금 그대로)', () => {
    const html = render()
    expect(html).not.toContain(HEADER_PANEL)
    expect(html).not.toContain('이번에 잼')
  })

  it('요약 줄이 빈 글자여도 헤더 패널을 그리지 않는다', () => {
    expect(render({ summaryMessage: '' })).not.toContain(HEADER_PANEL)
  })

  it('요약 줄을 그려도 카드는 그대로 나온다', () => {
    const html = render({ summaryMessage: SUMMARY })
    expect(html).toContain('들꽃')
    expect(html).toContain('바람의 깃')
  })

  it('resultMessage가 있으면 resultMessage가 이기고 요약은 그리지 않는다', () => {
    const result = t(d.capsule.claimResult, { n: 2 })
    const html = render({ resultMessage: result, summaryMessage: SUMMARY })
    expect(html).toContain(`>${result}</p>`)
    expect(html).not.toContain(SUMMARY)
  })
})

describe('BadgeRevealOverlay — «N 포인트» 조각 색 (티켓 20261104_2319)', () => {
  const POINT_SPAN = /<span class="text-point-text"[^>]*>1,240 포인트<\/span>/

  it('헤더 패널 문구의 포인트 조각만 point-text 오렌지로 칠하고 음성 안내 문자열은 그대로 둔다', () => {
    const summary = '이번에 1,240 포인트 받았어요'
    const html = render({ summaryMessage: summary })
    expect(html).toMatch(POINT_SPAN)
    expect(html).toContain('이번에 <span class="text-point-text"')
    expect(liveRegionText(html)).toBe(`배지 2개를 획득했어요. ${summary}`)
  })

  it('결과가 비었을 때 보여 주는 문구(emptyMessage)의 포인트 조각도 칠한다', () => {
    const html = render({ items: [], emptyMessage: '1,240 포인트는 돌려드렸어요' })
    expect(html).toMatch(POINT_SPAN)
    expect(html).toContain('</span>는 돌려드렸어요</p>')
  })

  it('포인트 조각이 없는 문구는 칠하지 않는다', () => {
    expect(render({ summaryMessage: SUMMARY })).not.toContain('text-point-text')
  })
})

describe('BadgeRevealOverlay summaryMessage — 라이브 리전', () => {
  it('배지 개수 뒤에 요약을 이어 읽는다', () => {
    expect(liveRegionText(render({ summaryMessage: SUMMARY }))).toBe(`배지 2개를 획득했어요. ${SUMMARY}`)
  })

  it('상세를 싣지 못한 잔여 개수도 개수에 더한다', () => {
    expect(liveRegionText(render({ summaryMessage: SUMMARY, moreCount: 3 }))).toBe(`배지 5개를 획득했어요. ${SUMMARY}`)
  })

  it('요약이 없으면 개수 공지만 읽는다(지금 그대로)', () => {
    expect(liveRegionText(render())).toBe(t(d.badgeReveal.opened, { count: 2 }))
  })

  it('resultMessage가 있으면 라이브 리전은 지금처럼 resultMessage만 읽는다', () => {
    const result = t(d.capsule.claimResult, { n: 2 })
    expect(liveRegionText(render({ resultMessage: result, summaryMessage: SUMMARY }))).toBe(result)
  })

  it('닫혀 있으면 아무것도 읽지 않는다', () => {
    expect(liveRegionText(render({ open: false, summaryMessage: SUMMARY }))).toBe('')
  })
})
