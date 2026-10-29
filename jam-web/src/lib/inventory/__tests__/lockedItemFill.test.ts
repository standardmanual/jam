/**
 * lib/inventory/lockedItemFill — 잠긴 아이템 배지 채우기·열기·조회 (티켓 20261018_0053)
 *
 * 고정하는 것:
 * - 채우기: 이용 정지 확인(`assertNotSuspended`)이 RPC보다 먼저다. 정지 중이면 RPC를 부르지 않는다. 양을 생략하면 `p_amount: null`(남은 양 기본값),
 *   줄인 양은 그대로 넘긴다. DB 함수의 거절 코드(`already_full`·`exceeds_remaining`(남은 양 포함)·`invalid_amount`·`insufficient_jam`·`not_locked`·
 *   `item_not_found`·`user_suspended`)를 `LockedItemError`로 바꾼다. 알 수 없는 코드·열기 전용 코드·RPC 오류·해석할 수 없는 응답은 일반 오류다.
 *   성공 응답에는 개체를 알 수 있는 값(이름·그림·일련번호 등)이 없다.
 * - 열기: 정지 확인이 RPC보다 먼저다. 성공하면 같은 개체의 일련번호와 포인트, 열린 뒤의 개체 정보(이름·그림·설명·컬렉션·트라이브)를 싣는다.
 *   `not_full`은 채운 양·필요한 양을 싣는다. 열기가 확정된 뒤 정보 조회가 실패해도 열기를 실패로 돌려주지 않는다(`item: null`).
 *   열기 거절 응답에는 개체 정보를 읽는 조회가 아예 나가지 않는다.
 * - 서비스 활동 잼(티켓 20261028_1735 3회, 옛 챕터 점수 «잠긴 아이템 배지 열기» 자리): 열기가 확정되면 `jam_apply_service_activity`를 (locked_unlock, `locked_unlock:<개체 id>`)로 한 번 부른다.
 *   거절·정지·해석 불가 응답에는 부르지 않고, 같은 개체를 다시 보내도 같은 키다. 옛 `chapter_add_score`는 더는 부르지 않는다. 지급(양 > 0)이 있으면 곧바로 캡슐 자동 채움이 이어지고
 *   (열기 응답은 그대로, 퀘스트 완료 처리보다 앞), 규칙값 0 등 지급 0이면 채우지 않는다. 지급 실패(RPC 오류·예외)는 열기와 응답을 바꾸지 않는다. 채우기는 잼 지급과 무관하다.
 * - 퀘스트 완료 처리(티켓 20261021_1248): 열기가 확정되면 서비스 활동 잼 다음에 `(supabase, userId)`로 한 번 부른다. 거절·정지·해석 불가 응답과 채우기에는 부르지 않고,
 *   완료 처리가 던져도 열기와 응답은 그대로다. 응답에는 완료 배지를 싣지 않는다. 실제 판정은 `onboarding-quest/__tests__`가 고정한다(여기서는 가짜).
 * - 포인트 소식(티켓 20261026_1031): 열기가 확정되고 `pointsAwarded`가 0보다 크면 활동 결산의 «포인트» 조각을 `(유저 id, { points }, { client })`로 한 번 낸다.
 *   퀘스트 완료 처리 다음이며 개체 정보 조회보다 앞이다. `pointsAwarded`가 0이면 내지 않고, 거절(`not_locked` 포함)·정지·해석 불가 응답과 채우기에도 내지 않는다.
 *   소식이 던져도 열기와 응답은 그대로다.
 * - 활동 피드(티켓 20261026_1031, 사용자 결정 2026-10-26): 잠긴 채 받은 개체는 받을 때 피드가 없다(`recordIssuedRewards`가 잠긴 개체는 포인트와 피드를 모두 건너뛴다, 7.3절).
 *   그래서 열기가 확정되면 `item_dropped`를 한 번 올린다. 칸 이름과 값은 열린 채 받은 개체의 피드와 같고(같은 헬퍼 `recordItemDroppedFeed`), 시각은 연 때(생략 = DB 기본값),
 *   활동에는 묶지 않는다. 포인트를 준 경우에만 `point_reward`를 싣고, 포인트를 다시 주지는 않는다(`awardPoints` 없음). 포인트가 0이어도 올린다(포인트와 별개).
 *   개체 정보를 읽지 못했으면 올리지 않고 기록만 남긴다. 피드가 던져도 열기와 응답은 그대로다. 거절(`not_locked` 포함)·정지·해석 불가 응답과 채우기에는 올리지 않고,
 *   같은 개체를 다시 열려 하면(`not_locked`) 두 번 올라가지 않는다.
 *   출처(사용자 결정 2026-10-26, 운영 로직 15.3절): 동기화로 받은 잠긴 개체만 올린다. 올리기 전에 발급 기록 `item_issue_log`에서 개체 id로 가장 앞선 한 줄의 `route`를 읽는다.
 *   `'sync'` → 올림 / `'capsule'` → 올리지 않음(포인트 소식·잼 지급·응답은 그대로) / 발급 기록 행 없음(운영자가 지정한 개체 등)·그 밖의 경로 값 → 올림 /
 *   경로를 읽다가 오류 → 올리지 않고 기록만 남김(캡슐 제외 결정을 어기느니 피드를 빼는 쪽이 안전하다). 개체 정보를 읽지 못했거나 거절·정지·해석 불가 응답·채우기에는 경로도 읽지 않는다.
 * - 조회: 채운 양·필요량·남은 양·잔액·열 수 있는지만 싣고 `badges` 등 개체 정보 표는 읽지 않는다. 내 것이 아니거나 버려지거나 드랍된 개체는
 *   `item_not_found`다. 이용 정지 중에도 막지 않는다. 지갑 행이 없으면 잔액 0이다.
 * - 경계: 계약 파일은 아무것도 가져오지 않고, 서버 전용 모듈은 클라이언트 파일의 import 사슬에 없다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/inventory/__tests__/lockedItemFill.test.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { UserSuspendedError } from '@/lib/suspension/suspension'

const calls = vi.hoisted(() => ({ order: [] as string[] }))
const assertNotSuspendedMock = vi.hoisted(() => vi.fn())
const logMock = vi.hoisted(() => vi.fn())
const autoFillMock = vi.hoisted(() => vi.fn())
const completionMock = vi.hoisted(() => vi.fn())
const recapMock = vi.hoisted(() => vi.fn())
const feedMock = vi.hoisted(() => vi.fn())
const awardPointsMock = vi.hoisted(() => vi.fn())

// 퀘스트 완료 처리는 가짜로 막는다(티켓 20261021_1248) — 불린 순서와 인자만 본다
vi.mock('@/lib/onboarding-quest/completion', () => ({
  recordOnboardingQuestCompletion: async (...args: unknown[]) => {
    calls.order.push('quest_completion')
    return completionMock(...args)
  },
}))
// 포인트 소식(활동 결산)은 가짜로 막는다(티켓 20261026_1031) — 불린 순서와 인자만 본다
vi.mock('@/lib/notifications/recap', () => ({
  recordActivityRecap: async (...args: unknown[]) => {
    calls.order.push('recap')
    return recapMock(...args)
  },
}))
// 활동 피드(item_dropped)는 가짜로 막는다(티켓 20261026_1031) — 불린 횟수와 인자(칸 이름·값, 시각)를 본다
vi.mock('@/lib/activity-feed', () => ({
  recordFeedEvent: async (...args: unknown[]) => feedMock(...args),
}))
// 열린 채 받은 개체의 피드(`recordIssuedRewards`)와 칸을 견주려고 포인트 지급은 가짜로 막는다 — 열기 경로가 포인트를 다시 주지 않는지도 본다
vi.mock('@/lib/points', () => ({ awardPoints: (...args: unknown[]) => awardPointsMock(...args) }))
// 잼 지급 실패 기록(logEngineDecision)이 실제 service 클라이언트를 만들지 않게 막는다
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))
// 서비스 활동 잼은 실제 `awardServiceJam`을 쓰고(RPC만 가짜), 지급 뒤 즉시 채움과 행동 지표 판정은 가짜로 막는다 — 불린 순서만 본다
vi.mock('@/lib/capsule/sync-auto-fill', () => ({
  runSyncCapsuleAutoFill: async (...args: unknown[]) => {
    calls.order.push('auto_fill')
    return autoFillMock(...args)
  },
}))
vi.mock('@/lib/badge-engine/jamActionRoute', () => ({ runJamActionEvaluation: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 주입된 클라이언트가 쓰이지 않았다')
  },
}))
vi.mock('@/lib/suspension/suspension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/suspension/suspension')>()
  return {
    ...actual,
    assertNotSuspended: async (...args: unknown[]) => {
      calls.order.push('assertNotSuspended')
      return assertNotSuspendedMock(...args)
    },
  }
})

import { recordIssuedRewards } from '@/lib/drop-engine/issueFollowUp'
import { fillLockedItem, getLockedItemStatus, LockedItemError, openLockedItem } from '../lockedItemFill'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'
const BADGE_ID = '33333333-3333-4333-8333-333333333333'
const BOOK_ID = '44444444-4444-4444-8444-444444444444'
const TRIBE_ID = '55555555-5555-4555-8555-555555555555'

type Result = { data: unknown; error: unknown }

/** `jam_apply_service_activity`의 지급 응답(5잼) */
const JAM_GRANTED = { ok: true, granted: 5, ruleAmount: 5, capped: false, duplicate: false, dailyUsed: 5, weeklyUsed: 5, balance: 5 }

