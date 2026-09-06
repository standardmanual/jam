/**
 * `searchParams` 정규화 헬퍼 회귀 테스트 (티켓 20260906_1312).
 *
 * 중복 쿼리 파라미터(`?q=a&q=b`)가 오면 Next가 배열을 넘겨 화면이 500으로 죽었다.
 * 이 헬퍼가 배열을 `undefined`로 흡수하는 것이 그 방어이므로, **배열 → undefined**와
 * **정상 문자열은 그대로 통과**를 여기서 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { singleQueryParam, pickSingleQueryParams } from '@/lib/searchParams'

describe('singleQueryParam', () => {
  it('문자열은 그대로 통과한다', () => {
    expect(singleQueryParam('checkin')).toBe('checkin')
  })

  it('빈 문자열도 문자열이므로 그대로 통과한다 (빈 값 처리는 호출부 폴백의 몫)', () => {
    expect(singleQueryParam('')).toBe('')
  })

  it('배열(중복 키)은 첫 값을 고르지 않고 undefined로 떨어뜨린다', () => {
    expect(singleQueryParam(['a', 'b'])).toBeUndefined()
    expect(singleQueryParam(['a'])).toBeUndefined()
    expect(singleQueryParam([])).toBeUndefined()
  })

  it('undefined는 undefined', () => {
    expect(singleQueryParam(undefined)).toBeUndefined()
  })
})

describe('pickSingleQueryParams', () => {
  it('레코드의 모든 값에 같은 규칙을 적용한다', () => {
    expect(
      pickSingleQueryParams({ page: '2', type: ['activity', 'item'], q: '', rarity: undefined })
    ).toEqual({ page: '2', type: undefined, q: '', rarity: undefined })
  })

  it('빈 레코드는 빈 레코드', () => {
    expect(pickSingleQueryParams({})).toEqual({})
  })
})
