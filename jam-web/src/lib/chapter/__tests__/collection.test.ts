/**
 * lib/chapter/collection — 챕터 점수 «컬렉션 완성» (티켓 20261019_1315 3회, 사용자 결정 4)
 *
 * 고정하는 것:
 * - 원천 id는 (유저, 컬렉션, 등급)으로 만든 결정적 id다. 같은 완성을 다시 보내도 같고, 유저·컬렉션·등급이 다르면 달라진다.
 * - 등급형이 아닌 컬렉션(옛 컬렉션)은 등급 `common`으로 센다. 나중에 등급형이 되어 common 등급을 완성해도 같은 (kind, 원천 id)라 이중 가산이 없다.
 * - 등급 값이 common·rare·epic·mystic이 아니면 다른 등급으로 대신 세지 않고 점수 없이 `chapter_score_failed`로 남긴다.
 * - 장착 라우트용 `awardSlotCollectionScore`: 등급형은 `completed_tier`가 있을 때만, 옛 컬렉션은 장착 전에 완성 기록이 없었고 장착 후에는 있을 때만 센다.
 *   이미 완성한 유저의 재장착(소급)은 세지 않고, 완성 기록을 읽지 못하면 세지 않은 채 기록한다.
 * - 피드(티켓 20261021_1249 6-3 5회): 이 함수가 «이번에 새로 완성한 등급»의 합류점이라 `collection_tier_completed` 피드를 같은 자리에서 한 건 기록한다. 메타는 컬렉션 id·이름·등급(`rarity`)뿐이고
 *   `level`·`earn_count` 키와 활동 id를 싣지 않는다. 점수보다 먼저 기록하고(챕터 오름 피드가 위로 오게), 점수가 실패해도 기록한다. 등급이 알려진 값이 아니거나 컬렉션 id·이름이 비면 기록하지 않는다.
 *   이미 완성한 유저의 재장착은 호출부(`awardSlotCollectionScore`)가 걸러 기록하지 않는다.
 * - 던지지 않는다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트만 쓴다. 라우트·동기화 보정과의 연결은 각 호출부 시험이 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/collection.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const logMock = vi.hoisted(() => vi.fn())
const recordFeedEventMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))
vi.mock('@/lib/activity-feed', () => ({ recordFeedEvent: (...args: unknown[]) => recordFeedEventMock(...args) }))

import {
  LEGACY_COLLECTION_TIER,
  awardCollectionCompleteScore,
  awardSlotCollectionScore,
  collectionCompleteSourceId,
  hasLegacyCollectionCompletion,
  isChapterCollectionTier,
} from '../collection'
import { deterministicSourceId } from '../source-id'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER_USER = '99999999-9999-4999-8999-999999999999'
const BOOK = '44444444-4444-4444-8444-444444444444'
const OTHER_BOOK = '55555555-5555-4555-8555-555555555555'

const OK_ROW = { score_added: 100, current_chapter: null, reached_chapters: [] }

interface FakeOptions {
  /** `user_item_book_completions` 조회 결과를 호출마다 차례로 돌려준다. 'error'면 조회 오류 */
  completionReads?: (boolean | 'error' | 'throw')[]
  rpcResult?: { data: unknown; error: unknown }
  /** `item_books` 이름 조회 결과. 생략하면 BOOK_NAME. null이면 없는 컬렉션, 'error'면 조회 오류, 'throw'면 예외 */
  bookName?: string | null | 'error' | 'throw'
}

const BOOK_NAME = '한강 컬렉션'

function fakeClient(opts: FakeOptions = {}) {
  const reads = [...(opts.completionReads ?? [])]
  const rpc = vi.fn(async () => opts.rpcResult ?? { data: [OK_ROW], error: null })
  const from = vi.fn((table: string) => {
    if (table === 'item_books') {
      const bookBuilder = {
        select: () => bookBuilder,
        eq: () => bookBuilder,
        maybeSingle: async () => {
          if (opts.bookName === 'throw') throw new Error('이름 조회 예외')
          if (opts.bookName === 'error') return { data: null, error: { message: '이름 조회 장애' } }
          if (opts.bookName === null) return { data: null, error: null }
          return { data: { name: opts.bookName ?? BOOK_NAME }, error: null }
        },
      }
      return bookBuilder
    }
    if (table !== 'user_item_book_completions') throw new Error(`예상하지 못한 테이블: ${table}`)
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => {
        const next = reads.shift()
        if (next === 'throw') throw new Error('조회 예외')
        if (next === 'error') return { data: null, error: { message: '조회 장애' } }
        return { data: next ? { item_book_id: BOOK } : null, error: null }
      },
    }
    return builder
  })
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from }
}

