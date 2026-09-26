/**
 * 이미지 컬럼 변경 시 제작 경로 초기화 판정 (티켓 20260925_1940 방침 A)
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/imageSourceReset.test.ts
 */
import { describe, it, expect } from 'vitest'
import { imageSourceReset, imageUrlTypeError } from '../imageSourceReset'

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

  it('문자열이 아닌 값이 와도 던지지 않는다(티켓 20260926_0203)', () => {
    const nonStrings = [123, { a: 1 }, ['x'], true] as unknown as string[]
    for (const value of nonStrings) {
      expect(() => imageSourceReset('https://cdn/a.png', value)).not.toThrow()
      expect(() => imageSourceReset(value, 'https://cdn/a.png')).not.toThrow()
    }
    expect(imageSourceReset('https://cdn/a.png', 123 as unknown as string)).toEqual({ image_source: null })
    expect(imageSourceReset(null, 123 as unknown as string)).toEqual({})
  })
})

describe('imageUrlTypeError', () => {
  it('문자열·null·undefined는 통과시킨다', () => {
    expect(imageUrlTypeError('https://cdn/a.png')).toBeNull()
    expect(imageUrlTypeError('')).toBeNull()
    expect(imageUrlTypeError(null)).toBeNull()
    expect(imageUrlTypeError(undefined)).toBeNull()
  })

  it('숫자·객체·배열·불리언은 거절 문구를 돌려주고 내부 정보를 담지 않는다', () => {
    for (const value of [123, { a: 1 }, ['x'], true]) {
      const message = imageUrlTypeError(value)
      expect(message).toBe('이미지 주소는 문자열이어야 합니다.')
    }
  })
})
