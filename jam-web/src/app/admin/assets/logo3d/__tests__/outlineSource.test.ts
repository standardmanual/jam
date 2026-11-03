// 티켓 20261103_1734 — 폰트·SVG → 윤곽 변환 로직 시험 (별도 3D 화면에서 옮긴 동작이 그대로인지 고정한다).
// 고정하는 것: 폰트 캐시, 오류 시 이전 형상 유지(applyResult), 글자열이 비었을 때, 취소, SVG 기본 로고와 올린 파일의 오류 겹침.
import { DOMParser as XmlDomParser, XMLSerializer as XmlSerializer } from '@xmldom/xmldom'
import type { Font } from 'opentype.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LogoOutline } from '@/lib/logo-3d/types'
import {
  applyResult,
  defaultLogoOutline,
  EMPTY_INPUT_RESULT,
  EMPTY_TEXT_ERROR,
  FONT_FETCH_ERROR,
  FONT_PARSE_ERROR,
  MAX_SVG_BYTES,
  pickInputResult,
  resolveFontOutline,
  resolveSvgFile,
  SVG_TOO_LARGE_ERROR,
  type FontCache,
  type InputResult,
} from '../outlineSource'

const { parseMock, fontToOutlineMock } = vi.hoisted(() => ({ parseMock: vi.fn(), fontToOutlineMock: vi.fn() }))
vi.mock('opentype.js', () => ({ parse: parseMock }))
vi.mock('@/lib/logo-3d/fontOutline', () => ({ fontToOutline: fontToOutlineMock }))

const square: LogoOutline = [{ outer: [[0, 0], [1, 0], [1, 1], [0, 1]], holes: [] }]
const other: LogoOutline = [{ outer: [[0, 0], [2, 0], [2, 2], [0, 2]], holes: [] }]
const fakeFont = { tag: 'font' } as unknown as Font

function okResponse(): Response {
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response
}

beforeEach(() => {
  parseMock.mockReset().mockReturnValue(fakeFont)
  fontToOutlineMock.mockReset().mockReturnValue({ outline: square, warnings: [], error: null })
})

describe('applyResult — 오류가 나면 이전 형상을 유지한다', () => {
  const prev: InputResult = { outline: square, warnings: ['이전 경고'], error: null }

  it('성공하면 윤곽·경고를 바꾸고 오류를 지운다', () => {
    const next = applyResult({ ...prev, error: '옛 오류' }, { outline: other, warnings: [], error: null })
    expect(next).toEqual({ outline: other, warnings: [], error: null })
  })

  it('실패하면 윤곽·경고는 그대로 두고 오류만 채운다', () => {
    const next = applyResult(prev, { outline: null, warnings: [], error: '실패' })
    expect(next).toEqual({ outline: square, warnings: ['이전 경고'], error: '실패' })
  })
})

