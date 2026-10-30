/**
 * 캡슐 게이지의 붙들기·풀기·번개 튐 (티켓 20261028_1740 3회)
 *
 * `CapsuleGauge.test.tsx`는 서버 렌더로 첫 화면을 보고, 이 파일은 훅 실행기(`__tests__/hookRunner.ts`)로 효과를 돌려 시간 흐름을 본다.
 * 합친 연출 문맥(`useCapsuleResult`)과 모션 줄이기 판정은 가짜로 대신하고, 타이머는 가짜 타이머로 흘린다.
 *
 * 고정하는 것
 *  - 붙들린 동안: 값이 있어도 2% 원이고 모션이 없으며 진입 모션이 돌지 않는다.
 *  - 풀리면: 2%에서 지금 값까지 `gaugeMoveDurationMs` 시간으로 옮겨 가고, 이동이 끝난 뒤 번개가 한 번 튄다.
 *  - 모션 줄이기: 이동 시간 0, 번개 튐 없음.
 *  - 붙들린 적이 없으면 기존 진입 모션 그대로이고 번개는 튀지 않는다.
 *  - 채움 요소를 문맥(`registerGaugeFill`)과 호출부의 `fillRef`에 알린다.
 *
 * 실행: cd jam-web && npx vitest run src/components/capsule/CapsuleGauge.held.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react', async (importOriginal) => (await import('./__tests__/hookRunner')).mockReact(await importOriginal<typeof import('react')>()))

const ctx = { gaugeHeld: false, resultPending: false, registerGaugeFill: vi.fn() }
vi.mock('@/components/capsule/capsuleResultContext', () => ({ useCapsuleResult: () => ctx }))
const motion = { reduced: false }
vi.mock('@/lib/motion', () => ({ prefersReducedMotion: () => motion.reduced }))

import CapsuleGauge, { CAPSULE_GAUGE_HEIGHT_PX, JamBolt, gaugeCircleDiameter } from './CapsuleGauge'
import { findAll, mount, rerender, unmount } from './__tests__/hookRunner'
import { GAUGE_ENTRY_DELAY_MS, capsuleGraphPercent, gaugeMoveDurationMs, graphPercentToFillRatio } from '@/lib/capsule/capsule-gauge'

const FILLED = 150
const REQUIRED = 300
const TARGET = capsuleGraphPercent(FILLED, REQUIRED)
const CIRCLE = gaugeCircleDiameter(CAPSULE_GAUGE_HEIGHT_PX)
const widthAt = (graph: number) => `calc(${CIRCLE}px + (100% - ${CIRCLE}px) * ${graphPercentToFillRatio(graph)})`

const props = { filled: FILLED, required: REQUIRED, ariaLabel: '캡슐, 채우는 중이에요' }

const fillStyle = () => findAll((e) => e.type === 'span' && (e.props.style as { background?: string } | undefined)?.background === 'var(--capsule-fill)')[0].props
  .style as { width: string; transition: string }
const bolt = () => {
  const ref = findAll((e) => e.type === JamBolt)[0].props.svgRef as { current: unknown }
  ref.current ??= { animate: vi.fn() }
  return ref.current as { animate: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
  ctx.gaugeHeld = false
  ctx.registerGaugeFill = vi.fn()
  motion.reduced = false
})
afterEach(() => {
  unmount()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('붙들린 동안', () => {
  it('값이 있어도 2% 원이고 모션이 없으며, 시간이 흘러도 진입 모션이 돌지 않는다', () => {
    ctx.gaugeHeld = true
    mount(CapsuleGauge, props)
    expect(fillStyle()).toMatchObject({ width: widthAt(2), transition: 'none' })

    vi.advanceTimersByTime(GAUGE_ENTRY_DELAY_MS + 3000)
    expect(fillStyle()).toMatchObject({ width: widthAt(2), transition: 'none' })
    expect(bolt().animate).not.toHaveBeenCalled()
  })

  it('진행 중이던 값이 있는 게이지도 붙들리면 곧바로 2% 원이 된다', () => {
    mount(CapsuleGauge, props)
    vi.advanceTimersByTime(GAUGE_ENTRY_DELAY_MS)
    expect(fillStyle().width).toBe(widthAt(TARGET))

    ctx.gaugeHeld = true
    rerender(props)
    expect(fillStyle()).toMatchObject({ width: widthAt(2), transition: 'none' })
  })
})

describe('풀린 뒤', () => {
  it('2%에서 지금 값까지 이동 시간을 두고 옮겨 간 뒤 번개가 한 번 튄다', () => {
    ctx.gaugeHeld = true
    mount(CapsuleGauge, props)

    ctx.gaugeHeld = false
    rerender(props)
    const duration = gaugeMoveDurationMs(2, TARGET)
    expect(fillStyle()).toMatchObject({ width: widthAt(TARGET), transition: `width ${duration}ms var(--ease-smooth-out)` })

    vi.advanceTimersByTime(duration - 1)
    expect(bolt().animate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(bolt().animate).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5000)
    rerender(props)
    expect(bolt().animate).toHaveBeenCalledTimes(1)
  })

  it('모션 줄이기에서는 이동 시간이 0이고 번개가 튀지 않는다', () => {
    motion.reduced = true
    ctx.gaugeHeld = true
    mount(CapsuleGauge, props)

    ctx.gaugeHeld = false
    rerender(props)
    expect(fillStyle()).toMatchObject({ width: widthAt(TARGET), transition: 'none' })
    const animate = bolt().animate
    vi.advanceTimersByTime(5000)
    expect(animate).not.toHaveBeenCalled()
  })

  it('옮길 곳이 없는 값(0)이어도 풀리면 번개가 한 번 튄다', () => {
    ctx.gaugeHeld = true
    const empty = { ...props, filled: 0 }
    mount(CapsuleGauge, empty)
    ctx.gaugeHeld = false
    rerender(empty)
    expect(fillStyle()).toMatchObject({ width: widthAt(2), transition: 'none' })
    const animate = bolt().animate // 타이머가 돌기 전에 가짜 번개를 붙여 둔다
    vi.advanceTimersByTime(1)
    expect(animate).toHaveBeenCalledTimes(1)
  })
})

describe('붙들린 적이 없을 때', () => {
  it('기존 진입 모션 그대로이고 번개는 튀지 않는다', () => {
    mount(CapsuleGauge, props)
    expect(fillStyle()).toMatchObject({ width: widthAt(2), transition: 'none' })
    vi.advanceTimersByTime(GAUGE_ENTRY_DELAY_MS)
    expect(fillStyle().width).toBe(widthAt(TARGET))
    expect(fillStyle().transition).toMatch(/^width 1500ms/)
    vi.advanceTimersByTime(5000)
    expect(bolt().animate).not.toHaveBeenCalled()
  })
})

describe('채움 요소 알리기', () => {
  it('문맥과 호출부의 fillRef 모두에 알린다', () => {
    const fillRef = { current: null as unknown }
    mount(CapsuleGauge, { ...props, fillRef: fillRef as never })
    const span = findAll((e) => e.type === 'span' && (e.props.style as { background?: string } | undefined)?.background === 'var(--capsule-fill)')[0]
    const element = { tag: 'fill' }
    ;(span.props.ref as (el: unknown) => void)(element)
    expect(ctx.registerGaugeFill).toHaveBeenCalledWith(element)
    expect(fillRef.current).toBe(element)
    ;(span.props.ref as (el: unknown) => void)(null)
    expect(ctx.registerGaugeFill).toHaveBeenLastCalledWith(null)
    expect(fillRef.current).toBeNull()
  })
})
