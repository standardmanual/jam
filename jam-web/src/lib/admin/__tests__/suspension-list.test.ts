/**
 * 어드민 이용 정지 이력 목록 (티켓 20261017_1426 2회)
 *
 * 고정하는 것: 상태 파라미터 해석(기본 active, all 유지), 상태별 조건(active = lifted_at IS NULL, lifted = IS NOT NULL, all = 조건 없음),
 * 최근 건 순 정렬(+ id 보조 키)과 쪽 범위, 검색어 → 유저 id로 좁히기(일치 유저가 없으면 조회하지 않고 빈 목록),
 * 조회 실패는 빈 목록이 아니라 error, 진행 중 건수.
 *
 * 실제 공용 DB는 호출하지 않는다 — 호출을 기록하는 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/suspension-list.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  applySuspensionStatus,
  fetchSuspensionActiveCount,
  fetchSuspensionListPage,
  parseSuspensionListParams,
  type SuspensionListQuery,
} from '../suspension-list'

type Call = unknown[]

function recorder(): { query: SuspensionListQuery<unknown>; calls: Call[] } {
  const calls: Call[] = []
  const query: SuspensionListQuery<unknown> = {
    is: (...args) => (calls.push(['is', ...args]), query),
    not: (...args) => (calls.push(['not', ...args]), query),
    in: (...args) => (calls.push(['in', ...args]), query),
    order: (...args) => (calls.push(['order', ...args]), query),
    range: (from, to) => {
      calls.push(['range', from, to])
      return Promise.resolve({ data: [], count: 0, error: null })
    },
  }
  return { query, calls }
}

describe('parseSuspensionListParams', () => {
  it('빈 파라미터의 상태는 active다', () => {
    expect(parseSuspensionListParams({})).toEqual({ q: '', status: 'active' })
  })

  it("'lifted'·'all'은 그대로 유지하고 알 수 없는 값은 active로 떨어진다", () => {
    expect(parseSuspensionListParams({ status: 'lifted' }).status).toBe('lifted')
    expect(parseSuspensionListParams({ status: 'all' }).status).toBe('all')
    expect(parseSuspensionListParams({ status: 'expired' }).status).toBe('active')
  })

  it('검색어는 sanitizeSearchTerm을 거친다', () => {
    expect(parseSuspensionListParams({ q: '홍,(길동)' }).q).toBe('홍  길동')
  })
})

describe('applySuspensionStatus', () => {
  it('active는 lifted_at이 비어 있는 줄만', () => {
    const { query, calls } = recorder()
    applySuspensionStatus(query, 'active')
    expect(calls).toEqual([['is', 'lifted_at', null]])
  })

  it('lifted는 lifted_at이 채워진 줄만', () => {
    const { query, calls } = recorder()
    applySuspensionStatus(query, 'lifted')
    expect(calls).toEqual([['not', 'lifted_at', 'is', null]])
  })

  it('all은 조건이 없다', () => {
    const { query, calls } = recorder()
    applySuspensionStatus(query, 'all')
    expect(calls).toEqual([])
  })
})

/** user_suspensions·users 두 표를 흉내내는 가짜 서비스 클라이언트 */
function makeClient(options: { matchedUsers?: { id: string }[]; userError?: string; listError?: string; count?: number }) {
  const calls: Call[] = []
  const client = {
    from: (table: string) => {
      calls.push(['from', table])
      if (table === 'users') {
        const chain = {
          select: () => chain,
          or: (expr: string) => (calls.push(['or', expr]), chain),
          limit: () => Promise.resolve({ data: options.userError ? null : (options.matchedUsers ?? []), error: options.userError ? { message: options.userError } : null }),
        }
        return chain
      }
      const chain: Record<string, unknown> = {
        select: (_cols: string, opts: unknown) => (calls.push(['select', opts]), chain),
        is: (...args: unknown[]) => (calls.push(['is', ...args]), chain),
        not: (...args: unknown[]) => (calls.push(['not', ...args]), chain),
        in: (...args: unknown[]) => (calls.push(['in', ...args]), chain),
        order: (...args: unknown[]) => (calls.push(['order', ...args]), chain),
        range: (from: number, to: number) => {
          calls.push(['range', from, to])
          return Promise.resolve({
            data: options.listError ? null : [{ id: 's1' }],
            count: options.listError ? null : (options.count ?? 1),
            error: options.listError ? { message: options.listError } : null,
          })
        },
        then: (onFulfilled: (v: unknown) => unknown) =>
          Promise.resolve({ count: options.count ?? 0, error: options.listError ? { message: options.listError } : null }).then(onFulfilled),
      }
      return chain
    },
  }
  return { client: client as unknown as Parameters<typeof fetchSuspensionListPage>[0], calls }
}

