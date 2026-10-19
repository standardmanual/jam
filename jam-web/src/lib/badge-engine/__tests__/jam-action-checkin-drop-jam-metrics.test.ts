/**
 * JAM! 행동 지표 — 체크인·드랍·잼 새 지표 6종 값 계산 테스트 (티켓 20261019_0542 2회, 마이그레이션 247)
 *
 * 검증 대상:
 *  ① 체크인 `new_checkin_badge_count`·`checkin_season_year_count`: 같은 배지를 여러 번 받아도 1종류, 같은 배지가 다른 장소에서 나와도 1종류,
 *     배지별 «처음 받은 줄»로만 계절을 센다(다시 받은 줄은 다른 계절을 채우지 못한다), 처음은 날짜가 가장 이른 줄(저장 순서 무관),
 *     KST 날짜 경계(UTC 15시 = KST 자정), 연도 경계(2025년 12월과 2026년 1월은 다른 해), 계절 경계(2·3월, 5·6월, 8·9월, 11·12월),
 *     1·2월과 12월은 같은 해의 겨울
 *  ② 드랍 `dropped_item_picked_up_count`: 왕복 드랍·픽업은 1아이템, 자기 드랍을 자기가 주운 것은 제외, 미픽업·탈퇴한 줍는 사람은 제외,
 *     여러 명이 주워도 1, 같은 아이템을 두 번 놓아도 1, `inventory_item_id`가 없는 옛 행은 조회에서 제외
 *  ③ 잼 `jam_week_count`·`jam_week_streak`: 주 경계(월요일 시작, 일요일과 월요일은 다른 주), 기준값 경계(`jam_week_min_earned` 정확히 일치는 채운 주),
 *     같은 주 여러 날 합산, 연말연초를 넘는 연속, 빈 주가 끼면 끊김, 보조 키 기본값 1
 *  ④ 조회: 다른 유저 행 분리, 조회 오류는 던진다
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge-engine/__tests__/jam-action-checkin-drop-jam-metrics.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  countCheckinFullSeasonYears,
  countCheckinSeasonYearCount,
  countNewCheckinBadgeCount,
  countNewCheckinBadges,
  firstEarnDayByBadge,
  type CheckinEarnRow,
} from '../jamActionCheckinMetrics'
import {
  countDroppedItemPickedUpCount,
  countDroppedItemsPickedUpByOthers,
  type MyDropRow,
} from '../jamActionDropMetrics'
import {
  countJamWeeks,
  DEFAULT_JAM_WEEK_MIN_EARNED,
  fetchDailyEarnedRows,
  jamWeekStreak,
  type DailyEarnedRow,
} from '../jamActionJamMetrics'

const ME = 'user-me'
const OTHER = 'user-other'

// ── 메모리 테이블 모킹 — eq·not·order·range를 실제로 적용하고 select한 열만 돌려준다 ──────────
const db = {
  tables: {} as Record<string, Record<string, unknown>[]>,
  error: null as { message: string } | null,
}

function mockSupabase(): SupabaseClient {
  const from = (table: string) => {
    let cols = ''
    const eqs: [string, unknown][] = []
    const nots: [string, unknown][] = []
    let ordered: string | null = null
    let range: [number, number] | null = null
    const builder: Record<string, unknown> = {}
    builder.select = (c: string) => {
      cols = c
      return builder
    }
    builder.eq = (c: string, v: unknown) => {
      eqs.push([c, v])
      return builder
    }
    builder.not = (c: string, op: string, v: unknown) => {
      if (op !== 'is' || v !== null) throw new Error(`예상하지 못한 not 연산: ${op}`)
      nots.push([c, v])
      return builder
    }
    builder.order = (c: string) => {
      ordered = c
      return builder
    }
    builder.range = (from: number, to: number) => {
      range = [from, to]
      return builder
    }
    builder.then = (resolve: (v: unknown) => void) => {
      if (db.error) return Promise.resolve({ data: null, error: db.error }).then(resolve)
      let rows = (db.tables[table] ?? []).filter(
        (r) => eqs.every(([c, v]) => r[c] === v) && nots.every(([c]) => r[c] !== null && r[c] !== undefined)
      )
      if (ordered) {
        const key = ordered
        rows = [...rows].sort((x, y) => (String(x[key]) < String(y[key]) ? -1 : 1))
      }
      if (range) rows = rows.slice(range[0], range[1] + 1)
      const wanted = cols.split(',').map((c) => c.trim())
      const projected = rows.map((r) => Object.fromEntries(wanted.map((c) => [c, r[c]])))
      return Promise.resolve({ data: projected, error: null }).then(resolve)
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

beforeEach(() => {
  db.tables = {}
  db.error = null
})

// ── ① 체크인 ─────────────────────────────────────────────────────────────

/** 방문 기록 한 줄 — 활동 시각(ISO, UTC)을 준다 */
function earn(badgeId: string, activityIso: string | null, earnedAt: string | null = null): CheckinEarnRow {
  return { badge_id: badgeId, triggered_by_activity_date: activityIso, earned_at: earnedAt }
}

