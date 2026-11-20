/**
 * 컬렉션 소개의 모션 래퍼 `FeedCollectionBurst` (티켓 20261121_0115, 상위 20261120_2026 4회차-3)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 훅(`useState`·`useRef`·`useEffect`)을 슬롯 배열로 바꿔 컴포넌트 함수를 직접 부르고,
 * 관찰자(`IntersectionObserver`)·`requestAnimationFrame`·`matchMedia`는 가짜로 대신한다(`TodayCardTracker.test.tsx`와 같은 방식).
 *
 * 확인하는 것: ① 처음(스크립트 도착 전)은 퍼진 모습 ② 관찰자 임계값 0.55이고 **카드 루트 요소**를 관찰하며(영역이 아니다, 표식 조상이 없으면 영역) 노출 계측 관찰자(50%)와 별개 ③ 55% 넘게 보이면 퍼지고 완전히 나가면 모이고 다시 들어오면 재생
 ④ 이미 보이는 채로 도착해도 «모인 모습 → 한 프레임 뒤 퍼짐»이 재생 ⑤ 동작 줄이기·관찰자 없음이면 관찰자를 만들지 않고 전환이 없다 ⑥ transform·opacity만 쓴다 ⑦ 해제.
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/FeedCollectionBurst.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  index: 0,
  effects: [] as (() => void | (() => void))[],
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useRef: (initial: unknown) => {
      const i = hooks.index++
      if (!(i in hooks.slots)) hooks.slots[i] = { current: initial }
      return hooks.slots[i]
    },
    useState: (initial: unknown) => {
      const i = hooks.index++
      if (!(i in hooks.slots)) hooks.slots[i] = initial
      return [hooks.slots[i], (next: unknown) => (hooks.slots[i] = next)]
    },
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect)
    },
  }
})

import FeedCollectionBurst, { burstBadgeStyle, nextBurstView, INITIAL_BURST_VIEW, type FeedBurstBadge } from '../feed/FeedCollectionBurst'
import { FEED_BURST, FEED_CARD_ROOT_ATTR, FEED_MOTION } from '@/lib/today/feedConstants'

const BADGES: FeedBurstBadge[] = [
  { imageUrl: '/b1.png', x: -0.69, y: -0.25, tilt: 8, size: 80, delayMs: 70 },
  { imageUrl: '/b2.png', x: -0.52, y: 0.65, tilt: -14, size: 68, delayMs: 140 },
  { imageUrl: '/b3.png', x: 0.64, y: -0.63, tilt: -9, size: 72, delayMs: 100 },
  { imageUrl: '/b4.png', x: 0.69, y: 0.4, tilt: 12, size: 84, delayMs: 210 },
]

interface ObserverStub {
  callback: (entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void
  options: { threshold: number[] }
  observe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}
let observers: ObserverStub[] = []
let frames: (() => void)[] = []
const cancelAnimationFrame = vi.fn()

beforeEach(() => {
  hooks.slots = []
  hooks.index = 0
  hooks.effects = []
  observers = []
  frames = []
  cancelAnimationFrame.mockClear()
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
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

type Child = ReactElement<{ style: Record<string, string | number>; 'aria-hidden'?: string }>

/** 카드 루트 표식을 가진 가짜 조상. 영역 요소의 `closest`가 이것을 돌려준다. */
const cardRoot = { name: 'card-root' }
const area = { closest: vi.fn((selector: string): unknown => (selector === `[${FEED_CARD_ROOT_ATTR}]` ? cardRoot : null)) }

/** 훅 순서를 처음으로 돌리고 컴포넌트를 불러 돌려받은 영역 요소를 얻는다. 영역 요소의 ref에는 가짜 요소를 단다. */
function render(): ReactElement<{ children: [Child[], unknown] }> {
  hooks.index = 0
  hooks.effects = []
  const element = FeedCollectionBurst({ badges: BADGES, children: null }) as ReactElement<{ children: [Child[], unknown] }>
  const areaRef = hooks.slots[0] as { current: unknown }
  if (!areaRef.current) areaRef.current = area
  return element
}

/** 지금 상태를 다시 그려 배지 스타일들을 얻는다. */
const badgeStyles = () => render().props.children[0].map((child) => child.props.style)

function mountWithObserver() {
  render()
  hooks.effects[0]()
  expect(observers).toHaveLength(1)
  return observers[0]
}

const SPREAD = (badge: FeedBurstBadge) => `translate(calc(${badge.x} * 50cqw), calc(${badge.y} * 50cqh)) rotate(${badge.tilt}deg) scale(1)`
const COLLECTED = 'translate(0px, 0px) rotate(0deg) scale(0.3)'

