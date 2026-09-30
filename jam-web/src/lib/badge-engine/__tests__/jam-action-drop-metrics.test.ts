/**
 * JAM! 행동 지표 — 드랍·픽업 4종 값 계산 테스트 (티켓 20261001_0632, 상위 20260930_1456 ②)
 *
 * 검증 대상:
 *  ① 순수 함수 `computeDropPickupMetrics`: 번갈아 놓기(왕복)가 지표를 부풀리지 않는다, 자기 드랍·시스템 드랍·
 *     탈퇴한 놓은/줍는 사람, 서로 다른 유저 수
 *  ② 조회: `inventory_item_id`가 없는 옛 행을 쿼리에서 제외한다(쿼리 고정), 다른 유저 행 분리,
 *     1,000행 페이지로 끝까지 읽기, 30페이지를 넘으면 오류, 조회 오류는 던진다
 *
 * 테이블 모킹은 메모리 `poi_drops`에 `eq`·`not`·`order`·`range`를 실제로 적용하고 `select`한 열만 돌려준다 —
 * 「어떤 행을 어떤 열로 읽는가」가 고정 대상이라 실제 조회와 같은 모양이어야 한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-drop-metrics.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeDropPickupMetrics,
  countDroppedItems,
  countPickedUpByUsers,
  countPickedUpItems,
  countPickupFromUsers,
  fetchMyDropRows,
  fetchMyPickupRows,
  type MyDropRow,
  type MyPickupRow,
} from '../jamActionDropMetrics'

type DropRecord = {
  id: string
  dropper_user_id: string | null
  picked_up_by: string | null
  inventory_item_id: string | null
}

const A = 'user-a'
const B = 'user-b'
const C = 'user-c'
const D = 'user-d'

// ── 메모리 poi_drops 모킹 ────────────────────────────────────────────────

const db = {
  rows: [] as DropRecord[],
  /** 조회 1회마다 `{ eqs, nots, range }` 기록 */
  queries: [] as { eqs: [string, unknown][]; nots: [string, string, unknown][]; range: [number, number] | null; cols: string }[],
  error: null as { message: string } | null,
}

let nextId = 0
function addRow(row: Omit<DropRecord, 'id'>) {
  db.rows.push({ id: String(nextId++).padStart(7, '0'), ...row })
}

