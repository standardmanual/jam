/**
 * 투데이 카드 트래커 (티켓 20261001_2244, 상위 20260930_1453 조각 b7)
 *
 * 트래커는 `CardFrame`이 카드를 감싸는 클라이언트 컴포넌트이고, 클릭하면 `/api/today/events`로 클릭을 보내는 것과 GA `today_card_click`을
 * 함께 보내는 줄이 컴포넌트 안에 있다. 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더로는 이벤트 핸들러를 부를 수 없으므로,
 * 훅(`useRef`·`useEffect`)을 바꿔 컴포넌트 함수를 직접 호출해 돌려받은 요소의 `onClick`을 부르고 노출 관찰자(`IntersectionObserver`)는 가짜로 대신한다.
 *
 * 확인하는 것: ① 클릭 → 서버 전송 + GA `today_card_click`(파라미터 4개: card_id·content_type_id·template_type·shape) ② `trackClick={false}`면
 * 클릭 핸들러가 없다(랭킹 행형: 노출만) ③ 화면에 50% 이상 보이면 노출을 한 번 보내고 관찰을 끝낸다 ④ 값이 없는 칸은 null로 간다.
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/TodayCardTracker.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const effects: (() => void | (() => void))[] = []
const refHolder: { current: unknown } = { current: null }

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useRef: () => refHolder,
    useEffect: (effect: () => void | (() => void)) => {
      effects.push(effect)
    },
  }
})

const trackEvent = vi.fn()
vi.mock('@/lib/analytics/gtag', () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }))

import TodayCardTracker from '../TodayCardTracker'

const sendBeacon = vi.fn(() => true)

interface ObserverStub {
  callback: (entries: { isIntersecting: boolean }[]) => void
  options: { threshold: number }
  observe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}
let observers: ObserverStub[] = []

beforeEach(() => {
  effects.length = 0
  observers = []
  refHolder.current = {}
  trackEvent.mockClear()
  sendBeacon.mockClear()
  vi.stubGlobal('navigator', { sendBeacon })
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: ObserverStub['callback'], options: ObserverStub['options']) {
        const stub: ObserverStub = { callback, options, observe: vi.fn(), disconnect: vi.fn() }
        observers.push(stub)
        return Object.assign(this, stub)
      }
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

type TrackerProps = Parameters<typeof TodayCardTracker>[0]

/** 컴포넌트 함수를 직접 불러 돌려받은 요소(`<div onClick>`)를 얻는다. */
function mount(props: Partial<TrackerProps> = {}): ReactElement<{ onClick?: () => void }> {
  return TodayCardTracker({ cardId: 'card-1', children: null, ...props }) as ReactElement<{ onClick?: () => void }>
}

/** 카드가 보내는 이벤트 이름들(sendBeacon 본문은 Blob이라 호출 인자 개수만 본다). */
const beaconUrls = () => sendBeacon.mock.calls.map((call) => (call as unknown as [string])[0])

describe('TodayCardTracker — 클릭', () => {
  it('클릭하면 서버에 클릭을 보내고 GA today_card_click을 4개 파라미터와 함께 보낸다', () => {
    const element = mount({ cardId: 'card-1', contentTypeId: 'T05', templateType: 'badge_spotlight', shape: 'hero' })
    expect(element.props.onClick).toBeTypeOf('function')

    element.props.onClick!()

    expect(beaconUrls()).toEqual(['/api/today/events'])
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('today_card_click', {
      card_id: 'card-1',
      content_type_id: 'T05',
      template_type: 'badge_spotlight',
      shape: 'hero',
    })
  })

  it('값이 없는 유형·템플릿·모양은 빈 값이 아니라 null로 보낸다', () => {
    mount({ cardId: 'card-2' }).props.onClick!()
    expect(trackEvent).toHaveBeenCalledWith('today_card_click', {
      card_id: 'card-2',
      content_type_id: null,
      template_type: null,
      shape: null,
    })
  })

  it('trackClick이 false면 클릭 핸들러가 없다(랭킹 행형은 노출만 기록한다)', () => {
    const element = mount({ trackClick: false })
    expect(element.props.onClick).toBeUndefined()
    expect(trackEvent).not.toHaveBeenCalled()
    expect(sendBeacon).not.toHaveBeenCalled()
  })
})

describe('TodayCardTracker — 노출', () => {
  it('화면에 50% 이상 보이면 노출을 한 번 보내고 관찰을 끝낸다', () => {
    mount({ cardId: 'card-1' })
    expect(effects).toHaveLength(1)
    effects[0]()

    expect(observers).toHaveLength(1)
    expect(observers[0].options).toEqual({ threshold: 0.5 })
    expect(observers[0].observe).toHaveBeenCalledWith(refHolder.current)

    observers[0].callback([{ isIntersecting: false }])
    expect(sendBeacon).not.toHaveBeenCalled()

    observers[0].callback([{ isIntersecting: true }])
    expect(beaconUrls()).toEqual(['/api/today/events'])
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
    // 노출은 GA로 보내지 않는다(GA는 클릭만)
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('이 카드의 노출을 이미 보고했다면(세션당 카드당 1회) 관찰을 시작하지 않는다', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => '1', setItem: vi.fn() })
    mount({ cardId: 'card-1' })
    effects[0]()
    expect(observers).toHaveLength(0)
  })
})
