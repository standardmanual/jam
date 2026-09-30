/**
 * JAM! 행동 지표 배지(드랍·픽업 4종) 판정·발급 테스트 — `evaluateJamActionBadges`를 끝까지 태운다
 * (티켓 20261001_0632, 상위 20260930_1456 ②)
 *
 * 검증 대상:
 *  ① 4지표 임계 발급/미발급(`triggered_by` = `jam_action:<키>`), 다른 유저·자기 드랍 분리
 *  ② 번갈아 놓기(A·B가 같은 개체를 왕복)로 임계 2 배지를 받지 못한다 — 행 수가 아니라 서로 다른 개체·유저로 센다
 *  ③ 호출 규칙: 요청한 지표만 조회, 후보가 없으면 조회 0회, 조회 오류·페이지 상한 초과는 그 지표만 건너뜀(fail-closed)
 *  ④ 등급형·레벨형 발급 정책
 *
 * 테이블 모킹은 메모리 테이블에 `eq`·`in`·`not`·`order`·`range`를 실제로 적용한다. ①의 테스트 파일
 * (`jam-action-badges.test.ts`)은 `.not()`·`.order()`·`.range()`를 지원하지 않아 이 파일에 따로 둔다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-drop-badges.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeRow } from '@/types/database'

function makeBadge(overrides: Partial<BadgeRow>): BadgeRow {
  return {
    id: `badge-${Math.random()}`,
    name: 'Test Badge',
    description: '',
    type: 'activity',
    rarity: 'common',
    level: null,
    family_key: null,
    sort_order: 0,
    image_url: null,
    condition_json: {},
    activity_types: [],
    patch_available: false,
    patch_price_krw: null,
    tribe_id: null,
    item_book_id: null,
    category: null,
    admin_category: null,
    show_on_map: true,
    drop_weight: 0,
    drop_excluded: false,
    drop_condition_json: null,
    valid_from: null,
    valid_until: null,
    point_reward: 0,
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
    background_color: null,
    background_shader_id: null,
    background_image_url: null,
    background_video_url: null,
    background_animation: null,
    image_gen_params: null,
    image_source: null,
    ...overrides,
  }
}

// ── 모킹 ─────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  /** 테이블별 조회 오류 주입 — 함수면 그 테이블의 n번째(1부터) 조회에서만 오류를 돌려줄 수 있다 */
  errors: {} as Record<string, { message: string } | ((nth: number) => { message: string } | undefined)>,
  /** 조회 실행 기록 — 테이블 이름과 그 조회가 건 `eq` 조건 */
  queried: [] as { table: string; eqCols: string[] }[],
  inserts: [] as { user_id: string; badge_id: string; triggered_by: string }[],
}))

const getUserBanLevelMock = vi.hoisted(() =>
  vi.fn<(userId: string) => Promise<'none' | 'soft' | 'hard'>>(async () => 'none')
)

function resetState() {
  state.tables = { badges: [], user_activity_badges: [], poi_drops: [] }
  state.errors = {}
  state.queried = []
  state.inserts = []
  getUserBanLevelMock.mockReset()
  getUserBanLevelMock.mockResolvedValue('none')
}

