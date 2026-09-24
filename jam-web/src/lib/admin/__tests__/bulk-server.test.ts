import { vi, afterEach } from 'vitest'

vi.mock('../auth', () => ({
  getAdminUser: vi.fn(),
}))

import { getAdminUser } from '../auth'
import { readBulkRequest, updateByIdsAllOrNothing, deleteByIds, bulkJson, type BulkServiceClient } from '../bulk/server'

type StubRow = { id: string; [key: string]: unknown }

interface StubCall {
  type: 'update-in' | 'update-eq' | 'select-in' | 'delete-in' | 'delete-eq'
  ids: string[]
}

function createStubClient(options: {
  rows: StubRow[]
  failOnUpdateChunk?: (ids: string[]) => boolean
  failOnRollbackId?: (id: string) => boolean
  failOnDeleteChunk?: (ids: string[]) => boolean
  failOnDeleteId?: (id: string) => boolean
}) {
  const { rows, failOnUpdateChunk, failOnRollbackId, failOnDeleteChunk, failOnDeleteId } = options
  const calls: StubCall[] = []
  const rowById = new Map(rows.map((r) => [r.id, r]))

  function from() {
    return {
      update: (patch: Record<string, unknown>) => ({
        in: (_column: string, ids: string[]) => ({
          select: async () => {
            calls.push({ type: 'update-in', ids })
            if (failOnUpdateChunk?.(ids)) return { data: null, error: { message: '갱신 실패' } }
            for (const id of ids) rowById.set(id, { ...(rowById.get(id) ?? { id }), ...patch })
            return { data: ids.map((id) => ({ id })), error: null }
          },
        }),
        eq: async (_column: string, id: string) => {
          calls.push({ type: 'update-eq', ids: [id] })
          if (failOnRollbackId?.(id)) return { error: { message: `${id} 롤백 실패` } }
          rowById.set(id, { ...(rowById.get(id) ?? { id }), ...patch })
          return { error: null }
        },
      }),
      select: () => ({
        in: async (_column: string, ids: string[]) => {
          calls.push({ type: 'select-in', ids })
          return { data: ids.map((id) => ({ ...(rowById.get(id) ?? { id }) })), error: null }
        },
      }),
      delete: () => ({
        in: (_column: string, ids: string[]) => ({
          select: async () => {
            calls.push({ type: 'delete-in', ids })
            if (failOnDeleteChunk?.(ids)) return { data: null, error: { message: 'FK 위반' } }
            for (const id of ids) rowById.delete(id)
            return { data: ids.map((id) => ({ id })), error: null }
          },
        }),
        eq: async (_column: string, id: string) => {
          calls.push({ type: 'delete-eq', ids: [id] })
          if (failOnDeleteId?.(id)) return { error: { message: `${id} FK 위반` } }
          rowById.delete(id)
          return { error: null }
        },
      }),
    }
  }

  return { client: { from } as unknown as BulkServiceClient, calls }
}