function rpcCalls(rpc: ReturnType<typeof fakeClient>['rpc']) {
  return rpc.mock.calls as unknown as [string, Record<string, unknown>][]
}

beforeEach(() => {
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  recordFeedEventMock.mockReset()
  recordFeedEventMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

/** 컬렉션 이름 조회(`item_books`)를 뺀 표 조회 호출 — 완성 기록(`user_item_book_completions`) 조회만 남긴다 */
function completionReadTables(from: ReturnType<typeof fakeClient>['from']): string[] {
  return (from.mock.calls as unknown as [string][]).map(([table]) => table).filter((table) => table !== 'item_books')
}

describe('collectionCompleteSourceId — (유저, 컬렉션, 등급) 결정적 id', () => {
  it('같은 입력이면 항상 같고 UUID 모양이다', () => {
    const a = collectionCompleteSourceId(USER, BOOK, 'common')
    expect(collectionCompleteSourceId(USER, BOOK, 'common')).toBe(a)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(a).toBe(deterministicSourceId('collection_complete', USER, BOOK, 'common'))
  })

  it('유저·컬렉션·등급이 다르면 모두 다르다', () => {
    const keys = [
      collectionCompleteSourceId(USER, BOOK, 'common'),
      collectionCompleteSourceId(OTHER_USER, BOOK, 'common'),
      collectionCompleteSourceId(USER, OTHER_BOOK, 'common'),
      collectionCompleteSourceId(USER, BOOK, 'rare'),
      collectionCompleteSourceId(USER, BOOK, 'epic'),
      collectionCompleteSourceId(USER, BOOK, 'mystic'),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('다른 용도의 결정적 id(배지 받기)와 겹치지 않는다', () => {
    expect(collectionCompleteSourceId(USER, BOOK, 'common')).not.toBe(deterministicSourceId('badge_receive', USER, BOOK, 'common'))
    expect(collectionCompleteSourceId(USER, BOOK, 'common')).not.toBe(deterministicSourceId('badge_receive', USER, BOOK))
  })
})

describe('isChapterCollectionTier', () => {
  it('common·rare·epic·mystic만 등급이다', () => {
    for (const tier of ['common', 'rare', 'epic', 'mystic']) expect(isChapterCollectionTier(tier)).toBe(true)
    for (const bad of ['legendary', 'Common', '', null, undefined, 1]) expect(isChapterCollectionTier(bad)).toBe(false)
  })
})

describe('awardCollectionCompleteScore', () => {
  it.each(['common', 'rare', 'epic', 'mystic'] as const)('%s 등급은 collection_complete_%s로 (유저, 컬렉션, 등급) id를 원천 id로 센다 — 수량 1, 날짜 생략', async (tier) => {
    const { client, rpc } = fakeClient()

    const result = await awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier })

    expect(result).toMatchObject({ ok: true })
    expect(rpcCalls(rpc)).toEqual([
      [
        'chapter_add_score',
        {
          p_user_id: USER,
          p_activity_kind: `collection_complete_${tier}`,
          p_source_id: collectionCompleteSourceId(USER, BOOK, tier),
          p_amount: 1,
        },
      ],
    ])
    expect(logMock).not.toHaveBeenCalled()
  })

  it('같은 완성을 두 번 보내면 같은 (kind, 원천 id)다', async () => {
    const { client, rpc } = fakeClient()

    await awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier: 'common' })
    await awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier: 'common' })

    const [first, second] = rpcCalls(rpc)
    expect(first[1].p_activity_kind).toBe(second[1].p_activity_kind)
    expect(first[1].p_source_id).toBe(second[1].p_source_id)
  })

  it('옛 컬렉션의 common과 등급형으로 바뀐 뒤의 common은 같은 (kind, 원천 id)다 — 이중 가산이 없다', async () => {
    const { client, rpc } = fakeClient()

    // 옛 컬렉션 — 등급 값이 없어 LEGACY_COLLECTION_TIER로 센다
    await awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier: LEGACY_COLLECTION_TIER })
    // 등급형 전환 뒤 — 장착 RPC가 completed_tier 'common'을 돌려준다
    await awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier: 'common' })

    expect(LEGACY_COLLECTION_TIER).toBe('common')
    const [legacy, tiered] = rpcCalls(rpc)
    expect(legacy[1].p_activity_kind).toBe('collection_complete_common')
    expect(tiered[1].p_activity_kind).toBe(legacy[1].p_activity_kind)
    expect(tiered[1].p_source_id).toBe(legacy[1].p_source_id)
  })

  it('알려진 등급이 아니면 다른 등급으로 대신 세지 않고 점수 없이 chapter_score_failed(sourceId null)를 남긴다', async () => {
    const { client, rpc } = fakeClient()

    const result = await awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier: 'legendary' })

    expect(result).toEqual({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER, expect.objectContaining({ sourceId: null }))
  })

  it('컬렉션 id가 비면 원천 id를 만들 수 없어 던지지 않고 기록한다', async () => {
    const { client, rpc } = fakeClient()

    await expect(awardCollectionCompleteScore(client, { userId: USER, itemBookId: '', tier: 'common' })).resolves.toEqual({ ok: false })

    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER, expect.objectContaining({ kind: 'collection_complete_common', sourceId: null }))
  })

  it('점수 RPC가 오류를 내도 던지지 않고 {ok:false}다', async () => {
    const { client } = fakeClient({ rpcResult: { data: null, error: { message: '점수 장애' } } })

    await expect(awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier: 'rare' })).resolves.toEqual({ ok: false })

    expect(logMock).toHaveBeenCalledWith(
      'points',
      'chapter_score_failed',
      USER,
      expect.objectContaining({ kind: 'collection_complete_rare', sourceId: collectionCompleteSourceId(USER, BOOK, 'rare') })
    )
  })
})