describe('fetchSuspensionListPage', () => {
  it('진행 중 정지를 최근 건 순으로, id를 보조 키로 읽는다', async () => {
    const t = makeClient({})

    const result = await fetchSuspensionListPage(t.client, { q: '', status: 'active' }, 1)

    expect(result).toEqual({ rows: [{ id: 's1' }], total: 1, error: null })
    expect(t.calls).toEqual([
      ['from', 'user_suspensions'],
      ['select', { count: 'exact' }],
      ['is', 'lifted_at', null],
      ['order', 'suspended_at', { ascending: false }],
      ['order', 'id'],
      ['range', 0, 49],
    ])
  })

  it('두 번째 쪽은 50번째부터 읽는다', async () => {
    const t = makeClient({})

    await fetchSuspensionListPage(t.client, { q: '', status: 'all' }, 2)

    expect(t.calls).toContainEqual(['range', 50, 99])
    expect(t.calls.some((c) => c[0] === 'is' || c[0] === 'not')).toBe(false)
  })

  it('검색어는 일치한 유저 id로 목록을 좁힌다', async () => {
    const t = makeClient({ matchedUsers: [{ id: 'u1' }, { id: 'u2' }] })

    await fetchSuspensionListPage(t.client, { q: '홍', status: 'all' }, 1)

    expect(t.calls).toContainEqual(['or', 'username.ilike.%홍%,email.ilike.%홍%'])
    expect(t.calls).toContainEqual(['in', 'user_id', ['u1', 'u2']])
  })

  it('검색어에 일치하는 유저가 없으면 이력을 읽지 않고 빈 목록이다', async () => {
    const t = makeClient({ matchedUsers: [] })

    const result = await fetchSuspensionListPage(t.client, { q: '없는사람', status: 'all' }, 1)

    expect(result).toEqual({ rows: [], total: 0, error: null })
    expect(t.calls.some((c) => c[0] === 'from' && c[1] === 'user_suspensions')).toBe(false)
  })

  it('유저 검색이 실패하면 error를 담는다', async () => {
    const t = makeClient({ userError: 'down' })

    const result = await fetchSuspensionListPage(t.client, { q: '홍', status: 'all' }, 1)

    expect(result).toEqual({ rows: [], total: 0, error: 'down' })
  })

  it('목록 조회가 실패하면 빈 목록 대신 error를 담는다', async () => {
    const t = makeClient({ listError: 'boom' })

    const result = await fetchSuspensionListPage(t.client, { q: '', status: 'active' }, 1)

    expect(result).toEqual({ rows: [], total: 0, error: 'boom' })
  })
})

describe('fetchSuspensionActiveCount', () => {
  it('진행 중인 정지 건수를 센다', async () => {
    const t = makeClient({ count: 3 })
    await expect(fetchSuspensionActiveCount(t.client)).resolves.toBe(3)
    expect(t.calls).toContainEqual(['is', 'lifted_at', null])
  })

  it('조회에 실패하면 null이다(라벨에서 숨긴다)', async () => {
    const t = makeClient({ listError: 'boom' })
    await expect(fetchSuspensionActiveCount(t.client)).resolves.toBeNull()
  })
})
