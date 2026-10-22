/**
 * JAM! 행동 지표 — 미션 완료·컬렉션 완성 값 계산 테스트 (티켓 20261001_0633, 상위 20260930_1456 ③)
 *
 * 검증 대상:
 *  - 내 행만 센다(다른 유저 행 분리), 0건이면 0
 *  - 미션: 쿼리 고정 — 테이블·`user_id` 조건·head count (행을 끌어오지 않는다)
 *  - 컬렉션 완성: 옛 완성 표와 등급 완성 표를 합쳐 «서로 다른 컬렉션 수»를 센다(티켓 20261022_0939 1회).
 *    한 컬렉션의 등급 행이 여러 개여도, 두 표에 같은 컬렉션이 겹쳐도 한 번만 센다
 *  - 조회 오류는 0으로 바꾸지 않고 던진다(fail-closed) — 두 표 어느 쪽 오류든
 *
 * 테이블 모킹은 메모리 테이블에 `eq`를 실제로 적용하고 head count·`order`·`range`를 지원한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-completion-metrics.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { countCollectionCompletions, countMissionCompletions } from '../jamActionCompletionMetrics'

type Row = Record<string, unknown>

const ME = 'user-me'
const OTHER = 'user-other'

const db = {
  tables: {} as Record<string, Row[]>,
  /** 조회 1회마다 기록 */
  queries: [] as {
    table: string
    cols: string
    head: boolean
    count: string | undefined
    eqs: [string, unknown][]
    orders: string[]
  }[],
  error: null as { message: string } | null,
  /** 들어 있으면 이 표를 읽는 조회만 오류를 돌려준다(없으면 `error`가 모든 표에 걸린다) */
  errorTable: null as string | null,
}

