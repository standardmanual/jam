/**
 * 챕터 게이지 카드의 진입·이동 모션과 숫자 자리 (티켓 20261127_1733)
 *
 * 훅 실행기(`capsule/__tests__/hookRunner`)로 효과를 돌리고 `IntersectionObserver`는 가짜로 대신한다. 트랙 안쪽 폭은 가짜 요소의 `clientWidth`(298px)로 준다.
 *
 * 고정하는 것
 *  - 관찰자 없음: 260ms 뒤 시작 길이에서 끝 길이로 1,500ms `--ease-smooth-out`. 시작 전에는 칩보다 2px 들어간 길이이고 전환이 없다.
 *  - 보임 관찰: 트랙을 보고(절반, 하단 탭바 72px 뺌), 보이기 전에는 움직이지 않으며, 보인 때부터 260ms 뒤다.
 *  - 모션 줄이기: 쉼도 시간도 0이다.
 *  - 값 0: 채움이 없고 숫자는 밖 자리이며, 보이면 숫자가 나타난다.
 *  - 숫자 자리: 65%는 채움 안(어두운 글자), 20%는 채움 오른쪽 바깥(오렌지 글자, 왼쪽 = 채움 끝 + 8). 숫자는 채움이 시작할 때 같이 나타난다.
 *  - 필요 잼 숫자: 원본(오렌지)은 정적이고 어두운 복사본은 채움 안에 트랙 안쪽 폭 상자로 있다. 마지막 챕터는 없다.
 *  - 값이 바뀜: 처음부터 다시 돌지 않고 지금 길이에서 새 길이로 700~1,500ms 동안 옮겨 간다.
 *
 * 실행: cd jam-web && npx vitest run src/components/ui/__tests__/ChapterGaugeCard.entry.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const INNER_WIDTH = 298

vi.mock('react', async (importOriginal) => {
  const base = (await import('../../capsule/__tests__/hookRunner')).mockReact(await importOriginal<typeof import('react')>())
  return {
    ...base,
    useRef: (init: unknown) => {
      const ref = base.useRef(init) as { current: unknown }
      if (init === null && ref.current === null) ref.current = { fake: true, clientWidth: INNER_WIDTH }
      return ref
    },
  }
})

const motion = { reduced: false }
vi.mock('@/lib/motion', () => ({ prefersReducedMotion: () => motion.reduced }))

import ChapterGaugeCard from '../ChapterGaugeCard'
import { findAll, mount, rerender, unmount } from '../../capsule/__tests__/hookRunner'
import { ENTRY_DELAY_MS, ENTRY_MS, ENTRY_TABBAR_CLEARANCE_PX, ENTRY_VISIBLE_RATIO, MOVE_MAX_MS, MOVE_MIN_MS, chapterFillRatio, fillWidthPx, moveDurationMs } from '../chapterGaugeCardMath'

const REQUIRED = 2344
const common = { tribeName: '야간 러너', chapterNo: 12, chapterLabel: 'CHAPTER', ariaLabel: '챕터 12, 야간 러너', trackAriaLabel: '다음 챕터까지 잼 모은양 / 필요양' }
const props = (filled: number, required: number | null = REQUIRED) => ({ ...common, filled, required })
const widthAt = (ratio: number) => `calc(44px + (100% - 44px) * ${ratio})`
const IDLE_WIDTH = '42px'

type Style = { width?: string; transition?: string; opacity?: number; color?: string; paddingRight?: string | number; left?: string }
const fills = () => findAll((e) => 'data-chapter-fill' in e.props)
const fillStyle = () => fills()[0].props.style as Style
const numbers = () => findAll((e) => 'data-chapter-number' in e.props)
const numberAt = (where: 'inside' | 'outside') => numbers().find((e) => e.props['data-chapter-number'] === where)

interface FakeObserver {
  callback: (entries: Array<{ isIntersecting: boolean; intersectionRatio: number }>) => void
  options: { threshold: number; rootMargin: string }
  observe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}
let observers: FakeObserver[] = []
const signal = (ratio: number) => observers[observers.length - 1].callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }])

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
function noObserver() {
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
}

beforeEach(() => {
  vi.useFakeTimers()
  observers = []
  motion.reduced = false
})
afterEach(() => {
  unmount()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('관찰자가 없는 환경', () => {
  it('260ms 뒤 시작 길이(칩보다 2px 안)에서 끝 길이로 1,500ms 옮겨 간다', () => {
    noObserver()
    mount(ChapterGaugeCard, props(1500))
    expect(fillStyle().width).toBe(IDLE_WIDTH)
    expect(fillStyle().transition).toBe('none')
    vi.advanceTimersByTime(ENTRY_DELAY_MS)
    expect(fillStyle().width).toBe(widthAt(chapterFillRatio(1500, REQUIRED)))
    expect(fillStyle().transition).toBe(`width ${ENTRY_MS}ms var(--ease-smooth-out)`)
  })

  it('모션 줄이기면 쉼도 시간도 0이다', () => {
    motion.reduced = true
    noObserver()
    mount(ChapterGaugeCard, props(1500))
    vi.advanceTimersByTime(1)
    expect(fillStyle().width).toBe(widthAt(chapterFillRatio(1500, REQUIRED)))
    expect(fillStyle().transition).toBe('none')
  })
})

describe('보임 관찰', () => {
  it('트랙을 관찰하고 보이기 전에는 움직이지 않으며, 보인 때부터 260ms 뒤 시작한다', () => {
    installObserver()
    mount(ChapterGaugeCard, props(1500))
    expect(observers).toHaveLength(1)
    expect(observers[0].observe).toHaveBeenCalledTimes(1)
    expect(observers[0].options.threshold).toBe(ENTRY_VISIBLE_RATIO)
    expect(observers[0].options.rootMargin).toBe(`0px 0px -${ENTRY_TABBAR_CLEARANCE_PX}px 0px`)
    vi.advanceTimersByTime(5000)
    expect(fillStyle().width).toBe(IDLE_WIDTH)
    // 절반 미만은 보임이 아니다
    signal(0.3)
    vi.advanceTimersByTime(5000)
    expect(fillStyle().width).toBe(IDLE_WIDTH)
    signal(0.5)
    expect(observers[0].disconnect).toHaveBeenCalled()
    vi.advanceTimersByTime(ENTRY_DELAY_MS - 1)
    expect(fillStyle().width).toBe(IDLE_WIDTH)
    vi.advanceTimersByTime(1)
    expect(fillStyle().width).toBe(widthAt(chapterFillRatio(1500, REQUIRED)))
  })
})

describe('모은 잼 숫자', () => {
  it('65%는 채움 안(어두운 글자), 20%는 채움 오른쪽 바깥(오렌지 글자, 채움 끝 + 8)이다', () => {
    noObserver()
    mount(ChapterGaugeCard, props(1500))
    expect(numberAt('inside')).toBeDefined()
    expect(numberAt('outside')).toBeUndefined()
    expect((numberAt('inside')!.props.style as Style).color).toBe('var(--capsule-track)')
    expect((numberAt('inside')!.props.style as Style).paddingRight).toBe('var(--spacing-12)')
    unmount()
    mount(ChapterGaugeCard, props(400))
    expect(numberAt('outside')).toBeDefined()
    expect(numberAt('inside')).toBeUndefined()
    expect((numberAt('outside')!.props.style as Style).color).toBe('var(--capsule-fill)')
    const end = fillWidthPx(INNER_WIDTH, chapterFillRatio(400, REQUIRED))
    expect((numberAt('outside')!.props.style as Style).left).toBe(`calc(${end}px + var(--spacing-8))`)
  })

  it('채움이 필요 잼 영역에 닿는 값(8xx/870)은 안쪽이고 오른쪽 여백이 커져 필요 잼 영역 앞에서 멈춘다', () => {
    noObserver()
    mount(ChapterGaugeCard, props(850, 870))
    const style = numberAt('inside')!.props.style as Style
    // 필요 잼 «870»: 12 + 3 × 10 + 8 = 50 → 트랙 안쪽 298 - 50 = 248. 채움 끝 = 44 + 254 × (850/870)
    const fillEnd = fillWidthPx(INNER_WIDTH, chapterFillRatio(850, 870))
    expect(style.paddingRight).toBeCloseTo(fillEnd - 248, 8)
    expect(style.paddingRight as number).toBeGreaterThan(12)
    expect(numberAt('outside')).toBeUndefined()
  })

  it('값 0이면 바깥 숫자는 칩 오른쪽 끝(44) + 8에 놓는다', () => {
    noObserver()
    mount(ChapterGaugeCard, props(0))
    expect((numberAt('outside')!.props.style as Style).left).toBe('calc(44px + var(--spacing-8))')
  })

  it('숫자는 채움이 시작하기 전에는 보이지 않고 시작하면 나타난다', () => {
    noObserver()
    mount(ChapterGaugeCard, props(1500))
    expect((numberAt('inside')!.props.style as Style).opacity).toBe(0)
    vi.advanceTimersByTime(ENTRY_DELAY_MS)
    vi.advanceTimersByTime(1)
    expect((numberAt('inside')!.props.style as Style).opacity).toBeUndefined()
  })

  it('값 0: 채움이 없고 숫자는 밖 자리이며 보이면 나타난다', () => {
    noObserver()
    mount(ChapterGaugeCard, props(0))
    expect(fills()).toHaveLength(0)
    expect(numberAt('outside')).toBeDefined()
    expect((numberAt('outside')!.props.style as Style).opacity).toBe(0)
    vi.advanceTimersByTime(ENTRY_DELAY_MS + 1)
    expect((numberAt('outside')!.props.style as Style).opacity).toBeUndefined()
    expect(fills()).toHaveLength(0)
  })

  it('챕터 10(필요량 없음): 채움은 가득이고 숫자는 안 자리다', () => {
    noObserver()
    mount(ChapterGaugeCard, props(1200, null))
    vi.advanceTimersByTime(ENTRY_DELAY_MS)
    expect(fillStyle().width).toBe(widthAt(1))
    expect(numberAt('inside')).toBeDefined()
  })

  it('큰 값(6자리)이 가득이면 안 자리다', () => {
    noObserver()
    mount(ChapterGaugeCard, props(900000, 900000))
    expect(numberAt('inside')).toBeDefined()
  })
})

describe('값이 바뀜', () => {
  it('처음부터 다시 돌지 않고 지금 길이에서 새 길이로 700~1,500ms 옮겨 간다', () => {
    noObserver()
    mount(ChapterGaugeCard, props(465))
    vi.advanceTimersByTime(ENTRY_DELAY_MS)
    const from = chapterFillRatio(465, REQUIRED)
    expect(fillStyle().width).toBe(widthAt(from))
    rerender(props(1500))
    const to = chapterFillRatio(1500, REQUIRED)
    expect(fillStyle().width).toBe(widthAt(to))
    const expected = moveDurationMs(from, to)
    expect(expected).toBeGreaterThanOrEqual(MOVE_MIN_MS)
    expect(expected).toBeLessThanOrEqual(MOVE_MAX_MS)
    expect(fillStyle().transition).toBe(`width ${expected}ms var(--ease-smooth-out)`)
  })

  it('모션 줄이기면 전환 없이 바로 새 길이다', () => {
    motion.reduced = true
    noObserver()
    mount(ChapterGaugeCard, props(465))
    vi.advanceTimersByTime(1)
    rerender(props(1500))
    expect(fillStyle().width).toBe(widthAt(chapterFillRatio(1500, REQUIRED)))
    expect(fillStyle().transition).toBe('none')
  })
})

describe('필요 잼 숫자', () => {
  const requiredOriginal = () => findAll((e) => e.props['data-chapter-required'] === 'value')
  const clip = () => findAll((e) => 'data-chapter-required-clip' in e.props)

  it('원본은 오렌지·aria-hidden이고 정적이며 팝인이 없다', () => {
    noObserver()
    mount(ChapterGaugeCard, props(465))
    const [orig] = requiredOriginal()
    expect(orig.props['aria-hidden']).toBe('true')
    expect((orig.props.style as Style).color).toBe('var(--capsule-fill)')
    expect((orig.props.style as Style).opacity).toBeUndefined()
    vi.advanceTimersByTime(ENTRY_DELAY_MS + 1)
    expect((requiredOriginal()[0].props.style as Style).opacity).toBeUndefined()
  })

  it('어두운 복사본은 채움 안에 트랙 안쪽 폭 상자로 있다', () => {
    noObserver()
    mount(ChapterGaugeCard, props(850, 870))
    const [c] = clip()
    expect(c.props['aria-hidden']).toBe('true')
    expect((c.props.style as { width: number }).width).toBe(INNER_WIDTH)
  })

  it('값 0이면 채움이 없어 복사본도 없다', () => {
    noObserver()
    mount(ChapterGaugeCard, props(0))
    expect(clip()).toHaveLength(0)
    expect(requiredOriginal()).toHaveLength(1)
  })

  it('마지막 챕터는 원본도 복사본도 없다', () => {
    noObserver()
    mount(ChapterGaugeCard, props(1200, null))
    expect(requiredOriginal()).toHaveLength(0)
    expect(clip()).toHaveLength(0)
  })
})
