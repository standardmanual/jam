/**
 * 이미지 컬럼 변경 시 제작 경로 초기화 판정 (티켓 20260925_1940 방침 A)
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/imageSourceReset.test.ts
 */
import { describe, it, expect } from 'vitest'
import { imageSourceReset } from '../imageSourceReset'

describe('imageSourceReset', () => {
  it('같은 값이면 건드리지 않는다', () => {
    expect(imageSourceReset('https://cdn/a.png', 'https://cdn/a.png')).toEqual({})
  })

  it('다른 값이면 image_source를 NULL로 되돌린다', () => {
    expect(imageSourceReset('https://cdn/a.png', 'https://cdn/b.png')).toEqual({ image_source: null })
  })

  it('다음 값이 undefined(본문에 없음)면 건드리지 않는다', () => {
    expect(imageSourceReset('https://cdn/a.png', undefined)).toEqual({})
    expect(imageSourceReset(null, undefined)).toEqual({})
  })

  it('null과 빈 문자열은 같은 값으로 본다', () => {
    expect(imageSourceReset(null, '')).toEqual({})
    expect(imageSourceReset('', null)).toEqual({})
    expect(imageSourceReset(undefined, null)).toEqual({})
  })

  it('공백뿐인 문자열은 빈 값으로, 앞뒤 공백은 무시하고 비교한다', () => {
    expect(imageSourceReset(null, '   ')).toEqual({})
    expect(imageSourceReset('https://cdn/a.png', ' https://cdn/a.png ')).toEqual({})
  })

  it('값이 없던 곳에 이미지가 생기거나 이미지가 지워지면 되돌린다', () => {
    expect(imageSourceReset(null, 'https://cdn/a.png')).toEqual({ image_source: null })
    expect(imageSourceReset('https://cdn/a.png', null)).toEqual({ image_source: null })
    expect(imageSourceReset('https://cdn/a.png', '')).toEqual({ image_source: null })
  })
})
