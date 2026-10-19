import { describe, expect, it } from 'vitest'
import { dropLossText } from '../drop-loss-text'

describe('dropLossText — 사라질 양 문구의 조사가 숫자 받침을 따른다 (티켓 20261018_1817)', () => {
  it.each([
    [1, '채운 잼 1은 사라져요. 돌려받을 수 없어요.'],
    [2, '채운 잼 2는 사라져요. 돌려받을 수 없어요.'],
    [3, '채운 잼 3은 사라져요. 돌려받을 수 없어요.'],
    [5, '채운 잼 5는 사라져요. 돌려받을 수 없어요.'],
    [10, '채운 잼 10은 사라져요. 돌려받을 수 없어요.'],
    [12, '채운 잼 12는 사라져요. 돌려받을 수 없어요.'],
  ])('%i → %s', (lostFill, expected) => {
    expect(dropLossText(lostFill)).toBe(expected)
  })

  it('조사 마커 문자가 그대로 남지 않는다', () => {
    expect(dropLossText(7)).not.toMatch(/[{}/]/)
  })
})
