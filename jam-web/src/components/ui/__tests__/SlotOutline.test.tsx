/**
 * SlotOutline — 점선 외곽선 추적과 렌더 (티켓 20261112_1627)
 *
 * 추적 함수는 canvas 없이 합성 RGBA 배열로 직접 시험한다. 저장소에 jsdom이 없어(vitest environment: node) 컴포넌트는 서버 렌더로
 * 마크업만 보고, 이미지·캔버스 경로(캐시·실패 기억)는 전역 `Image`·`document`를 가짜로 바꿔 시험한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  SlotOutline,
  clearSlotOutlineCache,
  traceAlphaOutline,
  traceSlotOutlineImage,
} from '@ds/components/cards/SlotOutline'

/** 알파만 의미 있는 RGBA 배열을 만든다. `filledAt(x, y)`가 참이면 alpha 255 */
function makeRgba(width: number, height: number, filledAt: (x: number, y: number) => boolean | number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = filledAt(x, y)
      data[(y * width + x) * 4 + 3] = typeof v === 'number' ? v : v ? 255 : 0
    }
  }
  return data
}

/** path 문자열의 («M … Z») 조각별 꼭짓점 목록 */
function parsePath(d: string): number[][][] {
  return d
    .split('M')
    .filter(Boolean)
    .map((piece) =>
      piece
        .replace('Z', '')
        .split('L')
        .map((pair) => pair.split(' ').map(Number)),
    )
}

describe('traceAlphaOutline', () => {
  const rect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1

  it('채워진 픽셀이 없으면 null', () => {
    expect(traceAlphaOutline(makeRgba(20, 20, () => false), 20, 20)).toBeNull()
  })

  it('입력이 비었거나 크기가 0이면 null', () => {
    expect(traceAlphaOutline(null as unknown as ArrayLike<number>, 10, 10)).toBeNull()
    expect(traceAlphaOutline(new Uint8ClampedArray(0), 0, 0)).toBeNull()
  })

  it('사각형 하나는 닫힌 고리 하나로, 좌표가 90 기준(소수 1자리)으로 환산된다', () => {
    // 100x100 캔버스에서 20..80 칸을 채운다 → 90 기준 18..72
    const d = traceAlphaOutline(makeRgba(100, 100, rect(20, 20, 80, 80)), 100, 100)!
    expect(d).toMatch(/^M[\d. L]+Z$/)
    const pieces = parsePath(d)
    expect(pieces).toHaveLength(1)
    const xs = pieces[0].map((p) => p[0])
    const ys = pieces[0].map((p) => p[1])
    expect(Math.min(...xs)).toBeCloseTo(18, 0)
    expect(Math.max(...xs)).toBeCloseTo(72, 0)
    expect(Math.min(...ys)).toBeCloseTo(18, 0)
    expect(Math.max(...ys)).toBeCloseTo(72, 0)
    // 좌표는 소수 1자리까지
    for (const num of d.match(/\d+(\.\d+)?/g)!) expect(num).toMatch(/^\d+(\.\d)?$/)
  })

  it('곧은 변의 중간 점은 단순화로 사라진다(사각형은 꼭짓점이 열 개를 넘지 않는다)', () => {
    const d = traceAlphaOutline(makeRgba(100, 100, rect(20, 20, 80, 80)), 100, 100)!
    expect(parsePath(d)[0].length).toBeLessThanOrEqual(10)
  })

  it('시작점은 맨 위, 같은 높이에서는 맨 왼쪽이다', () => {
    const d = traceAlphaOutline(makeRgba(100, 100, rect(20, 30, 80, 90)), 100, 100)!
    const points = parsePath(d)[0]
    const minY = Math.min(...points.map((p) => p[1]))
    const top = points.filter((p) => p[1] === minY)
    expect(points[0][1]).toBe(minY)
    expect(points[0][0]).toBe(Math.min(...top.map((p) => p[0])))
  })

  it('안쪽 구멍은 버리고 바깥 윤곽만 남긴다', () => {
    const ring = (x: number, y: number) => rect(10, 10, 90, 90)(x, y) && !rect(35, 35, 65, 65)(x, y)
    const d = traceAlphaOutline(makeRgba(100, 100, ring), 100, 100)!
    const pieces = parsePath(d)
    expect(pieces).toHaveLength(1)
    // 구멍(35..65 → 90 기준 31.5..58.5)의 꼭짓점이 없다
    expect(pieces[0].every((p) => p[0] < 20 || p[0] > 70 || p[1] < 20 || p[1] > 70)).toBe(true)
  })

  it('전체 면적 0.5% 미만의 잔 조각은 버리고 큰 조각은 모두 남긴다', () => {
    // 100x100 캔버스 면적의 0.5% = 50픽셀. 4x4(16)는 버리고 30x30 두 개는 남긴다
    const shape = (x: number, y: number) => rect(5, 5, 35, 35)(x, y) || rect(60, 60, 90, 90)(x, y) || rect(45, 5, 49, 9)(x, y)
    const pieces = parsePath(traceAlphaOutline(makeRgba(100, 100, shape), 100, 100)!)
    expect(pieces).toHaveLength(2)
  })

  it('잔 조각뿐이면 null', () => {
    expect(traceAlphaOutline(makeRgba(100, 100, rect(10, 10, 14, 14)), 100, 100)).toBeNull()
  })

  it('alpha 128 이상만 채워진 것으로 본다', () => {
    expect(traceAlphaOutline(makeRgba(60, 60, (x, y) => (rect(10, 10, 50, 50)(x, y) ? 127 : 0)), 60, 60)).toBeNull()
    expect(traceAlphaOutline(makeRgba(60, 60, (x, y) => (rect(10, 10, 50, 50)(x, y) ? 128 : 0)), 60, 60)).not.toBeNull()
  })

  it('이미지 가장자리에 닿은 도형도 닫힌 윤곽이 된다', () => {
    const d = traceAlphaOutline(makeRgba(40, 40, () => true), 40, 40)!
    const xs = parsePath(d)[0].map((p) => p[0])
    expect(Math.min(...xs)).toBeCloseTo(0, 0)
    expect(Math.max(...xs)).toBeCloseTo(90, 0)
  })

  it('가로로 긴 입력에서도 고리가 엉키지 않는다', () => {
    const d = traceAlphaOutline(makeRgba(80, 20, rect(5, 5, 75, 15)), 80, 20, { viewSize: 80 })!
    expect(parsePath(d)).toHaveLength(1)
  })

  it('원은 단순화로 원본 윤곽선보다 꼭짓점이 훨씬 적다', () => {
    const circle = (x: number, y: number) => (x - 50) ** 2 + (y - 50) ** 2 <= 40 ** 2
    const points = parsePath(traceAlphaOutline(makeRgba(100, 100, circle), 100, 100)!)[0]
    expect(points.length).toBeGreaterThan(8)
    expect(points.length).toBeLessThan(120)
  })
})