interface FakeOptions {
  rpc?: Record<string, Result>
  tables?: Record<string, Result>
  /** 서비스 활동 잼 RPC의 결과. 생략하면 5잼 지급 응답이다 */
  jam?: Result
  /** 서비스 활동 잼 RPC가 예외를 던진다 */
  jamThrows?: boolean
}

function fakeClient(options: FakeOptions) {
  const rpc = vi.fn(async (name: string) => {
    calls.order.push(`rpc:${name}`)
    if (name === 'jam_apply_service_activity') {
      if (options.jamThrows) throw new Error('jam network down')
      return options.jam ?? { data: JAM_GRANTED, error: null }
    }
    return options.rpc?.[name] ?? { data: null, error: { message: `unexpected rpc ${name}` } }
  })
  const reads: string[] = []
  /** 읽기 조건 기록 — `표.칸=값`(eq), `표.order:칸:asc|desc`, `표.limit:n` */
  const filters: string[] = []
  const client = {
    rpc,
    from: (table: string) => {
      reads.push(table)
      const result = options.tables?.[table] ?? { data: null, error: { message: `unexpected table ${table}` } }
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push(`${table}.${column}=${String(value)}`)
          return builder
        },
        order: (column: string, opts?: { ascending?: boolean }) => {
          filters.push(`${table}.order:${column}:${opts?.ascending === false ? 'desc' : 'asc'}`)
          return builder
        },
        limit: (count: number) => {
          filters.push(`${table}.limit:${count}`)
          return builder
        },
        maybeSingle: async () => result,
      }
      return builder
    },
  } as unknown as SupabaseClient
  return { client, rpc, reads, filters }
}