describe('awardCollectionCompleteScore — 컬렉션 완성 피드 (티켓 20261021_1249 6-3 5회)', () => {
  it.each(['common', 'rare', 'epic', 'mystic'] as const)('%s 등급을 완성하면 컬렉션 id·이름·등급(rarity)만 담아 피드 한 건을 기록한다', async (tier) => {
    const { client } = fakeClient()

    await awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier })

    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
    // 인자는 (유저, 종류, 메타) 셋뿐이다 — 활동 id를 넘기지 않아 활동 묶음 카드에 섞이지 않는다
    expect(recordFeedEventMock.mock.calls[0]).toEqual([USER, 'collection_tier_completed', { collection_id: BOOK, collection_name: BOOK_NAME, rarity: tier }])
  })

  it('메타에 level·earn_count 키가 없다 — 있으면 Lv.N 칩이나 ×N 필이 잘못 붙는다', async () => {
    const { client } = fakeClient()

    await awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier: 'rare' })

    const meta = recordFeedEventMock.mock.calls[0][2] as Record<string, unknown>
    expect(Object.keys(meta).sort()).toEqual(['collection_id', 'collection_name', 'rarity'])
    expect(meta).not.toHaveProperty('level')
    expect(meta).not.toHaveProperty('earn_count')
  })

  it('컬렉션 이름의 앞뒤 공백을 지운다', async () => {
    const { client } = fakeClient({ bookName: '  한강 컬렉션  ' })

    await awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier: 'common' })

    expect(recordFeedEventMock.mock.calls[0][2]).toMatchObject({ collection_name: '한강 컬렉션' })
  })

  it('피드를 점수보다 먼저 기록한다 — 점수가 챕터를 올려 생기는 «챕터 오름» 피드가 위에 오게', async () => {
    const { client, rpc } = fakeClient()

    await awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier: 'common' })

    expect(recordFeedEventMock.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0])
  })

  it('점수 RPC가 실패해도 피드는 기록한다 — 완성은 일어났다', async () => {
    const { client } = fakeClient({ rpcResult: { data: null, error: { message: '점수 장애' } } })

    await expect(awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier: 'common' })).resolves.toEqual({ ok: false })

    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
  })

  it('알려진 등급이 아니면 피드도 기록하지 않는다', async () => {
    const { client } = fakeClient()

    await awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier: 'legendary' })

    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })

  it('컬렉션 id가 비면 피드를 기록하지 않는다', async () => {
    const { client, from } = fakeClient()

    await awardCollectionCompleteScore(client, { userId: USER, itemBookId: '', tier: 'common' })

    expect(recordFeedEventMock).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it.each([
    ['없는 컬렉션', null],
    ['이름이 공백뿐', '   '],
    ['이름 조회 오류', 'error'],
    ['이름 조회 예외', 'throw'],
  ] as const)('컬렉션 이름을 얻지 못하면(%s) 이름 없는 피드를 남기지 않고, 점수는 그대로 세며, 던지지 않는다', async (_label, bookName) => {
    const { client, rpc } = fakeClient({ bookName })

    await expect(awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier: 'common' })).resolves.toMatchObject({ ok: true })

    expect(recordFeedEventMock).not.toHaveBeenCalled()
    expect(rpcCalls(rpc)).toHaveLength(1)
  })

  it('피드 기록이 던져도 점수는 그대로 세고 던지지 않는다', async () => {
    recordFeedEventMock.mockRejectedValue(new Error('피드 장애'))
    const { client, rpc } = fakeClient()

    await expect(awardCollectionCompleteScore(client, { userId: USER, itemBookId: BOOK, tier: 'common' })).resolves.toMatchObject({ ok: true })

    expect(rpcCalls(rpc)).toHaveLength(1)
  })
})