describe('SlotOutline 렌더', () => {
  it('주소가 없고 fallback이 box이면 둥근 사각형 점선을 그린다', () => {
    const html = renderToStaticMarkup(<SlotOutline src={null} fallback="box" />)
    expect(html).toContain('data-outline-state="box"')
    expect(html).toContain('viewBox="0 0 90 90"')
    expect(html).toContain('<rect')
    expect(html).toContain('rx="12"')
    expect(html).toContain('x="4"')
    expect(html).toContain('vector-effect="non-scaling-stroke"')
    expect(html).toContain('stroke-dasharray:3 4')
    expect(html).toContain('stroke:var(--muted)')
    expect(html).toContain('stroke-width:2')
    expect(html).toContain('aria-hidden="true"')
  })

  it('주소가 없고 fallback이 none이면 아무것도 그리지 않는다', () => {
    const html = renderToStaticMarkup(<SlotOutline src={undefined} fallback="none" />)
    expect(html).toContain('data-outline-state="none"')
    expect(html).not.toContain('<rect')
    expect(html).not.toContain('<path')
  })

  it('추적 중에는 칸 크기만 잡고 아무것도 그리지 않는다', () => {
    const html = renderToStaticMarkup(<SlotOutline src="/a.png" fallback="box" />)
    expect(html).toContain('data-outline-state="loading"')
    expect(html).toContain('aspect-ratio:1 / 1')
    expect(html).not.toContain('<rect')
    expect(html).not.toContain('<path')
  })

  it('label이 있으면 role="img"와 aria-label, 없으면 aria-hidden이다', () => {
    const labelled = renderToStaticMarkup(<SlotOutline src="/a.png" label="한강 마스터 윤곽" />)
    expect(labelled).toContain('role="img"')
    expect(labelled).toContain('aria-label="한강 마스터 윤곽"')
    expect(labelled).not.toContain('aria-hidden')
  })

  it('움직이는 점선(dashoffset 애니메이션)을 쓰지 않고, 등장 애니메이션은 reduced-motion에서 꺼진다', () => {
    const html = renderToStaticMarkup(<SlotOutline src={null} />)
    expect(html).not.toMatch(/dashoffset/i)
    expect(html).toMatch(/prefers-reduced-motion: reduce\)\{\.ds-slot-outline-path\{animation:none\}/)
  })
})

describe('traceSlotOutlineImage — 캐시', () => {
  let loads = 0
  let failNext = false

  beforeEach(() => {
    clearSlotOutlineCache()
    loads = 0
    failNext = false
    class FakeImage {
      crossOrigin = ''
      naturalWidth = 100
      naturalHeight = 100
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        loads += 1
        queueMicrotask(() => (failNext ? this.onerror?.() : this.onload?.()))
      }
    }
    const rgba = makeRgba(180, 180, (x, y) => x >= 40 && x < 140 && y >= 40 && y < 140)
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => undefined, getImageData: () => ({ data: rgba }) }),
      }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('같은 이미지는 한 번만 받고 진행 중 요청은 합친다', async () => {
    const [a, b] = await Promise.all([traceSlotOutlineImage('/a.png'), traceSlotOutlineImage('/a.png')])
    const c = await traceSlotOutlineImage('/a.png')
    expect(a).toMatch(/^M/)
    expect(b).toBe(a)
    expect(c).toBe(a)
    expect(loads).toBe(1)
  })

  it('다른 이미지는 따로 추적한다', async () => {
    await traceSlotOutlineImage('/a.png')
    await traceSlotOutlineImage('/b.png')
    expect(loads).toBe(2)
  })

  it('실패(null)도 기억해 다시 받지 않는다', async () => {
    failNext = true
    expect(await traceSlotOutlineImage('/broken.png')).toBeNull()
    failNext = false
    expect(await traceSlotOutlineImage('/broken.png')).toBeNull()
    expect(loads).toBe(1)
  })
})
