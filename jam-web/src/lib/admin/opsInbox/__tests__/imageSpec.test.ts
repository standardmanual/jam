/**
 * `image_spec` 칸 규칙 (티켓 20261007_1030). 순수 함수만 본다.
 *
 * - 종류별 이미지 칸 이름·종류 판정
 * - `readImageSpec`: 수정본 우선, 객체가 아니면 null
 * - `imageSpecToRenderArgs`: `preset_id` 없으면 null, 값은 문자열만 남김
 * - `stableImageSeed`·`previewRenderArgs`: 항목 ID의 고정 시드, 색이 없으면 임시 중립색(티켓 20261101_2149)
 * - `imageSpecWarnings`: 비어 있음·모양 틀림은 경고 문장, 제대로 된 값은 경고 없음
 */
import { describe, it, expect } from 'vitest'
import {
  PREVIEW_NEUTRAL_BG,
  PREVIEW_NEUTRAL_END,
  imageKeyOfKind,
  imageSpecToRenderArgs,
  imageSpecWarnings,
  isImageKind,
  previewRenderArgs,
  readImageSpec,
  stableImageSeed,
} from '../imageSpec'

describe('종류별 이미지 칸', () => {
  it('카드는 cover_image_url, 미션·배지·컬렉션은 image_url, 그 밖은 null이다', () => {
    expect(imageKeyOfKind('home_feed_card')).toBe('cover_image_url')
    expect(['mission', 'jam_badge', 'collection_launch'].map(imageKeyOfKind)).toEqual(['image_url', 'image_url', 'image_url'])
    expect(imageKeyOfKind('recipe')).toBeNull()
    expect(imageKeyOfKind(null)).toBeNull()
    expect(isImageKind('mission')).toBe(true)
    expect(isImageKind('drop_schedule')).toBe(false)
  })
})

describe('readImageSpec', () => {
  it('수정본이 있으면 수정본을 읽는다', () => {
    const item = { original: { image_spec: { preset_id: 'a' } }, edited: { image_spec: { preset_id: 'b' } } }
    expect(readImageSpec(item)).toEqual({ preset_id: 'b' })
  })

  it('없거나 객체가 아니면 null이다', () => {
    expect(readImageSpec({ original: {}, edited: null })).toBeNull()
    expect(readImageSpec({ original: { image_spec: 'x' }, edited: null })).toBeNull()
  })
})

describe('imageSpecToRenderArgs', () => {
  it('preset_id가 없으면 null이다', () => {
    expect(imageSpecToRenderArgs(null, 1)).toBeNull()
    expect(imageSpecToRenderArgs({ bg: '#ffffff' }, 1)).toBeNull()
    expect(imageSpecToRenderArgs({ preset_id: ' ' }, 1)).toBeNull()
  })

  it('제작 인자로 바꾸고 문자열이 아닌 values 값은 버린다', () => {
    const spec = { preset_id: 'p1', bg: '#111111', end: '#222222', values: { title: '제목', n: 3 } } as unknown as Parameters<
      typeof imageSpecToRenderArgs
    >[0]
    expect(imageSpecToRenderArgs(spec, 7)).toEqual({ presetId: 'p1', bg: '#111111', end: '#222222', values: { title: '제목' }, seed: 7 })
  })
})

