/**
 * 캡슐 게이지 진입 모션의 시작 조건 (티켓 20261031_1806)
 *
 * 진입 모션은 «마운트 후 260ms»가 아니라 «트랙이 절반 이상 보일 때 + 260ms»에 시작한다. 훅 실행기로 효과를 돌리고
 * `IntersectionObserver`는 가짜로 대신한다.
 *
 * 고정하는 것
 *  - 이미 보임: 관찰자의 첫 콜백이 보임을 알리면 260ms 뒤 2%에서 지금 값으로 1,500ms 동안 옮겨 간다.
 *  - 나중에 보임: 보이기 전에는 시간이 흘러도 2%에 머물고, 보인 때부터 260ms+1,500ms다. 절반 미만은 보임이 아니다.
 *  - 한 방문에 한 번: 시작하면 관찰자를 해제하고, 보임 신호가 다시 와도 되돌아가거나 반복하지 않는다.
 *  - 관찰자 없음(시험·구형): 지금처럼 즉시 시작한다.
 *  - 모션 줄이기: 보이는 즉시 끝 값이고 이동 시간이 0이다.
 *  - 값이 0이면 관찰자를 만들지 않고 모션도 없다.
 *  - 정리: 관찰 대기 중 사라지면 관찰자를 해제하고 타이머도 걷는다. 관찰 대상은 게이지 바깥 트랙이다.
 *
 * 실행: cd jam-web && npx vitest run src/components/capsule/CapsuleGauge.entry.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 훅 실행기는 null로 시작하는 ref를 {current: null}로 둔다 — 요소가 붙은 것처럼 가짜 요소를 채워 준다
vi.mock('react', async (importOriginal) => {
  const base = (await import('./__tests__/hookRunner')).mockReact(await importOriginal<typeof import('react')>())
  return {
    ...base,
    useRef: (init: unknown) => {
      const ref = base.useRef(init) as { current: unknown }
      if (init === null && ref.current === null) ref.current = { fake: true }
      return ref
    },
  }
})

const ctx = { gaugeHeld: false, resultPending: false, registerGaugeFill: vi.fn() }
vi.mock('@/components/capsule/capsuleResultContext', () => ({ useCapsuleResult: () => ctx }))
const motion = { reduced: false }
vi.mock('@/lib/motion', () => ({ prefersReducedMotion: () => motion.reduced }))

import CapsuleGauge, { CAPSULE_GAUGE_HEIGHT_PX, gaugeCircleDiameter } from './CapsuleGauge'
import { findAll, mount, unmount } from './__tests__/hookRunner'
import {
  GAUGE_ENTRY_DELAY_MS,
  GAUGE_ENTRY_MS,
  GAUGE_ENTRY_TABBAR_CLEARANCE_PX,
  GAUGE_ENTRY_VISIBLE_RATIO,
  GRAPH_MIN_PERCENT,
  capsuleGraphPercent,
  graphPercentToFillRatio,
} from '@/lib/capsule/capsule-gauge'

const FILLED = 150
const REQUIRED = 300
const TARGET = capsuleGraphPercent(FILLED, REQUIRED)
const CIRCLE = gaugeCircleDiameter(CAPSULE_GAUGE_HEIGHT_PX)
const widthAt = (graph: number) => `calc(${CIRCLE}px + (100% - ${CIRCLE}px) * ${graphPercentToFillRatio(graph)})`
const props = { filled: FILLED, required: REQUIRED, ariaLabel: '캡슐, 채우는 중이에요' }

const fillStyle = () =>
  findAll((e) => e.type === 'span' && (e.props.style as { background?: string } | undefined)?.background === 'var(--capsule-fill)')[0].props
    .style as { width: string; transition: string }

interface FakeObserver {
  callback: (entries: Array<{ isIntersecting: boolean; intersectionRatio: number }>) => void
  options: { threshold: number; rootMargin: string }
  observe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}
let observers: FakeObserver[] = []

function signal(ratio: number, isIntersecting = ratio > 0) {
  observers[observers.length - 1].callback([{ isIntersecting, intersectionRatio: ratio }])
}

function installObserver() {
  class Fake {
    constructor(callback: FakeObserver['callback'], options: FakeObserver['options']) {
      const record: FakeObserver = { callback, options, observe: vi.fn(), disconnect: vi.fn() }
      observers.push(record)
      return record as unknown as Fake
    }
  }
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, IntersectionObserver: Fake })
}

beforeEach(() => {
  vi.useFakeTimers()
  observers = []
  ctx.gaugeHeld = false
  ctx.registerGaugeFill = vi.fn()
  motion.reduced = false
})
afterEach(() => {
  unmount()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('관찰자가 없는 환경', () => {
  it('지금처럼 즉시 시작한다 — 260ms 뒤 끝 값으로 1,500ms', () => {
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
    mount(CapsuleGauge, props)
    expect(fillStyle().width).toBe(widthAt(GRAPH_MIN_PERCENT))
    vi.advanceTimersByTime(GAUGE_ENTRY_DELAY_MS)
    expect(fillStyle().width).toBe(widthAt(TARGET))
    expect(fillStyle().transition).toContain(`${GAUGE_ENTRY_MS}ms`)
  })
})

describe('이미 보임', () => {
  it('트랙을 관찰하고 첫 콜백이 보임을 알리면 260ms 뒤 차오른다', () => {
    installObserver()
    mount(CapsuleGauge, props)
    expect(observers).toHaveLength(1)
    expect(observers[0].observe).toHaveBeenCalledTimes(1)
    // 관찰 대상은 채움이 아니라 role="img" 바깥 트랙이다
    const track = findAll((e) => e.props.role === 'img')[0]
    expect((track.props as { ref?: { current: unknown } }).ref).toBeDefined()
    expect(observers[0].options.threshold).toBe(GAUGE_ENTRY_VISIBLE_RATIO)
    expect(observers[0].options.rootMargin).toBe(`0px 0px -${GAUGE_ENTRY_TABBAR_CLEARANCE_PX}px 0px`)

    signal(1)
    expect(fillStyle().width).toBe(widthAt(GRAPH_MIN_PERCENT))
    vi.advanceTimersByTime(GAUGE_ENTRY_DELAY_MS - 1)
    expect(fillStyle().width).toBe(widthAt(GRAPH_MIN_PERCENT))
    vi.advanceTimersByTime(1)
    expect(fillStyle().width).toBe(widthAt(TARGET))
    expect(fillStyle().transition).toContain(`${GAUGE_ENTRY_MS}ms`)
  })
})

describe('나중에 보임', () => {
  it('보이기 전에는 시간이 흘러도 2%에 머물고, 보인 때부터 260ms 뒤 차오른다', () => {
    installObserver()
    mount(CapsuleGauge, props)
    vi.advanceTimersByTime(10_000)
    expect(fillStyle().width).toBe(widthAt(GRAPH_MIN_PERCENT))
    expect(fillStyle().transition).toBe('none')

    signal(0.5)
    vi.advanceTimersByTime(GAUGE_ENTRY_DELAY_MS)
    expect(fillStyle().width).toBe(widthAt(TARGET))
    expect(fillStyle().transition).toContain(`${GAUGE_ENTRY_MS}ms`)
  })

  it('절반 미만 걸친 신호는 보임이 아니다', () => {
    installObserver()
    mount(CapsuleGauge, props)
    signal(0.3)
    signal(0, false)
    vi.advanceTimersByTime(5000)
    expect(fillStyle().width).toBe(widthAt(GRAPH_MIN_PERCENT))
    expect(observers[0].disconnect).not.toHaveBeenCalled()
  })
})

describe('한 방문에 한 번', () => {
  it('보이면 관찰자를 해제하고, 신호가 다시 와도 반복하지 않는다', () => {
    installObserver()
    mount(CapsuleGauge, props)
    signal(1)
    expect(observers[0].disconnect).toHaveBeenCalled()
    vi.advanceTimersByTime(GAUGE_ENTRY_DELAY_MS)
    expect(fillStyle().width).toBe(widthAt(TARGET))
    // 화면 밖으로 나갔다 다시 들어와도 새 관찰자도, 되감기도 없다
    signal(0, false)
    signal(1)
    vi.advanceTimersByTime(5000)
    expect(observers).toHaveLength(1)
    expect(fillStyle().width).toBe(widthAt(TARGET))
  })
})

describe('모션 줄이기', () => {
  it('보이는 즉시 끝 값이고 전환이 없다', () => {
    installObserver()
    motion.reduced = true
    mount(CapsuleGauge, props)
    signal(1)
    vi.advanceTimersByTime(0)
    expect(fillStyle().width).toBe(widthAt(TARGET))
    expect(fillStyle().transition).toBe('none')
  })
})

describe('값이 0', () => {
  it('관찰자를 만들지 않고 모션도 없다', () => {
    installObserver()
    mount(CapsuleGauge, { ...props, filled: 0 })
    expect(observers).toHaveLength(0)
    vi.advanceTimersByTime(5000)
    expect(fillStyle().width).toBe(widthAt(GRAPH_MIN_PERCENT))
  })
})

describe('합친 연출이 붙들 때', () => {
  it('붙들린 채로 보여도 2% 원이다', () => {
    installObserver()
    ctx.gaugeHeld = true
    mount(CapsuleGauge, props)
    expect(observers).toHaveLength(0)
    vi.advanceTimersByTime(5000)
    expect(fillStyle().width).toBe(widthAt(GRAPH_MIN_PERCENT))
    expect(fillStyle().transition).toBe('none')
  })
})

describe('정리', () => {
  it('관찰 대기 중 사라지면 관찰자를 해제한다', () => {
    installObserver()
    mount(CapsuleGauge, props)
    expect(observers[0].disconnect).not.toHaveBeenCalled()
    unmount()
    expect(observers[0].disconnect).toHaveBeenCalled()
  })

  it('보인 뒤 260ms 쉬는 중 사라지면 타이머를 걷는다', () => {
    installObserver()
    mount(CapsuleGauge, props)
    signal(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
