/**
 * JAM! 행동 지표 계산 함수 테스트 (티켓 20261001_0631)
 *
 * 검증 대상: 각 계산 함수가 «무엇을 세는가»와 «오류를 던지는가».
 *  - 성공 횟수 = `user_combine_success_logs` 행 수(그 유저만)
 *  - 실패 횟수 = `user_combine_fail_logs` 중 `fail_reason = 'no_recipe_match'`(소각 전 실패 제외)
 *  - 시도 횟수 = 성공 + 실패
 *  - 최초 성공 레시피 = `is_recipe_first = true` 행이 내 것인 레시피
 *  - DB 오류는 0으로 바꾸지 않고 던진다(「센 값이 0」과 「세지 못함」을 구분한다)
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-metrics.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  countCombineAttempts,
  countCombineFail,
  countCombineSuccess,
  fetchFirstSuccessRecipeIds,
} from '../jamActionMetrics'

type Row = Record<string, unknown>

function makeSupabase(tables: Record<string, Row[]>, errorTables: string[] = []) {
  const queried: string[] = []
  const from = (table: string) => {
    const eqs: [string, unknown][] = []
    const ins: [string, unknown[]][] = []
    let head = false
    const builder: Record<string, unknown> = {}
    builder.select = (_cols: string, opts?: { head?: boolean }) => {
      head = Boolean(opts?.head)
      return builder
    }
    builder.eq = (col: string, val: unknown) => {
      eqs.push([col, val])
      return builder
    }
    builder.in = (col: string, vals: unknown[]) => {
      ins.push([col, vals])
      return builder
    }
    builder.then = (resolve: (v: unknown) => void) => {
      queried.push(table)
      if (errorTables.includes(table)) {
        return Promise.resolve({ data: null, count: null, error: { message: 'DB 장애' } }).then(resolve)
      }
      const rows = (tables[table] ?? []).filter(
        (r) => eqs.every(([c, v]) => r[c] === v) && ins.every(([c, v]) => v.includes(r[c]))
      )
      return Promise.resolve(head ? { data: null, count: rows.length, error: null } : { data: rows, error: null }).then(resolve)
    }
    return builder
  }
  return { client: { from } as unknown as SupabaseClient, queried }
}

const TABLES: Record<string, Row[]> = {
  user_combine_success_logs: [
    { user_id: 'u1', recipe_id: 'r1', is_recipe_first: true },
    { user_id: 'u1', recipe_id: 'r2', is_recipe_first: false },
    { user_id: 'u1', recipe_id: 'r2', is_recipe_first: false },
    { user_id: 'u2', recipe_id: 'r1', is_recipe_first: false },
  ],
  user_combine_fail_logs: [
    { user_id: 'u1', fail_reason: 'no_recipe_match' },
    { user_id: 'u1', fail_reason: 'no_recipe_match' },
    { user_id: 'u1', fail_reason: 'invalid_count' },
    { user_id: 'u1', fail_reason: 'items_not_found' },
    { user_id: 'u1', fail_reason: 'recipe_not_found' },
    { user_id: 'u2', fail_reason: 'no_recipe_match' },
  ],
}

describe('countCombineSuccess', () => {
  it('그 유저의 성공 기록 행 수를 센다', async () => {
    const { client } = makeSupabase(TABLES)
    expect(await countCombineSuccess(client, 'u1')).toBe(3)
    expect(await countCombineSuccess(client, 'u2')).toBe(1)
    expect(await countCombineSuccess(client, 'nobody')).toBe(0)
  })

  it('DB 오류는 0이 아니라 예외다', async () => {
    const { client } = makeSupabase(TABLES, ['user_combine_success_logs'])
    await expect(countCombineSuccess(client, 'u1')).rejects.toThrow('믹스 성공 기록')
  })
})

describe('countCombineFail', () => {
  it('no_recipe_match만 센다 — 소각 전에 끝난 실패는 세지 않는다', async () => {
    const { client } = makeSupabase(TABLES)
    expect(await countCombineFail(client, 'u1')).toBe(2)
    expect(await countCombineFail(client, 'u2')).toBe(1)
  })

  it('DB 오류는 0이 아니라 예외다', async () => {
    const { client } = makeSupabase(TABLES, ['user_combine_fail_logs'])
    await expect(countCombineFail(client, 'u1')).rejects.toThrow('믹스 실패 로그')
  })
})

describe('countCombineAttempts', () => {
  it('성공 기록 수 + no_recipe_match 수다', async () => {
    const { client } = makeSupabase(TABLES)
    expect(await countCombineAttempts(client, 'u1')).toBe(5) // 성공 3 + no_recipe_match 2
    expect(await countCombineAttempts(client, 'u2')).toBe(2) // 성공 1 + no_recipe_match 1
  })

  it('두 테이블 중 하나라도 실패하면 예외다 — 한쪽만 더한 값을 돌려주지 않는다', async () => {
    await expect(countCombineAttempts(makeSupabase(TABLES, ['user_combine_fail_logs']).client, 'u1')).rejects.toThrow()
    await expect(countCombineAttempts(makeSupabase(TABLES, ['user_combine_success_logs']).client, 'u1')).rejects.toThrow()
  })
})

describe('fetchFirstSuccessRecipeIds', () => {
  it('내가 최초 성공자인 레시피 id만 돌려준다', async () => {
    const { client } = makeSupabase(TABLES)
    expect(await fetchFirstSuccessRecipeIds(client, 'u1', ['r1', 'r2'])).toEqual(new Set(['r1']))
    // 같은 레시피를 성공했어도 최초 표시가 없으면 포함되지 않는다
    expect(await fetchFirstSuccessRecipeIds(client, 'u2', ['r1'])).toEqual(new Set())
  })

  it('요청한 레시피 id 밖의 최초 성공은 돌려주지 않는다', async () => {
    const { client } = makeSupabase(TABLES)
    expect(await fetchFirstSuccessRecipeIds(client, 'u1', ['r2'])).toEqual(new Set())
  })

  it('레시피 id 목록이 비어 있으면 조회하지 않는다', async () => {
    const { client, queried } = makeSupabase(TABLES)
    expect(await fetchFirstSuccessRecipeIds(client, 'u1', [])).toEqual(new Set())
    expect(queried).toEqual([])
  })

  it('DB 오류는 빈 집합이 아니라 예외다', async () => {
    const { client } = makeSupabase(TABLES, ['user_combine_success_logs'])
    await expect(fetchFirstSuccessRecipeIds(client, 'u1', ['r1'])).rejects.toThrow('레시피 최초 성공 기록')
  })
})