describe('imageSpecWarnings', () => {
  const PATH = 'items[0]'

  it('모양이 맞으면 경고가 없다', () => {
    expect(imageSpecWarnings({ preset_id: 'p1', bg: '#111111', end: '#222222', values: { title: '제목' } }, PATH)).toEqual([])
  })

  it('없거나 빈 객체면 「비어 있어요」 한 줄이다', () => {
    for (const value of [undefined, null, {}]) {
      const warnings = imageSpecWarnings(value, PATH)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toMatch(/^items\[0\]\.image_spec: 비어 있어요/)
    }
  })

  it('객체가 아니면 경고한다', () => {
    expect(imageSpecWarnings('x', PATH)[0]).toMatch(/^items\[0\]\.image_spec: 객체여야 해요/)
    expect(imageSpecWarnings([1], PATH)[0]).toMatch(/객체여야 해요/)
  })

  it('칸 모양이 틀리면 칸마다 한 줄씩 경고한다', () => {
    const warnings = imageSpecWarnings({ preset_id: 1, bg: '', end: true, values: { a: 1 } }, PATH)
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('image_spec.preset_id: 비어 있지 않은 문자열'),
        expect.stringContaining('image_spec.bg: 비어 있지 않은 문자열'),
        expect.stringContaining('image_spec.end: 비어 있지 않은 문자열'),
        expect.stringContaining('image_spec.values.a: 문자열이어야 해요'),
      ])
    )
    expect(imageSpecWarnings({ preset_id: 'p', bg: '#111111', end: '#222222', values: 'x' }, PATH)).toEqual([
      expect.stringContaining('image_spec.values: 문자열 값을 가진 객체'),
    ])
  })

  it('preset_id만 빠져도 경고한다', () => {
    expect(imageSpecWarnings({ bg: '#111111' }, PATH)).toEqual([expect.stringContaining('image_spec.preset_id: 없어요')])
  })

  it('프리셋이 있는데 bg·end가 없으면 없는 칸을 짚어 경고한다(오류 아님)', () => {
    expect(imageSpecWarnings({ preset_id: 'p' }, PATH)).toEqual([
      expect.stringMatching(/^items\[0\]\.image_spec\.bg·end: 없어요\. 색이 없으면 이미지가 만들어지지 않아요\./),
    ])
    expect(imageSpecWarnings({ preset_id: 'p', bg: '#111111' }, PATH)).toEqual([expect.stringContaining('image_spec.end: 없어요')])
    expect(imageSpecWarnings({ preset_id: 'p', end: '#222222', bg: null }, PATH)).toEqual([expect.stringContaining('image_spec.bg: 없어요')])
  })
})

describe('stableImageSeed', () => {
  it('같은 항목 ID는 늘 같은 시드이고, 다른 ID는 (이 표본에서) 다른 시드다', () => {
    expect(stableImageSeed('item-1')).toBe(stableImageSeed('item-1'))
    expect(stableImageSeed('item-1')).not.toBe(stableImageSeed('item-2'))
  })

  it('0 이상 2^31 미만의 정수다', () => {
    for (const id of ['', 'a', 'item-1', '3f2a9c1e-7b4d-4e0a-9d55-0a1b2c3d4e5f', '한글 아이디']) {
      const seed = stableImageSeed(id)
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThan(0x80000000)
    }
  })
})

describe('previewRenderArgs', () => {
  it('preset_id가 없으면 null이다', () => {
    expect(previewRenderArgs(null, 'item-1')).toBeNull()
    expect(previewRenderArgs({ bg: '#111111', end: '#222222' }, 'item-1')).toBeNull()
  })

  it('색이 모두 있으면 제작 인자와 같고 시드는 항목 ID의 고정 시드다', () => {
    const spec = { preset_id: 'p1', bg: '#111111', end: '#222222', values: { title: '제목' } }
    const out = previewRenderArgs(spec, 'item-1')
    expect(out).toEqual({ args: imageSpecToRenderArgs(spec, stableImageSeed('item-1')), tempColor: false })
  })

  it('색이 없으면 임시 중립색으로 채우고 tempColor다. 실제 제작 인자(imageSpecToRenderArgs)는 그대로 빈 색이다', () => {
    const spec = { preset_id: 'p1' }
    const out = previewRenderArgs(spec, 'item-1')
    expect(out?.tempColor).toBe(true)
    expect(out?.args).toMatchObject({ bg: PREVIEW_NEUTRAL_BG, end: PREVIEW_NEUTRAL_END })
    expect(imageSpecToRenderArgs(spec, 1)).toMatchObject({ bg: '', end: '' })
  })

  it('한쪽 색만 있으면 있는 색을 따르고 tempColor다', () => {
    const out = previewRenderArgs({ preset_id: 'p1', bg: '#123456' }, 'item-1')
    expect(out).toMatchObject({ tempColor: true, args: { bg: '#123456', end: '#123456' } })
  })
})
