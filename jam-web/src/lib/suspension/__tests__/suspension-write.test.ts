/**
 * 이용 정지 걸기·풀기 — 서버 모듈 (티켓 20261017_1426 2회)
 *
 * 고정하는 것:
 * - `suspendUser`: 까닭은 앞뒤 공백을 지우고 저장하며, 비어 있으면 DB를 부르지 않고 `reason_required`로 거부한다.
 *   없는 유저는 `user_not_found`, 진행 중 정지가 있으면(부분 유니크 위반 23505) `already_suspended`, 그 밖의 DB 오류는 던진다.
 * - `liftSuspension`: 진행 중 정지의 `lifted_at`·`lifted_by`·`lift_note`를 채운다. 이미 풀렸거나 없으면 `not_suspended`.
 *   푼 시각은 건 시각보다 앞서지 않는다. 읽은 뒤 다른 운영자가 먼저 풀었으면(갱신된 줄 0) `not_suspended`.
 * - 풀고 다시 걸면 이력이 두 줄이 된다.
 *
 * 실제 공용 DB는 호출하지 않는다 — user_suspensions 한 표를 흉내내는 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/suspension/__tests__/suspension-write.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { liftSuspension, suspendUser } from '../suspension-write'

interface Row {
  id: string
  user_id: string
  reason: string
  suspended_at: string
  suspended_by: string
  lifted_at: string | null
  lifted_by: string | null
  lift_note: string | null
}

interface FakeOptions {
  users?: string[]
  rows?: Row[]
  failTable?: { table: string; op: 'select' | 'insert' | 'update'; message: string }
  /** 갱신 직전에 다른 운영자가 먼저 푼 상황을 흉내낸다 */
  liftedByOtherBeforeUpdate?: boolean
}

function makeFake(options: FakeOptions = {}) {
  const users = new Set(options.users ?? ['u1'])
  const rows: Row[] = options.rows ?? []
  let seq = rows.length
  const calls: string[] = []

  const from = (table: string) => {
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: Record<string, unknown> = {}
    const filters: Record<string, unknown> = {}
    const isNull: string[] = []

    const fail = () =>
      options.failTable && options.failTable.table === table && options.failTable.op === op
        ? { message: options.failTable.message }
        : null

    const matching = () =>
      rows.filter((r) => Object.entries(filters).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v) && isNull.every((c) => (r as unknown as Record<string, unknown>)[c] === null))

    const run = (single: 'one' | 'maybe' | 'list') => {
      calls.push(`${op}:${table}`)
      const error = fail()
      if (error) return { data: null, error }
      if (table === 'users') {
        const found = users.has(filters.id as string)
        return { data: found ? { id: filters.id } : null, error: null }
      }
      if (op === 'insert') {
        const active = rows.find((r) => r.user_id === payload.user_id && r.lifted_at === null)
        if (active) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_user_suspensions_active"' } }
        const row: Row = {
          id: `s${++seq}`,
          user_id: payload.user_id as string,
          reason: payload.reason as string,
          suspended_at: '2026-10-17T00:00:00.000Z',
          suspended_by: payload.suspended_by as string,
          lifted_at: null,
          lifted_by: null,
          lift_note: null,
        }
        rows.push(row)
        return { data: { id: row.id }, error: null }
      }
      if (op === 'update') {
        if (options.liftedByOtherBeforeUpdate) {
          for (const r of matching()) r.lifted_at = '2026-10-17T05:00:00.000Z'
        }
        const targets = matching()
        for (const r of targets) Object.assign(r, payload)
        return { data: targets.map((r) => ({ id: r.id })), error: null }
      }
      const found = matching()
      if (single === 'list') return { data: found, error: null }
      return { data: found[0] ?? null, error: null }
    }

    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (p: Record<string, unknown>) => {
        op = 'insert'
        payload = p
        return chain
      },
      update: (p: Record<string, unknown>) => {
        op = 'update'
        payload = p
        return chain
      },
      eq: (col: string, val: unknown) => {
        filters[col] = val
        return chain
      },
      is: (col: string, val: unknown) => {
        if (val === null) isNull.push(col)
        return chain
      },
      maybeSingle: async () => run('maybe'),
      single: async () => run('one'),
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(run('list')).then(onFulfilled, onRejected),
    }
    return chain
  }

  return { supabase: { from } as unknown as SupabaseClient, rows, calls }
}