beforeEach(() => {
  calls.order = []
  assertNotSuspendedMock.mockReset()
  assertNotSuspendedMock.mockResolvedValue(undefined)
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  autoFillMock.mockReset()
  autoFillMock.mockResolvedValue({ autoFill: {}, opened: false, chapterRose: false, unseenRecorded: true })
  completionMock.mockReset()
  completionMock.mockResolvedValue(null)
  recapMock.mockReset()
  recapMock.mockResolvedValue(undefined)
  feedMock.mockReset()
  feedMock.mockResolvedValue(undefined)
  awardPointsMock.mockReset()
  awardPointsMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const FILL_OK = { ok: true, applied: 30, required: 100, filled: 60, remaining: 40, balance: 12 }

describe('fillLockedItem', () => {
  it('양을 생략하면 p_amount null(남은 양 기본값)로 부르고 채운 결과만 싣는다', async () => {
    const { client, rpc } = fakeClient({ rpc: { locked_item_fill: { data: FILL_OK, error: null } } })

    const payload = await fillLockedItem(client, USER_ID, ITEM_ID)

    expect(rpc).toHaveBeenCalledWith('locked_item_fill', { p_user_id: USER_ID, p_item_id: ITEM_ID, p_amount: null })
    expect(payload).toEqual({ itemId: ITEM_ID, applied: 30, required: 100, filled: 60, remaining: 40, balance: 12, openable: false })
  })

  it('줄인 양은 그대로 넘긴다', async () => {
    const { client, rpc } = fakeClient({ rpc: { locked_item_fill: { data: FILL_OK, error: null } } })

    await fillLockedItem(client, USER_ID, ITEM_ID, 30)

    expect(rpc).toHaveBeenCalledWith('locked_item_fill', { p_user_id: USER_ID, p_item_id: ITEM_ID, p_amount: 30 })
  })

  it('다 채운 응답은 openable true이고 개체를 알 수 있는 값을 싣지 않는다', async () => {
    const full = { ok: true, applied: 40, required: 100, filled: 100, remaining: 0, balance: 0 }
    const { client } = fakeClient({ rpc: { locked_item_fill: { data: { ...full, badgeId: BADGE_ID, serialNumber: 7, name: '비밀' }, error: null } } })

    const payload = await fillLockedItem(client, USER_ID, ITEM_ID)

    expect(payload.openable).toBe(true)
    expect(Object.keys(payload).sort()).toEqual(['applied', 'balance', 'filled', 'itemId', 'openable', 'remaining', 'required'])
  })

  it('이용 정지 확인이 RPC보다 먼저이고, 정지 중이면 RPC를 부르지 않는다', async () => {
    assertNotSuspendedMock.mockRejectedValue(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-18T00:00:00Z' }))
    const { client, rpc } = fakeClient({ rpc: { locked_item_fill: { data: FILL_OK, error: null } } })

    await expect(fillLockedItem(client, USER_ID, ITEM_ID, 10)).rejects.toBeInstanceOf(UserSuspendedError)

    expect(rpc).not.toHaveBeenCalled()
    expect(calls.order).toEqual(['assertNotSuspended'])
  })

  it('정지 여부를 읽지 못해도 RPC를 부르지 않는다', async () => {
    assertNotSuspendedMock.mockRejectedValue(new Error('user_suspensions 조회 실패: down'))
    const { client, rpc } = fakeClient({ rpc: { locked_item_fill: { data: FILL_OK, error: null } } })

    await expect(fillLockedItem(client, USER_ID, ITEM_ID)).rejects.toThrow('user_suspensions 조회 실패')

    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['user_suspended', 'item_not_found', 'not_locked', 'already_full', 'invalid_amount', 'insufficient_jam'] as const)(
    'DB 거절 %s는 같은 코드의 LockedItemError다',
    async (code) => {
      const { client } = fakeClient({ rpc: { locked_item_fill: { data: { ok: false, error: code }, error: null } } })

      const err = await fillLockedItem(client, USER_ID, ITEM_ID, 10).catch((e) => e)

      expect(err).toBeInstanceOf(LockedItemError)
      expect(err.code).toBe(code)
      expect(err.remaining).toBeUndefined()
    }
  )

  it('exceeds_remaining은 남은 양을 싣는다', async () => {
    const { client } = fakeClient({ rpc: { locked_item_fill: { data: { ok: false, error: 'exceeds_remaining', remaining: 40 }, error: null } } })

    const err = await fillLockedItem(client, USER_ID, ITEM_ID, 999).catch((e) => e)

    expect(err).toBeInstanceOf(LockedItemError)
    expect(err.code).toBe('exceeds_remaining')
    expect(err.remaining).toBe(40)
  })

  it('알 수 없는 코드·열기 전용 코드·RPC 오류·해석할 수 없는 응답은 일반 오류다', async () => {
    const reject = (data: unknown, error: unknown = null) => fakeClient({ rpc: { locked_item_fill: { data, error } } }).client

    const unknown = await fillLockedItem(reject({ ok: false, error: 'weird' }), USER_ID, ITEM_ID).catch((e) => e)
    expect(unknown).not.toBeInstanceOf(LockedItemError)
    expect(unknown.message).toContain('알 수 없는 거절 코드')

    const openOnly = await fillLockedItem(reject({ ok: false, error: 'not_full' }), USER_ID, ITEM_ID).catch((e) => e)
    expect(openOnly).not.toBeInstanceOf(LockedItemError)

    await expect(fillLockedItem(reject(null, { message: 'boom' }), USER_ID, ITEM_ID)).rejects.toThrow('locked_item_fill RPC 오류')
    await expect(fillLockedItem(reject(null), USER_ID, ITEM_ID)).rejects.toThrow('해석할 수 없는 응답')
    await expect(fillLockedItem(reject({ ok: true, applied: 1 }), USER_ID, ITEM_ID)).rejects.toThrow('해석할 수 없는 응답')
  })
})

const OPEN_OK = { ok: true, itemId: ITEM_ID, badgeId: BADGE_ID, serialNumber: 7, pointsAwarded: 50 }

const INFO_TABLES: Record<string, Result> = {
  badges: {
    data: { name: '새벽의 첫 바퀴', image_url: 'https://img/x.png', description: '새벽에 달린 기록', rarity: 'epic', item_book_id: BOOK_ID, tribe_id: null },
    error: null,
  },
  item_books: { data: { id: BOOK_ID, name: '새벽 컬렉션', tribe_id: TRIBE_ID }, error: null },
  tribes: { data: { id: TRIBE_ID, name: '러너' }, error: null },
  inventory_items: { data: { serial_prefix: 'ABCD' }, error: null },
  // 발급 기록 — 기본은 동기화로 받은 개체다(피드가 올라가는 경우). 캡슐 출처·기록 없음·읽기 오류는 피드 시험이 이 칸만 바꾼다
  item_issue_log: { data: { route: 'sync' }, error: null },
}

describe('openLockedItem', () => {
  it('열면 같은 일련번호와 준 포인트, 열린 뒤의 개체 정보를 싣는다(트라이브는 컬렉션 것으로 보충)', async () => {
    const { client, rpc } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })

    const payload = await openLockedItem(client, USER_ID, ITEM_ID)

    expect(rpc).toHaveBeenCalledWith('locked_item_open', { p_user_id: USER_ID, p_item_id: ITEM_ID })
    expect(payload).toEqual({
      itemId: ITEM_ID,
      badgeId: BADGE_ID,
      serialNumber: 7,
      serialPrefix: 'ABCD',
      pointsAwarded: 50,
      item: {
        name: '새벽의 첫 바퀴',
        imageUrl: 'https://img/x.png',
        description: '새벽에 달린 기록',
        rarity: 'epic',
        collection: { id: BOOK_ID, name: '새벽 컬렉션' },
        tribe: { id: TRIBE_ID, name: '러너' },
      },
    })
  })

  it('컬렉션·트라이브가 없는 배지는 그 칸이 null이고 조회도 나가지 않는다', async () => {
    const { client, reads } = fakeClient({
      rpc: { locked_item_open: { data: { ...OPEN_OK, pointsAwarded: 0 }, error: null } },
      tables: { badges: { data: { name: 'N', image_url: null, description: null, rarity: null, item_book_id: null, tribe_id: null }, error: null } },
    })

    const payload = await openLockedItem(client, USER_ID, ITEM_ID)

    expect(payload.pointsAwarded).toBe(0)
    expect(payload.item).toEqual({ name: 'N', imageUrl: null, description: '', rarity: null, collection: null, tribe: null })
    // 발급 경로(피드 판정)와 접두사 조회는 따로 나가고, 이 표들이 없는 가짜 클라이언트에서는 실패한다 — 접두사는 null이고 피드는 올리지 않는다(열기 결과에는 영향이 없다)
    expect(reads).toEqual(['badges', 'item_issue_log', 'inventory_items'])
    expect(payload.serialPrefix).toBeNull()
  })

  it('일련번호 접두사를 읽어 싣는다(번호와 함께 일련번호 표시에 쓴다)', async () => {
    const { client } = fakeClient({
      rpc: { locked_item_open: { data: OPEN_OK, error: null } },
      tables: { ...INFO_TABLES, inventory_items: { data: { serial_prefix: 'WXYZ' }, error: null } },
    })

    const payload = await openLockedItem(client, USER_ID, ITEM_ID)

    expect(payload.serialNumber).toBe(7)
    expect(payload.serialPrefix).toBe('WXYZ')
  })

  it('이용 정지 확인이 RPC보다 먼저이고, 정지 중이면 RPC를 부르지 않는다', async () => {
    assertNotSuspendedMock.mockRejectedValue(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-18T00:00:00Z' }))
    const { client, rpc } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })

    await expect(openLockedItem(client, USER_ID, ITEM_ID)).rejects.toBeInstanceOf(UserSuspendedError)

    expect(rpc).not.toHaveBeenCalled()
    expect(calls.order).toEqual(['assertNotSuspended'])
  })

  it('not_full은 채운 양과 필요한 양을 싣고, 개체 정보 조회는 나가지 않는다', async () => {
    const { client, reads } = fakeClient({
      rpc: { locked_item_open: { data: { ok: false, error: 'not_full', required: 100, filled: 60 }, error: null } },
      tables: INFO_TABLES,
    })

    const err = await openLockedItem(client, USER_ID, ITEM_ID).catch((e) => e)

    expect(err).toBeInstanceOf(LockedItemError)
    expect(err.code).toBe('not_full')
    expect(err.required).toBe(100)
    expect(err.filled).toBe(60)
    expect(reads).toEqual([])
  })

  it.each(['user_suspended', 'item_not_found', 'not_locked'] as const)('DB 거절 %s는 같은 코드의 LockedItemError이고 개체 정보 조회가 없다', async (code) => {
    const { client, reads } = fakeClient({ rpc: { locked_item_open: { data: { ok: false, error: code }, error: null } }, tables: INFO_TABLES })

    const err = await openLockedItem(client, USER_ID, ITEM_ID).catch((e) => e)

    expect(err).toBeInstanceOf(LockedItemError)
    expect(err.code).toBe(code)
    expect(reads).toEqual([])
  })

  it('열기가 확정된 뒤 개체 정보 조회가 실패해도 열기는 성공이고 item은 null이다', async () => {
    const { client } = fakeClient({
      rpc: { locked_item_open: { data: OPEN_OK, error: null } },
      tables: { badges: { data: null, error: { message: 'down' } } },
    })

    const payload = await openLockedItem(client, USER_ID, ITEM_ID)

    expect(payload).toEqual({ itemId: ITEM_ID, badgeId: BADGE_ID, serialNumber: 7, serialPrefix: null, pointsAwarded: 50, item: null })
  })

  it('채우기 전용 코드·알 수 없는 코드·RPC 오류·해석할 수 없는 응답은 일반 오류다', async () => {
    const reject = (data: unknown, error: unknown = null) => fakeClient({ rpc: { locked_item_open: { data, error } } }).client

    const fillOnly = await openLockedItem(reject({ ok: false, error: 'insufficient_jam' }), USER_ID, ITEM_ID).catch((e) => e)
    expect(fillOnly).not.toBeInstanceOf(LockedItemError)

    await expect(openLockedItem(reject(null, { message: 'boom' }), USER_ID, ITEM_ID)).rejects.toThrow('locked_item_open RPC 오류')
    await expect(openLockedItem(reject(null), USER_ID, ITEM_ID)).rejects.toThrow('해석할 수 없는 응답')
    await expect(openLockedItem(reject({ ok: true }), USER_ID, ITEM_ID)).rejects.toThrow('해석할 수 없는 응답')
  })
})

describe('openLockedItem — 서비스 활동 잼 «잠긴 아이템 배지 열기» (티켓 20261028_1735 3회)', () => {
  const JAM_ARGS = { p_user_id: USER_ID, p_kind: 'locked_unlock', p_event_key: `locked_unlock:${ITEM_ID}` }
  const jamCalls = (rpc: { mock: { calls: unknown[][] } }) => rpc.mock.calls.filter(([name]) => name === 'jam_apply_service_activity')

  it('열기가 확정되면 개체 id를 원천으로 한 번 부른다(이벤트 키는 locked_unlock:<개체 id>, 열기 RPC 다음이다)', async () => {
    const { client, rpc } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })

    await openLockedItem(client, USER_ID, ITEM_ID)

    expect(jamCalls(rpc)).toEqual([['jam_apply_service_activity', JAM_ARGS]])
    expect(calls.order.slice(0, 3)).toEqual(['assertNotSuspended', 'rpc:locked_item_open', 'rpc:jam_apply_service_activity'])
  })

  it('옛 챕터 점수(chapter_add_score)는 더는 쌓지 않는다', async () => {
    const { client, rpc } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })

    await openLockedItem(client, USER_ID, ITEM_ID)

    expect(rpc.mock.calls.map(([name]) => name)).not.toContain('chapter_add_score')
  })

  it('지급이 있으면 곧바로 캡슐 자동 채움이 이어지고, 퀘스트 완료 처리·소식보다 앞이며 열기 응답은 그대로다 (지급 즉시 채움)', async () => {
    const { client } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })

    const payload = await openLockedItem(client, USER_ID, ITEM_ID)

    expect(autoFillMock).toHaveBeenCalledTimes(1)
    expect(autoFillMock).toHaveBeenCalledWith(expect.anything(), USER_ID)
    expect(calls.order).toEqual(['assertNotSuspended', 'rpc:locked_item_open', 'rpc:jam_apply_service_activity', 'auto_fill', 'quest_completion', 'recap'])
    expect(payload).toMatchObject({ itemId: ITEM_ID, badgeId: BADGE_ID, serialNumber: 7, serialPrefix: 'ABCD', pointsAwarded: 50 })
  })

  it('규칙값 0·같은 키 재전송처럼 지급이 0이면 채우지 않는다', async () => {
    const zero = fakeClient({
      rpc: { locked_item_open: { data: OPEN_OK, error: null } },
      tables: INFO_TABLES,
      jam: { data: { ok: true, granted: 0, reason: 'rule_zero' }, error: null },
    })
    await openLockedItem(zero.client, USER_ID, ITEM_ID)
    const dup = fakeClient({
      rpc: { locked_item_open: { data: OPEN_OK, error: null } },
      tables: INFO_TABLES,
      jam: { data: { ok: true, granted: 5, duplicate: true }, error: null },
    })
    await openLockedItem(dup.client, USER_ID, ITEM_ID)

    expect(autoFillMock).not.toHaveBeenCalled()
  })

  it('같은 개체를 다시 보내도 같은 (활동 종류, 원천 id)다', async () => {
    const { client, rpc } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })

    await openLockedItem(client, USER_ID, ITEM_ID)
    await openLockedItem(client, USER_ID, ITEM_ID)

    const calls2 = jamCalls(rpc)
    expect(calls2).toHaveLength(2)
    expect(calls2[1]).toEqual(calls2[0])
  })

  it('정지·DB 거절·해석할 수 없는 응답은 잼을 주지 않는다', async () => {
    assertNotSuspendedMock.mockRejectedValueOnce(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-18T00:00:00Z' }))
    const suspended = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })
    await openLockedItem(suspended.client, USER_ID, ITEM_ID).catch(() => {})

    const notFull = fakeClient({ rpc: { locked_item_open: { data: { ok: false, error: 'not_full', required: 100, filled: 60 }, error: null } } })
    await openLockedItem(notFull.client, USER_ID, ITEM_ID).catch(() => {})

    const broken = fakeClient({ rpc: { locked_item_open: { data: { ok: true }, error: null } } })
    await openLockedItem(broken.client, USER_ID, ITEM_ID).catch(() => {})

    for (const { rpc } of [suspended, notFull, broken]) {
      expect(rpc.mock.calls.map(([name]) => name)).not.toContain('jam_apply_service_activity')
    }
    expect(autoFillMock).not.toHaveBeenCalled()
  })

  it('채우기는 잼 지급과 무관하다', async () => {
    const { client, rpc } = fakeClient({ rpc: { locked_item_fill: { data: FILL_OK, error: null } } })

    await fillLockedItem(client, USER_ID, ITEM_ID)

    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['locked_item_fill'])
  })

  it('개체 정보 조회가 실패해도 잼은 준다(열기가 확정된 뒤의 일이다)', async () => {
    const { client, rpc } = fakeClient({
      rpc: { locked_item_open: { data: OPEN_OK, error: null } },
      tables: { badges: { data: null, error: { message: 'down' } } },
    })

    const payload = await openLockedItem(client, USER_ID, ITEM_ID)

    expect(payload.item).toBeNull()
    expect(rpc).toHaveBeenCalledWith('jam_apply_service_activity', JAM_ARGS)
  })

  it('잼 RPC가 오류를 돌려줘도 열기와 응답은 그대로이고 실패를 기록한다', async () => {
    const { client } = fakeClient({
      rpc: { locked_item_open: { data: OPEN_OK, error: null } },
      tables: INFO_TABLES,
      jam: { data: null, error: { message: 'jam rpc failed' } },
    })

    const payload = await openLockedItem(client, USER_ID, ITEM_ID)

    expect(payload).toMatchObject({ itemId: ITEM_ID, badgeId: BADGE_ID, serialNumber: 7, serialPrefix: 'ABCD', pointsAwarded: 50 })
    expect(payload.item).not.toBeNull()
    expect(logMock).toHaveBeenCalledWith('points', 'service_jam_failed', USER_ID, expect.objectContaining({ kind: 'locked_unlock', sourceId: ITEM_ID }))
    expect(autoFillMock).not.toHaveBeenCalled()
  })

  it('잼 RPC가 예외를 던져도 열기와 응답은 그대로다', async () => {
    const { client } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES, jamThrows: true })

    const payload = await openLockedItem(client, USER_ID, ITEM_ID)

    expect(payload).toMatchObject({ itemId: ITEM_ID, badgeId: BADGE_ID, pointsAwarded: 50 })
  })
})

