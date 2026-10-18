/**
 * BadgeGridCard `locked` — 서비스 사본과 MODULAR 원본이 같은 가림 규칙을 지킨다 (티켓 20261018_0054 2회)
 *
 * 잠긴 개체는 열기 전에 이름·그림을 보여 주지 않는다(운영 로직 7.3절). 호출부가 실수로 이름과 그림 URL을 넘겨도
 * 컴포넌트가 막아야 하므로 «넘겨도 DOM에 없다»를 두 구현 모두에서 확인한다. 저장소에 jsdom이 없어 서버 렌더로 본다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import ServiceBadgeGridCard from '../BadgeGridCard'
import { BadgeGridCard as DsBadgeGridCard } from '@ds/components/patterns/BadgeGridCard'
import { d } from '@/lib/i18n'

const SECRET_NAME = '새어 나가면 안 되는 이름'
const SECRET_IMAGE = 'https://example.com/secret-badge.png'

const implementations = [
  { label: '서비스', render: (props: Record<string, unknown>) => renderToStaticMarkup(<ServiceBadgeGridCard rarity="epic" {...props} />) },
  { label: 'MODULAR', render: (props: Record<string, unknown>) => renderToStaticMarkup(<DsBadgeGridCard rarity="epic" {...props} />) },
]

describe.each(implementations)('BadgeGridCard locked — $label', ({ render }) => {
  it('이름과 그림 URL이 넘어와도 DOM에 없고 가린 이름이 나온다', () => {
    const html = render({ locked: true, name: SECRET_NAME, imageUrl: SECRET_IMAGE, fillPercent: 40 })
    expect(html).not.toContain(SECRET_NAME)
    expect(html).not.toContain('secret-badge')
    expect(html).not.toContain('<img')
    expect(html).toContain(d.lockedItem.card.name)
  })

  it('잠금 타일(자물쇠)과 게이지가 있고 진행 수치 글자는 없다', () => {
    const html = render({ locked: true, fillPercent: 40 })
    expect(html).toContain('<svg')
    // 게이지 채움은 비율만 쓴다 — 40이 글자로 나오지 않는다
    expect(html).toContain('--ds-progress-fill:40%')
    expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/\d/)
  })

  it('locked가 아니면 기존 모양 그대로이고 게이지가 없다', () => {
    const html = render({ name: '첫 러닝', imageUrl: null })
    expect(html).toContain('첫 러닝')
    expect(html).not.toContain('--ds-progress-fill')
  })

  it('locked이면 반복 획득 ×N을 그리지 않는다', () => {
    const html = render({ locked: true, count: 3 })
    expect(html).not.toContain('×3')
  })
})