describe('countNewCheckinBadges — 새로 받은 체크인 배지의 서로 다른 종류 수', () => {
  it('줄이 없으면 0', () => {
    expect(countNewCheckinBadges([])).toBe(0)
  })

  it('같은 배지를 여러 번 받아도 1종류다', () => {
    expect(
      countNewCheckinBadges([
        earn('b1', '2026-03-01T01:00:00Z'),
        earn('b1', '2026-03-08T01:00:00Z'),
        earn('b1', '2026-04-08T01:00:00Z'),
      ])
    ).toBe(1)
  })

  it('서로 다른 배지는 각각 센다', () => {
    expect(countNewCheckinBadges([earn('b1', '2026-03-01T01:00:00Z'), earn('b2', '2026-03-01T02:00:00Z'), earn('b1', '2026-03-02T01:00:00Z')])).toBe(2)
  })

  it('날짜를 읽을 수 없는 줄도 배지 종류로 센다', () => {
    expect(countNewCheckinBadges([earn('b1', null, null), earn('b2', 'not-a-date', null)])).toBe(2)
  })
})

describe('firstEarnDayByBadge — 배지별 처음 받은 날(KST)', () => {
  it('저장 순서와 상관없이 날짜가 가장 이른 줄이 처음이다', () => {
    const rows = [earn('b1', '2026-06-10T01:00:00Z'), earn('b1', '2026-03-10T01:00:00Z'), earn('b1', '2026-09-10T01:00:00Z')]
    expect(firstEarnDayByBadge(rows).get('b1')).toBe('2026-03-10')
  })

  it('UTC 15시는 KST 다음 날 0시다 — 날짜 경계는 한국 시간이다', () => {
    expect(firstEarnDayByBadge([earn('b1', '2026-02-28T14:59:59Z')]).get('b1')).toBe('2026-02-28')
    expect(firstEarnDayByBadge([earn('b1', '2026-02-28T15:00:00Z')]).get('b1')).toBe('2026-03-01')
  })

  it('활동 시각이 없으면 기록 시각(earned_at)을 쓴다', () => {
    expect(firstEarnDayByBadge([earn('b1', null, '2026-07-04T00:00:00Z')]).get('b1')).toBe('2026-07-04')
  })

  it('시각을 읽을 수 있는 줄이 하나도 없는 배지는 뺀다', () => {
    expect(firstEarnDayByBadge([earn('b1', null, null)]).has('b1')).toBe(false)
  })
})