describe('FeedCollectionBurst — 기본 모습', () => {
  it('스크립트가 도착하기 전(처음 그린 결과)은 퍼진 모습이고 전환이 없다', () => {
    const styles = badgeStyles()
    expect(styles).toHaveLength(4)
    styles.forEach((style, index) => {
      expect(style.transform).toBe(SPREAD(BADGES[index]))
      expect(style.opacity).toBe(1)
      expect(style.transition).toBe('none')
    })
  })

  it('배지는 aria-hidden이다', () => {
    const [badges] = render().props.children
    for (const badge of badges) expect(badge.props['aria-hidden']).toBe('true')
  })
})

describe('FeedCollectionBurst — 관찰자', () => {
  it('임계값에 0.55가 있고 영역(높이 240)이 아니라 카드 루트 요소를 관찰한다(노출 계측의 50% 관찰자와 별개의 관찰자다)', () => {
    const observer = mountWithObserver()
    expect(FEED_BURST.visibleRatio).toBe(0.55)
    expect(observer.options.threshold).toContain(0.55)
    expect(observer.options.threshold).not.toContain(0.5)
    expect(area.closest).toHaveBeenCalledWith('[data-feed-card-root]')
    expect(observer.observe).toHaveBeenCalledTimes(1)
    expect(observer.observe).toHaveBeenCalledWith(cardRoot)
    expect(observer.observe).not.toHaveBeenCalledWith(area)
  })

  it('카드 루트 표식을 가진 조상이 없으면 영역 요소를 관찰한다(단독으로 쓸 때)', () => {
    render()
    const slot = hooks.slots[0] as { current: unknown }
    const alone = { closest: vi.fn(() => null) }
    slot.current = alone
    hooks.effects[0]()
    expect(observers[0].observe).toHaveBeenCalledWith(alone)
  })

  it('첫 결과가 «화면 밖»이면 모인 모습을 전환 없이 걸고 그대로 둔다', () => {
    const observer = mountWithObserver()
    observer.callback([{ isIntersecting: false, intersectionRatio: 0 }])
    badgeStyles().forEach((style) => {
      expect(style.transform).toBe(COLLECTED)
      expect(style.opacity).toBe(0)
      expect(style.transition).toBe('none')
    })
    expect(frames).toHaveLength(0)
  })

  it('모인 상태에서 55% 넘게 들어오면 퍼지고(전환 0.72초·지연 70~210ms·탄성 곡선) 불투명도 1이다', () => {
    const observer = mountWithObserver()
    observer.callback([{ isIntersecting: false, intersectionRatio: 0 }])
    observer.callback([{ isIntersecting: true, intersectionRatio: 0.56 }])
    badgeStyles().forEach((style, index) => {
      expect(style.transform).toBe(SPREAD(BADGES[index]))
      expect(style.opacity).toBe(1)
      expect(style.transition).toBe(
        `transform ${FEED_MOTION.durationSeconds}s ${FEED_MOTION.easing} ${BADGES[index].delayMs}ms, opacity ${FEED_BURST.opacitySeconds}s ease-out ${BADGES[index].delayMs}ms`,
      )
    })
    expect(FEED_MOTION.easing).toBe('cubic-bezier(0.2, 1.5, 0.4, 1)')
    expect(FEED_MOTION.durationSeconds).toBe(0.72)
  })

  it('55% 이하로 일부만 보이면 상태를 바꾸지 않는다(모인 채)', () => {
    const observer = mountWithObserver()
    observer.callback([{ isIntersecting: false, intersectionRatio: 0 }])
    observer.callback([{ isIntersecting: true, intersectionRatio: 0.3 }])
    badgeStyles().forEach((style) => expect(style.transform).toBe(COLLECTED))
  })

  it('퍼진 채 일부만 걸쳐 보이는 동안(나가는 중)은 그대로 퍼져 있고 완전히 나가면 다시 모인다', () => {
    const observer = mountWithObserver()
    observer.callback([{ isIntersecting: false, intersectionRatio: 0 }])
    observer.callback([{ isIntersecting: true, intersectionRatio: 0.9 }])
    observer.callback([{ isIntersecting: true, intersectionRatio: 0.4 }])
    badgeStyles().forEach((style, index) => expect(style.transform).toBe(SPREAD(BADGES[index])))
    observer.callback([{ isIntersecting: false, intersectionRatio: 0 }])
    badgeStyles().forEach((style) => {
      expect(style.transform).toBe(COLLECTED)
      expect(style.opacity).toBe(0)
      expect(style.transition).not.toBe('none') // 모이는 것도 전환이다
    })
  })

  it('다시 들어오면 재생한다(모임 → 퍼짐을 반복)', () => {
    const observer = mountWithObserver()
    observer.callback([{ isIntersecting: false, intersectionRatio: 0 }])
    for (let round = 0; round < 3; round++) {
      observer.callback([{ isIntersecting: true, intersectionRatio: 0.8 }])
      badgeStyles().forEach((style, index) => expect(style.transform).toBe(SPREAD(BADGES[index])))
      observer.callback([{ isIntersecting: false, intersectionRatio: 0 }])
      badgeStyles().forEach((style) => expect(style.transform).toBe(COLLECTED))
    }
  })

  it('이미 55% 넘게 보이는 채로 도착해도 모인 모습을 먼저 걸고 두 프레임 뒤 퍼진다', () => {
    const observer = mountWithObserver()
    observer.callback([{ isIntersecting: true, intersectionRatio: 1 }])
    badgeStyles().forEach((style) => {
      expect(style.transform).toBe(COLLECTED)
      expect(style.transition).toBe('none')
    })
    expect(frames).toHaveLength(1)
    frames.shift()!()
    expect(frames).toHaveLength(1)
    frames.shift()!()
    badgeStyles().forEach((style, index) => {
      expect(style.transform).toBe(SPREAD(BADGES[index]))
      expect(style.transition).not.toBe('none')
    })
  })

  it('정리하면 예약한 프레임을 취소하고 관찰을 끝낸다', () => {
    render()
    const cleanup = hooks.effects[0]() as () => void
    cleanup()
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
})

describe('FeedCollectionBurst — 동작 줄이기', () => {
  it('동작 줄이기가 켜져 있으면 관찰자를 만들지 않아 퍼진 모습 그대로이고 전환이 없다', () => {
    vi.stubGlobal('window', { matchMedia: (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }) })
    render()
    hooks.effects[0]()
    expect(observers).toHaveLength(0)
    badgeStyles().forEach((style, index) => {
      expect(style.transform).toBe(SPREAD(BADGES[index]))
      expect(style.opacity).toBe(1)
      expect(style.transition).toBe('none')
    })
  })

  it('동작 줄이기가 꺼져 있으면(matchMedia가 false) 관찰자를 만든다', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    mountWithObserver()
  })

  it('IntersectionObserver가 없는 환경은 관찰자 없이 퍼진 모습 그대로다', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render()
    hooks.effects[0]()
    expect(observers).toHaveLength(0)
    badgeStyles().forEach((style) => expect(style.opacity).toBe(1))
  })
})

