import { describe, it, expect } from 'vitest'
import {
  parseUserListParams,
  applyUserListFilters,
  applyUserListSort,
  isEmptyBanFilter,
  activeSuspensionOf,
  fetchSuspendedUserIds,
  SUSPENSION_FETCH_LIMIT,
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

describe('이용 정지 상태 판정', () => {
  const baseRow = {
    id: 'u1',
    email: 'a@x.com',
    username: null,
    display_name: null,
    created_at: '2026-01-01T00:00:00Z',
    is_admin: false,
    onboarding_completed_at: null,
    tribe: [{ name: '로드' }],
  }

  it('푼 시각이 없는 줄이 있으면 정지 중이다', () => {
    expect(activeSuspensionOf([{ suspended_at: '2026-10-01T00:00:00Z', lifted_at: null }])).toEqual({
      suspended_at: '2026-10-01T00:00:00Z',
      lifted_at: null,
    })
  })

  it('이력이 여러 줄이어도 푼 줄은 건너뛰고 진행 중인 줄을 찾는다', () => {
    const found = activeSuspensionOf([
      { suspended_at: '2026-08-01T00:00:00Z', lifted_at: '2026-08-05T00:00:00Z' },
      { suspended_at: '2026-10-01T00:00:00Z', lifted_at: null },
    ])
    expect(found?.suspended_at).toBe('2026-10-01T00:00:00Z')
  })

  it('모두 풀렸거나 이력이 없으면 정지 중이 아니다', () => {
    expect(activeSuspensionOf([{ suspended_at: '2026-08-01T00:00:00Z', lifted_at: '2026-08-05T00:00:00Z' }])).toBeNull()
    expect(activeSuspensionOf([])).toBeNull()
    expect(activeSuspensionOf(null)).toBeNull()
  })

  it('행 변환은 정지 중이면 정지 여부와 건 시각을 채운다', () => {
    const row = toUserListRow({ ...baseRow, suspensions: [{ suspended_at: '2026-10-01T00:00:00Z', lifted_at: null }] })
    expect(row.tribeName).toBe('로드')
    expect(row.suspended).toBe(true)
    expect(row.suspendedAt).toBe('2026-10-01T00:00:00Z')
    expect(row.onboarded).toBe(false)
  })

  it('행 변환은 푼 정지만 있으면 정지 중이 아니다', () => {
    const row = toUserListRow({ ...baseRow, suspensions: [{ suspended_at: '2026-08-01T00:00:00Z', lifted_at: '2026-08-05T00:00:00Z' }] })
    expect(row.suspended).toBe(false)
    expect(row.suspendedAt).toBeNull()
  })

  it('이력이 없는(null) 유저도 정지 중이 아니다', () => {
    expect(toUserListRow({ ...baseRow, suspensions: null }).suspended).toBe(false)
  })
})

describe('fetchSuspendedUserIds', () => {
  const calls: unknown[][] = []
  const fakeSupabase = (rows: { user_id: string }[], error: { message: string } | null = null) =>
    ({
      from: (table: string) => {
        calls.push(['from', table])
        const chain = {
          select: (cols: string) => (calls.push(['select', cols]), chain),
          is: (col: string, val: unknown) => (calls.push(['is', col, val]), chain),
          limit: () => Promise.resolve({ data: error ? null : rows, error }),
        }
        return chain
      },
    }) as unknown as Parameters<typeof fetchSuspendedUserIds>[0]

  const rowsOf = (count: number) => Array.from({ length: count }, (_, i) => ({ user_id: `u${i}` }))

  it('진행 중(lifted_at IS NULL)인 정지만 user_suspensions에서 읽고 옛 섀도우밴 표는 읽지 않는다', async () => {
    calls.length = 0
    const ids = await fetchSuspendedUserIds(fakeSupabase([{ user_id: 'a' }, { user_id: 'b' }]))

    expect(ids).toEqual(['a', 'b'])
    expect(calls).toContainEqual(['from', 'user_suspensions'])
    expect(calls).toContainEqual(['is', 'lifted_at', null])
    expect(calls.some((c) => c[0] === 'from' && c[1] === 'user_shadow_bans')).toBe(false)
  })

  it('한도 바로 아래(999건)까지는 오류 없이 전부 돌려준다', async () => {
    const ids = await fetchSuspendedUserIds(fakeSupabase(rowsOf(SUSPENSION_FETCH_LIMIT - 1)))
    expect(ids).toHaveLength(SUSPENSION_FETCH_LIMIT - 1)
  })

  it('정지 기록이 0건이면 빈 배열이다', async () => {
    expect(await fetchSuspendedUserIds(fakeSupabase([]))).toEqual([])
  })

  it('행 수가 한도와 같으면 조용히 잘린 결과 대신 오류를 던진다', async () => {
    await expect(fetchSuspendedUserIds(fakeSupabase(rowsOf(SUSPENSION_FETCH_LIMIT)))).rejects.toThrow(
      /한도\(1,000건\)를 넘어 제재 필터를 신뢰할 수 없습니다/
    )
  })

  it('조회 오류는 오류로 던진다', async () => {
    await expect(fetchSuspendedUserIds(fakeSupabase([], { message: 'boom' }))).rejects.toThrow(/정지 목록 조회 실패/)
  })
})