describe('countCheckinFullSeasonYears — 네 계절 모두 새 체크인 배지를 받은 해의 수', () => {
  /** 한 해의 네 계절에 각각 서로 다른 새 배지를 한 번씩 받는다 (봄 4/10·여름 7/10·가을 10/10·겨울 다음 해가 아니라 같은 해 1/10) */
  function fullYear(year: number, prefix: string): CheckinEarnRow[] {
    return [
      earn(`${prefix}-spring`, `${year}-04-10T01:00:00Z`),
      earn(`${prefix}-summer`, `${year}-07-10T01:00:00Z`),
      earn(`${prefix}-fall`, `${year}-10-10T01:00:00Z`),
      earn(`${prefix}-winter`, `${year}-01-10T01:00:00Z`),
    ]
  }

  it('줄이 없으면 0', () => {
    expect(countCheckinFullSeasonYears([])).toBe(0)
  })

  it('한 해의 네 계절을 모두 채우면 1이다', () => {
    expect(countCheckinFullSeasonYears(fullYear(2026, 'a'))).toBe(1)
  })

  it('세 계절만 채우면 0이다', () => {
    expect(countCheckinFullSeasonYears(fullYear(2026, 'a').slice(0, 3))).toBe(0)
  })

  it('해마다 따로 센다 — 두 해를 채우면 2, 한 해만 채우면 1', () => {
    expect(countCheckinFullSeasonYears([...fullYear(2025, 'a'), ...fullYear(2026, 'b')])).toBe(2)
    expect(countCheckinFullSeasonYears([...fullYear(2025, 'a'), ...fullYear(2026, 'b').slice(0, 2)])).toBe(1)
  })

  it('같은 배지를 계절마다 다시 받아도 처음 받은 계절만 채운다 — 계절을 채우려면 그 계절에 새 배지를 받아야 한다', () => {
    const rows = [
      earn('same', '2026-04-10T01:00:00Z'), // 처음(봄)
      earn('same', '2026-07-10T01:00:00Z'),
      earn('same', '2026-10-10T01:00:00Z'),
      earn('same', '2026-01-10T01:00:00Z'), // 날짜가 더 이른 줄이 처음이다 → 겨울이 처음
    ]
    // 처음은 1/10(겨울) 하나뿐이라 한 계절이다
    expect(countCheckinFullSeasonYears(rows)).toBe(0)
  })

  it('연도 경계 — 2025년 12월의 겨울과 2026년 1월의 겨울은 서로 다른 해다', () => {
    const rows = [
      earn('w-dec', '2025-12-10T01:00:00Z'), // 2025 겨울
      earn('spring', '2026-04-10T01:00:00Z'),
      earn('summer', '2026-07-10T01:00:00Z'),
      earn('fall', '2026-10-10T01:00:00Z'),
    ]
    expect(countCheckinFullSeasonYears(rows)).toBe(0) // 2026년에는 겨울이 없다
    expect(countCheckinFullSeasonYears([...rows, earn('w-jan', '2026-01-10T01:00:00Z')])).toBe(1)
  })

  it('연도 경계는 KST다 — 12월 31일 UTC 15시는 KST 1월 1일이라 다음 해의 겨울이다', () => {
    const rows = [
      earn('w', '2025-12-31T15:00:00Z'), // KST 2026-01-01 → 2026 겨울
      earn('spring', '2026-04-10T01:00:00Z'),
      earn('summer', '2026-07-10T01:00:00Z'),
      earn('fall', '2026-10-10T01:00:00Z'),
    ]
    expect(countCheckinFullSeasonYears(rows)).toBe(1)
    // 한 시간 이르면 KST 2025-12-31이라 2025 겨울이다
    rows[0] = earn('w', '2025-12-31T14:59:59Z')
    expect(countCheckinFullSeasonYears(rows)).toBe(0)
  })

  it('계절 경계 — 2/28·5/31·8/31·11/30은 이전 계절, 3/1·6/1·9/1·12/1은 다음 계절이다', () => {
    // 각 경계의 앞 날짜만으로는 한 계절씩만 채워진다: 겨울(2/28)·봄(5/31)·여름(8/31)·가을(11/30) → 네 계절
    const before = [
      earn('a', '2026-02-28T01:00:00Z'),
      earn('b', '2026-05-31T01:00:00Z'),
      earn('c', '2026-08-31T01:00:00Z'),
      earn('d', '2026-11-30T01:00:00Z'),
    ]
    expect(countCheckinFullSeasonYears(before)).toBe(1)
    // 경계 다음 날짜로 모두 옮기면 봄(3/1)·여름(6/1)·가을(9/1)·겨울(12/1) → 같은 해 네 계절
    const after = [
      earn('a', '2026-03-01T01:00:00Z'),
      earn('b', '2026-06-01T01:00:00Z'),
      earn('c', '2026-09-01T01:00:00Z'),
      earn('d', '2026-12-01T01:00:00Z'),
    ]
    expect(countCheckinFullSeasonYears(after)).toBe(1)
    // 경계 앞뒤를 하나씩 섞어 한 계절이 비면 센 해가 없다: 2/28(겨울)과 3/1(봄)은 다른 계절, 5/31과 6/1도 다른 계절
    expect(countCheckinFullSeasonYears([earn('a', '2026-02-28T01:00:00Z'), earn('b', '2026-03-01T01:00:00Z')])).toBe(0)
    expect(
      countCheckinFullSeasonYears([earn('a', '2026-03-01T01:00:00Z'), earn('b', '2026-05-31T01:00:00Z'), earn('c', '2026-09-01T01:00:00Z'), earn('d', '2026-12-01T01:00:00Z')])
    ).toBe(0) // 봄 둘 + 가을 + 겨울 — 여름이 비었다
  })

  it('1월·2월과 12월은 모두 겨울이다 — 한 해 안에서 1월과 12월은 같은 계절이라 둘을 합쳐도 겨울 하나다', () => {
    const rows = [
      earn('jan', '2026-01-10T01:00:00Z'),
      earn('dec', '2026-12-10T01:00:00Z'),
      earn('spring', '2026-04-10T01:00:00Z'),
      earn('summer', '2026-07-10T01:00:00Z'),
    ]
    expect(countCheckinFullSeasonYears(rows)).toBe(0) // 가을이 비었다
    expect(countCheckinFullSeasonYears([...rows, earn('fall', '2026-10-10T01:00:00Z')])).toBe(1)
  })
})

