/**
 * 투데이 카드 트래커의 «링크 안 클릭만 세기» (티켓 20261121_0115, 목록형)
 *
 * 목록형은 카드 전체 링크가 없고 항목·화살표 링크가 각자 있어, 카드 전체 링크를 끄면 클릭 계측도 꺼지는 틀(`link={false}`)을 그대로 쓸 수 없다.
 * 이 파일은 새 선택 입력 `clickOnLinksOnly`의 동작과 **기존 카드의 동작이 그대로**임을 고정한다(기존 시험 `TodayCardTracker.test.tsx`는 수정하지 않았다).
 * 훅은 `TodayCardTracker.test.tsx`와 같은 방식으로 바꿔 컴포넌트 함수를 직접 부른다. `CardFrame`이 이 값을 넘기는 쪽은 `CardFrame.trackLinkClicks.test.tsx`가 본다.
 *
 * 확인하는 것: ① `clickOnLinksOnly`면 링크(앵커) 안의 클릭만 서버·GA로 보내고 제목·빈 곳의 클릭은 안 보낸다 ② 생략(기본)이면 클릭 위치와 상관없이 지금처럼 센다(기존 카드 무변경)
 * ③ `trackClick={false}`면 여전히 클릭 핸들러가 없다.
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/TodayCardTracker.itemLinks.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const refHolder: { current: unknown } = { current: null }

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useRef: () => refHolder, useEffect: () => undefined }
})

const trackEvent = vi.fn()
vi.mock('@/lib/analytics/gtag', () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }))

import TodayCardTracker from '../TodayCardTracker'

const sendBeacon = vi.fn(() => true)

beforeEach(() => {
  refHolder.current = {}
  trackEvent.mockClear()
  sendBeacon.mockClear()
  vi.stubGlobal('navigator', { sendBeacon })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

type TrackerProps = Parameters<typeof TodayCardTracker>[0]
type ClickEvent = { target: unknown }

function mount(props: Partial<TrackerProps> = {}): ReactElement<{ onClick?: (event?: ClickEvent) => void }> {
  return TodayCardTracker({ cardId: 'card-1', children: null, ...props }) as ReactElement<{ onClick?: (event?: ClickEvent) => void }>
}

/** 요소 흉내: `closest('a')`가 앵커 안이면 truthy */
const insideLink = { closest: (selector: string) => (selector === 'a' ? {} : null) }
const outsideLink = { closest: () => null }
const textNode = {}

describe('TodayCardTracker — clickOnLinksOnly', () => {
  it('링크 안의 클릭은 서버와 GA로 보낸다', () => {
    mount({ clickOnLinksOnly: true, templateType: 'drop_alert' }).props.onClick!({ target: insideLink })
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('today_card_click', expect.objectContaining({ card_id: 'card-1', template_type: 'drop_alert' }))
  })

  it('링크 밖의 클릭(제목·빈 곳)은 보내지 않는다', () => {
    mount({ clickOnLinksOnly: true }).props.onClick!({ target: outsideLink })
    mount({ clickOnLinksOnly: true }).props.onClick!({ target: textNode })
    mount({ clickOnLinksOnly: true }).props.onClick!({ target: null })
    mount({ clickOnLinksOnly: true }).props.onClick!()
    expect(sendBeacon).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('기본값(생략)이면 클릭 위치를 보지 않고 센다 — 기존 카드는 그대로다', () => {
    for (const event of [undefined, { target: outsideLink }, { target: textNode }, { target: insideLink }]) {
      sendBeacon.mockClear()
      mount().props.onClick!(event)
      expect(sendBeacon).toHaveBeenCalledTimes(1)
    }
  })

  it('trackClick이 false면 clickOnLinksOnly와 상관없이 클릭 핸들러가 없다(랭킹 행형)', () => {
    expect(mount({ trackClick: false }).props.onClick).toBeUndefined()
    expect(mount({ trackClick: false, clickOnLinksOnly: true }).props.onClick).toBeUndefined()
  })
})
