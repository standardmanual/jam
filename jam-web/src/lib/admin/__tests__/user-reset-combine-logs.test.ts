/**
 * resetUserData — 믹스 이력(성공·실패) 삭제 테스트 (티켓 20261001_0631)
 *
 * 믹스 시도·성공 횟수 지표가 `user_combine_success_logs`에서 나오므로, 초기화가 이 기록을 지우지 않으면
 * 초기화한 유저의 횟수가 그대로 이어진다. 실패 이력(`user_combine_fail_logs`)과 같은 단계에서 지운다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/user-reset-combine-logs.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'
import { resetUserData } from '../user-actions'

type ServiceClient = ReturnType<typeof createServiceClient>

const USER_ID = 'user-1'

/** 삭제 대상 테이블과 `user_id` 필터를 기록하는 최소 체인. `failTables`의 삭제는 오류를 돌려준다 */
function makeSupabase(failTables: string[] = []) {
  const deletes: { table: string; filter: [string, unknown] | null }[] = []
  const from = (table: string) => {
    let op: 'select' | 'delete' | 'update' = 'select'
    let filter: [string, unknown] | null = null
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.delete = () => {
      op = 'delete'
      return builder
    }
    builder.update = () => {
      op = 'update'
      return builder
    }
    builder.in = () => builder
    builder.eq = (col: string, val: unknown) => {
      filter = [col, val]
      return builder
    }
    builder.maybeSingle = async () =>
      table === 'users' ? { data: { id: USER_ID, initial_sync_done: true }, error: null } : { data: null, error: null }
    builder.then = (resolve: (v: unknown) => void) => {
      if (op === 'delete') deletes.push({ table, filter })
      const error = op === 'delete' && failTables.includes(table) ? { message: `${table} 삭제 실패` } : null
      return Promise.resolve({ data: op === 'select' ? [] : null, count: 0, error }).then(resolve)
    }
    return builder
  }
  return { client: { from } as unknown as ServiceClient, deletes }
}

describe('resetUserData — 믹스 이력 삭제', () => {
  it('믹스 성공 기록과 실패 이력을 그 유저 기준으로 함께 지운다', async () => {
    const { client, deletes } = makeSupabase()

    const result = await resetUserData(client, USER_ID, 'admin@example.com')

    expect(result.ok).toBe(true)
    expect(deletes).toContainEqual({ table: 'user_combine_success_logs', filter: ['user_id', USER_ID] })
    expect(deletes).toContainEqual({ table: 'user_combine_fail_logs', filter: ['user_id', USER_ID] })
  })

  it('믹스 성공 기록 삭제가 실패하면 초기화 전체가 실패로 돌아온다', async () => {
    const { client } = makeSupabase(['user_combine_success_logs'])

    const result = await resetUserData(client, USER_ID, 'admin@example.com')

    expect(result).toEqual({ ok: false, status: 500, error: 'user_combine_success_logs 삭제 실패' })
  })

  it('믹스 실패 이력 삭제가 실패해도 마찬가지로 실패로 돌아온다 — 기존 동작', async () => {
    const { client } = makeSupabase(['user_combine_fail_logs'])

    const result = await resetUserData(client, USER_ID, 'admin@example.com')

    expect(result).toEqual({ ok: false, status: 500, error: 'user_combine_fail_logs 삭제 실패' })
  })
})