describe('openLockedItem — 퀘스트 완료 처리 (티켓 20261021_1248)', () => {
  it('열기가 확정되면 (클라이언트, 유저 id)로 한 번 부르고, 서비스 활동 잼 다음이며 개체 정보 조회보다 앞이다', async () => {
    const { client, reads } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })
    let readsWhenCalled = -1
    completionMock.mockImplementation(async () => {
      readsWhenCalled = reads.length
      return null
    })

    await openLockedItem(client, USER_ID, ITEM_ID)

    expect(completionMock).toHaveBeenCalledTimes(1)
    expect(completionMock).toHaveBeenCalledWith(client, USER_ID)
    expect(calls.order.indexOf('quest_completion')).toBeGreaterThan(calls.order.indexOf('rpc:jam_apply_service_activity'))
    // 완료 처리가 불릴 때까지 개체 정보 표는 아직 읽지 않았고, 그 뒤에 읽는다
    expect(readsWhenCalled).toBe(0)
    expect(reads.length).toBeGreaterThan(0)
  })

  it('정지·DB 거절·해석할 수 없는 응답은 부르지 않는다', async () => {
    assertNotSuspendedMock.mockRejectedValueOnce(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-18T00:00:00Z' }))
    await openLockedItem(fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES }).client, USER_ID, ITEM_ID).catch(() => {})

    const notFull = fakeClient({ rpc: { locked_item_open: { data: { ok: false, error: 'not_full', required: 100, filled: 60 }, error: null } } })
    await openLockedItem(notFull.client, USER_ID, ITEM_ID).catch(() => {})

    const broken = fakeClient({ rpc: { locked_item_open: { data: { ok: true }, error: null } } })
    await openLockedItem(broken.client, USER_ID, ITEM_ID).catch(() => {})

    expect(completionMock).not.toHaveBeenCalled()
  })

  it('채우기는 완료 처리와 무관하다 — 열기만 실제 단계 ③이다', async () => {
    const { client } = fakeClient({ rpc: { locked_item_fill: { data: FILL_OK, error: null } } })

    await fillLockedItem(client, USER_ID, ITEM_ID)

    expect(completionMock).not.toHaveBeenCalled()
  })

  it('완료 처리가 던져도 열기와 응답은 그대로이고 개체 정보를 이어 읽으며 기록만 남긴다', async () => {
    completionMock.mockRejectedValue(new Error('퀘스트 완료 처리 장애'))
    const { client } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })

    const payload = await openLockedItem(client, USER_ID, ITEM_ID)

    expect(payload).toMatchObject({ itemId: ITEM_ID, badgeId: BADGE_ID, serialNumber: 7, serialPrefix: 'ABCD', pointsAwarded: 50 })
    expect(payload.item).not.toBeNull()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('퀘스트 완료 처리 실패'), expect.any(Error))
  })

  it('응답에는 완료 배지를 싣지 않는다 — 완료 처리가 배지 id를 돌려줘도 응답 모양은 같다', async () => {
    completionMock.mockResolvedValue('cd20f271-9445-42cc-ac51-d8a96b25e1c3')
    const { client } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })

    const payload = await openLockedItem(client, USER_ID, ITEM_ID)

    expect(Object.keys(payload).sort()).toEqual(['badgeId', 'item', 'itemId', 'pointsAwarded', 'serialNumber', 'serialPrefix'])
    expect(JSON.stringify(payload)).not.toContain('cd20f271')
  })
})

