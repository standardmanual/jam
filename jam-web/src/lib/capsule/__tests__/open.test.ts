/**
 * lib/capsule/open — 캡슐 열기 (티켓 20261018_0052 2회)
 *
 * 고정하는 것:
 * - 순서: 이용 정지 확인 → 캡슐 상태·빈칸 사전 확인 → (조회·추첨) → RPC `capsule_open`. 정지·다 채우지 못함·빈칸 모자람·트라이브 없음은
 *   **추첨 난수를 쓰기 전에** 막고 RPC를 부르지 않는다. 나올 개체가 하나도 없으면 RPC를 부르지 않는다(채운 잼이 개체 없이 사라지지 않게).
 * - RPC 인자: 개체마다 badge_id·등급·처음 뽑힌 등급·잠김 여부·까닭·필요한 양. 퀘스트 전 캡슐은 첫 개체가 잠긴다.
 * - 응답: 열린 개체는 이름·그림·등급·일련번호, 잠긴 개체는 이름·그림·일련번호·badgeId 없이 등급과 필요한 양만. 다음 캡슐 필요량·채운 양.
 * - DB 거절(`not_full`·`insufficient_slots`(지금 빈칸·필요한 빈칸 포함)·`user_suspended`·`invalid_items`·`inventory_not_found`)은 `CapsuleError`,
 *   모르는 코드·RPC 오류·해석할 수 없는 응답은 일반 오류.
 * - 후속 처리: 개체마다 `recordIssuedRewards`(활동 없음, 잠김 여부 전달). 잠긴 개체는 포인트·피드에서 빠진다. 후속 처리가 던져도 열기는 유지된다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트·가짜 RPC·결정적 난수만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/open.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import type { CapsuleState } from '../capsule'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const order = vi.hoisted(() => ({ calls: [] as string[] }))
const assertNotSuspendedMock = vi.hoisted(() => vi.fn())
const stateMock = vi.hoisted(() => vi.fn())
const followUpMock = vi.hoisted(() => vi.fn())
const awardPointsMock = vi.hoisted(() => vi.fn())
const feedMock = vi.hoisted(() => vi.fn())
const logMock = vi.hoisted(() => vi.fn())
const badgesRef = vi.hoisted(() => ({ rows: [] as unknown[] }))
const realFollowUp = vi.hoisted(() => ({ fn: null as null | ((...args: never[]) => unknown) }))

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
      order.calls.push('assertNotSuspended')
      return assertNotSuspendedMock(...args)
    },
  }
})
vi.mock('../capsule', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../capsule')>()
  return {
    ...actual,
    getCapsuleState: async (...args: unknown[]) => {
      order.calls.push('getCapsuleState')
      return stateMock(...args)
    },
  }
})
vi.mock('../policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../policy')>()
  return { ...actual, getCapsulePolicy: async () => actual.DEFAULT_CAPSULE_POLICY }
})
vi.mock('@/lib/jam/policy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/jam/policy')>()
  return { ...actual, getJamPolicy: async () => actual.DEFAULT_JAM_POLICY }
})
vi.mock('@/lib/db/fetchAllRows', () => ({
  fetchAllRowsIn: async () => {
    order.calls.push('badges')
    return badgesRef.rows
  },
}))
vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))
vi.mock('@/lib/points', () => ({ awardPoints: (...args: unknown[]) => awardPointsMock(...args) }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: (...args: unknown[]) => feedMock(...args) }))
vi.mock('@/lib/drop-engine/issueFollowUp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drop-engine/issueFollowUp')>()
  realFollowUp.fn = actual.recordIssuedRewards as unknown as (...args: never[]) => unknown
  return { ...actual, recordIssuedRewards: (...args: Parameters<typeof actual.recordIssuedRewards>) => followUpMock(...args) }
})

import { CapsuleError } from '../capsule'
import { openCapsule } from '../open'

type Result = { data: unknown; error: unknown }

/** select·eq·maybeSingle 어느 쪽으로 끝나도 같은 결과를 돌려주는 가짜 조회 */
function chain(result: Result) {
  const q: Record<string, unknown> = {}
  const self = () => q
  q.select = self
  q.eq = self
  q.maybeSingle = async () => result
  q.then = (resolve: (r: Result) => unknown) => resolve(result)
  return q
}

