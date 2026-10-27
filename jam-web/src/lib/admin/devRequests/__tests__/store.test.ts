/**
 * 개발 요청 저장소 (티켓 20261026_2027 1회차)
 *
 * 서비스 클라이언트는 메모리 안의 가짜다. 지키는 것:
 * - 목록: 상태 필터·`all`, `no` 내림차순, 최대 200건, `created_by`는 결과에 없음
 * - 등록: 같은 정책의 열린(requested) 요청이 있으면 `duplicate_open`+`existingNo`, 닫힌 요청이나 다른 정책은 통과,
 *   `policy_id`가 없는 요청은 중복 검사를 하지 않음
 * - 수정: 없는 행은 `not_found`
 * - 읽기·쓰기 실패는 던진다
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/devRequests/__tests__/store.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createDevRequest, listDevRequests, updateDevRequest } from '../store'

type Row = Record<string, unknown>

const state: { rows: Row[]; fail: boolean; nextNo: number } = { rows: [], fail: false, nextNo: 1 }

function row(overrides: Row = {}): Row {
  const no = state.nextNo++
  return {
    id: `00000000-0000-4000-8000-${String(no).padStart(12, '0')}`,
    no,
    title: `요청${no}`,
    detail: '',
    origin: 'eco',
    policy_id: null,
    status: 'requested',
    ticket_id: null,
    created_by: 'admin-1',
    created_at: '2026-10-27T00:00:00.000Z',
    updated_at: '2026-10-27T00:00:00.000Z',
    ...overrides,
  }
}

/** 체인 끝(await·single·maybeSingle)에서 결과를 내는 가짜 쿼리. */
function fakeService() {
  const make = () => {
    const filters: Array<(r: Row) => boolean> = []
    let mode: 'select' | 'insert' | 'update' = 'select'
    let payload: Row = {}
    let sortKey: string | null = null
    let ascending = true
    let limit = Infinity

    const run = () => {
      if (state.fail) return { data: null, error: { code: 'XX000', message: 'boom secret' } }
      if (mode === 'insert') {
        const created = row({ ...payload })
        state.rows.push(created)
        return { data: [created], error: null }
      }
      let matched = state.rows.filter((r) => filters.every((f) => f(r)))
      if (mode === 'update') matched.forEach((r) => Object.assign(r, payload))
      if (sortKey) {
        const key = sortKey
        matched = [...matched].sort((a, b) => {
          const av = a[key] as number
          const bv = b[key] as number
          return (av < bv ? -1 : av > bv ? 1 : 0) * (ascending ? 1 : -1)
        })
      }
      return { data: matched.slice(0, limit), error: null }
    }

    const first = async () => {
      const result = run()
      if (result.error) return { data: null, error: result.error }
      return { data: (result.data as Row[])[0] ?? null, error: null }
    }

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (p: Row) => {
        mode = 'insert'
        payload = p
        return builder
      },
      update: (p: Row) => {
        mode = 'update'
        payload = p
        return builder
      },
      eq: (col: string, value: unknown) => {
        filters.push((r) => r[col] === value)
        return builder
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        sortKey = col
        ascending = opts?.ascending !== false
        return builder
      },
      limit: (n: number) => {
        limit = n
        return builder
      },
      single: first,
      maybeSingle: first,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    }
    return builder
  }
  return { from: () => make() } as never
}

beforeEach(() => {
  state.rows = []
  state.fail = false
  state.nextNo = 1
})

describe('listDevRequests', () => {
  it('기본 필터로 해당 상태만 no 내림차순으로 돌려주고 created_by는 없다', async () => {
    state.rows = [row(), row({ status: 'ticketed', ticket_id: '20261027_0900' }), row(), row({ status: 'dismissed' })]
    const list = await listDevRequests(fakeService(), { status: 'requested' })
    expect(list.map((r) => r.no)).toEqual([3, 1])
    expect(JSON.stringify(list)).not.toContain('created_by')
    expect(list[0]).toMatchObject({ policyId: null, ticketId: null, status: 'requested', origin: 'eco' })
  })

  it('상태를 고르면 그 상태만, all이면 전부 돌려준다', async () => {
    state.rows = [row(), row({ status: 'ticketed', ticket_id: '20261027_0900' }), row({ status: 'dismissed' })]
    expect((await listDevRequests(fakeService(), { status: 'ticketed' })).map((r) => r.no)).toEqual([2])
    expect((await listDevRequests(fakeService(), { status: 'dismissed' })).map((r) => r.no)).toEqual([3])
    expect((await listDevRequests(fakeService(), { status: 'all' })).map((r) => r.no)).toEqual([3, 2, 1])
  })

  it('최대 200건만 읽는다', async () => {
    state.rows = Array.from({ length: 250 }, () => row())
    const list = await listDevRequests(fakeService(), { status: 'all' })
    expect(list).toHaveLength(200)
    expect(list[0].no).toBe(250)
  })

  it('읽기 실패는 던진다', async () => {
    state.fail = true
    await expect(listDevRequests(fakeService(), { status: 'requested' })).rejects.toThrow('개발 요청 조회 실패')
  })
})