describe('체크인 조회 — countNewCheckinBadgeCount · countCheckinSeasonYearCount', () => {
  function seed() {
    db.tables.user_checkin_badge_earns = [
      { id: '1', user_id: ME, badge_id: 'b1', poi_id: 'p1', triggered_by_activity_date: '2026-04-10T01:00:00Z', earned_at: '2026-04-10T02:00:00Z' },
      { id: '2', user_id: ME, badge_id: 'b1', poi_id: 'p2', triggered_by_activity_date: '2026-07-10T01:00:00Z', earned_at: '2026-07-10T02:00:00Z' },
      { id: '3', user_id: ME, badge_id: 'b2', poi_id: 'p3', triggered_by_activity_date: '2026-07-11T01:00:00Z', earned_at: '2026-07-11T02:00:00Z' },
      { id: '4', user_id: OTHER, badge_id: 'b9', poi_id: 'p9', triggered_by_activity_date: '2026-07-11T01:00:00Z', earned_at: '2026-07-11T02:00:00Z' },
    ]
  }

  it('내 줄만 읽는다 — 같은 배지는 장소가 달라도 1종류, 다른 유저의 배지는 세지 않는다', async () => {
    seed()
    expect(await countNewCheckinBadgeCount(mockSupabase(), ME)).toBe(2)
    expect(await countNewCheckinBadgeCount(mockSupabase(), 'nobody')).toBe(0)
  })

  it('계절 지표는 같은 줄에서 처음 받은 날로 센다', async () => {
    seed()
    expect(await countCheckinSeasonYearCount(mockSupabase(), ME)).toBe(0)
    db.tables.user_checkin_badge_earns.push(
      { id: '5', user_id: ME, badge_id: 'b3', poi_id: 'p4', triggered_by_activity_date: '2026-10-10T01:00:00Z', earned_at: null },
      { id: '6', user_id: ME, badge_id: 'b4', poi_id: 'p5', triggered_by_activity_date: '2026-12-10T01:00:00Z', earned_at: null }
    )
    expect(await countCheckinSeasonYearCount(mockSupabase(), ME)).toBe(1)
  })

  it('조회 오류는 던진다(fail-closed)', async () => {
    db.error = { message: 'boom' }
    await expect(countNewCheckinBadgeCount(mockSupabase(), ME)).rejects.toThrow(/체크인 배지 방문 기록 조회 오류/)
    await expect(countCheckinSeasonYearCount(mockSupabase(), ME)).rejects.toThrow(/체크인 배지 방문 기록 조회 오류/)
  })
})

// ── ② 드랍 ───────────────────────────────────────────────────────────────