interface FakeOptions {
  rpc?: Result
  tribeId?: string | null
  tribes?: string[]
  userError?: unknown
  stateRow?: unknown
}

function fakeClient(options: FakeOptions = {}) {
  const rpc = vi.fn(async (name: string, args: unknown) => {
    order.calls.push(`rpc:${name}`)
    return options.rpc ?? { data: null, error: { message: `unexpected rpc ${name} ${JSON.stringify(args)}` } }
  })
  const reads: string[] = []
  const client = {
    rpc,
    from: (table: string) => {
      reads.push(table)
      switch (table) {
        case 'users':
          return chain({ data: { tribe_id: options.tribeId === undefined ? 'A' : options.tribeId }, error: options.userError ?? null })
        case 'tribes':
          return chain({ data: (options.tribes ?? ['A']).map((id) => ({ id, name: `트라이브-${id}` })), error: null })
        case 'item_books':
          return chain({
            data: (options.tribes ?? ['A']).map((t) => ({
              id: `book-${t}`,
              tribe_id: t,
              is_active: true,
              drop_excluded: false,
              valid_from: null,
              valid_until: null,
            })),
            error: null,
          })
        case 'user_drop_state':
          return chain({ data: options.stateRow ?? { common_streak: 0, capsule_epic_miss: 0 }, error: null })
        default:
          throw new Error(`예상하지 못한 테이블 ${table}`)
      }
    },
  } as unknown as SupabaseClient
  return { client, rpc, reads }
}

/** 정해진 값을 차례로 돌려주는 난수. 모자라면 던져 난수를 더 쓴 것을 드러낸다. */
function seq(...values: number[]) {
  let i = 0
  const rand = vi.fn(() => {
    if (i >= values.length) throw new Error('난수가 모자란다')
    return values[i++]
  })
  return rand
}

const mkBadge = (rarity: string, over: Record<string, unknown> = {}) => ({
  id: `badge-${rarity}`,
  name: `이름-${rarity}`,
  image_url: `https://img/${rarity}.png`,
  rarity,
  item_book_id: 'book-A',
  drop_excluded: false,
  valid_from: null,
  valid_until: null,
  deleted_at: null,
  point_reward: rarity === 'epic' ? 50 : 10,
  ...over,
})

const stateOf = (over: Partial<CapsuleState['status']> = {}, chapterNo: number | null = 3): CapsuleState => ({
  chapterNo,
  status: {
    required: 110,
    filled: 110,
    remaining: 0,
    balance: 0,
    openable: true,
    notOpenableReason: null,
    freeSlots: 40,
    neededSlots: 2,
    ...over,
  },
})

/** 개수 0.1(2개) / 1번째: 소속 0.5, common 0, 후보 0, 잠김 0.1(잠김) / 2번째: 소속 0.5, epic 0.95, 후보 0, 잠김 0.9(열린 채) */
const TWO_ITEMS = [0.1, 0.5, 0, 0, 0.1, 0.5, 0.95, 0, 0.9]

const OK_RPC: Result = {
  data: {
    ok: true,
    openId: 'open-1',
    itemIds: ['inv-1', 'inv-2'],
    items: [
      { inventoryItemId: 'inv-1', badgeId: 'badge-common', rarity: 'common', locked: true, serialNumber: 3 },
      { inventoryItemId: 'inv-2', badgeId: 'badge-epic', rarity: 'epic', locked: false, serialNumber: 7 },
    ],
    next: { required: 120, filled: 0 },
  },
  error: null,
}

