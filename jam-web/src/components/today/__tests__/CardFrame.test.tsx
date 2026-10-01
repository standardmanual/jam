/**
 * 카드 틀(`CardFrame`) 렌더 테스트 (티켓 20261001_1458, 상위 20260930_1453 b2)
 *
 * 접근·계측 겹이 모양을 모른 채 계측 정보(`tracking`)와 이동 대상(`href`)만으로 트래커·링크·눌림·포커스 윤곽선을 거는지 고정한다.
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 확인하고, 계측은 `TodayCardTracker`를
 * 표식 div로 바꿔 「그려졌는가」와 넘긴 값으로 확인한다 — 노출 보고(`IntersectionObserver`)와 클릭 보고(`/api/today/events`·GA)는
 * 모두 이 컴포넌트 안에서만 일어난다.
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
  default: (props: {
    cardId: string
    contentTypeId?: string | null
    templateType?: string
    shape?: string | null
    children: ReactNode
  }) => (
    <div
      data-tracker={props.cardId}
      data-content-type={props.contentTypeId ?? ''}
      data-template={props.templateType ?? ''}
      data-shape={props.shape ?? ''}
    >
      {props.children}
    </div>
  ),
}))

import CardFrame from '../CardFrame'
import type { BriefCardView } from '@/lib/today/cardView'

const TRACKING = { cardId: 'card-1', contentTypeId: 'T05', templateType: 'drop_alert', shape: 'brief' } as const

function makeView(overrides: Partial<BriefCardView> = {}): BriefCardView {
  return { shape: 'brief', resource: 'drop', title: '한강 번개 드랍', ...overrides }
}

const render = (view: BriefCardView) =>
  renderToStaticMarkup(
    <CardFrame view={view}>
      <p>안쪽 모양</p>
    </CardFrame>,
  )

describe('CardFrame — 계측 정보(tracking)가 없으면 안쪽만 그린다(미리보기)', () => {
  it('href가 있어도 트래커·링크·눌림·포커스 윤곽선이 모두 없다', () => {
    const html = render(makeView({ href: '/drops' }))
    expect(html).toBe('<p>안쪽 모양</p>')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('data-tracker')
    expect(html).not.toContain('jam-press')
    expect(html).not.toContain('focus-visible')
  })

  it('href가 없어도 래퍼 없이 안쪽만 그린다', () => {
    expect(render(makeView())).toBe('<p>안쪽 모양</p>')
  })
})

describe('CardFrame — tracking과 href가 모두 있으면 트래커 안에 링크를 둔다', () => {
  const html = render(makeView({ href: '/drops', tracking: TRACKING }))

  it('트래커가 카드 ID·유형 ID·템플릿·그려진 모양을 받는다', () => {
    expect(html).toContain('data-tracker="card-1"')
    expect(html).toContain('data-content-type="T05"')
    expect(html).toContain('data-template="drop_alert"')
    expect(html).toContain('data-shape="brief"')
  })

  it('링크는 트래커 안쪽에 있고 안쪽 모양을 감싼다', () => {
    expect(html.indexOf('data-tracker')).toBeLessThan(html.indexOf('<a '))
    expect(html).toMatch(/<a [^>]*href="\/drops"[^>]*><p>안쪽 모양<\/p><\/a>/)
  })

  it('링크는 블록 요소이고 둥근 윤곽·눌림·focus-visible 윤곽선(2px·오프셋 2px·--color-primary) 클래스를 가진다', () => {
    expect(html).toContain(
      'class="block rounded-[var(--radius-cards)] jam-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-primary)]"',
    )
  })

  it('눌림은 링크 하나에만 붙는다(이중 축소 없음)', () => {
    expect(html.match(/jam-press/g)).toHaveLength(1)
  })

  it('홈에서 색이 비는 Tailwind outline-primary를 쓰지 않고, 링크에 aria-label을 달지 않는다', () => {
    expect(html).not.toContain('outline-primary')
    expect(html).not.toContain('aria-label')
  })
})

describe('CardFrame — 한쪽만 있을 때', () => {
  it('tracking은 있고 href가 없으면 트래커는 그리되 링크·눌림은 없다', () => {
    const html = render(makeView({ tracking: TRACKING }))
    expect(html).toContain('data-tracker="card-1"')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('jam-press')
  })

  it('유형 ID가 없는 카드(null)도 트래커에 빈 값으로 넘어간다', () => {
    const html = render(makeView({ href: '/drops', tracking: { ...TRACKING, contentTypeId: null } }))
    expect(html).toContain('data-content-type=""')
  })
})
