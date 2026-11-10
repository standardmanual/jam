import { describe, it, expect } from 'vitest'
import { buildQueryHref, readEnumParam, readPageParam, readSingleParam } from '../urlQueryState'

const TABS = ['ongoing', 'joined', 'ended'] as const

describe('readEnumParam', () => {
  it('허용한 값은 그대로 읽는다', () => {
    expect(readEnumParam(new URLSearchParams('tab=ended'), 'tab', TABS, 'ongoing')).toBe('ended')
  })
  it('쿼리가 없으면 기본값', () => {
    expect(readEnumParam(new URLSearchParams(''), 'tab', TABS, 'ongoing')).toBe('ongoing')
  })
  it('모르는 값·빈 값은 기본값', () => {
    expect(readEnumParam(new URLSearchParams('tab=xyz'), 'tab', TABS, 'ongoing')).toBe('ongoing')
    expect(readEnumParam(new URLSearchParams('tab='), 'tab', TABS, 'ongoing')).toBe('ongoing')
  })
  it('중복 키는 기본값', () => {
    expect(readEnumParam(new URLSearchParams('tab=ended&tab=joined'), 'tab', TABS, 'ongoing')).toBe('ongoing')
  })
  it('Object.prototype 이름은 허용 값으로 통과하지 않는다', () => {
    expect(readEnumParam(new URLSearchParams('tab=constructor'), 'tab', TABS, 'ongoing')).toBe('ongoing')
  })
})

describe('readPageParam', () => {
  it('양의 정수는 그 번호', () => {
    expect(readPageParam(new URLSearchParams('page=3'), 'page')).toBe(3)
  })
  it('없음·0·음수·소수·문자·앞자리 0·중복은 1쪽', () => {
    for (const q of ['', 'page=0', 'page=-2', 'page=1.5', 'page=abc', 'page=007', 'page=', 'page=2&page=3']) {
      expect(readPageParam(new URLSearchParams(q), 'page')).toBe(1)
    }
  })
})

describe('readSingleParam', () => {
  it('한 번 나온 키만 값을 돌려준다', () => {
    expect(readSingleParam(new URLSearchParams('a=1'), 'a')).toBe('1')
    expect(readSingleParam(new URLSearchParams('a=1&a=2'), 'a')).toBeNull()
    expect(readSingleParam(new URLSearchParams(''), 'a')).toBeNull()
  })
})

describe('buildQueryHref', () => {
  it('값을 쓰면 쿼리가 붙는다', () => {
    expect(buildQueryHref('/missions', new URLSearchParams(), { tab: 'ended' })).toBe('/missions?tab=ended')
  })
  it('null이면 키를 지우고 쿼리가 비면 물음표도 없다', () => {
    expect(buildQueryHref('/missions', new URLSearchParams('tab=ended'), { tab: null })).toBe('/missions')
  })
  it('다른 쿼리와 해시는 보존하고 요청한 키만 바꾼다', () => {
    expect(buildQueryHref('/jam', new URLSearchParams('u=jam&feed=badge'), { feed: 'mission' }, '#x')).toBe(
      '/jam?u=jam&feed=mission#x',
    )
    expect(buildQueryHref('/jam', new URLSearchParams('u=jam&feed=badge'), { feed: null })).toBe('/jam?u=jam')
  })
  it('여러 키를 한 번에 바꾼다 (VOC 정렬 전환: sort 쓰고 page 지움)', () => {
    expect(buildQueryHref('/voc', new URLSearchParams('page=3'), { sort: 'answered', page: null })).toBe(
      '/voc?sort=answered',
    )
  })
})
