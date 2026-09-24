/**
 * 어드민 목록 URL 상태 규칙 회귀 테스트(티켓 20260924_0940).
 *
 * 여기서 고정하는 것은 "필터가 바뀌면 1쪽으로 돌아가고, 정렬만 바뀌면 선택이 유지된다"는
 * 상위 티켓 §1 표준이다 — 전부 순수 함수라 DOM·라우터 없이 검증한다.
 */
import { describe, it, expect } from 'vitest'
import {
  applyListParamPatch,
  buildPageHref,
  buildPageList,
  filterKeyOf,
  sortToSorting,
  sortingToSort,
} from '@/lib/admin/list-params'

describe('applyListParamPatch', () => {
  it('필터 값이 바뀌면 page를 지운다', () => {
    const result = applyListParamPatch({ page: '3', status: 'active' }, { status: 'inactive' })
    expect(result.page).toBeUndefined()
    expect(result.status).toBe('inactive')
  })

  it('patch 값이 기본값과 같으면 키 자체를 지운다', () => {
    const result = applyListParamPatch({ status: 'inactive' }, { status: 'active' }, { defaults: { status: 'active' } })
    expect(result.status).toBeUndefined()
  })

  it('patch 값이 null·빈 문자열이어도 키를 지운다', () => {
    expect(applyListParamPatch({ q: 'abc' }, { q: null }).q).toBeUndefined()
    expect(applyListParamPatch({ q: 'abc' }, { q: '' }).q).toBeUndefined()
  })

  it('연쇄 필터의 부모가 바뀌면 patch에 없는 하위 키를 지운다', () => {
    const cascade = ['type', 'activity_type', 'tribe_id']
    const result = applyListParamPatch(
      { type: 'item', activity_type: 'running', tribe_id: 't1' },
      { type: 'activity' },
      { cascade }
    )
    expect(result.type).toBe('activity')
    expect(result.activity_type).toBeUndefined()
    expect(result.tribe_id).toBeUndefined()
  })

  it('patch가 하위 키를 함께 명시하면 그 값은 지우지 않는다', () => {
    const cascade = ['type', 'activity_type']
    const result = applyListParamPatch(
      { type: 'item', activity_type: 'running' },
      { type: 'activity', activity_type: 'cycling' },
      { cascade }
    )
    expect(result.activity_type).toBe('cycling')
  })

  it('page만 바꾸면 page를 지우지 않는다(번호 페이지 이동)', () => {
    const result = applyListParamPatch({ page: '1', status: 'active' }, { page: '3' })
    expect(result.page).toBe('3')
    expect(result.status).toBe('active')
  })

  it('정렬만 바꾸면 filterKeyOf는 그대로다(선택을 비우지 않는다)', () => {
    const before = { page: '2', sort: 'name_asc', status: 'active' }
    const after = applyListParamPatch(before, { sort: 'name_desc' })
    expect(filterKeyOf(after)).toBe(filterKeyOf(before))
  })
})

describe('filterKeyOf', () => {
  it('키 순서와 무관하게 같은 값이면 같은 키를 만든다', () => {
    expect(filterKeyOf({ b: '2', a: '1' })).toBe(filterKeyOf({ a: '1', b: '2' }))
  })

  it('page·sort는 제외한다', () => {
    expect(filterKeyOf({ page: '3', sort: 'name_asc', status: 'active' })).toBe(filterKeyOf({ status: 'active' }))
  })

  it('빈 값·undefined 필터는 무시한다', () => {
    expect(filterKeyOf({ status: 'active', q: '', rarity: undefined })).toBe('status=active')
  })
})

describe('buildPageList', () => {
  it('1쪽뿐이면 1만 돌려준다', () => {
    expect(buildPageList(1, 1)).toEqual([1])
  })

  it('현재 쪽 ±2와 처음·끝을 포함하고 나머지는 생략 표시한다', () => {
    expect(buildPageList(5, 10)).toEqual([1, 'ellipsis', 3, 4, 5, 6, 7, 'ellipsis', 10])
  })

  it('경계 근처에서는 생략 표시가 생기지 않는다', () => {
    expect(buildPageList(1, 3)).toEqual([1, 2, 3])
  })
})

describe('buildPageHref', () => {
  it('1쪽이면 page 파라미터를 지운다', () => {
    expect(buildPageHref('/admin/badges', new URLSearchParams('page=3&status=active'), 1)).toBe(
      '/admin/badges?status=active'
    )
  })

  it('2쪽 이상이면 다른 쿼리를 유지한 채 page를 설정한다', () => {
    expect(buildPageHref('/admin/badges', new URLSearchParams('status=active'), 2)).toBe(
      '/admin/badges?status=active&page=2'
    )
  })

  it('쿼리가 없으면 물음표를 붙이지 않는다', () => {
    expect(buildPageHref('/admin/poi', new URLSearchParams(), 1)).toBe('/admin/poi')
  })
})

describe('sortToSorting / sortingToSort 왕복', () => {
  const sortable = ['name']

  it('URL 값 → SortingState → URL 값이 같은 값으로 돌아온다', () => {
    for (const sort of ['name_asc', 'name_desc']) {
      const sorting = sortToSorting(sort, sortable)
      expect(sortingToSort(sorting, sortable)).toBe(sort)
    }
  })

  it('sortable에 없는 컬럼은 무시한다', () => {
    expect(sortToSorting('completion_asc', sortable)).toEqual([])
  })

  it('빈 sorting은 undefined로 돌아온다', () => {
    expect(sortingToSort([], sortable)).toBeUndefined()
  })
})
