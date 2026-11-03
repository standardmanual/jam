/**
 * 3D 모드 스테이지 합성 (티켓 20261103_1735)
 *
 * 캔버스가 없는 환경이라 가짜 컨텍스트로 호출 순서·좌표·픽셀 값을 본다.
 * 고정하는 것: PNG 저장 크기(4개 비율), 배경 → 3D → 그레인 → 오버레이 순서, Transparent 배경의 알파 0,
 * 오버레이가 저장 크기 기준으로 그려지는 것.
 */
import { describe, expect, it, vi } from 'vitest'
import { composeBackground, type CanvasRatio } from '../logo3dConfig'
import { addGrain, composeStage, exportSizeFor, paintBackground } from '../stageCompose'

describe('exportSizeFor', () => {
  it('에셋 Export 크기를 긴 변으로 놓고 Canvas 비율로 짧은 변을 정한다', () => {
    const cases: [CanvasRatio, number, { width: number; height: number }][] = [
      ['1:1', 2048, { width: 2048, height: 2048 }],
      ['4:5', 2048, { width: 1638, height: 2048 }],
      ['9:16', 2048, { width: 1152, height: 2048 }],
      ['16:9', 2048, { width: 2048, height: 1152 }],
      ['16:9', 1024, { width: 1024, height: 576 }],
      ['4:5', 4096, { width: 3277, height: 4096 }],
    ]
    for (const [ratio, size, expected] of cases) expect(exportSizeFor(size, ratio)).toEqual(expected)
  })
})

describe('paintBackground', () => {
  function fakeContext() {
    const gradient = { addColorStop: vi.fn() }
    return {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      createLinearGradient: vi.fn(() => gradient),
      fillStyle: '' as unknown,
      gradient,
    }
  }

  it('Transparent는 지우기만 하고 칠하지 않아 배경 픽셀 알파가 0으로 남는다', () => {
    const ctx = fakeContext()
    paintBackground(ctx as unknown as CanvasRenderingContext2D, composeBackground('transparent', '#ffffff', '#000000', 0, 10, 10), 10, 10)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 10, 10)
    expect(ctx.fillRect).not.toHaveBeenCalled()
  })

  it('Solid는 한 색으로 전체를 칠한다', () => {
    const ctx = fakeContext()
    paintBackground(ctx as unknown as CanvasRenderingContext2D, composeBackground('solid', '#ff0000', '#000000', 0, 10, 10), 10, 10)
    expect(ctx.fillStyle).toBe('#ff0000')
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 10, 10)
  })

  it('Gradient는 선형 그라데이션으로 전체를 칠한다', () => {
    const ctx = fakeContext()
    paintBackground(ctx as unknown as CanvasRenderingContext2D, composeBackground('gradient', '#000000', '#ffffff', 0, 10, 10), 10, 10)
    expect(ctx.createLinearGradient).toHaveBeenCalled()
    expect(ctx.gradient.addColorStop).toHaveBeenCalled()
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 10, 10)
  })
})

/** 픽셀 배열을 들고 있는 가짜 컨텍스트. 호출 순서를 `calls`에 남긴다. */
function pixelContext(width: number, height: number, pixels: Uint8ClampedArray) {
  const calls: string[] = []
  const raw = {
    clearRect: vi.fn(() => calls.push('background')),
    fillRect: vi.fn(),
    fillStyle: '' as unknown,
    createLinearGradient: vi.fn(),
    drawImage: vi.fn(() => calls.push('logo')),
    getImageData: vi.fn(() => {
      calls.push('grain')
      return { data: pixels, width, height }
    }),
    putImageData: vi.fn(),
  }
  return { ctx: raw as unknown as CanvasRenderingContext2D, raw, calls }
}

function opaque(width: number, height: number, value: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < px.length; i += 4) {
    px[i] = px[i + 1] = px[i + 2] = value
    px[i + 3] = 255
  }
  return px
}

