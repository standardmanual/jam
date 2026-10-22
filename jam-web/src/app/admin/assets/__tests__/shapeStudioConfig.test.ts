import { describe, expect, it } from 'vitest'
import {
  buildSdfFromMask,
  cloneState,
  computeGeometry,
  DEFAULT_STATE,
  edt,
  GLYPH_PRESETS,
  GRADIENT_PRESETS,
  hasActiveRandomOption,
  hexToRgb,
  INITIAL_RAND_TOGGLES,
  INITIAL_STATE,
  makeState,
  randomizeState,
  SHAPE_PRESETS,
  validatePresetState,
} from '../shapeStudioConfig'

describe('shapeStudioConfig', () => {
  it('초깃값과 프리셋 목록이 원본 Shape Studio v2 스펙과 일치한다', () => {
    expect(DEFAULT_STATE).toEqual(INITIAL_STATE)
    expect(INITIAL_STATE.version).toBe(2)
    expect(INITIAL_STATE.shape).toBe('mushroom')
    expect(INITIAL_STATE.grad).toBe('morning')
    expect(INITIAL_STATE.segments).toHaveLength(2)
    expect(SHAPE_PRESETS).toHaveLength(2)
    expect(GLYPH_PRESETS.map((g) => g.glyph)).toEqual(['J', 'A', 'M', 'JAM'])
    expect(GRADIENT_PRESETS).toHaveLength(14)
    expect(hexToRgb('#ff0080')[0]).toBeCloseTo(1)
    expect(hexToRgb('#ff0080')[1]).toBeCloseTo(0)
  })

  it('세그먼트 모드와 글자 모드에서 기하 유니폼을 계산하고 Mushroom·Hourglass 상하 세그먼트가 간격 없이 겹쳐 붙는다', () => {
    const segGeo = computeGeometry(INITIAL_STATE)
    expect(segGeo.glyph).toBeUndefined()
    expect(segGeo.ext).toBeGreaterThan(0)
    expect(segGeo.fit).toBeLessThanOrEqual(1)
    expect(segGeo.geo).toHaveLength(16)
    expect(segGeo.rad).toHaveLength(16)

    for (const preset of SHAPE_PRESETS) {
      expect(preset.overlap).toBeGreaterThan(0)
      const presetState = makeState(preset, GRADIENT_PRESETS[0])
      const g = computeGeometry(presetState)
      const bottom0 = g.geo[0] - g.geo[1]
      const top1 = g.geo[4] + g.geo[5]
      expect(bottom0).toBeLessThan(top1)
    }

    const glyphState = {
      ...cloneState(INITIAL_STATE),
      glyph: 'JAM',
      shape: 'glyph-JAM',
      width: 520,
    }
    const gGeo = computeGeometry(glyphState)
    expect(gGeo.glyph).toBe(true)
    expect(gGeo.spanFull).toBeGreaterThan(0)
    expect(gGeo.ext).toBeGreaterThan(0)
  })

  it('edt 및 buildSdfFromMask가 유클리드 거리장을 계산한다', () => {
    const size = 16
    const mask = new Uint8Array(size * size)
    for (let y = 4; y < 12; y++) {
      for (let x = 4; x < 12; x++) {
        mask[y * size + x] = 1
      }
    }
    const sdf = buildSdfFromMask(mask, size, 8)
    expect(sdf).toHaveLength(size * size)
    // 중심부(내부)는 128 미만, 외곽 모서리(외부)는 128 초과
    expect(sdf[8 * size + 8]).toBeLessThan(128)
    expect(sdf[0]).toBeGreaterThan(128)

    const grid = new Float64Array([0, 1e20, 1e20, 1e20])
    edt(grid, 2, 2)
    expect(grid[0]).toBe(0)
    expect(grid[1]).toBe(1)
    expect(grid[2]).toBe(1)
    expect(grid[3]).toBe(2)
  })

  it('randomizeState가 활성화된 토글에 따라 상태를 갱신한다', () => {
    let seed = 0.42
    const deterministicRng = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    expect(hasActiveRandomOption(INITIAL_STATE, INITIAL_RAND_TOGGLES)).toBe(true)
    const nextSeg = randomizeState(INITIAL_STATE, INITIAL_RAND_TOGGLES, deterministicRng)
    expect(nextSeg.shape).toBe('custom')
    expect(nextSeg.grad).not.toBe(INITIAL_STATE.grad)

    const glyphState = {
      ...cloneState(INITIAL_STATE),
      glyph: 'J',
      shape: 'glyph-J',
    }
    const nextGlyph = randomizeState(glyphState, INITIAL_RAND_TOGGLES, deterministicRng)
    expect(nextGlyph.glyph).toBe('J')
    expect(nextGlyph.width).toBeGreaterThanOrEqual(280)
    expect(nextGlyph.width).toBeLessThanOrEqual(460)
  })

  it('validatePresetState가 올바른 JSON 설정을 통과시키고 잘못된 입력을 거부한다', () => {
    const valid = validatePresetState(cloneState(INITIAL_STATE))
    expect(valid.version).toBe(2)
    expect(valid.shape).toBe('custom')
    expect(valid.grad).toBe('custom')

    const valid916 = validatePresetState({
      ...cloneState(INITIAL_STATE),
      ratio: '9:16',
    })
    expect(valid916.ratio).toBe('9:16')

    expect(() => validatePresetState({ version: 1 })).toThrow('Shape Studio v2 설정 파일을 선택해주세요.')
    expect(() =>
      validatePresetState({
        ...cloneState(INITIAL_STATE),
        colors: ['#000000'],
      })
    ).toThrow('색상 설정이 올바르지 않습니다.')
    expect(() =>
      validatePresetState({
        ...cloneState(INITIAL_STATE),
        ratio: '3:2',
      })
    ).toThrow('비율이 올바르지 않습니다.')
    expect(() =>
      validatePresetState({
        ...cloneState(INITIAL_STATE),
        segments: [],
      })
    ).toThrow('세그먼트는 1~4개여야 합니다.')
  })
})
