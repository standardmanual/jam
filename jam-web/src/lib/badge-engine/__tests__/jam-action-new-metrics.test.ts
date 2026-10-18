/**
 * JAM! 행동 지표 — 새 JAM 조건 5종과 잼·챕터 3종의 값 계산 테스트 (티켓 20261018_1815 2회)
 *
 * 검증 대상:
 *  - 순수 함수: 픽업 당시 잠김 판정(자기 드랍·왕복·열린 채 받은 개체·픽업 뒤 연 개체), 다른 트라이브 종류 수,
 *    트라이브를 넘는 믹스, 한 주(월~일, KST)에 모은 잼
 *  - DB 읽기: 내 행만 센다, 0건이면 0, 행이 없으면 0, 조회 오류는 0으로 바꾸지 않고 던진다(fail-closed)
 *  - 8키가 수치형 지표로 판정·발급된다(`evaluateJamActionBadges` 경유)
 *
 * 테이블 모킹은 메모리 테이블에 `eq`·`in`·`is`·`not`을 실제로 적용한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-new-metrics.test.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))

import {
  ID_CHUNK_SIZE,
  countCapsuleOpens,
  countCrossTribeCombineSuccess,
  countCrossTribeCombines,
  countLockedAtPickup,
  countLockedItemOpens,
  countLockedItemPickups,
  countOtherTribeItemKinds,
  countOtherTribeKinds,
} from '../jamActionItemMetrics'
import { bestWeekJamEarned, readChapterReached, readJamTotalEarned, readJamWeeklyEarned } from '../jamActionJamMetrics'

type Row = Record<string, unknown>

const ME = 'user-me'
const OTHER = 'user-other'

const db = {
  tables: {} as Record<string, Row[]>,
  /** 조회 1회마다 기록 */
  queries: [] as { table: string; head: boolean }[],
  error: null as { message: string } | null,
}