describe('createDevRequest', () => {
  const input = { title: '확률 고정값을 설정으로', detail: '내용', origin: 'eco' as const, policyId: 'ch19-kpi-1' }

  it('정책이 겹치지 않으면 만들고 created_by 없이 돌려준다', async () => {
    const result = await createDevRequest(fakeService(), input, 'admin-9')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.request).toMatchObject({ no: 1, title: input.title, policyId: 'ch19-kpi-1', status: 'requested' })
      expect(JSON.stringify(result.request)).not.toContain('created_by')
    }
    expect(state.rows[0].created_by).toBe('admin-9')
  })

  it('같은 정책에 열린 요청이 있으면 만들지 않고 그 번호를 돌려준다', async () => {
    state.rows = [row({ policy_id: 'ch19-kpi-1' })]
    const result = await createDevRequest(fakeService(), input, 'admin-1')
    expect(result).toEqual({ ok: false, code: 'duplicate_open', existingNo: 1 })
    expect(state.rows).toHaveLength(1)
  })

  it('같은 정책이라도 닫힌 요청(ticketed·dismissed)만 있으면 만든다', async () => {
    state.rows = [row({ policy_id: 'ch19-kpi-1', status: 'ticketed' }), row({ policy_id: 'ch19-kpi-1', status: 'dismissed' })]
    expect((await createDevRequest(fakeService(), input, 'admin-1')).ok).toBe(true)
    expect(state.rows).toHaveLength(3)
  })

  it('다른 정책의 열린 요청은 막지 않는다', async () => {
    state.rows = [row({ policy_id: 'other-policy' })]
    expect((await createDevRequest(fakeService(), input, 'admin-1')).ok).toBe(true)
  })

  it('policy_id가 없는 요청은 중복 검사를 하지 않는다', async () => {
    state.rows = [row({ policy_id: null })]
    const free = { ...input, policyId: null }
    expect((await createDevRequest(fakeService(), free, 'admin-1')).ok).toBe(true)
    expect((await createDevRequest(fakeService(), free, 'admin-1')).ok).toBe(true)
    expect(state.rows).toHaveLength(3)
  })

  it('읽기·쓰기 실패는 던진다', async () => {
    state.fail = true
    await expect(createDevRequest(fakeService(), input, 'admin-1')).rejects.toThrow('개발 요청 중복 확인 실패')
    await expect(createDevRequest(fakeService(), { ...input, policyId: null }, 'admin-1')).rejects.toThrow(
      '개발 요청 등록 실패'
    )
  })
})

describe('updateDevRequest', () => {
  it('상태를 바꾸고 바뀐 행을 돌려준다', async () => {
    state.rows = [row()]
    const id = state.rows[0].id as string
    const result = await updateDevRequest(fakeService(), id, { status: 'dismissed' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.request).toMatchObject({ id, status: 'dismissed' })
    expect(state.rows[0].status).toBe('dismissed')
    expect(JSON.stringify(result)).not.toContain('created_by')
  })

  it('없는 행은 not_found', async () => {
    state.rows = [row()]
    expect(await updateDevRequest(fakeService(), '99999999-9999-4999-8999-999999999999', { status: 'dismissed' })).toEqual({
      ok: false,
      code: 'not_found',
    })
  })

  it('쓰기 실패는 던진다', async () => {
    state.fail = true
    await expect(updateDevRequest(fakeService(), 'x', { status: 'dismissed' })).rejects.toThrow('개발 요청 수정 실패')
  })
})
