import { describe, it, expect } from 'vitest'
import {
  parseUserListParams,
  applyUserListFilters,
  applyUserListSort,
  isEmptyBanFilter,
  isBanActive,
  toUserListRow,
  DEFAULT_USER_LIST_SORT,
  type UserListQuery,
} from '../user-list'

/** 호출 기록만 남기는 가짜 쿼리 — 체이닝이 그대로 이어지는지도 함께 본다 */
function recorder() {
  const calls: [string, ...unknown[]][] = []
  const query: UserListQuery<unknown> = {
    is: (...args) => (calls.push(['is', ...args]), query),
    not: (...args) => (calls.push(['not', ...args]), query),
    eq: (...args) => (calls.push(['eq', ...args]), query),
    in: (...args) => (calls.push(['in', ...args]), query),
    or: (...args) => (calls.push(['or', ...args]), query),
    order: (...args) => (calls.push(['order', ...args]), query),
    range: () => Promise.resolve({ data: [], count: 0, error: null }),
  }
  return { query, calls }
}

describe('parseUserListParams', () => {
  it('검색어의 필터 문법·와일드카드 문자를 공백으로 바꾸고 100자로 자른다', () => {
    const q = parseUserListParams({ q: 'a,b(c)%d_e*f\\g' }).q
    expect(q).not.toMatch(/[,()%_*\\]/)
    expect(q.split(/\s+/)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(parseUserListParams({ q: 'x'.repeat(150) }).q).toHaveLength(100)
  })

  it('모르는 값은 기본값으로 되돌린다', () => {
    const params = parseUserListParams({ onboarding: 'weird', ban: 'weird', sort: 'weird' })
    expect(params.onboarding).toBeUndefined()
    expect(params.ban).toBeUndefined()
    expect(params.sort).toBe(DEFAULT_USER_LIST_SORT)
  })

  it('허용된 값은 그대로 읽는다', () => {
    const params = parseUserListParams({ tribe_id: 't1', onboarding: 'done', ban: 'banned', sort: 'username_asc' })
    expect(params).toMatchObject({ tribeId: 't1', onboarding: 'done', ban: 'banned', sort: 'username_asc' })
  })
})

describe('applyUserListFilters', () => {
  it('검색어가 있으면 이름·표시 이름·이메일을 한 번에 검색한다', () => {
    const { query, calls } = recorder()
    applyUserListFilters(query, parseUserListParams({ q: 'kim' }), null)
    expect(calls).toEqual([['or', 'username.ilike.%kim%,display_name.ilike.%kim%,email.ilike.%kim%']])
  })

  it('정제 뒤 빈 검색어는 필터를 걸지 않는다', () => {
    const { query, calls } = recorder()
    applyUserListFilters(query, parseUserListParams({ q: ' , ' }), null)
    expect(calls).toEqual([])
  })

  it('트라이브·온보딩 필터를 건다', () => {
    const done = recorder()
    applyUserListFilters(done.query, parseUserListParams({ tribe_id: 't1', onboarding: 'done' }), null)
    expect(done.calls).toEqual([
      ['eq', 'tribe_id', 't1'],
      ['not', 'onboarding_completed_at', 'is', null],
    ])

    const pending = recorder()
    applyUserListFilters(pending.query, parseUserListParams({ onboarding: 'pending' }), null)
    expect(pending.calls).toEqual([['is', 'onboarding_completed_at', null]])
  })

  it('제재 중 필터는 제재 중인 id로 좁히고, 제재 없음 필터는 그 id를 뺀다', () => {
    const banned = recorder()
    applyUserListFilters(banned.query, parseUserListParams({ ban: 'banned' }), ['b1', 'b2'])
    expect(banned.calls).toEqual([['in', 'id', ['b1', 'b2']]])

    const clean = recorder()
    applyUserListFilters(clean.query, parseUserListParams({ ban: 'clean' }), ['b1', 'b2'])
    expect(clean.calls).toEqual([['not', 'id', 'in', '(b1,b2)']])
  })

  it('제재 없음 필터인데 제재 중인 유저가 없으면 아무것도 빼지 않는다', () => {
    const { query, calls } = recorder()
    applyUserListFilters(query, parseUserListParams({ ban: 'clean' }), [])
    expect(calls).toEqual([])
  })
})

describe('isEmptyBanFilter', () => {
  it('제재 중 필터인데 제재 중인 유저가 없으면 항상 빈 결과다', () => {
    expect(isEmptyBanFilter(parseUserListParams({ ban: 'banned' }), [])).toBe(true)
    expect(isEmptyBanFilter(parseUserListParams({ ban: 'banned' }), ['b1'])).toBe(false)
    expect(isEmptyBanFilter(parseUserListParams({ ban: 'clean' }), [])).toBe(false)
    expect(isEmptyBanFilter(parseUserListParams({}), null)).toBe(false)
  })
})

describe('applyUserListSort', () => {
  it('가입일 정렬은 id를 보조 키로 둔다', () => {
    const { query, calls } = recorder()
    applyUserListSort(query, 'createdAt_desc')
    expect(calls).toEqual([
      ['order', 'created_at', { ascending: false }],
      ['order', 'id', { ascending: true }],
    ])
  })

  it('이름 정렬은 이름 없는 유저를 뒤로 보낸다', () => {
    const { query, calls } = recorder()
    applyUserListSort(query, 'username_asc')
    expect(calls[0]).toEqual(['order', 'username', { ascending: true, nullsFirst: false }])
  })
})

describe('제재 상태 판정', () => {
  const now = new Date('2026-09-24T00:00:00Z')

  it('만료 시각이 없거나 아직 지나지 않았으면 제재 중이다', () => {
    expect(isBanActive({ ban_level: 'hard', expires_at: null }, now)).toBe(true)
    expect(isBanActive({ ban_level: 'soft', expires_at: '2026-10-01T00:00:00Z' }, now)).toBe(true)
  })

  it('만료됐거나 제재가 없으면 제재 중이 아니다', () => {
    expect(isBanActive({ ban_level: 'soft', expires_at: '2026-09-01T00:00:00Z' }, now)).toBe(false)
    expect(isBanActive(null, now)).toBe(false)
  })

  it('행 변환은 임베드가 배열이어도 첫 값을 읽고 만료된 제재는 비운다', () => {
    const row = toUserListRow(
      {
        id: 'u1',
        email: 'a@x.com',
        username: null,
        display_name: null,
        created_at: '2026-01-01T00:00:00Z',
        is_admin: false,
        onboarding_completed_at: null,
        tribe: [{ name: '로드' }],
        ban: [{ ban_level: 'soft', expires_at: '2026-09-01T00:00:00Z' }],
      },
      now
    )
    expect(row.tribeName).toBe('로드')
    expect(row.banLevel).toBeNull()
    expect(row.onboarded).toBe(false)
  })
})
