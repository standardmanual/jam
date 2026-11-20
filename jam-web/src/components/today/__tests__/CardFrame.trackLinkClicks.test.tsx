/**
 * `CardFrame`이 트래커에 넘기는 값 — `trackLinkClicks` (티켓 20261121_0115, 목록형)
 *
 * 트래커는 표식 객체로 바꿔 `CardFrame`이 넘기는 값(`trackClick`·`clickOnLinksOnly`)과 카드 전체 `Link` 유무를 본다.
 *
 * 확인하는 것: 기본(기존 모든 카드)은 클릭을 세고 링크 위치를 따지지 않으며 카드 전체 `Link`가 있다. `link={false}`만이면 노출만(랭킹 행형과 같다).
 * `link={false}`+`trackLinkClicks`면 클릭을 세되 링크 안만 세고 카드 전체 `Link`는 없다(목록형). `link={true}`일 때 `trackLinkClicks`는 효과가 없다.
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/CardFrame.trackLinkClicks.test.tsx
 */
import { describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/today/TodayCardTracker', () => ({
  default: (props: Record<string, unknown>) => ({ __tracker: props }),
}))

import CardFrame from '../CardFrame'

function frame(options: { link?: boolean; trackLinkClicks?: boolean }): ReactElement<Record<string, unknown>> {
  const view = {
    resource: 'drop',
    shape: 'hero',
    title: '제목',
    imageUrl: null,
    href: '/drops',
    tracking: { cardId: 'card-1', contentTypeId: null, templateType: 'drop_alert', shape: 'hero' },
  } as never
  return CardFrame({ view, link: options.link, trackLinkClicks: options.trackLinkClicks, children: null as ReactNode }) as ReactElement<
    Record<string, unknown>
  >
}

describe('CardFrame — 트래커에 넘기는 값', () => {
  it('기본: 클릭을 세고 링크 위치는 따지지 않으며 카드 전체 Link가 있다', () => {
    const element = frame({})
    expect(element.props.trackClick).toBe(true)
    expect(element.props.clickOnLinksOnly).toBe(false)
    expect(element.props.children).not.toBeNull() // CardLink
  })

  it('link={false}만: 노출만 기록하고(trackClick=false) 카드 전체 Link가 없다 — 랭킹 행형과 같다', () => {
    const element = frame({ link: false })
    expect(element.props.trackClick).toBe(false)
    expect(element.props.clickOnLinksOnly).toBe(false)
    expect(element.props.children).toBeNull()
  })

  it('link={false} + trackLinkClicks: 클릭을 세되 링크 안만 세고 카드 전체 Link는 없다 — 목록형', () => {
    const element = frame({ link: false, trackLinkClicks: true })
    expect(element.props.trackClick).toBe(true)
    expect(element.props.clickOnLinksOnly).toBe(true)
    expect(element.props.children).toBeNull()
  })

  it('link={true}일 때 trackLinkClicks는 효과가 없다(카드 전체가 링크라 위치를 따지지 않는다)', () => {
    const element = frame({ link: true, trackLinkClicks: true })
    expect(element.props.trackClick).toBe(true)
    expect(element.props.clickOnLinksOnly).toBe(false)
  })
})