describe('resolveFontOutline', () => {
  const base = { family: 'Poppins', weight: 700, text: 'JAM' }

  it('폰트를 받아 윤곽으로 바꾸고 같은 폰트는 캐시를 쓴다', async () => {
    const cache: FontCache = new Map()
    const fetchImpl = vi.fn(async () => okResponse())
    const first = await resolveFontOutline({ ...base, cache, fetchImpl: fetchImpl as unknown as typeof fetch })
    const second = await resolveFontOutline({ ...base, text: 'JAMS', cache, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(first?.outline).toBe(square)
    expect(second?.error).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((fetchImpl.mock.calls as unknown as [string][])[0][0]).toBe('/api/admin/logo-3d/font?family=Poppins&weight=700')
    expect(cache.get('Poppins|700')).toBe(fakeFont)
  })

  it('폰트나 굵기가 다르면 새로 받는다', async () => {
    const cache: FontCache = new Map()
    const fetchImpl = vi.fn(async () => okResponse())
    await resolveFontOutline({ ...base, cache, fetchImpl: fetchImpl as unknown as typeof fetch })
    await resolveFontOutline({ ...base, weight: 400, cache, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('글자열이 비면 받지 않고 비었다는 오류를 돌려준다', async () => {
    const fetchImpl = vi.fn()
    const result = await resolveFontOutline({ ...base, text: '   ', cache: new Map(), fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(result).toEqual({ outline: null, warnings: [], error: EMPTY_TEXT_ERROR })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('서버가 준 오류 문구를 그대로 쓰고, 없으면 기본 문구를 쓴다', async () => {
    const withBody = vi.fn(async () => ({ ok: false, json: async () => ({ error: '서버 문구' }) }) as unknown as Response)
    const noBody = vi.fn(async () => ({ ok: false, json: async () => Promise.reject(new Error('x')) }) as unknown as Response)
    expect((await resolveFontOutline({ ...base, cache: new Map(), fetchImpl: withBody as unknown as typeof fetch }))?.error).toBe('서버 문구')
    expect((await resolveFontOutline({ ...base, cache: new Map(), fetchImpl: noBody as unknown as typeof fetch }))?.error).toBe(FONT_FETCH_ERROR)
  })

  it('폰트 파일을 읽지 못하면 읽기 오류를 돌려주고 캐시하지 않는다', async () => {
    parseMock.mockImplementation(() => {
      throw new Error('bad font')
    })
    const cache: FontCache = new Map()
    const result = await resolveFontOutline({ ...base, cache, fetchImpl: (async () => okResponse()) as unknown as typeof fetch })
    expect(result?.error).toBe(FONT_PARSE_ERROR)
    expect(cache.size).toBe(0)
  })

  it('네트워크가 끊기면 받기 오류를 돌려준다', async () => {
    const result = await resolveFontOutline({
      ...base,
      cache: new Map(),
      fetchImpl: (async () => {
        throw new TypeError('network')
      }) as unknown as typeof fetch,
    })
    expect(result?.error).toBe(FONT_FETCH_ERROR)
  })

  it('요청이 취소되면(AbortError) 결과를 돌려주지 않는다', async () => {
    const result = await resolveFontOutline({
      ...base,
      cache: new Map(),
      fetchImpl: (async () => {
        throw new DOMException('aborted', 'AbortError')
      }) as unknown as typeof fetch,
    })
    expect(result).toBeNull()
  })

  it('변환 오류는 그대로 전달돼 applyResult가 이전 형상을 유지하게 한다', async () => {
    fontToOutlineMock.mockReturnValue({ outline: [], warnings: [], error: '글자 윤곽을 만들지 못했어요.' })
    const cache: FontCache = new Map([['Poppins|700', fakeFont]])
    const result = await resolveFontOutline({ ...base, cache })
    const merged = applyResult({ outline: square, warnings: [], error: null }, result!)
    expect(merged.outline).toBe(square)
    expect(merged.error).toBe('글자 윤곽을 만들지 못했어요.')
  })
})

describe('resolveSvgFile', () => {
  it('5MB를 넘으면 읽지 않고 크기 오류를 돌려준다', async () => {
    const file = { size: MAX_SVG_BYTES + 1, text: vi.fn() } as unknown as File
    expect(await resolveSvgFile(file)).toEqual({ error: SVG_TOO_LARGE_ERROR })
    expect(file.text).not.toHaveBeenCalled()
  })

  it('파일을 열지 못하면 읽기 오류를 돌려준다', async () => {
    const file = { size: 10, text: async () => Promise.reject(new Error('io')) } as unknown as File
    const result = await resolveSvgFile(file)
    expect('error' in result && result.error).toContain('SVG를 읽지 못했어요')
  })
})

describe('SVG 기본 로고', () => {
  const globals = globalThis as Record<string, unknown>
  const original = { DOMParser: globals.DOMParser, XMLSerializer: globals.XMLSerializer }

  beforeAll(() => {
    globals.DOMParser = XmlDomParser
    globals.XMLSerializer = XmlSerializer
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterAll(() => {
    globals.DOMParser = original.DOMParser
    globals.XMLSerializer = original.XMLSerializer
    vi.restoreAllMocks()
  })

  it('SVG 모드에서 올린 파일이 없으면 기본 로고 윤곽을 만든다', () => {
    const outcome = defaultLogoOutline('svg', '')
    expect(outcome?.error).toBeNull()
    expect(outcome?.outline?.length).toBeGreaterThan(0)
  })

  it('폰트 모드이거나 올린 파일이 있으면 만들지 않는다', () => {
    expect(defaultLogoOutline('font', '')).toBeNull()
    expect(defaultLogoOutline('svg', '<svg/>')).toBeNull()
  })

  it('pickInputResult — 폰트 모드는 폰트 결과, SVG 모드는 기본 로고(없으면 올린 파일) 결과를 쓴다', () => {
    const fontResult: InputResult = { outline: square, warnings: [], error: null }
    const svgResult: InputResult = { outline: other, warnings: [], error: null }
    const defaultOutcome = { outline: other, warnings: ['기본'], error: null }
    expect(pickInputResult({ source: 'font', fontResult, svgResult, defaultOutcome })).toBe(fontResult)
    expect(pickInputResult({ source: 'svg', fontResult, svgResult, defaultOutcome: null })).toBe(svgResult)
    expect(pickInputResult({ source: 'svg', fontResult, svgResult, defaultOutcome })).toEqual({
      outline: other,
      warnings: ['기본'],
      error: null,
    })
  })

  it('올린 파일을 읽다 실패한 오류는 기본 로고 위에도 알린다', () => {
    const svgResult: InputResult = { ...EMPTY_INPUT_RESULT, error: 'SVG 오류' }
    const picked = pickInputResult({
      source: 'svg',
      fontResult: EMPTY_INPUT_RESULT,
      svgResult,
      defaultOutcome: { outline: other, warnings: [], error: null },
    })
    expect(picked.outline).toBe(other)
    expect(picked.error).toBe('SVG 오류')
  })
})