describe('hasLegacyCollectionCompletion', () => {
  it('완성 기록이 있으면 true, 없으면 false', async () => {
    expect(await hasLegacyCollectionCompletion(fakeClient({ completionReads: [true] }).client, USER, BOOK)).toBe(true)
    expect(await hasLegacyCollectionCompletion(fakeClient({ completionReads: [false] }).client, USER, BOOK)).toBe(false)
  })

  it('조회 오류·예외는 «모른다»(null)다 — 던지지 않는다', async () => {
    expect(await hasLegacyCollectionCompletion(fakeClient({ completionReads: ['error'] }).client, USER, BOOK)).toBeNull()
    expect(await hasLegacyCollectionCompletion(fakeClient({ completionReads: ['throw'] }).client, USER, BOOK)).toBeNull()
  })
})

describe('awardSlotCollectionScore — 등급형', () => {
  it('새로 완성한 등급(completed_tier)이 있으면 그 등급으로 센다 — 완성 기록을 읽지 않는다', async () => {
    const { client, rpc, from } = fakeClient()

    await awardSlotCollectionScore(client, { userId: USER, itemBookId: BOOK, tierMode: true, completedTier: 'epic', completedBefore: null })

    expect(rpcCalls(rpc)).toHaveLength(1)
    expect(rpcCalls(rpc)[0][1]).toMatchObject({ p_activity_kind: 'collection_complete_epic', p_source_id: collectionCompleteSourceId(USER, BOOK, 'epic') })
    expect(completionReadTables(from)).toEqual([])
  })

  it('새로 완성한 등급이 없으면 세지 않는다', async () => {
    const { client, rpc } = fakeClient()

    await awardSlotCollectionScore(client, { userId: USER, itemBookId: BOOK, tierMode: true, completedTier: null, completedBefore: null })

    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('옛 컬렉션용 completedBefore 값은 등급형에서 무시한다', async () => {
    const { client, rpc } = fakeClient()

    await awardSlotCollectionScore(client, { userId: USER, itemBookId: BOOK, tierMode: true, completedTier: 'rare', completedBefore: true })

    expect(rpcCalls(rpc)).toHaveLength(1)
  })
})

describe('awardSlotCollectionScore — 옛 컬렉션(tier_mode 꺼짐)', () => {
  it('장착 전에는 완성 기록이 없고 장착 후에 생겼으면 common으로 센다', async () => {
    const { client, rpc } = fakeClient({ completionReads: [true] }) // 장착 후 읽기

    await awardSlotCollectionScore(client, { userId: USER, itemBookId: BOOK, tierMode: false, completedTier: null, completedBefore: false })

    expect(rpcCalls(rpc)).toHaveLength(1)
    expect(rpcCalls(rpc)[0][1]).toMatchObject({
      p_activity_kind: 'collection_complete_common',
      p_source_id: collectionCompleteSourceId(USER, BOOK, 'common'),
    })
  })

  it('이미 완성한 유저(장착 전부터 완성 기록 있음)의 재장착은 소급 가산하지 않고 장착 후 기록도 읽지 않는다', async () => {
    const { client, rpc, from } = fakeClient({ completionReads: [true] })

    await awardSlotCollectionScore(client, { userId: USER, itemBookId: BOOK, tierMode: false, completedTier: null, completedBefore: true })

    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('장착 후에도 완성 기록이 없으면(아직 덜 채움) 세지 않는다', async () => {
    const { client, rpc } = fakeClient({ completionReads: [false] })

    await awardSlotCollectionScore(client, { userId: USER, itemBookId: BOOK, tierMode: false, completedTier: null, completedBefore: false })

    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('장착 전 기록을 읽지 못했으면(null) 소급 가산을 피하려고 세지 않고 chapter_score_failed를 남긴다', async () => {
    const { client, rpc, from } = fakeClient({ completionReads: [true] })

    await awardSlotCollectionScore(client, { userId: USER, itemBookId: BOOK, tierMode: false, completedTier: null, completedBefore: null })

    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledWith(
      'points',
      'chapter_score_failed',
      USER,
      expect.objectContaining({ kind: 'collection_complete_common', sourceId: collectionCompleteSourceId(USER, BOOK, 'common') })
    )
  })

  it('장착 후 기록을 읽지 못하면 세지 않고 chapter_score_failed를 남긴다', async () => {
    const { client, rpc } = fakeClient({ completionReads: ['error'] })

    await awardSlotCollectionScore(client, { userId: USER, itemBookId: BOOK, tierMode: false, completedTier: null, completedBefore: false })

    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith(
      'points',
      'chapter_score_failed',
      USER,
      expect.objectContaining({ kind: 'collection_complete_common' })
    )
  })

  it('점수 RPC가 예외로 거부돼도 던지지 않는다', async () => {
    const rpc = vi.fn(async () => {
      throw new Error('점수 RPC 예외')
    })
    const reads = [true]
    const client = {
      rpc,
      from: (table: string) => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () =>
            table === 'item_books'
              ? { data: { name: BOOK_NAME }, error: null }
              : { data: reads.shift() ? { item_book_id: BOOK } : null, error: null },
        }
        return builder
      },
    } as unknown as SupabaseClient

    await expect(
      awardSlotCollectionScore(client, { userId: USER, itemBookId: BOOK, tierMode: false, completedTier: null, completedBefore: false })
    ).resolves.toBeUndefined()

    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER, expect.objectContaining({ kind: 'collection_complete_common' }))
  })
})

describe('awardSlotCollectionScore — 컬렉션 완성 피드 (티켓 20261021_1249 6-3 5회)', () => {
  it('등급형: 이번에 새로 완성한 등급이 있을 때만 그 등급으로 한 건 기록한다', async () => {
    const { client } = fakeClient()

    await awardSlotCollectionScore(client, { userId: USER, itemBookId: BOOK, tierMode: true, completedTier: 'epic', completedBefore: null })
    await awardSlotCollectionScore(client, { userId: USER, itemBookId: BOOK, tierMode: true, completedTier: null, completedBefore: null })

    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
    expect(recordFeedEventMock.mock.calls[0]).toEqual([USER, 'collection_tier_completed', { collection_id: BOOK, collection_name: BOOK_NAME, rarity: 'epic' }])
  })

  it('옛 컬렉션: 장착 전에는 완성 기록이 없고 장착 후에 생겼으면 common으로 한 건 기록한다', async () => {
    const { client } = fakeClient({ completionReads: [true] })

    await awardSlotCollectionScore(client, { userId: USER, itemBookId: BOOK, tierMode: false, completedTier: null, completedBefore: false })

    expect(recordFeedEventMock).toHaveBeenCalledTimes(1)
    expect(recordFeedEventMock.mock.calls[0][2]).toMatchObject({ collection_id: BOOK, rarity: 'common' })
  })

  it('이미 완성한 유저의 재장착은 소급해서 기록하지 않는다', async () => {
    const { client } = fakeClient({ completionReads: [true] })

    await awardSlotCollectionScore(client, { userId: USER, itemBookId: BOOK, tierMode: false, completedTier: null, completedBefore: true })

    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })

  it('장착 후에도 완성 기록이 없거나, 기록을 읽지 못하면 기록하지 않는다', async () => {
    const notYet = fakeClient({ completionReads: [false] })
    await awardSlotCollectionScore(notYet.client, { userId: USER, itemBookId: BOOK, tierMode: false, completedTier: null, completedBefore: false })

    const unknownBefore = fakeClient({ completionReads: [true] })
    await awardSlotCollectionScore(unknownBefore.client, { userId: USER, itemBookId: BOOK, tierMode: false, completedTier: null, completedBefore: null })

    const unknownAfter = fakeClient({ completionReads: ['error'] })
    await awardSlotCollectionScore(unknownAfter.client, { userId: USER, itemBookId: BOOK, tierMode: false, completedTier: null, completedBefore: false })

    expect(recordFeedEventMock).not.toHaveBeenCalled()
  })
})
