/**
 * 홈피드 카드 모양 상수·술어 (티켓 20261001_1152)
 *
 * 확인하는 것: 모양 5개와 이미지 모양 3개, 대소문자가 다른 값·옛 layout 값·문자열이 아닌 값은 모양이 아니다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/shape.test.ts
 */
import { describe, it, expect } from 'vitest'
import { CARD_SHAPES, IMAGE_CARD_SHAPES, isCardShape, isImageShape } from '../shape'

describe('카드 모양', () => {
  it('모양은 5개다(마이그레이션 206 today_cards_shape_check와 같은 목록)', () => {
    expect([...CARD_SHAPES]).toEqual(['hero', 'poster', 'square', 'brief', 'list'])
  })

  it('이미지 모양은 hero·poster·square 3개이고 모두 모양 목록 안에 있다', () => {
    expect([...IMAGE_CARD_SHAPES]).toEqual(['hero', 'poster', 'square'])
    for (const shape of IMAGE_CARD_SHAPES) expect(CARD_SHAPES).toContain(shape)
  })

  it.each(['hero', 'poster', 'square', 'brief', 'list'])('isCardShape: %s는 모양이다', (shape) => {
    expect(isCardShape(shape)).toBe(true)
  })

  it.each(['hero', 'poster', 'square'])('isImageShape: %s는 이미지 모양이다', (shape) => {
    expect(isImageShape(shape)).toBe(true)
  })

  it.each(['brief', 'list'])('isImageShape: %s는 이미지가 없는 모양이다', (shape) => {
    expect(isCardShape(shape)).toBe(true)
    expect(isImageShape(shape)).toBe(false)
  })

  it.each([
    ['대문자', 'Hero'],
    ['전부 대문자', 'POSTER'],
    ['앞뒤 공백', ' hero '],
    ['빈 문자열', ''],
    ['옛 layout 값', 'large_thumbnail'],
    ['옛 layout 값(기사)', 'editorial_article'],
    ['숫자', 1],
    ['null', null],
    ['undefined', undefined],
    ['배열', ['hero']],
    ['객체', { shape: 'hero' }],
  ])('모양이 아니다: %s', (_label, value) => {
    expect(isCardShape(value)).toBe(false)
    expect(isImageShape(value)).toBe(false)
  })
})
