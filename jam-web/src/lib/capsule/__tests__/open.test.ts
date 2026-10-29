/**
 * lib/capsule/open — 캡슐 열기 (티켓 20261018_0052 2회)
 *
 * 고정하는 것:
 * - 순서: 이용 정지 확인 → 캡슐 상태·빈칸 사전 확인 → (조회·추첨) → RPC `capsule_open`. 정지·다 채우지 못함·빈칸 모자람·트라이브 없음은
 *   **추첨 난수를 쓰기 전에** 막고 RPC를 부르지 않는다. 나올 개체가 하나도 없으면 RPC를 부르지 않는다(채운 잼이 개체 없이 사라지지 않게).
 * - RPC 인자: 개체마다 badge_id·등급·처음 뽑힌 등급·잠김 여부·까닭·필요한 양. 퀘스트 전 캡슐은 첫 개체가 잠긴다.
 * - 응답: 열린 개체는 이름·그림·등급·일련번호, 잠긴 개체는 이름·그림·일련번호·badgeId 없이 등급과 필요한 양만. 다음 캡슐 필요량·채운 양.
 * - DB 거절(`not_full`·`insufficient_slots`(지금 빈칸·필요한 빈칸 포함)·`user_suspended`·`invalid_items`·`inventory_not_found`·`capsule_changed`)은 `CapsuleError`,
 *   모르는 코드·RPC 오류·해석할 수 없는 응답은 일반 오류.
 * - 후속 처리: 개체마다 `recordIssuedRewards`(활동 없음, 잠김 여부 전달, 피드 건너뜀 `skipFeed`). 잠긴 개체는 포인트에서 빠진다. 열린 개체도 피드에 올리지 않는다(운영 로직 15.3절, 티켓 20261021_1249 6-3 5회). 후속 처리가 던져도 열기는 유지된다.
 * - 챕터 점수 «캡슐 열기»(티켓 20261019_1315): 열기가 확정된 직후(`capsule_open` 다음, 후속 처리 앞) `chapter_add_score`를
 *   (capsule_open, 열기 기록 id, 1)로 한 번 부른다. 거절·추첨 전에 막힌 경우에는 부르지 않고, 같은 열기를 다시 보내도 같은 키다.
 *   점수 실패(RPC 오류·예외)와 후속 처리 실패는 열기·응답을 바꾸지 않는다.
 * - 퀘스트 완료 처리(티켓 20261021_1248): 열기가 확정된 직후 챕터 점수 다음에 `(supabase, userId)`로 한 번 부른다. 거절·추첨 전에 막힌 경우에는 부르지 않고,
 *   완료 처리가 던져도 열기와 응답은 그대로다. 응답에는 완료 배지를 싣지 않는다. 실제 판정은 `onboarding-quest/__tests__`가 고정한다(여기서는 가짜).
 * - 다른 트라이브 추첨 대상(티켓 20261021_1248): 후보 배지가 있는 트라이브만이다. 후보 없는 비활성 트라이브가 뽑혀 첫 캡슐이 열리지 않는 일이 없다.
 * - `counted` 옵션(티켓 20261028_1733 2회): RPC가 `capsule_open_counted`, 옛 점수 `chapter_add_score`는 부르지 않고, 오름이 있으면 `processChapterRise`로 잇는다.
 *   응답에 `chapterNo`·`reachedChapters`·`chapterCount`가 더해진다. `counted`가 없으면 옛 경로 그대로다.
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
const completionMock = vi.hoisted(() => vi.fn())
const riseMock = vi.hoisted(() => vi.fn())
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
vi.mock('@/lib/onboarding-quest/completion', () => ({
  recordOnboardingQuestCompletion: async (...args: unknown[]) => {
    order.calls.push('quest_completion')
    return completionMock(...args)
  },
}))
vi.mock('@/lib/chapter/rise', () => ({
  processChapterRise: async (...args: unknown[]) => {
    order.calls.push('rise')
    return riseMock(...args)
  },
}))
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
  /** 챕터 점수 RPC의 결과. 생략하면 정상 응답이다 */
  score?: Result
  /** 챕터 점수 RPC가 예외를 던진다 */
  scoreThrows?: boolean
  tribeId?: string | null
  tribes?: string[]
  /** 컬렉션(item_books)이 있는 트라이브. 생략하면 `tribes` 전체. 여기에 없는 트라이브는 후보 배지가 하나도 없는 비활성 트라이브다 */
  bookTribes?: string[]
  userError?: unknown
  stateRow?: unknown
}