describe('openLockedItem — 포인트 소식 (티켓 20261026_1031)', () => {
  it('열기가 확정되면 받은 포인트로 소식을 한 번 내고, 퀘스트 완료 처리 다음이며 개체 정보 조회보다 앞이다', async () => {
    const { client, reads } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })
    let readsWhenCalled = -1
    recapMock.mockImplementation(async () => {
      readsWhenCalled = reads.length
    })

    await openLockedItem(client, USER_ID, ITEM_ID)

    expect(recapMock).toHaveBeenCalledTimes(1)
    expect(recapMock).toHaveBeenCalledWith(USER_ID, { points: 50 }, { client })
    expect(calls.order.indexOf('recap')).toBeGreaterThan(calls.order.indexOf('quest_completion'))
    expect(readsWhenCalled).toBe(0)
    expect(reads.length).toBeGreaterThan(0)
  })

  it('소식은 알림 RPC를 직접 부르지 않는다 — 부르는 RPC는 열기와 서비스 활동 잼뿐이다', async () => {
    const { client, rpc } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })

    await openLockedItem(client, USER_ID, ITEM_ID)

    expect(rpc.mock.calls.map((call) => call[0]).sort()).toEqual(['jam_apply_service_activity', 'locked_item_open'])
  })

  it('받은 포인트가 0이면(포인트 없는 배지·이미 지급) 소식을 내지 않는다', async () => {
    const { client } = fakeClient({
      rpc: { locked_item_open: { data: { ...OPEN_OK, pointsAwarded: 0 }, error: null } },
      tables: INFO_TABLES,
    })

    const payload = await openLockedItem(client, USER_ID, ITEM_ID)

    expect(payload.pointsAwarded).toBe(0)
    expect(recapMock).not.toHaveBeenCalled()
  })

  it('이미 연 개체(not_locked)·정지·DB 거절·해석할 수 없는 응답은 소식을 내지 않는다', async () => {
    const notLocked = fakeClient({ rpc: { locked_item_open: { data: { ok: false, error: 'not_locked' }, error: null } } })
    await expect(openLockedItem(notLocked.client, USER_ID, ITEM_ID)).rejects.toMatchObject({ code: 'not_locked' })

    assertNotSuspendedMock.mockRejectedValueOnce(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-26T00:00:00Z' }))
    await openLockedItem(fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES }).client, USER_ID, ITEM_ID).catch(() => {})

    const notFull = fakeClient({ rpc: { locked_item_open: { data: { ok: false, error: 'not_full', required: 100, filled: 60 }, error: null } } })
    await openLockedItem(notFull.client, USER_ID, ITEM_ID).catch(() => {})

    const broken = fakeClient({ rpc: { locked_item_open: { data: { ok: true }, error: null } } })
    await openLockedItem(broken.client, USER_ID, ITEM_ID).catch(() => {})

    expect(recapMock).not.toHaveBeenCalled()
  })

  it('채우기는 소식을 내지 않는다', async () => {
    const { client } = fakeClient({ rpc: { locked_item_fill: { data: FILL_OK, error: null } } })

    await fillLockedItem(client, USER_ID, ITEM_ID)

    expect(recapMock).not.toHaveBeenCalled()
  })

  it('소식이 던져도 열기와 응답은 그대로이고 개체 정보를 이어 읽으며 기록만 남긴다', async () => {
    recapMock.mockRejectedValue(new Error('알림 장애'))
    const { client } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })

    const payload = await openLockedItem(client, USER_ID, ITEM_ID)

    expect(payload).toMatchObject({ itemId: ITEM_ID, badgeId: BADGE_ID, serialNumber: 7, serialPrefix: 'ABCD', pointsAwarded: 50 })
    expect(payload.item).not.toBeNull()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('포인트 소식 기록 실패'), expect.any(Error))
  })
})