/** 메모리 테이블 위에서 supabase-js 읽기 빌더를 흉내 낸다 — `range`는 무시하고 한 번에 돌려준다(행 < 1,000) */
function mockSupabase(): SupabaseClient {
  const from = (table: string) => {
    let head = false
    const filters: ((r: Row) => boolean)[] = []
    let single = false
    const builder: Record<string, unknown> = {}
    builder.select = (...args: unknown[]) => {
      head = Boolean((args[1] as { head?: boolean } | undefined)?.head)
      return builder
    }
    builder.eq = (col: string, val: unknown) => {
      filters.push((r) => r[col] === val)
      return builder
    }
    builder.in = (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]))
      return builder
    }
    builder.is = (col: string, val: unknown) => {
      filters.push((r) => (r[col] ?? null) === val)
      return builder
    }
    builder.not = (col: string, op: string, val: unknown) => {
      if (op === 'is') filters.push((r) => (r[col] ?? null) !== val)
      return builder
    }
    builder.order = () => builder
    builder.range = (from: number) => {
      // 첫 페이지만 행을 주고 다음 페이지는 비운다 — 행 수가 한 페이지(1,000)보다 작다는 전제
      if (from > 0) filters.push(() => false)
      return builder
    }
    builder.maybeSingle = () => {
      single = true
      return builder
    }
    builder.then = (resolve: (v: unknown) => void) => {
      db.queries.push({ table, head })
      if (db.error) return Promise.resolve({ data: null, count: null, error: db.error }).then(resolve)
      const rows = (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      if (head) return Promise.resolve({ data: null, count: rows.length, error: null }).then(resolve)
      if (single) return Promise.resolve({ data: rows[0] ?? null, error: null }).then(resolve)
      return Promise.resolve({ data: rows, error: null }).then(resolve)
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

beforeEach(() => {
  db.tables = {}
  db.queries = []
  db.error = null
})

// ── 순수 함수 ─────────────────────────────────────────────────────────────

describe('countLockedAtPickup — 픽업 당시 잠겨 있던 서로 다른 개체 수', () => {
  const T1 = '2026-10-10T00:00:00Z'
  const T2 = '2026-10-12T00:00:00Z'
  const T3 = '2026-10-14T00:00:00Z'

  it('지금도 잠겨 있으면 그때도 잠겨 있었다', () => {
    expect(
      countLockedAtPickup(ME, [{ inventory_item_id: 'i1', dropper_user_id: OTHER, picked_up_at: T2 }], [
        { id: 'i1', locked: true, unlocked_at: null },
      ])
    ).toBe(1)
  })

  it('픽업 뒤에 연 개체는 세고, 픽업 전에 이미 열려 있던 개체는 세지 않는다', () => {
    const pickups = [
      { inventory_item_id: 'after', dropper_user_id: OTHER, picked_up_at: T2 },
      { inventory_item_id: 'before', dropper_user_id: OTHER, picked_up_at: T2 },
    ]
    const items = [
      { id: 'after', locked: false, unlocked_at: T3 },
      { id: 'before', locked: false, unlocked_at: T1 },
    ]
    expect(countLockedAtPickup(ME, pickups, items)).toBe(1)
  })

  it('열린 채 받은 개체(잠긴 적 없음)는 세지 않는다', () => {
    expect(
      countLockedAtPickup(ME, [{ inventory_item_id: 'i1', dropper_user_id: OTHER, picked_up_at: T2 }], [
        { id: 'i1', locked: false, unlocked_at: null },
      ])
    ).toBe(0)
  })

  it('자기 드랍은 세지 않는다', () => {
    expect(
      countLockedAtPickup(ME, [{ inventory_item_id: 'i1', dropper_user_id: ME, picked_up_at: T2 }], [
        { id: 'i1', locked: true, unlocked_at: null },
      ])
    ).toBe(0)
  })

  it('시스템·탈퇴한 놓은 사람(null)의 드랍은 센다', () => {
    expect(
      countLockedAtPickup(ME, [{ inventory_item_id: 'i1', dropper_user_id: null, picked_up_at: T2 }], [
        { id: 'i1', locked: true, unlocked_at: null },
      ])
    ).toBe(1)
  })

  it('같은 개체를 드랍·픽업 왕복해도 1이다', () => {
    const pickups = [
      { inventory_item_id: 'i1', dropper_user_id: OTHER, picked_up_at: T1 },
      { inventory_item_id: 'i1', dropper_user_id: OTHER, picked_up_at: T2 },
      { inventory_item_id: 'i1', dropper_user_id: ME, picked_up_at: T3 }, // 내가 놓은 것을 내가 다시 줍기
    ]
    expect(countLockedAtPickup(ME, pickups, [{ id: 'i1', locked: true, unlocked_at: null }])).toBe(1)
  })

  it('개체 행을 못 찾거나 픽업 시각을 읽을 수 없는 열린 개체는 세지 않는다', () => {
    expect(countLockedAtPickup(ME, [{ inventory_item_id: 'gone', dropper_user_id: OTHER, picked_up_at: T2 }], [])).toBe(0)
    expect(
      countLockedAtPickup(
        ME,
        [
          { inventory_item_id: 'i1', dropper_user_id: OTHER, picked_up_at: null },
          { inventory_item_id: 'i2', dropper_user_id: OTHER, picked_up_at: 'broken' },
        ],
        [
          { id: 'i1', locked: false, unlocked_at: T3 },
          { id: 'i2', locked: false, unlocked_at: T3 },
        ]
      )
    ).toBe(0)
  })
})

describe('countOtherTribeKinds — 내 소속과 다른 트라이브 배지의 서로 다른 종류 수', () => {
  const tribeOf = new Map<string, string | null>([
    ['mine-1', 'T-me'],
    ['a-1', 'T-a'],
    ['a-2', 'T-a'],
    ['b-1', 'T-b'],
    ['none', null],
  ])

  it('같은 종류를 여러 개 가져도 1종이고, 내 트라이브·트라이브 없는 배지는 세지 않는다', () => {
    expect(countOtherTribeKinds('T-me', ['mine-1', 'a-1', 'a-1', 'a-2', 'b-1', 'none'], tribeOf)).toBe(3)
  })

  it('내 소속이 없으면 가릴 수 없어 0이다', () => {
    expect(countOtherTribeKinds(null, ['a-1', 'b-1'], tribeOf)).toBe(0)
  })

  it('배지 행을 못 찾으면 세지 않는다', () => {
    expect(countOtherTribeKinds('T-me', ['unknown'], tribeOf)).toBe(0)
  })
})

describe('countCrossTribeCombines — 재료가 트라이브 2개 이상에 걸친 믹스 성공 수', () => {
  const tribeOf = new Map<string, string | null>([
    ['a-1', 'T-a'],
    ['a-2', 'T-a'],
    ['b-1', 'T-b'],
    ['none', null],
  ])

  it('트라이브 2개 이상이면 세고, 한 트라이브뿐이면 세지 않는다', () => {
    expect(countCrossTribeCombines([['a-1', 'b-1'], ['a-1', 'a-2'], ['a-1', 'a-2', 'b-1']], tribeOf)).toBe(2)
  })

  it('트라이브가 없는 재료와 행을 못 찾은 재료는 트라이브로 세지 않는다', () => {
    expect(countCrossTribeCombines([['a-1', 'none'], ['a-1', 'unknown']], tribeOf)).toBe(0)
  })

  it('성공 기록이 없으면 0이다', () => {
    expect(countCrossTribeCombines([], tribeOf)).toBe(0)
  })
})

describe('bestWeekJamEarned — 월~일(KST) 한 주에 모은 잼의 최댓값', () => {
  it('주(월~일) 단위로 합산해 가장 많은 주를 돌려준다', () => {
    // 2026-10-12(월)~10-18(일) 주: 100 + 200 = 300 / 2026-10-19(월) 주: 250
    expect(
      bestWeekJamEarned([
        { earned_on: '2026-10-12', amount: 100 },
        { earned_on: '2026-10-18', amount: 200 },
        { earned_on: '2026-10-19', amount: 250 },
      ])
    ).toBe(300)
  })

  it('일요일과 다음 월요일은 다른 주다', () => {
    expect(
      bestWeekJamEarned([
        { earned_on: '2026-10-18', amount: 200 }, // 일
        { earned_on: '2026-10-19', amount: 200 }, // 월
      ])
    ).toBe(200)
  })

  it('행이 없으면 0이다', () => {
    expect(bestWeekJamEarned([])).toBe(0)
  })
})

// ── DB 읽기 ───────────────────────────────────────────────────────────────

describe('countCapsuleOpens · countLockedItemOpens', () => {
  it('내 행만 센다 — 캡슐 열기 기록과 개체 이력의 unlocked만', async () => {
    db.tables = {
      capsule_opens: [{ user_id: ME }, { user_id: ME }, { user_id: OTHER }],
      inventory_item_events: [
        { user_id: ME, event_type: 'unlocked' },
        { user_id: ME, event_type: 'filled' },
        { user_id: ME, event_type: 'dropped' },
        { user_id: OTHER, event_type: 'unlocked' },
      ],
    }
    expect(await countCapsuleOpens(mockSupabase(), ME)).toBe(2)
    expect(await countLockedItemOpens(mockSupabase(), ME)).toBe(1)
  })

  it('0건이면 0이고, 조회 오류는 0으로 바꾸지 않고 던진다', async () => {
    expect(await countCapsuleOpens(mockSupabase(), ME)).toBe(0)
    db.error = { message: 'boom' }
    await expect(countCapsuleOpens(mockSupabase(), ME)).rejects.toThrow(/캡슐 열기 기록 조회 오류: boom/)
    await expect(countLockedItemOpens(mockSupabase(), ME)).rejects.toThrow(/잠긴 개체 열기 기록 조회 오류/)
  })
})

describe('countLockedItemPickups', () => {
  it('잠긴 채 주운 서로 다른 개체만 센다(자기 드랍 제외, 열린 채 받은 개체 제외)', async () => {
    db.tables = {
      poi_drops: [
        { id: 'd1', picked_up_by: ME, dropper_user_id: OTHER, inventory_item_id: 'locked-1', picked_up_at: '2026-10-12T00:00:00Z' },
        { id: 'd2', picked_up_by: ME, dropper_user_id: ME, inventory_item_id: 'locked-2', picked_up_at: '2026-10-12T00:00:00Z' },
        { id: 'd3', picked_up_by: ME, dropper_user_id: OTHER, inventory_item_id: 'open-1', picked_up_at: '2026-10-12T00:00:00Z' },
        { id: 'd4', picked_up_by: OTHER, dropper_user_id: ME, inventory_item_id: 'locked-3', picked_up_at: '2026-10-12T00:00:00Z' },
        { id: 'd5', picked_up_by: ME, dropper_user_id: OTHER, inventory_item_id: null, picked_up_at: '2026-10-12T00:00:00Z' },
      ],
      inventory_items: [
        { id: 'locked-1', locked: true, unlocked_at: null },
        { id: 'locked-2', locked: true, unlocked_at: null },
        { id: 'open-1', locked: false, unlocked_at: null },
        { id: 'locked-3', locked: true, unlocked_at: null },
      ],
    }
    expect(await countLockedItemPickups(mockSupabase(), ME)).toBe(1)
  })

  it('픽업 기록이 없으면 0이고 개체를 조회하지 않는다', async () => {
    expect(await countLockedItemPickups(mockSupabase(), ME)).toBe(0)
    expect(db.queries.some((q) => q.table === 'inventory_items')).toBe(false)
  })

  it('조회 오류는 던진다', async () => {
    db.error = { message: 'boom' }
    await expect(countLockedItemPickups(mockSupabase(), ME)).rejects.toThrow(/내가 주운 드랍 조회 오류/)
  })
})

describe('countOtherTribeItemKinds', () => {
  const seed = (myTribe: string | null) => {
    db.tables = {
      users: [{ id: ME, tribe_id: myTribe }],
      inventory: [{ id: 'inv-me', user_id: ME }],
      inventory_items: [
        { id: 'x1', inventory_id: 'inv-me', badge_id: 'b-mine', destroyed_at: null },
        { id: 'x2', inventory_id: 'inv-me', badge_id: 'b-a', destroyed_at: null },
        { id: 'x3', inventory_id: 'inv-me', badge_id: 'b-a', destroyed_at: null }, // 같은 종류
        { id: 'x4', inventory_id: 'inv-me', badge_id: 'b-b', destroyed_at: null },
        { id: 'x5', inventory_id: 'inv-me', badge_id: 'b-c', destroyed_at: '2026-10-01T00:00:00Z' }, // 소모됨
        { id: 'x6', inventory_id: null, badge_id: 'b-d', destroyed_at: null }, // 드랍 중
        { id: 'x7', inventory_id: 'inv-other', badge_id: 'b-e', destroyed_at: null }, // 남의 것
      ],
      badges: [
        { id: 'b-mine', tribe_id: 'T-me' },
        { id: 'b-a', tribe_id: 'T-a' },
        { id: 'b-b', tribe_id: 'T-b' },
        { id: 'b-c', tribe_id: 'T-c' },
        { id: 'b-d', tribe_id: 'T-d' },
        { id: 'b-e', tribe_id: 'T-e' },
      ],
    }
  }

  it('지금 가진 개체 가운데 다른 트라이브 배지의 서로 다른 종류만 센다', async () => {
    seed('T-me')
    expect(await countOtherTribeItemKinds(mockSupabase(), ME)).toBe(2)
  })

  it('내 소속이 없으면 0이고 개체를 조회하지 않는다', async () => {
    seed(null)
    expect(await countOtherTribeItemKinds(mockSupabase(), ME)).toBe(0)
    expect(db.queries.some((q) => q.table === 'inventory_items')).toBe(false)
  })

  it('인벤토리가 없으면 0이다', async () => {
    seed('T-me')
    db.tables.inventory = []
    expect(await countOtherTribeItemKinds(mockSupabase(), ME)).toBe(0)
  })
})

describe('countCrossTribeCombineSuccess', () => {
  it('내 성공 기록 중 재료가 트라이브 2개 이상에 걸친 행만 센다', async () => {
    db.tables = {
      user_combine_success_logs: [
        { id: 's1', user_id: ME, ingredient_badge_ids: ['b-a', 'b-b'] },
        { id: 's2', user_id: ME, ingredient_badge_ids: ['b-a', 'b-a2'] },
        { id: 's3', user_id: OTHER, ingredient_badge_ids: ['b-a', 'b-b'] },
      ],
      badges: [
        { id: 'b-a', tribe_id: 'T-a' },
        { id: 'b-a2', tribe_id: 'T-a' },
        { id: 'b-b', tribe_id: 'T-b' },
      ],
    }
    expect(await countCrossTribeCombineSuccess(mockSupabase(), ME)).toBe(1)
  })

  it('성공 기록이 없으면 0이고 배지를 조회하지 않는다', async () => {
    expect(await countCrossTribeCombineSuccess(mockSupabase(), ME)).toBe(0)
    expect(db.queries.some((q) => q.table === 'badges')).toBe(false)
  })

  it('id 조회는 ID_CHUNK_SIZE 단위로 나눈다', async () => {
    const ids = Array.from({ length: ID_CHUNK_SIZE + 1 }, (_, i) => `b-${i}`)
    db.tables = {
      user_combine_success_logs: [{ id: 's1', user_id: ME, ingredient_badge_ids: ids }],
      badges: ids.map((id, i) => ({ id, tribe_id: i % 2 === 0 ? 'T-a' : 'T-b' })),
    }
    expect(await countCrossTribeCombineSuccess(mockSupabase(), ME)).toBe(1)
    expect(db.queries.filter((q) => q.table === 'badges')).toHaveLength(2)
  })
})

describe('readJamTotalEarned · readJamWeeklyEarned · readChapterReached', () => {
  it('지금까지 모은 잼은 지갑의 total_earned이고(가진 양이 아니다), 지갑이 없으면 0이다', async () => {
    db.tables = { jam_wallets: [{ user_id: ME, balance: 10, total_earned: 1500 }] }
    expect(await readJamTotalEarned(mockSupabase(), ME)).toBe(1500)
    expect(await readJamTotalEarned(mockSupabase(), OTHER)).toBe(0)
  })

  it('한 주에 모은 잼은 내 날짜별 모은 양을 월~일 주로 합산한 최댓값이다', async () => {
    db.tables = {
      jam_daily_earned: [
        { user_id: ME, earned_on: '2026-10-12', amount: 120 },
        { user_id: ME, earned_on: '2026-10-14', amount: 180 },
        { user_id: ME, earned_on: '2026-10-19', amount: 100 },
        { user_id: OTHER, earned_on: '2026-10-12', amount: 9999 },
      ],
    }
    expect(await readJamWeeklyEarned(mockSupabase(), ME)).toBe(300)
    expect(await readJamWeeklyEarned(mockSupabase(), 'nobody')).toBe(0)
  })

  it('도달한 챕터는 user_chapters.chapter_no이고, 행이 없거나 퀘스트 전(NULL)이면 0이다', async () => {
    db.tables = {
      user_chapters: [
        { user_id: ME, chapter_no: 3 },
        { user_id: OTHER, chapter_no: null },
      ],
    }
    expect(await readChapterReached(mockSupabase(), ME)).toBe(3)
    expect(await readChapterReached(mockSupabase(), OTHER)).toBe(0)
    expect(await readChapterReached(mockSupabase(), 'nobody')).toBe(0)
  })

  it('조회 오류는 0으로 바꾸지 않고 던진다', async () => {
    db.error = { message: 'boom' }
    await expect(readJamTotalEarned(mockSupabase(), ME)).rejects.toThrow(/잼 지갑 조회 오류/)
    await expect(readJamWeeklyEarned(mockSupabase(), ME)).rejects.toThrow(/날짜별 모은 잼 조회 오류/)
    await expect(readChapterReached(mockSupabase(), ME)).rejects.toThrow(/챕터 조회 오류/)
  })
})