describe('burstBadgeStyle·nextBurstView — 순수 함수', () => {
  it('transform·opacity만 전환한다', () => {
    const style = burstBadgeStyle(BADGES[0], { phase: 'spread', animate: true })
    expect(String(style.transition)).toMatch(/^transform [\d.]+s .+ \d+ms, opacity [\d.]+s ease-out \d+ms$/)
    expect(String(style.transition)).not.toMatch(/(?:left|top|margin|width|height)/)
  })

  it('퍼진 모습과 모인 모습은 변환 함수 목록(translate → rotate → scale)이 같아 보간된다', () => {
    const order = /^translate\(.+\) rotate\(.+\) scale\(.+\)$/
    expect(String(burstBadgeStyle(BADGES[0], { phase: 'spread', animate: true }).transform)).toMatch(order)
    expect(String(burstBadgeStyle(BADGES[0], { phase: 'collected', animate: true }).transform)).toMatch(order)
  })

  it('배지는 영역 가운데에서 시작한다(left·top 50%, 한 변의 절반만큼 당김)', () => {
    const style = burstBadgeStyle(BADGES[0], INITIAL_BURST_VIEW)
    expect(style).toMatchObject({ left: '50%', top: '50%', width: 80, height: 80, marginLeft: -40, marginTop: -40 })
  })

  it('nextBurstView: 경계값(정확히 0.55)은 퍼짐이다', () => {
    const armedSpread = nextBurstView({ isIntersecting: true, intersectionRatio: 0.55 }, { phase: 'collected', animate: true }, true)
    expect(armedSpread.view.phase).toBe('spread')
    const below = nextBurstView({ isIntersecting: true, intersectionRatio: 0.54 }, { phase: 'collected', animate: true }, true)
    expect(below.view.phase).toBe('collected')
  })
})