describe('countDroppedItemsPickedUpByOthers — 내가 드랍한 서로 다른 아이템 중 다른 유저가 픽업한 수', () => {
  const drop = (item: string, pickedUpBy: string | null): MyDropRow => ({ inventory_item_id: item, picked_up_by: pickedUpBy })

  it('행이 없으면 0', () => {
    expect(countDroppedItemsPickedUpByOthers(ME, [])).toBe(0)
  })

  it('다른 유저가 주운 아이템을 센다', () => {
    expect(countDroppedItemsPickedUpByOthers(ME, [drop('i1', OTHER), drop('i2', 'user-c')])).toBe(2)
  })

  it('같은 아이템이 두 유저 사이를 왕복해도 1이다 — 내가 놓은 행이 여럿이어도 같은 아이템이다', () => {
    // 내가 놓고 OTHER가 줍고, OTHER가 놓은 것을 내가 줍고, 다시 내가 놓고 OTHER가 줍는다 → 내 드랍 행은 2개, 아이템은 1개
    expect(countDroppedItemsPickedUpByOthers(ME, [drop('i1', OTHER), drop('i1', OTHER)])).toBe(1)
  })

  it('내가 놓은 것을 내가 주운 아이템은 세지 않는다(자기 드랍 제외)', () => {
    expect(countDroppedItemsPickedUpByOthers(ME, [drop('i1', ME)])).toBe(0)
  })

  it('자기가 줍고 다시 놓았다가 다른 유저가 줍은 아이템은 센다', () => {
    expect(countDroppedItemsPickedUpByOthers(ME, [drop('i1', ME), drop('i1', OTHER)])).toBe(1)
  })

  it('아직 아무도 줍지 않았거나(null) 줍은 사람이 탈퇴해 지워진 행은 세지 않는다', () => {
    expect(countDroppedItemsPickedUpByOthers(ME, [drop('i1', null)])).toBe(0)
  })

  it('한 아이템을 여러 명이 나눠 주워도 1이다', () => {
    expect(countDroppedItemsPickedUpByOthers(ME, [drop('i1', OTHER), drop('i1', 'user-c'), drop('i1', 'user-d')])).toBe(1)
  })
})

describe('countDroppedItemPickedUpCount — 조회', () => {
  it('내가 놓은 드랍 행만, inventory_item_id가 있는 행만 읽는다 — 옛 행(개체 연결 없음)은 센 값에 들지 않는다', async () => {
    db.tables.poi_drops = [
      { id: '1', dropper_user_id: ME, picked_up_by: OTHER, inventory_item_id: 'i1' },
      { id: '2', dropper_user_id: ME, picked_up_by: OTHER, inventory_item_id: 'i1' },
      { id: '3', dropper_user_id: ME, picked_up_by: OTHER, inventory_item_id: null },
      { id: '4', dropper_user_id: ME, picked_up_by: ME, inventory_item_id: 'i2' },
      { id: '5', dropper_user_id: ME, picked_up_by: null, inventory_item_id: 'i3' },
      { id: '6', dropper_user_id: OTHER, picked_up_by: ME, inventory_item_id: 'i4' }, // 내가 주운 것
      { id: '7', dropper_user_id: OTHER, picked_up_by: 'user-c', inventory_item_id: 'i5' }, // 남의 드랍
    ]
    expect(await countDroppedItemPickedUpCount(mockSupabase(), ME)).toBe(1)
  })

  it('조회 오류는 던진다(fail-closed)', async () => {
    db.error = { message: 'boom' }
    await expect(countDroppedItemPickedUpCount(mockSupabase(), ME)).rejects.toThrow(/내가 놓은 드랍 조회 오류/)
  })
})

// ── ③ 잼 주 ──────────────────────────────────────────────────────────────

const day = (earnedOn: string, amount: number): DailyEarnedRow => ({ earned_on: earnedOn, amount })