describe('openLockedItem — 활동 피드 item_dropped (티켓 20261026_1031)', () => {
  it('열기가 확정되면 item_dropped를 한 번, 연 개체의 정보를 열린 채 받은 개체와 같은 칸으로 올린다', async () => {
    const { client, reads } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })
    let readsWhenCalled = -1
    feedMock.mockImplementation(async () => {
      readsWhenCalled = reads.length
    })

    await openLockedItem(client, USER_ID, ITEM_ID)

    expect(feedMock).toHaveBeenCalledTimes(1)
    expect(feedMock).toHaveBeenCalledWith(
      USER_ID,
      'item_dropped',
      {
        inventory_item_id: ITEM_ID,
        badge_id: BADGE_ID,
        badge_name: '새벽의 첫 바퀴',
        badge_image_url: 'https://img/x.png',
        rarity: 'epic',
        poi_name: '',
        tribe_name: '러너',
        is_last_piece: false,
        point_reward: 50,
      },
      undefined,
      undefined
    )
    // 개체 정보를 읽은 다음에 올린다
    expect(readsWhenCalled).toBeGreaterThan(0)
  })

  it('시각은 연 때(생략 = DB 기본값 지금)이고 활동에는 묶지 않는다', async () => {
    const { client } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })

    await openLockedItem(client, USER_ID, ITEM_ID)

    // recordFeedEvent(유저, 종류, 메타, 시각, 활동 id) — 4·5번째 인자를 넘기지 않는다
    expect(feedMock.mock.calls[0][3]).toBeUndefined()
    expect(feedMock.mock.calls[0][4]).toBeUndefined()
  })

  it('칸 이름과 값이 열린 채 받은 개체의 피드(recordIssuedRewards)와 같다', async () => {
    await recordIssuedRewards({
      userId: USER_ID,
      stravaId: null,
      startDate: null,
      tribeName: '러너',
      inventoryItemId: ITEM_ID,
      badge: { id: BADGE_ID, name: '새벽의 첫 바퀴', image_url: 'https://img/x.png', point_reward: 50 },
      rarity: 'epic',
    })
    expect(feedMock).toHaveBeenCalledTimes(1)
    const received = feedMock.mock.calls[0]
    feedMock.mockClear()

    const { client } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })
    await openLockedItem(client, USER_ID, ITEM_ID)

    expect(feedMock).toHaveBeenCalledTimes(1)
    expect(feedMock.mock.calls[0].slice(0, 4)).toEqual(received.slice(0, 4))
  })

  it('포인트를 다시 주지 않는다 — 포인트는 열기 RPC 안에서 한 번 주고, 피드는 point_reward 칸에 그 값을 적을 뿐이다', async () => {
    const { client } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })

    await openLockedItem(client, USER_ID, ITEM_ID)

    expect(awardPointsMock).not.toHaveBeenCalled()
  })

  it('포인트가 0이어도(포인트 없는 배지·이미 지급) 열기가 확정되면 피드는 올라가고 point_reward 칸은 없다', async () => {
    const { client } = fakeClient({
      rpc: { locked_item_open: { data: { ...OPEN_OK, pointsAwarded: 0 }, error: null } },
      tables: INFO_TABLES,
    })

    await openLockedItem(client, USER_ID, ITEM_ID)

    expect(recapMock).not.toHaveBeenCalled()
    expect(feedMock).toHaveBeenCalledTimes(1)
    expect(feedMock.mock.calls[0][2]).not.toHaveProperty('point_reward')
    expect(feedMock.mock.calls[0][2]).toMatchObject({ inventory_item_id: ITEM_ID, badge_id: BADGE_ID })
  })

  it('그림·트라이브가 없는 배지는 그 칸을 빈 문자열로 올린다', async () => {
    const { client } = fakeClient({
      rpc: { locked_item_open: { data: OPEN_OK, error: null } },
      tables: {
        ...INFO_TABLES,
        badges: { data: { name: '이름만', image_url: null, description: null, rarity: null, item_book_id: null, tribe_id: null }, error: null },
      },
    })

    await openLockedItem(client, USER_ID, ITEM_ID)

    expect(feedMock.mock.calls[0][2]).toMatchObject({ badge_name: '이름만', badge_image_url: '', rarity: null, tribe_name: '' })
  })

  it('개체 정보를 읽지 못하면(조회 실패·배지 행 없음) 피드를 올리지 않고 기록만 남기며, 열기는 성공이다', async () => {
    const failed = fakeClient({
      rpc: { locked_item_open: { data: OPEN_OK, error: null } },
      tables: { ...INFO_TABLES, badges: { data: null, error: { message: 'down' } } },
    })
    const failedPayload = await openLockedItem(failed.client, USER_ID, ITEM_ID)

    const missing = fakeClient({
      rpc: { locked_item_open: { data: OPEN_OK, error: null } },
      tables: { ...INFO_TABLES, badges: { data: null, error: null } },
    })
    const missingPayload = await openLockedItem(missing.client, USER_ID, ITEM_ID)

    expect(feedMock).not.toHaveBeenCalled()
    expect(failedPayload).toMatchObject({ itemId: ITEM_ID, badgeId: BADGE_ID, pointsAwarded: 50, item: null })
    expect(missingPayload).toMatchObject({ itemId: ITEM_ID, badgeId: BADGE_ID, pointsAwarded: 50, item: null })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('개체 정보가 없어 피드를 올리지 않는다'))
    // 포인트 소식은 개체 정보와 무관하게 나간다
    expect(recapMock).toHaveBeenCalledTimes(2)
  })

  describe('출처 — 동기화로 받은 개체만 올린다(캡슐 개봉 결과는 피드에 올리지 않는다, 운영 로직 15.3절, 사용자 결정 2026-10-26)', () => {
    it('발급 기록의 경로를 개체 id로, 가장 앞선 한 줄만 읽고 피드보다 먼저 읽는다', async () => {
      const { client, reads, filters } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })
      let readsWhenCalled: string[] = []
      feedMock.mockImplementation(async () => {
        readsWhenCalled = [...reads]
      })

      await openLockedItem(client, USER_ID, ITEM_ID)

      expect(filters.filter((f) => f.startsWith('item_issue_log.'))).toEqual([
        `item_issue_log.inventory_item_id=${ITEM_ID}`,
        'item_issue_log.order:created_at:asc',
        'item_issue_log.order:id:asc',
        'item_issue_log.limit:1',
      ])
      expect(readsWhenCalled).toContain('item_issue_log')
      expect(reads.filter((t) => t === 'item_issue_log')).toHaveLength(1)
    })

    it("경로가 'sync'(동기화)이면 피드를 한 번 올린다", async () => {
      const { client } = fakeClient({
        rpc: { locked_item_open: { data: OPEN_OK, error: null } },
        tables: { ...INFO_TABLES, item_issue_log: { data: { route: 'sync' }, error: null } },
      })

      await openLockedItem(client, USER_ID, ITEM_ID)

      expect(feedMock).toHaveBeenCalledTimes(1)
      expect(feedMock.mock.calls[0][1]).toBe('item_dropped')
    })

    it("경로가 'capsule'(캡슐에서 나온 잠긴 개체)이면 피드를 올리지 않는다 — 포인트 소식·잼 지급·응답은 그대로다", async () => {
      const { client } = fakeClient({
        rpc: { locked_item_open: { data: OPEN_OK, error: null } },
        tables: { ...INFO_TABLES, item_issue_log: { data: { route: 'capsule' }, error: null } },
      })

      const payload = await openLockedItem(client, USER_ID, ITEM_ID)

      expect(feedMock).not.toHaveBeenCalled()
      // 포인트 소식은 그대로 한 번 나간다
      expect(recapMock).toHaveBeenCalledTimes(1)
      expect(recapMock).toHaveBeenCalledWith(USER_ID, { points: 50 }, { client })
      // 잼 지급·즉시 채움·퀘스트 완료 처리도 그대로다
      expect(calls.order).toEqual(['assertNotSuspended', 'rpc:locked_item_open', 'rpc:jam_apply_service_activity', 'auto_fill', 'quest_completion', 'recap'])
      // 열기 응답은 출처와 무관하게 같다(개체 정보·접두사를 그대로 싣는다)
      expect(payload).toMatchObject({ itemId: ITEM_ID, badgeId: BADGE_ID, serialNumber: 7, serialPrefix: 'ABCD', pointsAwarded: 50 })
      expect(payload.item).toMatchObject({ name: '새벽의 첫 바퀴' })
    })

    it('발급 기록 행이 없으면(운영자가 지정한 개체 등 캡슐이 아닌 경로) 피드를 한 번 올린다', async () => {
      const { client } = fakeClient({
        rpc: { locked_item_open: { data: OPEN_OK, error: null } },
        tables: { ...INFO_TABLES, item_issue_log: { data: null, error: null } },
      })

      await openLockedItem(client, USER_ID, ITEM_ID)

      expect(feedMock).toHaveBeenCalledTimes(1)
      expect(feedMock.mock.calls[0][2]).toMatchObject({ inventory_item_id: ITEM_ID, badge_id: BADGE_ID, point_reward: 50 })
    })

    it('캡슐이 아닌 다른 경로 값이면 올린다 — 제외하는 것은 캡슐뿐이다', async () => {
      const { client } = fakeClient({
        rpc: { locked_item_open: { data: OPEN_OK, error: null } },
        tables: { ...INFO_TABLES, item_issue_log: { data: { route: 'admin_grant' }, error: null } },
      })

      await openLockedItem(client, USER_ID, ITEM_ID)

      expect(feedMock).toHaveBeenCalledTimes(1)
    })

    it('경로를 읽다가 오류가 나면 피드를 올리지 않고 기록만 남기며, 열기 응답과 포인트 소식은 그대로다', async () => {
      const { client } = fakeClient({
        rpc: { locked_item_open: { data: OPEN_OK, error: null } },
        tables: { ...INFO_TABLES, item_issue_log: { data: null, error: { message: 'down' } } },
      })

      const payload = await openLockedItem(client, USER_ID, ITEM_ID)

      expect(feedMock).not.toHaveBeenCalled()
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('발급 경로 조회 실패'), expect.any(Error))
      expect(payload).toMatchObject({ itemId: ITEM_ID, badgeId: BADGE_ID, serialNumber: 7, serialPrefix: 'ABCD', pointsAwarded: 50 })
      expect(payload.item).not.toBeNull()
      expect(recapMock).toHaveBeenCalledTimes(1)
    })

    it('개체 정보를 읽지 못해 피드를 올리지 않을 때는 발급 경로도 읽지 않는다', async () => {
      const { client, reads } = fakeClient({
        rpc: { locked_item_open: { data: OPEN_OK, error: null } },
        tables: { ...INFO_TABLES, badges: { data: null, error: { message: 'down' } } },
      })

      await openLockedItem(client, USER_ID, ITEM_ID)

      expect(reads).not.toContain('item_issue_log')
      expect(feedMock).not.toHaveBeenCalled()
    })

    it('거절(not_locked 포함)·정지·해석할 수 없는 응답과 채우기는 발급 경로를 읽지 않는다', async () => {
      const notLocked = fakeClient({ rpc: { locked_item_open: { data: { ok: false, error: 'not_locked' }, error: null } }, tables: INFO_TABLES })
      await openLockedItem(notLocked.client, USER_ID, ITEM_ID).catch(() => {})

      const broken = fakeClient({ rpc: { locked_item_open: { data: { ok: true }, error: null } }, tables: INFO_TABLES })
      await openLockedItem(broken.client, USER_ID, ITEM_ID).catch(() => {})

      const fill = fakeClient({ rpc: { locked_item_fill: { data: FILL_OK, error: null } }, tables: INFO_TABLES })
      await fillLockedItem(fill.client, USER_ID, ITEM_ID)

      expect([...notLocked.reads, ...broken.reads, ...fill.reads]).not.toContain('item_issue_log')
    })
  })

  it('피드가 던져도 열기와 응답은 그대로이고 기록만 남긴다', async () => {
    feedMock.mockRejectedValue(new Error('피드 장애'))
    const { client } = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })

    const payload = await openLockedItem(client, USER_ID, ITEM_ID)

    expect(payload).toMatchObject({ itemId: ITEM_ID, badgeId: BADGE_ID, serialNumber: 7, serialPrefix: 'ABCD', pointsAwarded: 50 })
    expect(payload.item).not.toBeNull()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('피드 기록 실패'), expect.any(Error))
  })

  it('이미 연 개체(not_locked)·정지·DB 거절·해석할 수 없는 응답은 피드를 올리지 않는다', async () => {
    const notLocked = fakeClient({ rpc: { locked_item_open: { data: { ok: false, error: 'not_locked' }, error: null } } })
    await expect(openLockedItem(notLocked.client, USER_ID, ITEM_ID)).rejects.toMatchObject({ code: 'not_locked' })

    assertNotSuspendedMock.mockRejectedValueOnce(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-26T00:00:00Z' }))
    await openLockedItem(fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES }).client, USER_ID, ITEM_ID).catch(() => {})

    const notFull = fakeClient({ rpc: { locked_item_open: { data: { ok: false, error: 'not_full', required: 100, filled: 60 }, error: null } } })
    await openLockedItem(notFull.client, USER_ID, ITEM_ID).catch(() => {})

    const broken = fakeClient({ rpc: { locked_item_open: { data: { ok: true }, error: null } } })
    await openLockedItem(broken.client, USER_ID, ITEM_ID).catch(() => {})

    expect(feedMock).not.toHaveBeenCalled()
  })

  it('같은 개체를 다시 열려 하면(두 번째는 not_locked) 피드가 두 번 올라가지 않는다', async () => {
    const first = fakeClient({ rpc: { locked_item_open: { data: OPEN_OK, error: null } }, tables: INFO_TABLES })
    await openLockedItem(first.client, USER_ID, ITEM_ID)

    const second = fakeClient({ rpc: { locked_item_open: { data: { ok: false, error: 'not_locked' }, error: null } }, tables: INFO_TABLES })
    await expect(openLockedItem(second.client, USER_ID, ITEM_ID)).rejects.toMatchObject({ code: 'not_locked' })

    expect(feedMock).toHaveBeenCalledTimes(1)
  })

  it('채우기는 피드를 올리지 않는다', async () => {
    const { client } = fakeClient({ rpc: { locked_item_fill: { data: FILL_OK, error: null } } })

    await fillLockedItem(client, USER_ID, ITEM_ID)

    expect(feedMock).not.toHaveBeenCalled()
  })
})

