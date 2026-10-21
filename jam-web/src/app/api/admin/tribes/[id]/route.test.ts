/**
 * DELETE·PUT /api/admin/tribes/[id] — 삭제 가드와 고정 오류 문구 (티켓 20261019_1318 2회)
 * 참가 대상으로 둔 미션(`mission_allowed_tribes`, FK RESTRICT)이 있는 트라이브는 가드가 409로 막고, DB 오류 원문은 응답에 싣지 않는다.
 * DB는 메모리 스텁이다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/tribes/[id]/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>

const TRIBE = '11111111-1111-4111-8111-111111111111'
const RAW_DB_MESSAGE = 'update or delete on table "tribes" violates foreign key constraint "mission_allowed_tribes_tribe_id_fkey"'

const holder = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  /** 이 동작은 DB 오류로 끝난다(`테이블.동작`) */
  failOn: new Set<string>(),
  calls: [] as string[],
}))

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => ({ id: 'admin-1', email: 'admin@example.com' }) }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from(table: string) {
      let action = 'select'
      const filters: Array<(r: Row) => boolean> = []
      let updateValues: Row | null = null
      let insertRows: Row[] = []
      const rows = () => holder.tables[table] ?? []
      const run = () => {
        const key = `${table}.${action}`
        holder.calls.push(key)
        if (holder.failOn.has(key)) return { data: null, error: { message: RAW_DB_MESSAGE } }
        if (action === 'delete') {
          holder.tables[table] = rows().filter((r) => !filters.every((f) => f(r)))
          return { data: null, error: null }
        }
        if (action === 'insert') {
          holder.tables[table] = [...rows(), ...insertRows]
          return { data: null, error: null }
        }
        const picked = rows().filter((r) => filters.every((f) => f(r)))
        if (action === 'update') for (const r of picked) Object.assign(r, updateValues)
        return { data: picked, error: null }
      }
      const builder: Record<string, unknown> = {
        select: () => builder,
        update: (values: Row) => ((action = 'update'), (updateValues = values), builder),
        delete: () => ((action = 'delete'), builder),
        insert: (values: Row[]) => ((action = 'insert'), (insertRows = values), builder),
        eq: (column: string, value: unknown) => (filters.push((r) => r[column] === value), builder),
        in: (column: string, values: unknown[]) => (filters.push((r) => values.includes(r[column])), builder),
        range: async (from: number, to: number) => {
          const result = run()
          return { data: (result.data as Row[] | null)?.slice(from, to + 1) ?? null, error: result.error }
        },
        single: async () => {
          const result = run()
          const first = (result.data as Row[] | null)?.[0]
          return first ? { data: first, error: null } : { data: null, error: result.error ?? { message: 'no rows' } }
        },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
      }
      return builder
    },
  }),
}))

const { DELETE, PUT } = await import('./route')

const ctx = { params: Promise.resolve({ id: TRIBE }) }
const del = () => DELETE(new NextRequest(`https://j-a-m.app/api/admin/tribes/${TRIBE}`, { method: 'DELETE' }), ctx)
const put = (body: Record<string, unknown>) =>
  PUT(
    new NextRequest(`https://j-a-m.app/api/admin/tribes/${TRIBE}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx
  )

beforeEach(() => {
  holder.tables = { tribes: [{ id: TRIBE, name: '러너', is_active: true, sort_order: 1 }] }
  holder.failOn.clear()
  holder.calls.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('DELETE /api/admin/tribes/[id]', () => {
  it('참가 대상으로 둔 미션이 있으면 409로 막고 삭제하지 않는다(사유에 미션 수가 나온다)', async () => {
    holder.tables.mission_allowed_tribes = [
      { mission_id: 'm1', tribe_id: TRIBE },
      { mission_id: 'm2', tribe_id: TRIBE },
    ]
    const res = await del()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('참가 대상으로 둔 미션 2건')
    expect(holder.calls).not.toContain('tribes.delete')
    expect(holder.tables.tribes).toHaveLength(1)
  })

  it('막는 참조가 없으면 삭제한다(챕터 이름은 안내만이라 막지 않는다)', async () => {
    holder.tables.chapter_names = [{ tribe_id: TRIBE, chapter_no: 1, name: '새내기' }]
    const res = await del()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(holder.tables.tribes).toEqual([])
  })

  it('DB가 삭제를 거부하면 500과 고정 문구다(DB 오류 원문이 응답에 없다)', async () => {
    holder.failOn.add('tribes.delete')
    const res = await del()
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toContain('트라이브를 삭제하지 못했어요')
    expect(JSON.stringify(json)).not.toContain('mission_allowed_tribes_tribe_id_fkey')
    expect(JSON.stringify(json)).not.toContain('violates')
  })
})

describe('PUT /api/admin/tribes/[id]', () => {
  it('저장이 실패하면 500과 고정 문구다(DB 오류 원문이 응답에 없다)', async () => {
    holder.failOn.add('tribes.update')
    const res = await put({ name: '러너2' })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toContain('트라이브가 저장되지 않았어요')
    expect(JSON.stringify(json)).not.toContain('violates')
  })

  it('인접 트라이브 저장이 실패하면 500과 고정 문구다', async () => {
    holder.failOn.add('tribe_adjacency.insert')
    const res = await put({ adjacent_tribe_ids: ['22222222-2222-4222-8222-222222222222'] })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toContain('인접 트라이브가 저장되지 않았어요')
    expect(JSON.stringify(json)).not.toContain('violates')
  })

  it('저장에 성공하면 인접 트라이브를 새 목록으로 바꾼다', async () => {
    holder.tables.tribe_adjacency = [{ tribe_id: TRIBE, adjacent_tribe_id: '33333333-3333-4333-8333-333333333333' }]
    const res = await put({ adjacent_tribe_ids: ['22222222-2222-4222-8222-222222222222'] })
    expect(res.status).toBe(200)
    expect(holder.tables.tribe_adjacency).toEqual([{ tribe_id: TRIBE, adjacent_tribe_id: '22222222-2222-4222-8222-222222222222' }])
  })
})
