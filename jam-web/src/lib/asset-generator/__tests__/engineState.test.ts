/**
 * engineState — 프리셋 모드별 설정값 검증 (티켓 20261103_1736)
 * 실행: cd jam-web && npx vitest run src/lib/asset-generator/__tests__/engineState.test.ts
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_LOGO3D_PARAMS } from '@/lib/logo-3d/types'
import {
  ENGINE_STATE_TOO_LARGE_MESSAGE,
  ENGINE_STATE_UNSUPPORTED_MESSAGE,
  INVALID_ENGINE_STATE_MESSAGE,
  MAX_ENGINE_STATE_BYTES,
  parseEngineStateInput,
  validateEngineState,
} from '../engineState'

const HOST = 'ceehnkzdbecxwzxrhhns.supabase.co'

function makeRaw(overrides: Record<string, unknown> = {}) {
  return {
    mode: '3d',
    version: 1,
    state: {
      source: 'font',
      fontFamily: 'Poppins',
      fontWeight: 700,
      text: 'JAM',
      params: { ...DEFAULT_LOGO3D_PARAMS },
      paletteId: 'steel-sky',
      frameColor: '#9ba3ab',
      tileColor: '#7cc4f0',
      rotX: 14,
      rotY: 22,
      rotZ: 3,
      zoom: 100,
      view: 'perspective',
      ...overrides,
    },
  }
}

describe('validateEngineState', () => {
  it('정상 값은 알려진 필드만 담아 돌려준다', () => {
    const raw = makeRaw({ extra: 'x' })
    const res = validateEngineState(raw, HOST)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.mode).toBe('3d')
      expect(res.value.state).not.toHaveProperty('extra')
      expect(res.value.state.params).toEqual(DEFAULT_LOGO3D_PARAMS)
    }
  })

  it('객체가 아니거나 state가 없으면 형식 오류다', () => {
    for (const raw of [null, 'x', 3, [], { mode: '3d', version: 1 }, { mode: '3d', version: 1, state: [] }]) {
      expect(validateEngineState(raw, HOST).ok).toBe(false)
    }
    expect(validateEngineState({ mode: '3d', version: 1 }, HOST)).toEqual({ ok: false, message: INVALID_ENGINE_STATE_MESSAGE })
  })

  it('알 수 없는 mode·version은 지원하지 않는 설정이다', () => {
    expect(validateEngineState({ ...makeRaw(), mode: 'cube' }, HOST)).toEqual({ ok: false, message: ENGINE_STATE_UNSUPPORTED_MESSAGE })
    expect(validateEngineState({ ...makeRaw(), version: 2 }, HOST)).toEqual({ ok: false, message: ENGINE_STATE_UNSUPPORTED_MESSAGE })
  })

  it.each([
    ['숫자가 유한수가 아님', { rotX: Number.NaN }],
    ['줌이 0 이하', { zoom: 0 }],
    ['숫자 자리에 문자열', { fontWeight: '700' }],
    ['source 값이 틀림', { source: 'png' }],
    ['view 값이 틀림', { view: 'top' }],
    ['색이 #rrggbb가 아님', { frameColor: 'red' }],
    ['params 값이 유한수가 아님', { params: { ...DEFAULT_LOGO3D_PARAMS, depth: Number.POSITIVE_INFINITY } }],
    ['params 키가 빠짐', { params: { depth: 0.3 } }],
    ['svgUrl이 저장소 주소가 아님', { svgUrl: 'https://evil.com/a.svg' }],
    ['svgUrl이 http', { svgUrl: `http://${HOST}/a.svg` }],
  ])('%s이면 형식 오류다', (_label, override) => {
    expect(validateEngineState(makeRaw(override), HOST)).toEqual({ ok: false, message: INVALID_ENGINE_STATE_MESSAGE })
  })

  it('저장소 호스트의 svgUrl과 svgName은 통과한다', () => {
    const res = validateEngineState(makeRaw({ svgUrl: `https://${HOST}/images/a.svg`, svgName: 'logo.svg' }), HOST)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.state).toMatchObject({ svgUrl: `https://${HOST}/images/a.svg`, svgName: 'logo.svg' })
  })
})

describe('parseEngineStateInput', () => {
  it('JSON 문자열을 검증해 돌려준다', () => {
    expect(parseEngineStateInput(JSON.stringify(makeRaw()), HOST).ok).toBe(true)
  })

  it('JSON이 아니면 형식 오류다', () => {
    expect(parseEngineStateInput('{not json', HOST)).toEqual({ ok: false, message: INVALID_ENGINE_STATE_MESSAGE })
  })

  it('32KB를 넘으면 크기 오류이고 그 이하는 통과한다', () => {
    const big = JSON.stringify(makeRaw({ text: 'x'.repeat(10) })) + ' '.repeat(MAX_ENGINE_STATE_BYTES)
    expect(parseEngineStateInput(big, HOST)).toEqual({ ok: false, message: ENGINE_STATE_TOO_LARGE_MESSAGE })
    expect(parseEngineStateInput(JSON.stringify(makeRaw()) + ' '.repeat(100), HOST).ok).toBe(true)
  })
})