const ITEM_ROW = {
  id: ITEM_ID,
  inventory_id: 'inv-1',
  locked: true,
  unlock_required: 100,
  unlock_filled: 60,
  destroyed_at: null,
  dropped_at: null,
}

function statusTables(overrides: Partial<Record<string, Result>> = {}): Record<string, Result> {
  return {
    inventory_items: { data: ITEM_ROW, error: null },
    inventory: { data: { user_id: USER_ID }, error: null },
    jam_wallets: { data: { balance: 45 }, error: null },
    ...overrides,
  }
}

describe('getLockedItemStatus', () => {
  it('덜 찬 개체는 남은 양과 열 수 없음을 싣고, 개체 정보 표는 읽지 않는다', async () => {
    const { client, reads } = fakeClient({ tables: statusTables() })

    const status = await getLockedItemStatus(client, USER_ID, ITEM_ID)

    expect(status).toEqual({ itemId: ITEM_ID, locked: true, required: 100, filled: 60, remaining: 40, balance: 45, openable: false })
    expect(reads).toEqual(['inventory_items', 'inventory', 'jam_wallets'])
    expect(reads).not.toContain('badges')
  })

  it('다 채운 잠긴 개체는 열 수 있다(인벤토리 빈칸은 보지 않는다)', async () => {
    const { client, reads } = fakeClient({ tables: statusTables({ inventory_items: { data: { ...ITEM_ROW, unlock_filled: 100 }, error: null } }) })

    const status = await getLockedItemStatus(client, USER_ID, ITEM_ID)

    expect(status).toMatchObject({ filled: 100, remaining: 0, openable: true })
    expect(reads).toEqual(['inventory_items', 'inventory', 'jam_wallets'])
  })

  it('이미 열린 개체는 가득 차 있어도 열 수 있다고 하지 않는다', async () => {
    const { client } = fakeClient({
      tables: statusTables({ inventory_items: { data: { ...ITEM_ROW, locked: false, unlock_filled: 100 }, error: null } }),
    })

    expect(await getLockedItemStatus(client, USER_ID, ITEM_ID)).toMatchObject({ locked: false, openable: false })
  })

  it('필요량이 없는 개체는 남은 양 0이고 열 수 없다', async () => {
    const { client } = fakeClient({
      tables: statusTables({ inventory_items: { data: { ...ITEM_ROW, locked: false, unlock_required: null, unlock_filled: 0 }, error: null } }),
    })

    expect(await getLockedItemStatus(client, USER_ID, ITEM_ID)).toMatchObject({ required: null, remaining: 0, openable: false })
  })

  it('지갑 행이 없으면 잔액 0이다', async () => {
    const { client } = fakeClient({ tables: statusTables({ jam_wallets: { data: null, error: null } }) })

    expect((await getLockedItemStatus(client, USER_ID, ITEM_ID)).balance).toBe(0)
  })

  it.each([
    ['개체 없음', { inventory_items: { data: null, error: null } }],
    ['인벤토리에서 빠진 개체', { inventory_items: { data: { ...ITEM_ROW, inventory_id: null }, error: null } }],
    ['버려진 개체', { inventory_items: { data: { ...ITEM_ROW, destroyed_at: '2026-10-18T00:00:00Z' }, error: null } }],
    ['드랍된 개체', { inventory_items: { data: { ...ITEM_ROW, dropped_at: '2026-10-18T00:00:00Z' }, error: null } }],
    ['남의 개체', { inventory: { data: { user_id: 'other-user' }, error: null } }],
    ['인벤토리 행 없음', { inventory: { data: null, error: null } }],
  ])('%s는 item_not_found다', async (_label, overrides) => {
    const { client } = fakeClient({ tables: statusTables(overrides) })

    const err = await getLockedItemStatus(client, USER_ID, ITEM_ID).catch((e) => e)

    expect(err).toBeInstanceOf(LockedItemError)
    expect(err.code).toBe('item_not_found')
  })

  it('조회 오류는 던진다', async () => {
    await expect(
      getLockedItemStatus(fakeClient({ tables: statusTables({ inventory_items: { data: null, error: { message: 'down' } } }) }).client, USER_ID, ITEM_ID)
    ).rejects.toThrow('inventory_items 조회 실패')
    await expect(
      getLockedItemStatus(fakeClient({ tables: statusTables({ inventory: { data: null, error: { message: 'down' } } }) }).client, USER_ID, ITEM_ID)
    ).rejects.toThrow('inventory 조회 실패')
    await expect(
      getLockedItemStatus(fakeClient({ tables: statusTables({ jam_wallets: { data: null, error: { message: 'down' } } }) }).client, USER_ID, ITEM_ID)
    ).rejects.toThrow('jam_wallets 조회 실패')
  })

  it('이용 정지 확인을 하지 않는다(내 상태 보기)', async () => {
    const { client } = fakeClient({ tables: statusTables() })

    await getLockedItemStatus(client, USER_ID, ITEM_ID)

    expect(assertNotSuspendedMock).not.toHaveBeenCalled()
  })
})