describe('suspendUser', () => {
  it('까닭의 앞뒤 공백을 지우고 한 줄을 남긴다', async () => {
    const t = makeFake()

    const result = await suspendUser(t.supabase, { userId: 'u1', reason: '  GPS 조작  ', adminEmail: 'a@x.com' })

    expect(result).toEqual({ ok: true, id: 's1' })
    expect(t.rows).toHaveLength(1)
    expect(t.rows[0]).toMatchObject({ user_id: 'u1', reason: 'GPS 조작', suspended_by: 'a@x.com', lifted_at: null })
  })

  it.each(['', '   ', '\n\t '])('까닭이 비어 있으면(%j) DB를 부르지 않고 거부한다', async (reason) => {
    const t = makeFake()

    const result = await suspendUser(t.supabase, { userId: 'u1', reason, adminEmail: 'a@x.com' })

    expect(result).toEqual({ ok: false, code: 'reason_required' })
    expect(t.calls).toEqual([])
  })

  it('없는 유저는 user_not_found이고 줄을 만들지 않는다', async () => {
    const t = makeFake({ users: [] })

    const result = await suspendUser(t.supabase, { userId: 'ghost', reason: '사유', adminEmail: 'a@x.com' })

    expect(result).toEqual({ ok: false, code: 'user_not_found' })
    expect(t.rows).toHaveLength(0)
  })

  it('진행 중 정지가 있으면 부분 유니크 위반을 already_suspended로 알린다', async () => {
    const t = makeFake()
    await suspendUser(t.supabase, { userId: 'u1', reason: '첫 정지', adminEmail: 'a@x.com' })

    const second = await suspendUser(t.supabase, { userId: 'u1', reason: '두 번째', adminEmail: 'a@x.com' })

    expect(second).toEqual({ ok: false, code: 'already_suspended' })
    expect(t.rows).toHaveLength(1)
  })

  it('예상하지 못한 DB 오류는 던진다', async () => {
    const t = makeFake({ failTable: { table: 'user_suspensions', op: 'insert', message: 'boom' } })

    await expect(suspendUser(t.supabase, { userId: 'u1', reason: '사유', adminEmail: 'a@x.com' })).rejects.toThrow(/삽입 실패: boom/)
  })

  it('유저 조회가 실패하면 던진다(없는 유저로 단정하지 않는다)', async () => {
    const t = makeFake({ failTable: { table: 'users', op: 'select', message: 'down' } })

    await expect(suspendUser(t.supabase, { userId: 'u1', reason: '사유', adminEmail: 'a@x.com' })).rejects.toThrow(/users 조회 실패/)
  })
})