describe('addGrain', () => {
  it('불투명 픽셀의 색을 바꾸고 알파는 그대로 둔다', () => {
    const px = opaque(16, 16, 128)
    const { ctx } = pixelContext(16, 16, px)
    addGrain(ctx, 16, 16, 20)
    let changed = 0
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] !== 128) changed++
      expect(px[i + 3]).toBe(255)
      expect(px[i]).toBe(px[i + 1])
      expect(px[i]).toBe(px[i + 2])
    }
    expect(changed).toBeGreaterThan(0)
  })

  it('알파가 0인 픽셀(Transparent 배경)은 건드리지 않는다', () => {
    const px = new Uint8ClampedArray(16 * 16 * 4)
    const { ctx } = pixelContext(16, 16, px)
    addGrain(ctx, 16, 16, 20)
    expect(px.every((v) => v === 0)).toBe(true)
  })

  it('그레인이 0이면 픽셀을 읽지도 않는다', () => {
    const { ctx, raw } = pixelContext(4, 4, opaque(4, 4, 100))
    addGrain(ctx, 4, 4, 0)
    expect(raw.getImageData).not.toHaveBeenCalled()
  })
})

describe('composeStage', () => {
  const logo = {} as CanvasImageSource
  const plan = composeBackground('solid', '#112233', '#000000', 0, 20, 10)

  it('배경 → 3D → 그레인 → 오버레이 순으로 쌓는다(Shape 저장과 같은 레이어 순서)', () => {
    const { ctx, calls } = pixelContext(20, 10, opaque(20, 10, 90))
    composeStage(ctx, { width: 20, height: 10, background: plan, logo, grainPct: 10, drawOverlays: () => calls.push('overlay') })
    expect(calls).toEqual(['background', 'logo', 'grain', 'overlay'])
  })

  it('그레인이 0이면 그레인 단계를 건너뛴다', () => {
    const { ctx, calls } = pixelContext(20, 10, opaque(20, 10, 90))
    composeStage(ctx, { width: 20, height: 10, background: plan, logo, grainPct: 0, drawOverlays: () => calls.push('overlay') })
    expect(calls).toEqual(['background', 'logo', 'overlay'])
  })

  it('오버레이는 저장 크기(width, height) 기준으로 그린다', () => {
    const { ctx } = pixelContext(1152, 2048, new Uint8ClampedArray(0))
    const drawOverlays = vi.fn()
    composeStage(ctx, { width: 1152, height: 2048, background: plan, logo: null, grainPct: 0, drawOverlays })
    expect(drawOverlays).toHaveBeenCalledWith(ctx, 1152, 2048)
  })

  it('Transparent 배경이면 배경을 칠하지 않고, 3D가 없으면 그리지 않는다', () => {
    const { ctx, raw } = pixelContext(20, 10, new Uint8ClampedArray(20 * 10 * 4))
    composeStage(ctx, {
      width: 20,
      height: 10,
      background: composeBackground('transparent', '#ffffff', '#000000', 0, 20, 10),
      logo: null,
      grainPct: 0,
    })
    expect(raw.fillRect).not.toHaveBeenCalled()
    expect(raw.drawImage).not.toHaveBeenCalled()
  })

  it('Transparent 배경에 그레인을 입혀도 3D 밖 픽셀의 알파는 0으로 남는다', () => {
    const px = new Uint8ClampedArray(8 * 8 * 4)
    // 가운데 한 픽셀만 3D가 그려진 불투명 픽셀
    const center = (4 * 8 + 4) * 4
    px[center] = px[center + 1] = px[center + 2] = 100
    px[center + 3] = 255
    const { ctx } = pixelContext(8, 8, px)
    composeStage(ctx, {
      width: 8,
      height: 8,
      background: composeBackground('transparent', '#ffffff', '#000000', 0, 8, 8),
      logo,
      grainPct: 20,
    })
    for (let i = 0; i < px.length; i += 4) {
      if (i === center) expect(px[i + 3]).toBe(255)
      else expect([px[i], px[i + 1], px[i + 2], px[i + 3]]).toEqual([0, 0, 0, 0])
    }
  })
})
