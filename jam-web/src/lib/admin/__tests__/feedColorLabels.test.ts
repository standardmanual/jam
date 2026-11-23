/**
 * 카드 폼 색 고르기 선택지 — 쓰임 표(`FEED_COLOR_USAGE`)에서 가져온다 (티켓 20261122_2225)
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/feedColorLabels.test.ts
 */
import { describe, expect, it } from 'vitest'
import { currentColorChoice, FEED_COLOR_LABELS, feedColorChoices } from '../feedColorLabels'
import { FEED_COLOR_USAGE } from '@/lib/today/feedConstants'

const values = (role: 'bg' | 'chip' | 'box') => feedColorChoices(role).map((choice) => choice.value)

describe('feedColorChoices — 자리마다 쓰임 표의 색만', () => {
  it('배경색은 바탕 색(노랑·초록·짙은 초록·분홍·하늘)이다', () => {
    expect(values('bg')).toEqual(['yellow', 'green', 'green-deep', 'pink', 'sky'])
  })

  it('박스 색은 박스 색(같은 다섯)이다', () => {
    expect(values('box')).toEqual(['yellow', 'green', 'green-deep', 'pink', 'sky'])
  })

  it('칩 색은 값 칩 색(노랑·초록·분홍·하늘·빨강·보라·흰색)이고 짙은 초록·파랑은 없다', () => {
    expect(values('chip')).toEqual(['yellow', 'green', 'pink', 'sky', 'red', 'purple', 'white'])
    expect(values('chip')).not.toContain('green-deep')
    expect(values('chip')).not.toContain('blue')
  })

  it('하드코딩 없이 쓰임 표를 그대로 읽는다', () => {
    expect(values('bg')).toEqual([...FEED_COLOR_USAGE.bg])
    expect(values('box')).toEqual([...FEED_COLOR_USAGE.box])
    expect(values('chip')).toEqual([...FEED_COLOR_USAGE.valueChip])
  })

  it('선택지는 색 이름과 견본 색 키를 함께 낸다', () => {
    for (const role of ['bg', 'chip', 'box'] as const) {
      for (const choice of feedColorChoices(role)) {
        expect(choice.label).toBe(FEED_COLOR_LABELS[choice.value])
        expect(choice.colorKey).toBe(choice.value)
      }
    }
  })
})

describe('currentColorChoice — 표 밖의 저장값은 «현재 값»으로만 보인다', () => {
  it('칩에 저장된 짙은 초록은 현재 값이고, 선택지 목록에는 없다', () => {
    const current = currentColorChoice('chip', 'green-deep')
    expect(current).toEqual({ value: 'green-deep', label: '짙은 그린 (현재 값)', colorKey: 'green-deep' })
    expect(values('chip')).not.toContain('green-deep')
  })

  it('표 안의 색·빈 값·모르는 키는 현재 값이 없다', () => {
    expect(currentColorChoice('chip', 'pink')).toBeUndefined()
    expect(currentColorChoice('bg', 'green-deep')).toBeUndefined()
    expect(currentColorChoice('box', '')).toBeUndefined()
    expect(currentColorChoice('box', null)).toBeUndefined()
    expect(currentColorChoice('bg', 'red-soft')).toBeUndefined()
  })

  it('바탕·박스에 저장된 빨강은 표 밖이라 현재 값이다', () => {
    expect(currentColorChoice('bg', 'red')?.label).toBe('레드 (현재 값)')
    expect(currentColorChoice('box', 'blue')?.label).toBe('블루 (현재 값)')
  })
})