describe('liftSuspension', () => {
  const NOW = new Date('2026-10-18T00:00:00.000Z')

  it('진행 중 정지의 푼 시각·푼 사람·메모를 채운다', async () => {
    const t = makeFake()
    const suspended = await suspendUser(t.supabase, { userId: 'u1', reason: '사유', adminEmail: 'a@x.com' })
    if (!suspended.ok) throw new Error('정지 실패')

    const result = await liftSuspension(t.supabase, { suspensionId: suspended.id, adminEmail: 'b@x.com', note: ' 상담 후 해제 ', now: NOW })

    expect(result).toEqual({ ok: true })
    expect(t.rows[0]).toMatchObject({ lifted_at: '2026-10-18T00:00:00.000Z', lifted_by: 'b@x.com', lift_note: '상담 후 해제' })
  })

  it('메모가 없거나 공백이면 null로 남긴다', async () => {
    const t = makeFake()
    const suspended = await suspendUser(t.supabase, { userId: 'u1', reason: '사유', adminEmail: 'a@x.com' })
    if (!suspended.ok) throw new Error('정지 실패')

    await liftSuspension(t.supabase, { suspensionId: suspended.id, adminEmail: 'b@x.com', note: '   ', now: NOW })

    expect(t.rows[0].lift_note).toBeNull()
  })

  it('없는 정지는 not_suspended다', async () => {
    const t = makeFake()

    await expect(liftSuspension(t.supabase, { suspensionId: 'nope', adminEmail: 'b@x.com', now: NOW })).resolves.toEqual({
      ok: false,
      code: 'not_suspended',
    })
  })

  it('이미 푼 정지는 not_suspended이고 푼 기록을 덮어쓰지 않는다', async () => {
    const t = makeFake()
    const suspended = await suspendUser(t.supabase, { userId: 'u1', reason: '사유', adminEmail: 'a@x.com' })
    if (!suspended.ok) throw new Error('정지 실패')
    await liftSuspension(t.supabase, { suspensionId: suspended.id, adminEmail: 'b@x.com', note: '첫 해제', now: NOW })

    const again = await liftSuspension(t.supabase, { suspensionId: suspended.id, adminEmail: 'c@x.com', note: '두 번째', now: new Date('2026-10-19T00:00:00.000Z') })

    expect(again).toEqual({ ok: false, code: 'not_suspended' })
    expect(t.rows[0]).toMatchObject({ lifted_by: 'b@x.com', lift_note: '첫 해제' })
  })

  it('서버 시계가 건 시각보다 앞서 있어도 푼 시각이 건 시각보다 앞서지 않는다', async () => {
    const t = makeFake()
    const suspended = await suspendUser(t.supabase, { userId: 'u1', reason: '사유', adminEmail: 'a@x.com' })
    if (!suspended.ok) throw new Error('정지 실패')

    await liftSuspension(t.supabase, { suspensionId: suspended.id, adminEmail: 'b@x.com', now: new Date('2026-10-16T00:00:00.000Z') })

    expect(t.rows[0].lifted_at).toBe('2026-10-17T00:00:00.000Z')
  })

  it('읽은 뒤 다른 운영자가 먼저 풀었으면 not_suspended다', async () => {
    const t = makeFake({ liftedByOtherBeforeUpdate: true })
    const suspended = await suspendUser(t.supabase, { userId: 'u1', reason: '사유', adminEmail: 'a@x.com' })
    if (!suspended.ok) throw new Error('정지 실패')

    const result = await liftSuspension(t.supabase, { suspensionId: suspended.id, adminEmail: 'b@x.com', now: NOW })

    expect(result).toEqual({ ok: false, code: 'not_suspended' })
  })

  it('갱신 오류는 던진다', async () => {
    const t = makeFake({ failTable: { table: 'user_suspensions', op: 'update', message: 'boom' } })
    const suspended = await suspendUser(t.supabase, { userId: 'u1', reason: '사유', adminEmail: 'a@x.com' })
    if (!suspended.ok) throw new Error('정지 실패')

    await expect(liftSuspension(t.supabase, { suspensionId: suspended.id, adminEmail: 'b@x.com', now: NOW })).rejects.toThrow(/갱신 실패: boom/)
  })
})

describe('풀고 다시 걸기', () => {
  it('이력이 두 줄이 되고 진행 중인 줄은 하나다', async () => {
    const t = makeFake()
    const first = await suspendUser(t.supabase, { userId: 'u1', reason: '첫 정지', adminEmail: 'a@x.com' })
    if (!first.ok) throw new Error('정지 실패')
    await liftSuspension(t.supabase, { suspensionId: first.id, adminEmail: 'a@x.com', now: new Date('2026-10-18T00:00:00.000Z') })

    const second = await suspendUser(t.supabase, { userId: 'u1', reason: '다시 정지', adminEmail: 'a@x.com' })

    expect(second).toMatchObject({ ok: true })
    expect(t.rows).toHaveLength(2)
    expect(t.rows.filter((r) => r.lifted_at === null)).toHaveLength(1)
  })
})