function mockSupabase(): SupabaseClient {
  const from = (table: string) => {
    const eqs: [string, unknown][] = []
    const ins: [string, unknown[]][] = []
    const notNulls: string[] = []
    let ordered = false
    let range: [number, number] | null = null
    let cols = '*'
    const builder: Record<string, unknown> = {}
    builder.select = (c: string) => {
      cols = c
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
    builder.not = (col: string, op: string, val: unknown) => {
      if (op === 'is' && val === null) notNulls.push(col)
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
    builder.is = () => builder
    builder.or = () => builder
    builder.insert = (payload: { user_id: string; badge_id: string; triggered_by: string }) => {
      if (table !== 'user_activity_badges') return Promise.resolve({ data: null, error: null })
      const owned = state.tables.user_activity_badges
      // UNIQUE(user_id, badge_id) — 이미 보유한 배지의 INSERT는 23505로 떨어진다
      if (owned.some((r) => r.user_id === payload.user_id && r.badge_id === payload.badge_id)) {
        return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
      }
      owned.push({ user_id: payload.user_id, badge_id: payload.badge_id })
      state.inserts.push(payload)
      return Promise.resolve({ data: null, error: null })
    }
    builder.then = (resolve: (v: unknown) => void) => {
      state.queried.push({ table, eqCols: eqs.map(([c]) => c) })
      const injected = state.errors[table]
      const nth = state.queried.filter((q) => q.table === table).length
      const error = typeof injected === 'function' ? injected(nth) : injected
      if (error) return Promise.resolve({ data: null, count: null, error }).then(resolve)
      let rows = (state.tables[table] ?? []).filter(
        (r) =>
          eqs.every(([c, v]) => r[c] === v) &&
          ins.every(([c, v]) => v.includes(r[c])) &&
          notNulls.every((c) => r[c] !== null && r[c] !== undefined)
      )
      if (ordered) rows = [...rows].sort((x, y) => (String(x.id) < String(y.id) ? -1 : 1))
      if (range) rows = rows.slice(range[0], range[1] + 1)
      if (table === 'poi_drops') {
        const wanted = cols.split(',').map((c) => c.trim())
        rows = rows.map((r) => Object.fromEntries(wanted.map((c) => [c, r[c]])))
      }
      return Promise.resolve({ data: rows, error: null }).then(resolve)
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => mockSupabase() }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/points', () => ({ awardPoints: vi.fn(async () => null) }))
vi.mock('@/lib/abusing/shadow-ban', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/shadow-ban')>()
  return { ...actual, getUserBanLevel: (userId: string) => getUserBanLevelMock(userId) }
})
vi.mock('@/lib/abusing/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/abusing/policy')>()
  return { ...actual, getAbusingPolicy: vi.fn(async () => actual.DEFAULT_POLICY) }
})

import { evaluateJamActionBadges } from '../jamActionBadges'

const A = 'user-a'
const B = 'user-b'
const C = 'user-c'
const D = 'user-d'

let nextDropId = 0
function addDrop(dropper: string | null, pickedUpBy: string | null, item: string | null) {
  state.tables.poi_drops.push({
    id: String(nextDropId++).padStart(7, '0'),
    dropper_user_id: dropper,
    picked_up_by: pickedUpBy,
    inventory_item_id: item,
  })
}
function setBadges(...badges: BadgeRow[]) {
  state.tables.badges = badges as unknown as Row[]
}
const dropQueries = () => state.queried.filter((q) => q.table === 'poi_drops')
const idsOf = (earned: { id: string }[]) => earned.map((b) => b.id)

beforeEach(() => {
  resetState()
  vi.clearAllMocks()
  getUserBanLevelMock.mockResolvedValue('none')
  nextDropId = 0
})

// ═══════════════════════════════════════════════════════════════════════
// ① 4지표 임계
// ═══════════════════════════════════════════════════════════════════════

describe('드랍한 아이템 수(drop_item_count)', () => {
  it('서로 다른 개체가 임계에 못 미치면 발급하지 않고, 채우면 발급한다', async () => {
    setBadges(makeBadge({ id: 'drop-3', condition_json: { drop_item_count: 3 } }))
    addDrop(A, null, 'X')
    addDrop(A, null, 'Y')
    expect(await evaluateJamActionBadges(A, ['drop_item_count'])).toEqual([])
    expect(state.inserts).toEqual([])

    addDrop(A, B, 'Z')
    expect(await evaluateJamActionBadges(A, ['drop_item_count'])).toEqual([{ id: 'drop-3', name: 'Test Badge' }])
    expect(state.inserts).toEqual([{ user_id: A, badge_id: 'drop-3', triggered_by: 'jam_action:drop_item_count' }])
  })

  it('같은 개체를 여러 번 놓아도 1개로 센다', async () => {
    setBadges(makeBadge({ id: 'drop-2', condition_json: { drop_item_count: 2 } }))
    for (let i = 0; i < 5; i++) addDrop(A, B, 'X')
    expect(await evaluateJamActionBadges(A, ['drop_item_count'])).toEqual([])
  })

  it('다른 유저가 놓은 드랍은 세지 않는다', async () => {
    setBadges(makeBadge({ id: 'drop-2', condition_json: { drop_item_count: 2 } }))
    addDrop(A, null, 'X')
    addDrop(B, null, 'Y')
    addDrop(B, null, 'Z')
    expect(await evaluateJamActionBadges(A, ['drop_item_count'])).toEqual([])
  })

  it('옛 행(inventory_item_id null)은 세지 않는다', async () => {
    setBadges(makeBadge({ id: 'drop-2', condition_json: { drop_item_count: 2 } }))
    addDrop(A, null, 'X')
    addDrop(A, null, null)
    addDrop(A, null, null)
    expect(await evaluateJamActionBadges(A, ['drop_item_count'])).toEqual([])
  })
})

describe('픽업한 아이템 수(pickup_item_count)', () => {
  it('서로 다른 개체를 임계만큼 주우면 발급한다 — 시스템 드랍·탈퇴한 놓은 사람의 드랍도 센다', async () => {
    setBadges(makeBadge({ id: 'pickup-3', condition_json: { pickup_item_count: 3 } }))
    addDrop(B, A, 'X')
    addDrop(null, A, 'Y') // 시스템 드랍(또는 탈퇴한 놓은 사람)
    expect(await evaluateJamActionBadges(A, ['pickup_item_count'])).toEqual([])

    addDrop(C, A, 'Z')
    expect(idsOf(await evaluateJamActionBadges(A, ['pickup_item_count']))).toEqual(['pickup-3'])
    expect(state.inserts).toEqual([{ user_id: A, badge_id: 'pickup-3', triggered_by: 'jam_action:pickup_item_count' }])
  })

  it('자기 드랍 14건만 주운 유저는 임계 1 배지를 받지 못한다', async () => {
    setBadges(makeBadge({ id: 'pickup-1', condition_json: { pickup_item_count: 1 } }))
    for (let i = 0; i < 14; i++) addDrop(A, A, `own-${i}`)
    expect(await evaluateJamActionBadges(A, ['pickup_item_count'])).toEqual([])
    expect(state.inserts).toEqual([])
  })
})

describe('픽업한 드랍의 드랍 유저 수(pickup_from_user_count)', () => {
  it('서로 다른 유저 3명에게서 주우면 발급하고, 한 명에게서 여러 개를 주운 것은 1명이다', async () => {
    setBadges(makeBadge({ id: 'from-3', condition_json: { pickup_from_user_count: 3 } }))
    addDrop(B, A, 'X1')
    addDrop(B, A, 'X2')
    addDrop(B, A, 'X3')
    addDrop(C, A, 'Y')
    expect(await evaluateJamActionBadges(A, ['pickup_from_user_count'])).toEqual([])

    addDrop(D, A, 'Z')
    expect(idsOf(await evaluateJamActionBadges(A, ['pickup_from_user_count']))).toEqual(['from-3'])
    expect(state.inserts[0].triggered_by).toBe('jam_action:pickup_from_user_count')
  })

  it('자기 드랍·시스템 드랍·탈퇴한 놓은 사람은 함께 줍기에 세지 않는다', async () => {
    setBadges(makeBadge({ id: 'from-1', condition_json: { pickup_from_user_count: 1 } }))
    addDrop(A, A, 'own')
    addDrop(null, A, 'system')
    expect(await evaluateJamActionBadges(A, ['pickup_from_user_count'])).toEqual([])
  })
})

describe('내 드랍을 픽업한 유저 수(picked_up_by_user_count)', () => {
  it('서로 다른 유저 3명이 주우면 발급하고, 한 명이 여러 개를 주운 것은 1명이다', async () => {
    setBadges(makeBadge({ id: 'by-3', condition_json: { picked_up_by_user_count: 3 } }))
    addDrop(A, B, 'X1')
    addDrop(A, B, 'X2')
    addDrop(A, B, 'X3')
    addDrop(A, C, 'Y')
    expect(await evaluateJamActionBadges(A, ['picked_up_by_user_count'])).toEqual([])

    addDrop(A, D, 'Z')
    expect(idsOf(await evaluateJamActionBadges(A, ['picked_up_by_user_count']))).toEqual(['by-3'])
    expect(state.inserts).toEqual([{ user_id: A, badge_id: 'by-3', triggered_by: 'jam_action:picked_up_by_user_count' }])
  })

  it('내가 다시 주운 것·줍는 사람이 탈퇴한 행·아직 줍지 않은 행은 세지 않는다', async () => {
    setBadges(makeBadge({ id: 'by-1', condition_json: { picked_up_by_user_count: 1 } }))
    addDrop(A, A, 'own')
    addDrop(A, null, 'withdrawn-or-not-yet')
    expect(await evaluateJamActionBadges(A, ['picked_up_by_user_count'])).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ② 번갈아 놓기
// ═══════════════════════════════════════════════════════════════════════

describe('번갈아 놓기(왕복)는 지표를 부풀리지 못한다', () => {
  function alternate(times: number) {
    for (let i = 0; i < times; i++) {
      addDrop(A, B, 'X') // A가 놓고 B가 줍는다
      addDrop(B, A, 'X') // B가 놓고 A가 줍는다
    }
  }

  it('A·B가 개체 X를 10번 왕복해 행이 20개여도 임계 2 배지 네 종을 둘 다 받지 못한다', async () => {
    setBadges(
      makeBadge({ id: 'drop-2', condition_json: { drop_item_count: 2 } }),
      makeBadge({ id: 'pickup-2', condition_json: { pickup_item_count: 2 } }),
      makeBadge({ id: 'from-2', condition_json: { pickup_from_user_count: 2 } }),
      makeBadge({ id: 'by-2', condition_json: { picked_up_by_user_count: 2 } })
    )
    alternate(10)
    expect(state.tables.poi_drops).toHaveLength(20)

    const all = ['drop_item_count', 'pickup_item_count', 'pickup_from_user_count', 'picked_up_by_user_count'] as const
    expect(await evaluateJamActionBadges(A, all)).toEqual([])
    expect(await evaluateJamActionBadges(B, all)).toEqual([])
    expect(state.inserts).toEqual([])
  })

  it('같은 왕복에서 임계 1 배지는 둘 다 네 종을 받는다 — 네 지표가 모두 1이다', async () => {
    setBadges(
      makeBadge({ id: 'drop-1', name: '드랍', condition_json: { drop_item_count: 1 } }),
      makeBadge({ id: 'pickup-1', name: '픽업', condition_json: { pickup_item_count: 1 } }),
      makeBadge({ id: 'from-1', name: '함께', condition_json: { pickup_from_user_count: 1 } }),
      makeBadge({ id: 'by-1', name: '나눔', condition_json: { picked_up_by_user_count: 1 } })
    )
    alternate(10)

    const all = ['drop_item_count', 'pickup_item_count', 'pickup_from_user_count', 'picked_up_by_user_count'] as const
    expect(idsOf(await evaluateJamActionBadges(A, all)).sort()).toEqual(['by-1', 'drop-1', 'from-1', 'pickup-1'])
    expect(idsOf(await evaluateJamActionBadges(B, all)).sort()).toEqual(['by-1', 'drop-1', 'from-1', 'pickup-1'])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ③ 호출 규칙
// ═══════════════════════════════════════════════════════════════════════

describe('호출 규칙', () => {
  it('요청한 지표만 조회한다 — 드랍 지표는 놓은 사람 기준 조회 한 번뿐이다', async () => {
    setBadges(
      makeBadge({ id: 'drop-1', condition_json: { drop_item_count: 1 } }),
      makeBadge({ id: 'pickup-1', condition_json: { pickup_item_count: 1 } })
    )
    addDrop(A, B, 'X')
    await evaluateJamActionBadges(A, ['drop_item_count'])
    expect(dropQueries()).toEqual([{ table: 'poi_drops', eqCols: ['dropper_user_id'] }])
  })

  it('픽업 지표는 주운 사람 기준으로만 조회한다', async () => {
    setBadges(makeBadge({ id: 'pickup-1', condition_json: { pickup_item_count: 1 } }))
    addDrop(B, A, 'X')
    await evaluateJamActionBadges(A, ['pickup_item_count'])
    expect(dropQueries()).toEqual([{ table: 'poi_drops', eqCols: ['picked_up_by'] }])
  })

  it('요청한 지표를 조건으로 가진 후보가 없으면 poi_drops를 조회하지 않는다', async () => {
    setBadges(makeBadge({ id: 'follower', condition_json: { follower_count: 10 } }))
    addDrop(A, B, 'X')
    expect(
      await evaluateJamActionBadges(A, ['drop_item_count', 'pickup_item_count', 'pickup_from_user_count', 'picked_up_by_user_count'])
    ).toEqual([])
    expect(dropQueries()).toEqual([])
  })

  it('한 지표의 조회가 실패해도 그 지표만 건너뛰고 나머지는 발급한다 (fail-closed)', async () => {
    setBadges(
      makeBadge({ id: 'drop-1', name: '드랍', condition_json: { drop_item_count: 1 } }),
      makeBadge({ id: 'pickup-1', name: '픽업', condition_json: { pickup_item_count: 1 } })
    )
    addDrop(A, null, 'X')
    addDrop(B, A, 'Y')
    // 요청 순서: drop_item_count(poi_drops 1번째 조회) → pickup_item_count(2번째 조회)
    state.errors.poi_drops = (nth) => (nth === 2 ? { message: 'DB 장애' } : undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const earned = await evaluateJamActionBadges(A, ['drop_item_count', 'pickup_item_count'])

    expect(idsOf(earned)).toEqual(['drop-1'])
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('30페이지를 넘는 유저는 그 지표만 건너뛰고 다른 지표는 발급한다', async () => {
    setBadges(
      makeBadge({ id: 'drop-1', name: '드랍', condition_json: { drop_item_count: 1 } }),
      makeBadge({ id: 'pickup-1', name: '픽업', condition_json: { pickup_item_count: 1 } })
    )
    // 놓은 드랍 행이 30,001개(31번째 페이지에 행이 있다) → 드랍 지표는 세지 못한다
    for (let i = 0; i < 30001; i++) addDrop(A, null, `item-${i}`)
    addDrop(B, A, 'picked')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const earned = await evaluateJamActionBadges(A, ['drop_item_count', 'pickup_item_count'])

    expect(idsOf(earned)).toEqual(['pickup-1'])
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('요청이 비어 있으면 배지 조회도 하지 않는다', async () => {
    expect(await evaluateJamActionBadges(A, [])).toEqual([])
    expect(state.queried).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// ④ 발급 정책 — 등급형·레벨형
// ═══════════════════════════════════════════════════════════════════════

describe('발급 정책은 usageBadges의 것을 그대로 쓴다', () => {
  it('등급형: 여러 등급을 한 번에 넘겨도 최상위 tier 1개만 발급된다', async () => {
    setBadges(
      makeBadge({ id: 'g-common', name: '나눔가', rarity: 'common', condition_json: { picked_up_by_user_count: 1 } }),
      makeBadge({ id: 'g-rare', name: '나눔가', rarity: 'rare', condition_json: { picked_up_by_user_count: 3 } }),
      makeBadge({ id: 'g-epic', name: '나눔가', rarity: 'epic', condition_json: { picked_up_by_user_count: 30 } })
    )
    addDrop(A, B, 'X1')
    addDrop(A, C, 'X2')
    addDrop(A, D, 'X3')
    expect(idsOf(await evaluateJamActionBadges(A, ['picked_up_by_user_count']))).toEqual(['g-rare'])
  })

  it('레벨형: 보유 레벨 + 1부터 조건을 채우는 동안 연속 발급된다', async () => {
    const fam = 'pickup-family'
    setBadges(
      makeBadge({ id: 'lv1', rarity: null, level: 1, family_key: fam, condition_json: { pickup_item_count: 1 } }),
      makeBadge({ id: 'lv2', rarity: null, level: 2, family_key: fam, condition_json: { pickup_item_count: 3 } }),
      makeBadge({ id: 'lv3', rarity: null, level: 3, family_key: fam, condition_json: { pickup_item_count: 10 } })
    )
    addDrop(B, A, 'X1')
    addDrop(B, A, 'X2')
    addDrop(C, A, 'X3')
    addDrop(C, A, 'X4')
    expect(idsOf(await evaluateJamActionBadges(A, ['pickup_item_count']))).toEqual(['lv1', 'lv2'])
  })

  it('이미 보유한 배지는 다시 발급하지 않는다 — 멱등', async () => {
    setBadges(makeBadge({ id: 'drop-1', condition_json: { drop_item_count: 1 } }))
    addDrop(A, null, 'X')
    expect(idsOf(await evaluateJamActionBadges(A, ['drop_item_count']))).toEqual(['drop-1'])
    expect(await evaluateJamActionBadges(A, ['drop_item_count'])).toEqual([])
    expect(state.inserts).toHaveLength(1)
  })
})