beforeEach(() => {
  order.calls = []
  assertNotSuspendedMock.mockReset()
  assertNotSuspendedMock.mockResolvedValue(undefined)
  stateMock.mockReset()
  stateMock.mockResolvedValue(stateOf())
  followUpMock.mockReset()
  followUpMock.mockImplementation((...args: unknown[]) => (realFollowUp.fn as (...a: unknown[]) => unknown)(...args))
  awardPointsMock.mockReset()
  awardPointsMock.mockResolvedValue(undefined)
  feedMock.mockReset()
  feedMock.mockResolvedValue(undefined)
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  badgesRef.rows = [mkBadge('common'), mkBadge('epic')]
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('openCapsule — 성공', () => {
  it('정지 확인, 상태 확인, 조회, RPC 순서로 부르고 개체·다음 캡슐을 응답에 채운다', async () => {
    const { client, rpc } = fakeClient({ rpc: OK_RPC })

    const payload = await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    expect(order.calls).toEqual(['assertNotSuspended', 'getCapsuleState', 'badges', 'rpc:capsule_open'])
    expect(rpc).toHaveBeenCalledWith('capsule_open', {
      p_user_id: USER_ID,
      p_items: [
        { badge_id: 'badge-common', rarity: 'common', rolled_rarity: 'common', locked: true, lock_reason: 'rolled', unlock_required: 30 },
        { badge_id: 'badge-epic', rarity: 'epic', rolled_rarity: 'epic', locked: false, lock_reason: null, unlock_required: null },
      ],
    })
    expect(payload).toEqual({
      openId: 'open-1',
      items: [
        // 잠긴 개체: 이름·그림·일련번호·badgeId 없이 등급과 필요한 양만
        { locked: true, inventoryItemId: 'inv-1', rarity: 'common', unlockRequired: 30 },
        {
          locked: false,
          inventoryItemId: 'inv-2',
          badgeId: 'badge-epic',
          name: '이름-epic',
          imageUrl: 'https://img/epic.png',
          rarity: 'epic',
          serialNumber: 7,
        },
      ],
      next: { required: 120, filled: 0 },
    })
    expect(JSON.stringify(payload.items[0])).not.toMatch(/이름|img|badge-common|serial/)
  })

  it('퀘스트 전 캡슐(chapterNo null)은 첫 개체가 잠긴 채(필요한 양 5)로 간다', async () => {
    stateMock.mockResolvedValue(stateOf({ required: 5, filled: 5 }, null))
    const { client, rpc } = fakeClient({
      rpc: {
        data: {
          ok: true,
          openId: 'open-2',
          items: [{ inventoryItemId: 'inv-1', serialNumber: 1 }],
          next: { required: 90, filled: 0 },
        },
        error: null,
      },
    })
    // 개수 0.5(1개), 소속 0.5, epic 0.95, 후보 0 — 잠김 난수 없음
    const payload = await openCapsule(client, USER_ID, { rand: seq(0.5, 0.5, 0.95, 0) })

    const items = (rpc.mock.calls[0][1] as { p_items: Array<Record<string, unknown>> }).p_items
    expect(items[0]).toMatchObject({ badge_id: 'badge-epic', locked: true, lock_reason: 'rolled', unlock_required: 5 })
    expect(payload.items[0]).toEqual({ locked: true, inventoryItemId: 'inv-1', rarity: 'epic', unlockRequired: 5 })
  })

  it('카운터(common_streak·capsule_epic_miss)를 읽어 보정에 쓴다(epic_miss 15면 첫 개체가 Epic 이상)', async () => {
    const { client, rpc } = fakeClient({
      stateRow: { common_streak: 0, capsule_epic_miss: 15 },
      rpc: { data: { ok: true, openId: 'o', items: [{ inventoryItemId: 'inv-1' }], next: { required: 90, filled: 0 } }, error: null },
    })
    // 개수 0.5(1개), 소속 0.5, 등급 0(보정으로 epic), 후보 0, 잠김 0.9
    await openCapsule(client, USER_ID, { rand: seq(0.5, 0.5, 0, 0, 0.9) })

    const items = (rpc.mock.calls[0][1] as { p_items: Array<Record<string, unknown>> }).p_items
    expect(items[0]).toMatchObject({ rarity: 'epic' })
  })
})

describe('openCapsule — 추첨 전에 막는다', () => {
  it('이용 정지 중이면 아무것도 읽지 않고 RPC를 부르지 않는다', async () => {
    assertNotSuspendedMock.mockRejectedValue(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-18T00:00:00Z' }))
    const { client, rpc, reads } = fakeClient({ rpc: OK_RPC })
    const rand = seq()

    await expect(openCapsule(client, USER_ID, { rand })).rejects.toBeInstanceOf(UserSuspendedError)

    expect(order.calls).toEqual(['assertNotSuspended'])
    expect(rand).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(reads).toEqual([])
  })

  it('정지 여부를 읽지 못하면 그 오류를 던지고 추첨하지 않는다', async () => {
    assertNotSuspendedMock.mockRejectedValue(new Error('user_suspensions 조회 실패: down'))
    const { client, rpc } = fakeClient({ rpc: OK_RPC })
    const rand = seq()

    await expect(openCapsule(client, USER_ID, { rand })).rejects.toThrow('user_suspensions 조회 실패')
    expect(rand).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('다 채우지 못했으면 not_full이고 추첨·조회·RPC가 없다', async () => {
    stateMock.mockResolvedValue(stateOf({ filled: 50, remaining: 60, openable: false, notOpenableReason: 'not_full' }))
    const { client, rpc, reads } = fakeClient({ rpc: OK_RPC })
    const rand = seq()

    const error = (await openCapsule(client, USER_ID, { rand }).catch((e: unknown) => e)) as CapsuleError

    expect(error).toBeInstanceOf(CapsuleError)
    expect(error.code).toBe('not_full')
    expect(rand).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(reads).toEqual([])
  })

  it('빈칸이 모자라면 insufficient_slots이고 지금 빈칸·필요한 빈칸을 싣는다. 추첨·RPC는 없다', async () => {
    stateMock.mockResolvedValue(stateOf({ openable: false, notOpenableReason: 'no_free_slots', freeSlots: 1, neededSlots: 2 }))
    const { client, rpc, reads } = fakeClient({ rpc: OK_RPC })
    const rand = seq()

    const error = (await openCapsule(client, USER_ID, { rand }).catch((e: unknown) => e)) as CapsuleError

    expect(error).toBeInstanceOf(CapsuleError)
    expect(error.code).toBe('insufficient_slots')
    expect(error.freeSlots).toBe(1)
    expect(error.neededSlots).toBe(2)
    expect(rand).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(reads).toEqual([])
  })

  it('소속 트라이브가 없으면 no_tribe이고 추첨·RPC가 없다', async () => {
    const { client, rpc } = fakeClient({ rpc: OK_RPC, tribeId: null })
    const rand = seq()

    const error = (await openCapsule(client, USER_ID, { rand }).catch((e: unknown) => e)) as CapsuleError

    expect(error).toBeInstanceOf(CapsuleError)
    expect(error.code).toBe('no_tribe')
    expect(rand).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('소속 트라이브를 읽지 못하면 일반 오류다(no_tribe로 오인하지 않는다)', async () => {
    const { client, rpc } = fakeClient({ rpc: OK_RPC, userError: { message: 'down' } })

    const error = await openCapsule(client, USER_ID, { rand: seq() }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(CapsuleError)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('나올 개체 후보가 하나도 없으면 RPC를 부르지 않고 일반 오류를 던진다', async () => {
    badgesRef.rows = []
    const { client, rpc } = fakeClient({ rpc: OK_RPC })

    const error = await openCapsule(client, USER_ID, { rand: seq(0.5, 0.5, 0) }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(CapsuleError)
    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith('drop', 'drop_attempt', USER_ID, expect.objectContaining({ path: 'capsule', outcome: 'no_candidate' }))
  })
})

describe('openCapsule — DB 응답 변환', () => {
  it.each(['user_suspended', 'not_full', 'invalid_items', 'inventory_not_found'] as const)('DB 거절 %s를 CapsuleError로 바꾼다', async (code) => {
    const { client } = fakeClient({ rpc: { data: { ok: false, error: code }, error: null } })

    const error = (await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) }).catch((e: unknown) => e)) as CapsuleError

    expect(error).toBeInstanceOf(CapsuleError)
    expect(error.code).toBe(code)
  })

  it('insufficient_slots는 지금 빈칸과 필요한 빈칸을 함께 싣는다', async () => {
    const { client } = fakeClient({ rpc: { data: { ok: false, error: 'insufficient_slots', free: 0, needed: 2 }, error: null } })

    const error = (await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) }).catch((e: unknown) => e)) as CapsuleError

    expect(error.code).toBe('insufficient_slots')
    expect(error.freeSlots).toBe(0)
    expect(error.neededSlots).toBe(2)
  })

  it('RPC 오류·모르는 거절 코드·해석할 수 없는 응답은 일반 오류다', async () => {
    const cases: Result[] = [
      { data: null, error: { message: 'boom' } },
      { data: { ok: false, error: 'mystery' }, error: null },
      { data: { ok: true }, error: null },
      { data: null, error: null },
    ]
    for (const rpc of cases) {
      const error = await openCapsule(fakeClient({ rpc }).client, USER_ID, { rand: seq(...TWO_ITEMS) }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBeInstanceOf(CapsuleError)
    }
  })

  it('거절되면 후속 처리를 하지 않는다', async () => {
    const { client } = fakeClient({ rpc: { data: { ok: false, error: 'not_full' }, error: null } })

    await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) }).catch(() => {})

    expect(followUpMock).not.toHaveBeenCalled()
    expect(awardPointsMock).not.toHaveBeenCalled()
    expect(feedMock).not.toHaveBeenCalled()
  })
})

describe('openCapsule — 후속 처리', () => {
  it('개체마다 활동 없이 후속 처리를 부르고, 잠긴 개체는 포인트·피드에서 빠진다', async () => {
    const { client } = fakeClient({ rpc: OK_RPC })

    await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    expect(followUpMock).toHaveBeenCalledTimes(2)
    expect(followUpMock.mock.calls[0][0]).toMatchObject({ userId: USER_ID, stravaId: null, startDate: null, inventoryItemId: 'inv-1', locked: true })
    expect(followUpMock.mock.calls[1][0]).toMatchObject({ inventoryItemId: 'inv-2', locked: false, rarity: 'epic', tribeName: '트라이브-A' })
    // 잠긴 common(포인트 10)은 주지 않고, 열린 epic(포인트 50)만 준다
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER_ID, 50, 'badge_point_reward', { sourceBadgeId: 'badge-epic' })
    // 피드도 열린 개체만, 활동 없이
    expect(feedMock).toHaveBeenCalledTimes(1)
    expect(feedMock.mock.calls[0][2]).toMatchObject({ inventory_item_id: 'inv-2', badge_id: 'badge-epic' })
    expect(feedMock.mock.calls[0][4]).toBeNull()
  })

  it('후속 처리가 던져도 열기는 유지되고 응답이 그대로 나온다. 로그만 남긴다', async () => {
    followUpMock.mockRejectedValue(new Error('포인트 서버 다운'))
    const { client } = fakeClient({ rpc: OK_RPC })

    const payload = await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    expect(payload.openId).toBe('open-1')
    expect(payload.items).toHaveLength(2)
    expect(console.error).toHaveBeenCalled()
  })

  it('판정 로그가 던져도 열기는 유지된다', async () => {
    logMock.mockRejectedValue(new Error('로그 다운'))
    const { client } = fakeClient({ rpc: OK_RPC })

    const payload = await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    expect(payload.openId).toBe('open-1')
  })
})
