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
  isForeignImageSource,
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

const PATH = 'items[0]'
const HOST = 'abc.supabase.co'
const OWN = `https://${HOST}/storage/v1/object/public/assets/a.png`

describe('isForeignImageSource (티켓 20261007_1620)', () => {
  it('저장소 https 주소와 같은 출처 경로는 통과한다', () => {
    expect(isForeignImageSource(OWN, HOST)).toBe(false)
    expect(isForeignImageSource('/images/a.png', HOST)).toBe(false)
  })

  it('다른 호스트·http·프로토콜 없는 외부 주소는 밖의 주소다', () => {
    expect(isForeignImageSource('https://evil.example/a.png', HOST)).toBe(true)
    expect(isForeignImageSource(`http://${HOST}/a.png`, HOST)).toBe(true)
    expect(isForeignImageSource('//evil.example/a.png', HOST)).toBe(true)
    expect(isForeignImageSource('/\\evil.example/a.png', HOST)).toBe(true)
    expect(isForeignImageSource(`https://${HOST}.evil.example/a.png`, HOST)).toBe(true)
  })

  it('값 안에 낀 탭·개행은 브라우저가 지우므로 걷어낸 뒤 판정한다', () => {
    for (const v of ['/\t/evil.example/a.png', '/\n/evil.example/a.png', '/\r/evil.example/a.png', '/\\\t/evil.example/a.png', '\t//evil.example/a.png', 'ht\ntps://evil.example/a.png']) {
      expect(isForeignImageSource(v, HOST), JSON.stringify(v)).toBe(true)
    }
    expect(isForeignImageSource('/images/\ta.png', HOST)).toBe(false)
  })

  it('저장소 호스트를 모르면 모든 http(s) 주소가 밖의 주소다', () => {
    expect(isForeignImageSource(OWN, null)).toBe(true)
    expect(isForeignImageSource('/images/a.png', null)).toBe(false)
  })
})

describe('imageSpecToRenderArgs — 외부 이미지 주소 (티켓 20261007_1620)', () => {
  it('이미지 레이어의 외부 주소 값은 건너뛰고 저장소 주소·로컬 경로·텍스트 값은 남긴다', () => {
    const spec = {
      preset_id: 'p1',
      bg: '#111111',
      end: '#222222',
      values: { img01: 'https://evil.example/a.png', img02: OWN, img03: '/images/a.png', text01: 'https://evil.example 글자' },
    }
    expect(imageSpecToRenderArgs(spec, 1, HOST)?.values).toEqual({ img02: OWN, img03: '/images/a.png', text01: 'https://evil.example 글자' })
  })
  it('탭·개행을 끼운 외부 주소도 건너뛴다', () => {
    const spec = { preset_id: 'p1', bg: '#111111', end: '#222222', values: { img01: '/\t/evil.example/a.png', img02: '/\n/evil.example/b.png', img03: '/images/a.png' } }
    expect(imageSpecToRenderArgs(spec, 1, HOST)?.values).toEqual({ img03: '/images/a.png' })
  })
})

describe('imageSpecWarnings — 외부 이미지 주소 (티켓 20261007_1620)', () => {
  const base = { preset_id: 'p1', bg: '#111111', end: '#222222' }

  it('이미지 레이어의 외부 주소마다 경고 한 줄을 낸다', () => {
    const warnings = imageSpecWarnings({ ...base, values: { img01: 'https://evil.example/a.png', img02: '//evil.example/b.png' } }, PATH, HOST)
    expect(warnings).toEqual([
      expect.stringContaining('image_spec.values.img01: JAM! 저장소의 이미지 주소가 아니에요'),
      expect.stringContaining('image_spec.values.img02: JAM! 저장소의 이미지 주소가 아니에요'),
    ])
  })

  it('탭·개행을 끼운 외부 주소도 경고한다', () => {
    const warnings = imageSpecWarnings({ ...base, values: { img01: '/\t/evil.example/a.png' } }, PATH, HOST)
    expect(warnings).toEqual([expect.stringContaining('image_spec.values.img01: JAM! 저장소의 이미지 주소가 아니에요')])
  })

  it('저장소 주소·로컬 경로·텍스트 값은 경고하지 않는다', () => {
    expect(imageSpecWarnings({ ...base, values: { img01: OWN, img02: '/images/a.png', text01: 'https://evil.example' } }, PATH, HOST)).toEqual([])
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