function fakeClient(options: FakeOptions = {}) {
  const rpc = vi.fn(async (name: string, args: unknown) => {
    order.calls.push(`rpc:${name}`)
    if (name === 'chapter_add_score') {
      if (options.scoreThrows) throw new Error('score network down')
      return options.score ?? { data: [{ score_added: 20, current_chapter: null, reached_chapters: [] }], error: null }
    }
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
            data: (options.bookTribes ?? options.tribes ?? ['A']).map((t) => ({
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
  completionMock.mockReset()
  completionMock.mockResolvedValue(null)
  riseMock.mockReset()
  riseMock.mockResolvedValue(undefined)
  badgesRef.rows = [mkBadge('common'), mkBadge('epic')]
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('openCapsule — 성공', () => {
  it('정지 확인, 상태 확인, 조회, RPC 순서로 부르고 개체·다음 캡슐을 응답에 채운다', async () => {
    const { client, rpc } = fakeClient({ rpc: OK_RPC })

    const payload = await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    // 열기가 확정된 직후 남은 칸 알림을 검사한다(티켓 20261018_0056)
    // 챕터 점수는 열기 확정 직후, 후속 처리 앞이다(티켓 20261019_1315). 퀘스트 완료 처리는 점수 바로 다음이다(티켓 20261021_1248)
    expect(order.calls).toEqual([
      'assertNotSuspended',
      'getCapsuleState',
      'badges',
      'rpc:capsule_open',
      'rpc:chapter_add_score',
      'quest_completion',
      'rpc:inventory_slot_alert_step',
    ])
    expect(rpc).toHaveBeenCalledWith('inventory_slot_alert_step', { p_user_id: USER_ID })
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
  it.each(['user_suspended', 'not_full', 'invalid_items', 'inventory_not_found', 'capsule_changed'] as const)('DB 거절 %s를 CapsuleError로 바꾼다', async (code) => {
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
    // 열리지 않았으니 남은 칸 알림도 검사하지 않는다(티켓 20261018_0056)
    expect(order.calls).not.toContain('rpc:inventory_slot_alert_step')
    // 챕터 점수도 세지 않는다(티켓 20261019_1315)
    expect(order.calls).not.toContain('rpc:chapter_add_score')
    // 퀘스트 완료 처리도 부르지 않는다(티켓 20261021_1248)
    expect(completionMock).not.toHaveBeenCalled()
  })
})

describe('openCapsule — 후속 처리', () => {
  it('개체마다 활동 없이 후속 처리를 부르고, 잠긴 개체는 포인트에서 빠진다', async () => {
    const { client } = fakeClient({ rpc: OK_RPC })

    await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    expect(followUpMock).toHaveBeenCalledTimes(2)
    expect(followUpMock.mock.calls[0][0]).toMatchObject({ userId: USER_ID, stravaId: null, startDate: null, inventoryItemId: 'inv-1', locked: true })
    expect(followUpMock.mock.calls[1][0]).toMatchObject({ inventoryItemId: 'inv-2', locked: false, rarity: 'epic', tribeName: '트라이브-A' })
    // 잠긴 common(포인트 10)은 주지 않고, 열린 epic(포인트 50)만 준다
    expect(awardPointsMock).toHaveBeenCalledTimes(1)
    expect(awardPointsMock).toHaveBeenCalledWith(USER_ID, 50, 'badge_point_reward', { sourceBadgeId: 'badge-epic' })
  })

  it('캡슐에서 나온 아이템 배지는 열린 개체여도 피드에 올리지 않는다(운영 로직 15.3절) — 모든 개체의 후속 처리가 피드 건너뜀을 켠다', async () => {
    const { client } = fakeClient({ rpc: OK_RPC })

    await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    expect(followUpMock.mock.calls.every(([input]) => (input as { skipFeed?: boolean }).skipFeed === true)).toBe(true)
    expect(feedMock).not.toHaveBeenCalled()
    // 포인트는 그대로 준다
    expect(awardPointsMock).toHaveBeenCalledWith(USER_ID, 50, 'badge_point_reward', { sourceBadgeId: 'badge-epic' })
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

describe('openCapsule — 챕터 점수 «캡슐 열기» (티켓 20261019_1315)', () => {
  const SCORE_CALL = ['chapter_add_score', { p_user_id: USER_ID, p_activity_kind: 'capsule_open', p_source_id: 'open-1', p_amount: 1 }] as const

  it('열기가 확정되면 열기 기록 id를 원천으로 한 번 센다(날짜는 보내지 않는다)', async () => {
    const { client, rpc } = fakeClient({ rpc: OK_RPC })

    await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    const scoreCalls = rpc.mock.calls.filter(([name]) => name === 'chapter_add_score')
    expect(scoreCalls).toHaveLength(1)
    expect(scoreCalls[0]).toEqual(SCORE_CALL)
    expect(Object.keys(scoreCalls[0][1] as object)).not.toContain('p_occurred_on')
  })

  it('점수는 후속 처리(recordIssuedRewards)보다 먼저 센다 — 후속 처리가 던져도 점수는 이미 들어갔다', async () => {
    followUpMock.mockImplementation(async () => {
      order.calls.push('followUp')
      throw new Error('포인트 서버 다운')
    })
    const { client } = fakeClient({ rpc: OK_RPC })

    await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    expect(order.calls.indexOf('rpc:chapter_add_score')).toBeGreaterThan(order.calls.indexOf('rpc:capsule_open'))
    expect(order.calls.indexOf('rpc:chapter_add_score')).toBeLessThan(order.calls.indexOf('followUp'))
  })

  it('같은 열기(같은 열기 기록 id)를 다시 보내도 같은 (활동 종류, 원천 id)다', async () => {
    const { client, rpc } = fakeClient({ rpc: OK_RPC })

    await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })
    await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    const scoreCalls = rpc.mock.calls.filter(([name]) => name === 'chapter_add_score')
    expect(scoreCalls).toHaveLength(2)
    expect(scoreCalls[1]).toEqual(scoreCalls[0])
  })

  it('추첨 전에 막히거나 DB가 거절한 열기는 점수를 세지 않는다', async () => {
    assertNotSuspendedMock.mockRejectedValueOnce(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-18T00:00:00Z' }))
    const suspended = fakeClient({ rpc: OK_RPC })
    await openCapsule(suspended.client, USER_ID, { rand: seq() }).catch(() => {})

    const rejected = fakeClient({ rpc: { data: { ok: false, error: 'not_full' }, error: null } })
    await openCapsule(rejected.client, USER_ID, { rand: seq(...TWO_ITEMS) }).catch(() => {})

    for (const { rpc } of [suspended, rejected]) {
      expect(rpc.mock.calls.map(([name]) => name)).not.toContain('chapter_add_score')
    }
  })

  it('점수 RPC가 오류를 돌려줘도 열기와 응답은 그대로이고 실패를 기록한다', async () => {
    const { client } = fakeClient({ rpc: OK_RPC, score: { data: null, error: { message: 'score rpc failed' } } })

    const payload = await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    expect(payload.openId).toBe('open-1')
    expect(payload.items).toHaveLength(2)
    expect(payload.next).toEqual({ required: 120, filled: 0 })
    expect(followUpMock).toHaveBeenCalledTimes(2)
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER_ID, expect.objectContaining({ kind: 'capsule_open', sourceId: 'open-1' }))
  })

  it('점수 RPC가 예외를 던져도 열기와 응답은 그대로다', async () => {
    const { client } = fakeClient({ rpc: OK_RPC, scoreThrows: true })

    const payload = await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    expect(payload.openId).toBe('open-1')
    expect(payload.items).toHaveLength(2)
    expect(followUpMock).toHaveBeenCalledTimes(2)
  })
})

describe('openCapsule — 퀘스트 완료 처리 (티켓 20261021_1248)', () => {
  it('열기가 확정되면 (클라이언트, 유저 id)로 한 번 부르고, 점수를 센 다음이며 후속 처리보다 앞이다', async () => {
    followUpMock.mockImplementation(async () => {
      order.calls.push('followUp')
    })
    const { client } = fakeClient({ rpc: OK_RPC })

    await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    expect(completionMock).toHaveBeenCalledTimes(1)
    expect(completionMock).toHaveBeenCalledWith(client, USER_ID)
    expect(order.calls.indexOf('quest_completion')).toBeGreaterThan(order.calls.indexOf('rpc:chapter_add_score'))
    expect(order.calls.indexOf('quest_completion')).toBeLessThan(order.calls.indexOf('followUp'))
  })

  it('추첨 전에 막히거나 DB가 거절하거나 나올 개체가 없으면 부르지 않는다', async () => {
    assertNotSuspendedMock.mockRejectedValueOnce(new UserSuspendedError({ reason: '어뷰징', suspendedAt: '2026-10-18T00:00:00Z' }))
    await openCapsule(fakeClient({ rpc: OK_RPC }).client, USER_ID, { rand: seq() }).catch(() => {})

    stateMock.mockResolvedValueOnce(stateOf({ filled: 50, remaining: 60, openable: false, notOpenableReason: 'not_full' }))
    await openCapsule(fakeClient({ rpc: OK_RPC }).client, USER_ID, { rand: seq() }).catch(() => {})

    await openCapsule(fakeClient({ rpc: { data: { ok: false, error: 'not_full' }, error: null } }).client, USER_ID, { rand: seq(...TWO_ITEMS) }).catch(() => {})

    badgesRef.rows = []
    await openCapsule(fakeClient({ rpc: OK_RPC }).client, USER_ID, { rand: seq(0.5, 0.5, 0) }).catch(() => {})

    expect(completionMock).not.toHaveBeenCalled()
  })

  it('완료 처리가 던져도 열기와 응답은 그대로이고 후속 처리를 이어 하며 기록만 남긴다', async () => {
    completionMock.mockRejectedValue(new Error('퀘스트 완료 처리 장애'))
    const { client } = fakeClient({ rpc: OK_RPC })

    const payload = await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    expect(payload.openId).toBe('open-1')
    expect(payload.items).toHaveLength(2)
    expect(payload.next).toEqual({ required: 120, filled: 0 })
    expect(followUpMock).toHaveBeenCalledTimes(2)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('퀘스트 완료 처리 실패'), expect.any(Error))
  })

  it('응답에는 완료 배지를 싣지 않는다 — 완료 처리가 배지 id를 돌려줘도 응답 모양은 같다', async () => {
    completionMock.mockResolvedValue('cd20f271-9445-42cc-ac51-d8a96b25e1c3')
    const { client } = fakeClient({ rpc: OK_RPC })

    const payload = await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    expect(Object.keys(payload).sort()).toEqual(['items', 'next', 'openId'])
    expect(JSON.stringify(payload)).not.toContain('cd20f271')
  })
})

describe('openCapsule — 다른 트라이브는 후보 배지가 있는 트라이브만 (티켓 20261021_1248)', () => {
  const badgeOf = (tribe: string, rarity = 'common') => mkBadge(rarity, { id: `badge-${rarity}-${tribe}`, item_book_id: `book-${tribe}` })
  const oneItemRpc: Result = {
    data: { ok: true, openId: 'open-t', items: [{ inventoryItemId: 'inv-1', serialNumber: 1 }], next: { required: 90, filled: 0 } },
    error: null,
  }
  // 개수 0.5(1개) / 소속 확률 0.1(다른 트라이브) / 다른 트라이브 고르기 0(첫째) / common 0 / 후보 0 / 잠김 0.9(열린 채)
  const OTHER_TRIBE_FIRST = [0.5, 0.1, 0, 0, 0, 0.9]

  it('후보 배지가 없는 비활성 트라이브만 «다른 트라이브»로 남아 있어도 소속 트라이브로 열린다 — 개체가 비지 않는다', async () => {
    badgesRef.rows = [badgeOf('A')]
    const { client, rpc } = fakeClient({ rpc: oneItemRpc, tribes: ['A', 'B', 'C'], bookTribes: ['A'] })

    // 좁히지 않으면 0이 «다른 트라이브 가운데 첫째» = B(후보 없음)로 가서 개체가 비고 열리지 않았다
    const payload = await openCapsule(client, USER_ID, { rand: seq(0.5, 0.1, 0, 0, 0.9) })

    const items = (rpc.mock.calls.find(([name]) => name === 'capsule_open')?.[1] as { p_items: Array<Record<string, unknown>> }).p_items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ badge_id: 'badge-common-A' })
    expect(payload.openId).toBe('open-t')
  })

  it('후보가 있는 다른 트라이브는 그대로 뽑힌다 — 활성 트라이브 사이의 고르기는 달라지지 않는다', async () => {
    badgesRef.rows = [badgeOf('A'), badgeOf('B'), badgeOf('C')]
    const { client, rpc } = fakeClient({ rpc: oneItemRpc, tribes: ['A', 'B', 'C', 'D'], bookTribes: ['A', 'B', 'C'] })

    await openCapsule(client, USER_ID, { rand: seq(...OTHER_TRIBE_FIRST) })
    // 다른 트라이브는 B, C 둘(D는 후보 없음으로 빠졌다) — 0.99는 마지막(C)
    await openCapsule(client, USER_ID, { rand: seq(0.5, 0.1, 0.99, 0, 0, 0.9) })

    const picked = rpc.mock.calls
      .filter(([name]) => name === 'capsule_open')
      .map(([, args]) => (args as { p_items: Array<{ badge_id: string }> }).p_items[0].badge_id)
    expect(picked).toEqual(['badge-common-B', 'badge-common-C'])
  })

  it('소속 트라이브는 후보가 없어도 대상에서 빠지지 않는다 — 다른 트라이브만 후보가 있으면 그쪽에서 나온다', async () => {
    badgesRef.rows = [badgeOf('B')]
    const { client, rpc } = fakeClient({ rpc: oneItemRpc, tribes: ['A', 'B'], bookTribes: ['B'] })

    await openCapsule(client, USER_ID, { rand: seq(...OTHER_TRIBE_FIRST) })

    const items = (rpc.mock.calls.find(([name]) => name === 'capsule_open')?.[1] as { p_items: Array<Record<string, unknown>> }).p_items
    expect(items[0]).toMatchObject({ badge_id: 'badge-common-B' })
  })

  it('후속 처리의 트라이브 이름은 전체 트라이브 표에서 찾는다(좁히기가 이름 조회를 줄이지 않는다)', async () => {
    badgesRef.rows = [badgeOf('B')]
    const { client } = fakeClient({ rpc: oneItemRpc, tribes: ['A', 'B', 'C'], bookTribes: ['B'] })

    await openCapsule(client, USER_ID, { rand: seq(...OTHER_TRIBE_FIRST) })

    expect(followUpMock.mock.calls[0][0]).toMatchObject({ tribeName: '트라이브-B' })
  })
})

describe('openCapsule — counted 옵션 (티켓 20261028_1733 2회)', () => {
  const countedRpc = (extra: Record<string, unknown>): Result => ({
    data: { ...(OK_RPC.data as Record<string, unknown>), ...extra },
    error: null,
  })

  it('RPC는 capsule_open_counted이고 옛 capsule_open·점수 chapter_add_score는 부르지 않는다', async () => {
    const { client, rpc } = fakeClient({ rpc: countedRpc({ chapterNo: 3, reachedChapters: [], chapterCount: 2 }) })

    await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS), counted: true })

    const names = rpc.mock.calls.map(([name]) => name)
    expect(names).toContain('capsule_open_counted')
    expect(names).not.toContain('capsule_open')
    expect(names).not.toContain('chapter_add_score')
    expect(rpc).toHaveBeenCalledWith('capsule_open_counted', expect.objectContaining({ p_user_id: USER_ID }))
  })

  it('오름이 없으면 오름 처리에 빈 목록을 넘기고, 응답에 챕터 횟수 정보를 더한다', async () => {
    const { client } = fakeClient({ rpc: countedRpc({ chapterNo: 3, reachedChapters: [], chapterCount: 2 }) })

    const payload = await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS), counted: true })

    expect(riseMock).toHaveBeenCalledWith({ userId: USER_ID, reachedChapters: [] })
    expect(payload).toMatchObject({ openId: 'open-1', next: { required: 120, filled: 0 }, chapterNo: 3, reachedChapters: [], chapterCount: 2 })
  })

  it('챕터가 올랐으면 오른 챕터를 오름 처리에 넘긴다 — 열기 확정 뒤, 퀘스트 완료·후속 처리보다 앞이다', async () => {
    followUpMock.mockImplementation(async () => {
      order.calls.push('followUp')
    })
    const { client } = fakeClient({ rpc: countedRpc({ chapterNo: 3, reachedChapters: [4], chapterCount: 0 }) })

    const payload = await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS), counted: true })

    expect(riseMock).toHaveBeenCalledTimes(1)
    expect(riseMock).toHaveBeenCalledWith({ userId: USER_ID, reachedChapters: [4] })
    expect(payload).toMatchObject({ chapterNo: 3, reachedChapters: [4], chapterCount: 0 })
    expect(order.calls.indexOf('rise')).toBeGreaterThan(order.calls.indexOf('rpc:capsule_open_counted'))
    expect(order.calls.indexOf('rise')).toBeLessThan(order.calls.indexOf('quest_completion'))
    expect(order.calls.indexOf('rise')).toBeLessThan(order.calls.indexOf('followUp'))
  })

  it('퀘스트 전 캡슐은 센 게 없다 — chapterNo·chapterCount는 null이고 모양이 틀린 값은 걸러 낸다', async () => {
    stateMock.mockResolvedValue(stateOf({ required: 5, filled: 5 }, null))
    const { client } = fakeClient({ rpc: countedRpc({ chapterNo: null, reachedChapters: [0, 'x', 2.5, 5], chapterCount: null }) })

    const payload = await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS), counted: true })

    expect(payload).toMatchObject({ chapterNo: null, reachedChapters: [5], chapterCount: null })
  })

  it('counted 응답 필드가 없어도 열기는 유지된다(빈 값으로 읽는다)', async () => {
    const { client } = fakeClient({ rpc: OK_RPC })

    const payload = await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS), counted: true })

    expect(payload).toMatchObject({ chapterNo: null, reachedChapters: [], chapterCount: null })
  })

  it('DB가 거절하면 CapsuleError이고 오름 처리를 하지 않는다. RPC 오류 문구에는 counted 함수 이름이 쓰인다', async () => {
    const rejected = fakeClient({ rpc: { data: { ok: false, error: 'not_full' }, error: null } })
    const error = await openCapsule(rejected.client, USER_ID, { rand: seq(...TWO_ITEMS), counted: true }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CapsuleError)
    expect((error as CapsuleError).code).toBe('not_full')

    const broken = fakeClient({ rpc: { data: null, error: { message: 'boom' } } })
    await expect(openCapsule(broken.client, USER_ID, { rand: seq(...TWO_ITEMS), counted: true })).rejects.toThrow('capsule_open_counted RPC 오류: boom')

    expect(riseMock).not.toHaveBeenCalled()
  })

  it('counted를 켜지 않으면 응답에 챕터 정보가 없고 오름 처리는 점수 경로를 거친다(옛 경로 그대로)', async () => {
    const { client, rpc } = fakeClient({ rpc: OK_RPC })

    const payload = await openCapsule(client, USER_ID, { rand: seq(...TWO_ITEMS) })

    expect(Object.keys(payload).sort()).toEqual(['items', 'next', 'openId'])
    expect(rpc.mock.calls.map(([name]) => name)).toContain('chapter_add_score')
    expect(riseMock).not.toHaveBeenCalled()
  })
})