function mockSupabase(): SupabaseClient {
  const from = (table: string) => {
    let cols = ''
    let head = false
    let count: string | undefined
    const eqs: [string, unknown][] = []
    const orders: string[] = []
    let range: [number, number] | null = null
    const builder: Record<string, unknown> = {}
    builder.select = (c: string, opts?: { head?: boolean; count?: string }) => {
      cols = c
      head = Boolean(opts?.head)
      count = opts?.count
      return builder
    }
    builder.eq = (col: string, val: unknown) => {
      eqs.push([col, val])
      return builder
    }
    builder.order = (col: string) => {
      orders.push(col)
      return builder
    }
    builder.range = (from_: number, to: number) => {
      range = [from_, to]
      return builder
    }
    builder.then = (resolve: (v: unknown) => void) => {
      db.queries.push({ table, cols, head, count, eqs, orders })
      if (db.error && (db.errorTable === null || db.errorTable === table)) {
        return Promise.resolve({ data: null, count: null, error: db.error }).then(resolve)
      }
      let rows = (db.tables[table] ?? []).filter((r) => eqs.every(([c, v]) => r[c] === v))
      if (range) rows = rows.slice(range[0], range[1] + 1)
      return Promise.resolve(head ? { data: null, count: rows.length, error: null } : { data: rows, error: null }).then(resolve)
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

beforeEach(() => {
  db.tables = { user_mission_completions: [], user_item_book_completions: [], user_item_book_tier_completions: [] }
  db.queries = []
  db.error = null
  db.errorTable = null
})

describe('countMissionCompletions — 완료한 미션 수', () => {
  it('내 행만 센다 — 다른 유저의 완료 기록은 세지 않는다', () => {
    db.tables.user_mission_completions = [
      { id: '1', user_id: ME, mission_id: 'm1' },
      { id: '2', user_id: ME, mission_id: 'm2' },
      { id: '3', user_id: OTHER, mission_id: 'm1' },
      { id: '4', user_id: OTHER, mission_id: 'm3' },
    ]
    return expect(countMissionCompletions(mockSupabase(), ME)).resolves.toBe(2)
  })

  it('기록이 없으면 0이다', async () => {
    expect(await countMissionCompletions(mockSupabase(), ME)).toBe(0)
  })

  it('쿼리 고정: user_mission_completions를 user_id로 걸러 head count로만 읽는다', async () => {
    db.tables.user_mission_completions = [{ id: '1', user_id: ME, mission_id: 'm1' }]
    await countMissionCompletions(mockSupabase(), ME)
    expect(db.queries).toEqual([
      { table: 'user_mission_completions', cols: 'id', head: true, count: 'exact', eqs: [['user_id', ME]], orders: [] },
    ])
  })

  it('조회 오류는 0으로 바꾸지 않고 던진다', async () => {
    db.error = { message: 'DB 장애' }
    await expect(countMissionCompletions(mockSupabase(), ME)).rejects.toThrow(/DB 장애/)
  })
})

describe('countCollectionCompletions — 완성한 컬렉션 수', () => {
  it('옛 완성 표만 있으면 그 행의 컬렉션 수를 센다 — 다른 유저의 완성 기록은 세지 않는다', async () => {
    db.tables.user_item_book_completions = [
      { user_id: ME, item_book_id: 'b1' },
      { user_id: ME, item_book_id: 'b2' },
      { user_id: ME, item_book_id: 'b3' },
      { user_id: OTHER, item_book_id: 'b1' },
    ]
    expect(await countCollectionCompletions(mockSupabase(), ME)).toBe(3)
  })

  it('등급 완성 표만 있어도 센다 — 새 구조로 옮긴 컬렉션이 0으로 남지 않는다', async () => {
    db.tables.user_item_book_tier_completions = [
      { user_id: ME, item_book_id: 'b1', tier: 'common' },
      { user_id: ME, item_book_id: 'b2', tier: 'rare' },
      { user_id: OTHER, item_book_id: 'b3', tier: 'common' },
    ]
    expect(await countCollectionCompletions(mockSupabase(), ME)).toBe(2)
  })

  it('두 표를 합친다 — 옛 표 컬렉션과 등급 표 컬렉션이 서로 다르면 더한다', async () => {
    db.tables.user_item_book_completions = [{ user_id: ME, item_book_id: 'b1' }]
    db.tables.user_item_book_tier_completions = [{ user_id: ME, item_book_id: 'b2', tier: 'epic' }]
    expect(await countCollectionCompletions(mockSupabase(), ME)).toBe(2)
  })

  it('한 컬렉션의 등급 행이 여러 개여도 컬렉션당 한 번만 센다', async () => {
    db.tables.user_item_book_tier_completions = [
      { user_id: ME, item_book_id: 'b1', tier: 'common' },
      { user_id: ME, item_book_id: 'b1', tier: 'rare' },
      { user_id: ME, item_book_id: 'b1', tier: 'mystic' },
      { user_id: ME, item_book_id: 'b2', tier: 'common' },
    ]
    expect(await countCollectionCompletions(mockSupabase(), ME)).toBe(2)
  })

  it('옛 표와 등급 표에 같은 컬렉션이 겹쳐도 한 번만 센다', async () => {
    db.tables.user_item_book_completions = [
      { user_id: ME, item_book_id: 'b1' },
      { user_id: ME, item_book_id: 'b2' },
    ]
    db.tables.user_item_book_tier_completions = [
      { user_id: ME, item_book_id: 'b1', tier: 'common' },
      { user_id: ME, item_book_id: 'b1', tier: 'rare' },
      { user_id: ME, item_book_id: 'b3', tier: 'common' },
    ]
    expect(await countCollectionCompletions(mockSupabase(), ME)).toBe(3)
  })

  it('기록이 없으면 0이다', async () => {
    expect(await countCollectionCompletions(mockSupabase(), ME)).toBe(0)
  })

  it('쿼리 고정: 두 표를 user_id로 걸러 컬렉션 id만 읽는다(head count가 아니다). 등급 표는 PK 전체로 정렬한다', async () => {
    db.tables.user_item_book_completions = [{ user_id: ME, item_book_id: 'b1' }]
    await countCollectionCompletions(mockSupabase(), ME)
    expect(db.queries).toEqual([
      { table: 'user_item_book_completions', cols: 'item_book_id', head: false, count: undefined, eqs: [['user_id', ME]], orders: ['item_book_id'] },
      {
        table: 'user_item_book_tier_completions',
        cols: 'item_book_id',
        head: false,
        count: undefined,
        eqs: [['user_id', ME]],
        orders: ['item_book_id', 'tier'],
      },
    ])
  })

  it('조회 오류는 0으로 바꾸지 않고 던진다', async () => {
    db.error = { message: 'DB 장애' }
    await expect(countCollectionCompletions(mockSupabase(), ME)).rejects.toThrow(/DB 장애/)
  })

  it('등급 완성 표만 읽지 못해도 던진다 — 옛 표 값만으로 낮게 센 채 돌려주지 않는다', async () => {
    db.tables.user_item_book_completions = [{ user_id: ME, item_book_id: 'b1' }]
    db.error = { message: '등급 표 장애' }
    db.errorTable = 'user_item_book_tier_completions'
    await expect(countCollectionCompletions(mockSupabase(), ME)).rejects.toThrow(/등급 표 장애/)
  })

  it('옛 완성 표만 읽지 못해도 던진다', async () => {
    db.tables.user_item_book_tier_completions = [{ user_id: ME, item_book_id: 'b1', tier: 'common' }]
    db.error = { message: '옛 표 장애' }
    db.errorTable = 'user_item_book_completions'
    await expect(countCollectionCompletions(mockSupabase(), ME)).rejects.toThrow(/옛 표 장애/)
  })
})