function mockSupabase(): SupabaseClient {
  const from = (table: string) => {
    if (table !== 'poi_drops') throw new Error(`예상하지 못한 테이블: ${table}`)
    let cols = ''
    const eqs: [string, unknown][] = []
    const nots: [string, string, unknown][] = []
    let ordered = false
    let range: [number, number] | null = null
    const builder: Record<string, unknown> = {}
    builder.select = (c: string) => {
      cols = c
      return builder
    }
    builder.eq = (col: string, val: unknown) => {
      eqs.push([col, val])
      return builder
    }
    builder.not = (col: string, op: string, val: unknown) => {
      nots.push([col, op, val])
      return builder
    }
    builder.order = () => {
      ordered = true
      return builder
    }
    builder.range = (from: number, to: number) => {
      range = [from, to]
      return builder
    }
    builder.then = (resolve: (v: unknown) => void) => {
      db.queries.push({ eqs, nots, range, cols })
      if (db.error) return Promise.resolve({ data: null, error: db.error }).then(resolve)
      let rows = db.rows.filter(
        (r) =>
          eqs.every(([c, v]) => (r as Record<string, unknown>)[c] === v) &&
          // `.not(col, 'is', null)` — 그 열이 null이 아닌 행만
          nots.every(([c, op, v]) => (op === 'is' && v === null ? (r as Record<string, unknown>)[c] !== null : true))
      )
      // 1,000행 페이지 조회는 `.order('id')`와 함께여야 페이지가 겹치거나 빠지지 않는다
      if (ordered) rows = [...rows].sort((x, y) => (x.id < y.id ? -1 : 1))
      if (range) rows = rows.slice(range[0], range[1] + 1)
      const wanted = cols.split(',').map((c) => c.trim())
      const projected = rows.map((r) => Object.fromEntries(wanted.map((c) => [c, (r as Record<string, unknown>)[c]])))
      return Promise.resolve({ data: projected, error: null }).then(resolve)
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

beforeEach(() => {
  db.rows = []
  db.queries = []
  db.error = null
  nextId = 0
})

const drop = (item: string, pickedUpBy: string | null = null): MyDropRow => ({ inventory_item_id: item, picked_up_by: pickedUpBy })
const pickup = (item: string, dropper: string | null): MyPickupRow => ({ inventory_item_id: item, dropper_user_id: dropper })

// ═══════════════════════════════════════════════════════════════════════
// ① 순수 함수 — 규칙
// ═══════════════════════════════════════════════════════════════════════

describe('computeDropPickupMetrics — 서로 다른 개체·유저로 센다', () => {
  it('번갈아 놓기: A·B가 같은 개체 X를 10번 왕복해 행이 20개여도 두 유저 모두 네 지표가 1이다', () => {
    // A가 X를 놓고 B가 줍고, B가 X를 놓고 A가 줍고 … 10번 왕복 = 드랍 행 20개
    const all: { dropper: string; picker: string; item: string }[] = []
    for (let i = 0; i < 10; i++) {
      all.push({ dropper: A, picker: B, item: 'X' })
      all.push({ dropper: B, picker: A, item: 'X' })
    }
    expect(all).toHaveLength(20)

    const viewOf = (me: string) =>
      computeDropPickupMetrics(
        me,
        all.filter((r) => r.dropper === me).map((r) => drop(r.item, r.picker)),
        all.filter((r) => r.picker === me).map((r) => pickup(r.item, r.dropper))
      )

    const expected = { dropItemCount: 1, pickupItemCount: 1, pickupFromUserCount: 1, pickedUpByUserCount: 1 }
    expect(viewOf(A)).toEqual(expected)
    expect(viewOf(B)).toEqual(expected)
  })

  it('자기 드랍을 자기가 주운 것은 드랍에는 세고 픽업·함께 픽업·주워짐에는 세지 않는다', () => {
    const myDrops = [drop('X', A), drop('Y', A)]
    const myPickups = [pickup('X', A), pickup('Y', A)]
    expect(computeDropPickupMetrics(A, myDrops, myPickups)).toEqual({
      dropItemCount: 2,
      pickupItemCount: 0,
      pickupFromUserCount: 0,
      pickedUpByUserCount: 0,
    })
  })

  it('시스템 드랍(놓은 사람 없음)은 픽업에 세고 함께 픽업에는 세지 않는다', () => {
    expect(computeDropPickupMetrics(A, [], [pickup('S1', null), pickup('S2', null)])).toEqual({
      dropItemCount: 0,
      pickupItemCount: 2,
      pickupFromUserCount: 0,
      pickedUpByUserCount: 0,
    })
  })

  it('놓은 사람이 탈퇴한 드랍은 시스템 드랍과 같이 센다 — 픽업 O, 함께 픽업 X', () => {
    // 탈퇴한 놓은 사람은 `dropper_user_id`가 null이 된다(시스템 드랍과 같은 모양)
    const withdrawn = computeDropPickupMetrics(A, [], [pickup('W1', null)])
    const system = computeDropPickupMetrics(A, [], [pickup('W1', null)])
    expect(withdrawn).toEqual(system)
    expect(withdrawn.pickupItemCount).toBe(1)
    expect(withdrawn.pickupFromUserCount).toBe(0)
  })

  it('줍는 사람이 탈퇴한 행(picked_up_by null)과 아직 줍지 않은 행은 주워짐에 세지 않는다', () => {
    expect(computeDropPickupMetrics(A, [drop('X', null), drop('Y', null)], [])).toEqual({
      dropItemCount: 2,
      pickupItemCount: 0,
      pickupFromUserCount: 0,
      pickedUpByUserCount: 0,
    })
  })

  it('서로 다른 유저 수: 세 명이 각각 주우면 3, 한 명이 여러 개를 주우면 1이다', () => {
    const threePeople = computeDropPickupMetrics(A, [drop('X', B), drop('Y', C), drop('Z', D)], [])
    expect(threePeople.pickedUpByUserCount).toBe(3)
    expect(threePeople.dropItemCount).toBe(3)

    const onePerson = computeDropPickupMetrics(A, [drop('X', B), drop('Y', B), drop('Z', B)], [])
    expect(onePerson.pickedUpByUserCount).toBe(1)
    expect(onePerson.dropItemCount).toBe(3)

    const fromThree = computeDropPickupMetrics(A, [], [pickup('X', B), pickup('Y', C), pickup('Z', D)])
    expect(fromThree.pickupFromUserCount).toBe(3)
    const fromOne = computeDropPickupMetrics(A, [], [pickup('X', B), pickup('Y', B), pickup('Z', B)])
    expect(fromOne.pickupFromUserCount).toBe(1)
    expect(fromOne.pickupItemCount).toBe(3)
  })

  it('같은 개체를 다른 사람에게서 다시 주워도 픽업 개체 수는 1이고 함께 픽업 유저 수만 는다', () => {
    const m = computeDropPickupMetrics(A, [], [pickup('X', B), pickup('X', C)])
    expect(m.pickupItemCount).toBe(1)
    expect(m.pickupFromUserCount).toBe(2)
  })

  it('행이 없으면 모두 0이다', () => {
    expect(computeDropPickupMetrics(A, [], [])).toEqual({
      dropItemCount: 0,
      pickupItemCount: 0,
      pickupFromUserCount: 0,
      pickedUpByUserCount: 0,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② 조회 — 계산 함수 4개
// ═══════════════════════════════════════════════════════════════════════

describe('계산 함수 4개 — 메모리 poi_drops로 끝까지', () => {
  it('번갈아 놓기를 DB 조회로 읽어도 두 유저 모두 네 지표가 1이다', async () => {
    for (let i = 0; i < 10; i++) {
      addRow({ dropper_user_id: A, picked_up_by: B, inventory_item_id: 'X' })
      addRow({ dropper_user_id: B, picked_up_by: A, inventory_item_id: 'X' })
    }
    const supabase = mockSupabase()
    for (const me of [A, B]) {
      expect(await countDroppedItems(supabase, me)).toBe(1)
      expect(await countPickedUpItems(supabase, me)).toBe(1)
      expect(await countPickupFromUsers(supabase, me)).toBe(1)
      expect(await countPickedUpByUsers(supabase, me)).toBe(1)
    }
  })

  it('옛 행(inventory_item_id null)은 어떤 지표에도 세지 않는다 — 쿼리가 null 행을 제외한다', async () => {
    addRow({ dropper_user_id: A, picked_up_by: B, inventory_item_id: null })
    addRow({ dropper_user_id: B, picked_up_by: A, inventory_item_id: null })
    addRow({ dropper_user_id: A, picked_up_by: B, inventory_item_id: 'X' })
    addRow({ dropper_user_id: B, picked_up_by: A, inventory_item_id: 'Y' })
    const supabase = mockSupabase()

    expect(await countDroppedItems(supabase, A)).toBe(1)
    expect(await countPickedUpItems(supabase, A)).toBe(1)
    expect(await countPickupFromUsers(supabase, A)).toBe(1)
    expect(await countPickedUpByUsers(supabase, A)).toBe(1)

    // 쿼리 고정: 모든 조회가 `.not('inventory_item_id', 'is', null)`를 건다
    expect(db.queries.length).toBeGreaterThan(0)
    for (const q of db.queries) {
      expect(q.nots).toContainEqual(['inventory_item_id', 'is', null])
    }
  })

  it('옛 행만 있는 유저는 모든 지표가 0이다', async () => {
    addRow({ dropper_user_id: A, picked_up_by: B, inventory_item_id: null })
    addRow({ dropper_user_id: B, picked_up_by: A, inventory_item_id: null })
    const supabase = mockSupabase()
    expect(await countDroppedItems(supabase, A)).toBe(0)
    expect(await countPickedUpItems(supabase, A)).toBe(0)
    expect(await countPickupFromUsers(supabase, A)).toBe(0)
    expect(await countPickedUpByUsers(supabase, A)).toBe(0)
  })

  it('다른 유저의 행은 섞이지 않는다', async () => {
    addRow({ dropper_user_id: A, picked_up_by: B, inventory_item_id: 'X' })
    addRow({ dropper_user_id: C, picked_up_by: D, inventory_item_id: 'Y' })
    addRow({ dropper_user_id: C, picked_up_by: D, inventory_item_id: 'Z' })
    const supabase = mockSupabase()
    expect(await countDroppedItems(supabase, A)).toBe(1)
    expect(await countPickedUpByUsers(supabase, A)).toBe(1)
    expect(await countPickedUpItems(supabase, A)).toBe(0)
    expect(await countDroppedItems(supabase, C)).toBe(2)
    expect(await countPickedUpByUsers(supabase, C)).toBe(1)
    expect(await countPickedUpItems(supabase, D)).toBe(2)
    expect(await countPickupFromUsers(supabase, D)).toBe(1)
  })

  it('시스템 드랍·탈퇴한 놓은 사람·탈퇴한 줍는 사람·자기 드랍을 한 번에 가려낸다', async () => {
    // A가 놓은 것: 자기가 주움(X), 탈퇴한 줍는 사람(Y), 아직 안 주움(Z), B가 주움(W)
    addRow({ dropper_user_id: A, picked_up_by: A, inventory_item_id: 'X' })
    addRow({ dropper_user_id: A, picked_up_by: null, inventory_item_id: 'Y' })
    addRow({ dropper_user_id: A, picked_up_by: null, inventory_item_id: 'Z' })
    addRow({ dropper_user_id: A, picked_up_by: B, inventory_item_id: 'W' })
    // A가 주운 것: 시스템/탈퇴한 놓은 사람(S1), C가 놓은 것(S2)
    addRow({ dropper_user_id: null, picked_up_by: A, inventory_item_id: 'S1' })
    addRow({ dropper_user_id: C, picked_up_by: A, inventory_item_id: 'S2' })
    const supabase = mockSupabase()

    expect(await countDroppedItems(supabase, A)).toBe(4)
    expect(await countPickedUpByUsers(supabase, A)).toBe(1) // B만
    // 자기 드랍 X는 픽업에서 빠지고, S1(놓은 사람 없음)·S2는 센다
    expect(await countPickedUpItems(supabase, A)).toBe(2)
    expect(await countPickupFromUsers(supabase, A)).toBe(1) // C만
  })

  it('놓은 사람 기준 조회와 주운 사람 기준 조회는 각자 필요한 열만 읽는다', async () => {
    addRow({ dropper_user_id: A, picked_up_by: B, inventory_item_id: 'X' })
    const supabase = mockSupabase()
    await fetchMyDropRows(supabase, A)
    await fetchMyPickupRows(supabase, A)
    expect(db.queries[0].cols).toBe('inventory_item_id, picked_up_by')
    expect(db.queries[0].eqs).toEqual([['dropper_user_id', A]])
    expect(db.queries[1].cols).toBe('inventory_item_id, dropper_user_id')
    expect(db.queries[1].eqs).toEqual([['picked_up_by', A]])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② 페이지 읽기와 fail-closed
// ═══════════════════════════════════════════════════════════════════════

describe('1,000행 페이지로 끝까지 읽는다', () => {
  function addManyDrops(user: string, count: number) {
    for (let i = 0; i < count; i++) {
      addRow({ dropper_user_id: user, picked_up_by: null, inventory_item_id: `item-${i}` })
    }
  }

  it('2,500행은 3페이지를 읽고 전부 센다 — 1,000행에서 잘리지 않는다', async () => {
    addManyDrops(A, 2500)
    const supabase = mockSupabase()
    expect(await countDroppedItems(supabase, A)).toBe(2500)
    expect(db.queries.map((q) => q.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('정확히 1,000행이면 다음 페이지가 비어 있음을 확인하고 끝낸다', async () => {
    addManyDrops(A, 1000)
    expect(await countDroppedItems(mockSupabase(), A)).toBe(1000)
    expect(db.queries.map((q) => q.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('행이 없어도 한 번 조회하고 0을 돌려준다', async () => {
    expect(await countDroppedItems(mockSupabase(), A)).toBe(0)
    expect(db.queries).toHaveLength(1)
  })

  it('30페이지(30,000행)까지는 읽는다', async () => {
    addManyDrops(A, 30000)
    expect(await countDroppedItems(mockSupabase(), A)).toBe(30000)
  })

  it('30페이지를 넘으면(30,001행 → 31번째 페이지에 행이 있다) 오류를 던진다 — 잘린 값을 돌려주지 않는다', async () => {
    addManyDrops(A, 30001)
    await expect(countDroppedItems(mockSupabase(), A)).rejects.toThrow(/30페이지/)
    // 31번째 페이지까지만 읽고 멈춘다
    expect(db.queries).toHaveLength(31)
  })

  it('주운 사람 기준 조회도 같은 상한이 걸린다', async () => {
    for (let i = 0; i < 30001; i++) {
      addRow({ dropper_user_id: B, picked_up_by: A, inventory_item_id: `item-${i}` })
    }
    await expect(countPickedUpItems(mockSupabase(), A)).rejects.toThrow(/30페이지/)
  })
})

describe('조회 오류는 던진다 — 0으로 바꿔 돌려주지 않는다', () => {
  it.each([
    ['countDroppedItems', countDroppedItems],
    ['countPickedUpItems', countPickedUpItems],
    ['countPickupFromUsers', countPickupFromUsers],
    ['countPickedUpByUsers', countPickedUpByUsers],
  ])('%s', async (_name, fn) => {
    db.error = { message: 'DB 장애' }
    await expect(fn(mockSupabase(), A)).rejects.toThrow(/DB 장애/)
  })
})