describe('countJamWeeks — 한 주에 기준 이상 모은 주의 수', () => {
  it('행이 없으면 0', () => {
    expect(countJamWeeks([], 200)).toBe(0)
  })

  it('기본 기준은 1잼이다', () => {
    expect(DEFAULT_JAM_WEEK_MIN_EARNED).toBe(1)
    expect(countJamWeeks([day('2026-10-14', 1)])).toBe(1)
    expect(countJamWeeks([day('2026-10-14', 0)])).toBe(0)
  })

  it('기준 경계 — 199는 못 채우고 정확히 200은 채운 주다', () => {
    expect(countJamWeeks([day('2026-10-14', 199)], 200)).toBe(0)
    expect(countJamWeeks([day('2026-10-14', 200)], 200)).toBe(1)
  })

  it('같은 주 여러 날을 합산한다', () => {
    expect(countJamWeeks([day('2026-10-12', 100), day('2026-10-15', 60), day('2026-10-18', 40)], 200)).toBe(1)
  })

  it('주 경계 — 일요일(10/18)과 월요일(10/19)은 다른 주다: 100 + 100이 두 주에 나뉘면 어느 주도 200이 아니다', () => {
    expect(countJamWeeks([day('2026-10-18', 100), day('2026-10-19', 100)], 200)).toBe(0)
    // 같은 월요일부터 일요일까지는 한 주다
    expect(countJamWeeks([day('2026-10-19', 100), day('2026-10-25', 100)], 200)).toBe(1)
  })

  it('채운 주를 쌓은 만큼 센다(연속하지 않아도 된다)', () => {
    expect(countJamWeeks([day('2026-10-05', 200), day('2026-10-19', 300), day('2026-11-02', 250), day('2026-11-09', 10)], 200)).toBe(3)
  })

  it('연도 경계를 넘는 주(2025-12-29~2026-01-04)는 한 주로 합산한다', () => {
    expect(countJamWeeks([day('2025-12-31', 120), day('2026-01-02', 80)], 200)).toBe(1)
  })
})

describe('jamWeekStreak — 기준 이상 모은 주가 이어진 최장 주 수', () => {
  it('행이 없으면 0', () => {
    expect(jamWeekStreak([], 200)).toBe(0)
  })

  it('바로 다음 주끼리 이어진 만큼 센다', () => {
    expect(jamWeekStreak([day('2026-10-05', 200), day('2026-10-14', 200), day('2026-10-21', 250)], 200)).toBe(3)
  })

  it('중간에 못 채운 주가 끼면 끊기고 가장 긴 구간을 돌려준다', () => {
    const rows = [
      day('2026-09-28', 200),
      day('2026-10-05', 200),
      day('2026-10-12', 199), // 못 채움
      day('2026-10-19', 200),
      day('2026-10-26', 200),
      day('2026-11-02', 200),
    ]
    expect(jamWeekStreak(rows, 200)).toBe(3)
  })

  it('잼을 전혀 못 모은 주(행이 없는 주)가 끼어도 끊긴다', () => {
    expect(jamWeekStreak([day('2026-10-05', 200), day('2026-10-19', 200)], 200)).toBe(1)
  })

  it('연도 경계를 넘어 이어진다 — 2025-12-29 주와 2026-01-05 주는 바로 다음 주다', () => {
    expect(jamWeekStreak([day('2025-12-30', 200), day('2026-01-06', 200)], 200)).toBe(2)
  })

  it('주 경계 — 일요일(10/18)은 앞 주, 월요일(10/19)은 다음 주라 둘 다 200이면 이어진 2주다', () => {
    expect(jamWeekStreak([day('2026-10-18', 200), day('2026-10-19', 200)], 200)).toBe(2)
  })

  it('기본 기준 1잼으로는 잼을 모은 주가 이어진 만큼 센다', () => {
    expect(jamWeekStreak([day('2026-10-14', 1), day('2026-10-21', 5)])).toBe(2)
  })
})

describe('fetchDailyEarnedRows — 조회', () => {
  it('내 행만 읽는다', async () => {
    db.tables.jam_daily_earned = [
      { user_id: ME, earned_on: '2026-10-14', amount: 200 },
      { user_id: OTHER, earned_on: '2026-10-14', amount: 999 },
    ]
    expect(await fetchDailyEarnedRows(mockSupabase(), ME)).toEqual([{ earned_on: '2026-10-14', amount: 200 }])
  })

  it('조회 오류는 던진다(fail-closed)', async () => {
    db.error = { message: 'boom' }
    await expect(fetchDailyEarnedRows(mockSupabase(), ME)).rejects.toThrow(/날짜별 모은 잼 조회 오류/)
  })
})
