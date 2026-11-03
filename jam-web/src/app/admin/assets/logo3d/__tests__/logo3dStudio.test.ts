// 티켓 20261103_1734 — 에셋 3D 모드 연결부 시험.
// 고정하는 것: 모드 목록·기능 제한, 배경 공유(Shape 값을 그대로 쓰고 모드를 바꿔도 유지), 입력 패치 규칙, 그레인 계산, 그레인이 배경에 입혀지는지.
import { describe, expect, it, vi } from 'vitest'
import {
  cloneState,
  ENGINE_MODE_OPTIONS,
  engineModeSupports,
  INITIAL_STATE,
  type StudioEngineMode,
} from '../../shapeStudioConfig'
import {
  applyLogo3DPatch,
  composeBackground,
  DEFAULT_LOGO3D_SCENE,
  DEFAULT_LOGO3D_STATE,
  grainCellPx,
  grainNoise,
  studioStageProps,
} from '../logo3dConfig'
import { paintBackground } from '../Logo3DViewport'

describe('Mode 목록', () => {
  it('Shape · Ribbon 옆에 「3D (입체 로고)」가 있다', () => {
    expect(ENGINE_MODE_OPTIONS.map(([mode]) => mode)).toEqual(['shape', 'ribbon', '3d'])
    expect(ENGINE_MODE_OPTIONS.find(([mode]) => mode === '3d')?.[1]).toBe('3D (입체 로고)')
  })
})

describe('engineModeSupports', () => {
  it('3D 모드에서는 랜덤 생성·PNG 저장·동영상 저장·콘텐츠 적용을 막는다', () => {
    expect(engineModeSupports('3d')).toEqual({ randomize: false, pngExport: false, videoExport: false, applyToContent: false })
  })

  it('Shape·Ribbon 모드는 전부 쓸 수 있다', () => {
    for (const mode of ['shape', 'ribbon'] as StudioEngineMode[]) {
      expect(engineModeSupports(mode)).toEqual({ randomize: true, pngExport: true, videoExport: true, applyToContent: true })
    }
  })
})

describe('배경 공유', () => {
  it('3D 미리보기가 쓰는 배경·그레인·비율은 에셋 상태의 값 그대로다', () => {
    const studio = { ...cloneState(INITIAL_STATE), bgMode: 'solid' as const, bgA: '#123456', bgB: '#abcdef', bgAngle: 45, grain: 7, ratio: '16:9' as const }
    expect(studioStageProps(studio)).toEqual({ bgMode: 'solid', bgA: '#123456', bgB: '#abcdef', bgAngle: 45, grain: 7, ratio: '16:9' })
  })

  it('3D 고유 상태는 배경·비율 칸이 없어, 모드를 오가도 에셋 배경 값이 바뀔 수 없다', () => {
    const keys = Object.keys(DEFAULT_LOGO3D_SCENE)
    for (const bgKey of ['bgMode', 'bgA', 'bgB', 'bgAngle', 'ratio', 'grain']) expect(keys).not.toContain(bgKey)
  })

  it('별도 3D 화면의 기본 상태는 3D 고유 상태 + 배경·비율이다(기본값이 갈라지지 않는다)', () => {
    const { bgMode, bgA, bgB, bgAngle, ratio, ...scene } = DEFAULT_LOGO3D_STATE
    expect([bgMode, bgA, bgB, bgAngle, ratio]).toHaveLength(5)
    expect(scene).toEqual(DEFAULT_LOGO3D_SCENE)
  })
})

describe('applyLogo3DPatch', () => {
  it('폰트·굵기·글자열을 바꾸면 입력이 폰트로 돌아간다', () => {
    const svgMode = { ...DEFAULT_LOGO3D_SCENE, source: 'svg' as const }
    for (const patch of [{ fontFamily: 'Inter' }, { fontWeight: 400 }, { text: 'AB' }]) {
      expect(applyLogo3DPatch(svgMode, patch).source).toBe('font')
    }
  })

  it('입력 종류를 같이 보내면 그 값을 따른다', () => {
    const svgMode = { ...DEFAULT_LOGO3D_SCENE, source: 'svg' as const }
    expect(applyLogo3DPatch(svgMode, { text: 'AB', source: 'svg' }).source).toBe('svg')
  })

  it('색·시점을 바꿔도 입력 종류는 그대로다', () => {
    const svgMode = { ...DEFAULT_LOGO3D_SCENE, source: 'svg' as const }
    expect(applyLogo3DPatch(svgMode, { view: 'isometric', zoom: 150 })).toMatchObject({ source: 'svg', view: 'isometric', zoom: 150 })
  })
})

describe('그레인', () => {
  it('0%면 잡음이 없다', () => {
    for (let i = 0; i < 20; i++) expect(Math.abs(grainNoise(i, i * 3, 0))).toBe(0)
  })

  it('같은 칸은 늘 같은 값이고 범위는 셰이더 식 안이다(최대 20% → ±0.0624 이내)', () => {
    let min = Infinity
    let max = -Infinity
    for (let x = 0; x < 64; x++) {
      for (let y = 0; y < 64; y++) {
        const v = grainNoise(x, y, 20)
        expect(grainNoise(x, y, 20)).toBe(v)
        min = Math.min(min, v)
        max = Math.max(max, v)
      }
    }
    expect(min).toBeLessThan(0)
    expect(max).toBeGreaterThan(0)
    expect(Math.max(Math.abs(min), Math.abs(max))).toBeLessThanOrEqual((1.2 * 20 * 0.26) / 100 + 1e-9)
  })

  it('그레인 한 알은 높이 700px당 1px로 커진다(셰이더 uGrainPx와 같다)', () => {
    expect(grainCellPx(500)).toBe(1)
    expect(grainCellPx(1400)).toBe(2)
    expect(grainCellPx(2048)).toBe(3)
  })

  it('paintBackground는 그레인이 있으면 칠한 배경의 픽셀을 바꾸고, 투명 배경에는 입히지 않는다', () => {
    const size = 8
    const make = () => {
      const data = new Uint8ClampedArray(size * size * 4).fill(128)
      const getImageData = vi.fn(() => ({ data }) as unknown as ImageData)
      const putImageData = vi.fn()
      const gradient = { addColorStop: vi.fn() }
      const ctx = {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        createLinearGradient: vi.fn(() => gradient),
        fillStyle: '' as unknown,
        getImageData,
        putImageData,
      }
      return { ctx: ctx as unknown as CanvasRenderingContext2D, data, getImageData, putImageData }
    }

    const none = make()
    paintBackground(none.ctx, composeBackground('solid', '#808080', '#000000', 0, size, size), size, size, 0)
    expect(none.getImageData).not.toHaveBeenCalled()

    const grained = make()
    paintBackground(grained.ctx, composeBackground('solid', '#808080', '#000000', 0, size, size), size, size, 20)
    expect(grained.putImageData).toHaveBeenCalledTimes(1)
    expect(new Set(grained.data).size).toBeGreaterThan(1)

    const transparent = make()
    paintBackground(transparent.ctx, composeBackground('transparent', '#808080', '#000000', 0, size, size), size, size, 20)
    expect(transparent.getImageData).not.toHaveBeenCalled()
  })
})