describe('readBulkRequest', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  function req(body: unknown) {
    return new Request('http://localhost/api/admin/poi/bulk', { method: 'POST', body: JSON.stringify(body) })
  }

  it('어드민이 아니면 403', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null)
    const result = await readBulkRequest(req({}), { actions: { activate: {} }, idFormat: 'string' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it('어드민이면 본문을 파싱해 실행 어드민 정보와 함께 context를 돌려준다', async () => {
    vi.mocked(getAdminUser).mockResolvedValue({ id: 'admin-1', email: 'admin@example.com' })
    const result = await readBulkRequest(req({ ids: ['p1'], action: 'activate' }), {
      actions: { activate: {} },
      idFormat: 'string',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.context.admin).toEqual({ id: 'admin-1', email: 'admin@example.com' })
      expect(result.context.body).toMatchObject({ ids: ['p1'], action: 'activate' })
    }
  })

  it('본문이 규격에 맞지 않으면 400', async () => {
    vi.mocked(getAdminUser).mockResolvedValue({ id: 'admin-1', email: 'admin@example.com' })
    const result = await readBulkRequest(req({ ids: ['p1'], action: 'unknown-action' }), {
      actions: { activate: {} },
      idFormat: 'string',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(400)
  })
})

describe('updateByIdsAllOrNothing', () => {
  it('200건 이하는 한 문장으로 처리한다', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`)
    const { client, calls } = createStubClient({ rows: ids.map((id) => ({ id, is_active: false })) })
    const result = await updateByIdsAllOrNothing(client, 'poi', ids, { is_active: true })

    expect(result).toEqual({ ok: true, updatedIds: ids, partiallyApplied: false, error: null })
    expect(calls.filter((c) => c.type === 'update-in')).toHaveLength(1)
    expect(calls.filter((c) => c.type === 'select-in')).toHaveLength(0)
  })

  it('450건은 3묶음(200/200/50)으로 나눠 반영한다', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`)
    const { client, calls } = createStubClient({ rows: ids.map((id) => ({ id, is_active: false })) })
    const result = await updateByIdsAllOrNothing(client, 'poi', ids, { is_active: true })

    expect(result.ok).toBe(true)
    expect(result.updatedIds).toHaveLength(450)
    const updateCalls = calls.filter((c) => c.type === 'update-in')
    expect(updateCalls.map((c) => c.ids.length)).toEqual([200, 200, 50])
  })

  it('2번째 묶음이 실패하면 1번째 묶음을 저장된 값으로 되돌리는 호출이 나가고, 3번째 묶음은 시도하지 않는다', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`)
    const rows = ids.map((id, i) => ({ id, is_active: i % 2 === 0 }))
    const { client, calls } = createStubClient({
      rows,
      failOnUpdateChunk: (chunkIds) => chunkIds[0] === 'id-200',
    })
    const result = await updateByIdsAllOrNothing(client, 'poi', ids, { is_active: true })

    expect(result.ok).toBe(false)
    expect(result.partiallyApplied).toBe(false)

    const updateInCalls = calls.filter((c) => c.type === 'update-in')
    expect(updateInCalls).toHaveLength(2) // 1번째(성공) + 2번째(실패) — 3번째는 시도하지 않는다

    const rollbackCalls = calls.filter((c) => c.type === 'update-eq')
    expect(rollbackCalls).toHaveLength(200)
    expect(rollbackCalls.map((c) => c.ids[0]).sort()).toEqual([...ids.slice(0, 200)].sort())
  })

  it('되돌리기까지 실패하면 일부만 반영된 상태로 보고한다', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`)
    const rows = ids.map((id) => ({ id, is_active: false }))
    const { client } = createStubClient({
      rows,
      failOnUpdateChunk: (chunkIds) => chunkIds[0] === 'id-200',
      failOnRollbackId: (id) => id === 'id-50',
    })
    const result = await updateByIdsAllOrNothing(client, 'poi', ids, { is_active: true })

    expect(result.ok).toBe(false)
    expect(result.partiallyApplied).toBe(true)
    expect(result.updatedIds.length).toBeGreaterThan(0)
    expect(result.error).toContain('일부만 반영')
  })

  it('id가 없으면 아무 것도 하지 않고 성공을 돌려준다', async () => {
    const { client, calls } = createStubClient({ rows: [] })
    const result = await updateByIdsAllOrNothing(client, 'poi', [], { is_active: true })
    expect(result).toEqual({ ok: true, updatedIds: [], partiallyApplied: false, error: null })
    expect(calls).toHaveLength(0)
  })
})

describe('deleteByIds', () => {
  it('200건씩 삭제해 processed에 담는다', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)
    const { client, calls } = createStubClient({ rows: ids.map((id) => ({ id })) })
    const result = await deleteByIds(client, 'poi', ids)

    expect(result.processed).toHaveLength(250)
    expect(result.skipped).toHaveLength(0)
    expect(calls.filter((c) => c.type === 'delete-in')).toHaveLength(2)
  })

  it('한 묶음이 FK 위반으로 실패하면 그 묶음만 한 건씩 다시 시도하고, 실패분만 건너뜀으로 보고한다', async () => {
    const ids = ['a', 'b', 'c']
    const { client, calls } = createStubClient({
      rows: ids.map((id) => ({ id })),
      failOnDeleteChunk: () => true,
      failOnDeleteId: (id) => id === 'b',
    })
    const result = await deleteByIds(client, 'poi', ids)

    expect(result.processed.sort()).toEqual(['a', 'c'])
    expect(result.skipped).toEqual([{ id: 'b', reason: 'b FK 위반' }])
    expect(calls.filter((c) => c.type === 'delete-eq')).toHaveLength(3)
  })

  it('reasonFor로 건너뜀 사유 형식을 바꿀 수 있다', async () => {
    const { client } = createStubClient({
      rows: [{ id: 'x' }],
      failOnDeleteChunk: () => true,
      failOnDeleteId: () => true,
    })
    const result = await deleteByIds(client, 'poi', ['x'], (id, message) => `${id}: 커스텀(${message})`)
    expect(result.skipped[0].reason).toBe('x: 커스텀(x FK 위반)')
  })
})

describe('bulkJson', () => {
  it('감사 로그를 한 줄 남기고 결과를 그대로 응답한다', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = bulkJson(
      { processed: ['a', 'b'], skipped: [{ id: 'c', reason: '참조 있음' }] },
      { admin: { id: 'admin-1', email: 'admin@example.com' }, action: 'delete' }
    )
    expect(spy).toHaveBeenCalledTimes(1)
    const line = spy.mock.calls[0][0] as string
    expect(line).toContain('admin@example.com')
    expect(line).toContain('action=delete')
    expect(line).toContain('processed=2')
    expect(line).toContain('skipped=1')

    const body = await res.json()
    expect(body).toEqual({ processed: ['a', 'b'], skipped: [{ id: 'c', reason: '참조 있음' }] })
    spy.mockRestore()
  })

  it('dry_run이면 로그에 dryRun 표시를 남긴다', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    bulkJson(
      { processed: [], skipped: [], dryRun: true },
      { admin: { id: 'admin-1', email: 'admin@example.com' }, action: 'delete' }
    )
    expect(spy.mock.calls[0][0]).toContain('dryRun=true')
    spy.mockRestore()
  })
})