// ── 클라이언트·서버 경계 ────────────────────────────────────────────────────────────────
const srcRoot = fileURLToPath(new URL('../../../', import.meta.url))
const dsRoot = join(srcRoot, '../design-system')
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']

function resolveLocal(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(srcRoot, spec.slice(2))
  else if (spec.startsWith('@ds/')) base = join(dsRoot, spec.slice(4))
  else if (spec.startsWith('.')) base = join(dirname(from), spec)
  else return null
  for (const ext of EXTENSIONS) {
    const candidate = base + ext
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

function specifiersOf(source: string): string[] {
  const out: string[] = []
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) out.push(match[1])
  return out
}

// 'use client' 파일 약 300개가 같은 파일을 공유하므로 파일별 로컬 import 목록을 한 번만 만든다.
// 진입점마다 다시 읽으면 전체 실행의 부하에서 5초 제한을 넘겼다(티켓 20261021_1019).
const localImportsCache = new Map<string, string[]>()

function crawl(entry: string): Set<string> {
  const files = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (files.has(file)) continue
    files.add(file)
    const found = localImportsCache.get(file) ?? specifiersOf(readFileSync(file, 'utf8')).flatMap((spec) => resolveLocal(file, spec) ?? [])
    localImportsCache.set(file, found)
    queue.push(...found)
  }
  return files
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

describe('클라이언트·서버 경계', () => {
  it('계약 파일은 아무것도 가져오지 않는다', () => {
    const contract = join(srcRoot, 'lib/inventory/lockedItemFill-contract.ts')
    expect(specifiersOf(readFileSync(contract, 'utf8'))).toEqual([])
  })

  it("'use client' 파일의 사슬에 lockedItemFill.ts(서버 전용)가 없다", () => {
    const clientFiles = walk(srcRoot).filter((file) => /^\s*['"]use client['"]/m.test(readFileSync(file, 'utf8')))
    expect(clientFiles.length, '크롤러가 클라이언트 파일을 찾지 못했다').toBeGreaterThan(0)

    for (const entry of clientFiles) {
      for (const file of crawl(entry)) {
        expect(file.replace(srcRoot, 'src/'), `${entry.replace(srcRoot, 'src/')}가 서버 전용 잠긴 개체 모듈을 끌어온다`).not.toMatch(
          /lib\/inventory\/lockedItemFill\.ts$/
        )
      }
    }
  })
})

// ── 열기 전 가림(7.3절) — 소스 검색 경계 ─────────────────────────────────────────────────
describe('열기 전에는 개체를 알 수 있는 값을 읽지도 싣지도 않는다(소스 검색)', () => {
  const source = readFileSync(join(srcRoot, 'lib/inventory/lockedItemFill.ts'), 'utf8')

  /** `export async function <name>` 시작부터 다음 `export`·`async function` 직전까지 */
  function bodyOf(name: string): string {
    const start = source.indexOf(`async function ${name}`)
    expect(start, `${name}을 찾지 못했다`).toBeGreaterThanOrEqual(0)
    const rest = source.slice(start + 1)
    const next = rest.search(/\n(?:export )?async function /)
    return next === -1 ? rest : rest.slice(0, next)
  }

  it('조회(getLockedItemStatus)는 badges·item_books·tribes 표를 읽지 않고 일련번호·배지 칸을 고르지 않는다', () => {
    const body = bodyOf('getLockedItemStatus')
    expect(body).not.toMatch(/from\(\s*['"](badges|item_books|tribes)['"]/)
    expect(body).not.toMatch(/serial_number|badge_id|image_url|description/)
  })

  it('채우기(fillLockedItem)는 개체 정보 표를 읽지 않고 RPC 응답의 개체 값을 옮기지 않는다', () => {
    const body = bodyOf('fillLockedItem')
    expect(body).not.toMatch(/from\(\s*['"](badges|item_books|tribes)['"]/)
    expect(body).not.toMatch(/serialNumber|badgeId/)
  })

  it('개체 정보 조회(loadOpenedInfo)는 열기 성공 뒤 한 곳에서만 불린다', () => {
    const calls = [...source.matchAll(/loadOpenedInfo\(/g)]
    // 정의 1회 + 열기 안의 호출 1회
    expect(calls.length).toBe(2)
    const openBody = bodyOf('openLockedItem')
    expect(openBody.indexOf('throwRejection')).toBeLessThan(openBody.indexOf('loadOpenedInfo'))
  })
})
