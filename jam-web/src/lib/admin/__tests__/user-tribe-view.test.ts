/**
 * 어드민 유저 상세 «트라이브» 구역이 읽는 값 (티켓 20261021_1247 3회)
 *
 * 고정하는 것
 *  - 트라이브가 있는 유저: 지금 트라이브 이름, 바꿀 수 있는 트라이브(활성이고 지금 것이 아닌 것, 표 순서 그대로), 변경 이력.
 *  - 트라이브가 없는 유저: `current`가 `{ ok: true, value: null }`이고 트라이브 표를 읽지 않는다(어드민이 지정하지 않는다). 이력은 읽는다.
 *  - 읽지 못함은 «없음»과 다르다: 트라이브 표를 읽지 못하면(오류·예외·행 없음) `current`·`options`가 `{ ok: false }`, 이력을 읽지 못하면 `history`만 `{ ok: false }`.
 *    한 구역의 실패가 다른 구역을 막지 않고, 어느 경우에도 던지지 않는다.
 *
 * DB는 메모리 스텁이다. 변경 이력 읽기 자체(`fetchTribeChangeHistory`)는 `user-tribe.test.ts`가 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/user-tribe-view.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchHistoryMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/admin/user-tribe', () => ({ fetchTribeChangeHistory: fetchHistoryMock }))

import { loadUserTribeView } from '../user-tribe-view'
import type { TribeChangeHistoryItem } from '../user-tribe'

type Row = Record<string, unknown>

const USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const T1 = '11111111-1111-4111-8111-111111111111'
const T2 = '22222222-2222-4222-8222-222222222222'
const T3 = '33333333-3333-4333-8333-333333333333'
const T4 = '44444444-4444-4444-8444-444444444444'

// 표 순서(sort_order, name)대로 돌려준다고 가정한 행들. T3은 꺼진 트라이브다
const TRIBES: Row[] = [
  { id: T1, name: '낭만 미식가', is_active: true, sort_order: 1 },
  { id: T2, name: '아스팔트 레인저', is_active: true, sort_order: 2 },
  { id: T3, name: '옛 트라이브', is_active: false, sort_order: 3 },
  { id: T4, name: '숲속의 갱단', is_active: true, sort_order: 4 },
]

const HISTORY_ITEM: TribeChangeHistoryItem = {
  id: 'c1',
  createdAt: '2026-10-21T05:30:00+00:00',
  fromTribeId: T1,
  fromTribeName: '낭만 미식가',
  toTribeId: T2,
  toTribeName: '아스팔트 레인저',
  reasonCode: 'wrong_pick',
  reasonLabel: '유저가 잘못 골랐어요',
  memo: null,
  changedByEmail: 'admin@example.com',
  cancelledMissionCount: 0,
}

/** `from('tribes').select().order().order()`만 흉내 낸다. 읽은 표 이름을 `reads`에 쌓는다 */
function createStub(opts: { tribes?: Row[]; error?: { message: string }; throws?: boolean } = {}) {
  const reads: string[] = []
  const client = {
    from: (table: string) => {
      reads.push(table)
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          if (opts.throws) return Promise.reject(new Error('연결 끊김')).then(resolve, reject)
          return Promise.resolve(
            opts.error ? { data: null, error: opts.error } : { data: opts.tribes ?? TRIBES, error: null }
          ).then(resolve, reject)
        },
      }
      return chain
    },
  }
  return { client: client as never, reads }
}

beforeEach(() => {
  fetchHistoryMock.mockReset()
  fetchHistoryMock.mockResolvedValue([HISTORY_ITEM])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadUserTribeView — 트라이브가 있는 유저', () => {
  it('지금 트라이브 이름과, 활성이고 지금 것이 아닌 트라이브를 표 순서대로 돌려준다', async () => {
    const { client, reads } = createStub()
    const view = await loadUserTribeView(client, USER, T1)

    expect(view.current).toEqual({ ok: true, value: { id: T1, name: '낭만 미식가' } })
    // T1(지금 것)과 T3(꺼진 것)이 빠진다
    expect(view.options).toEqual({
      ok: true,
      value: [
        { id: T2, name: '아스팔트 레인저' },
        { id: T4, name: '숲속의 갱단' },
      ],
    })
    expect(view.history).toEqual({ ok: true, value: [HISTORY_ITEM] })
    expect(reads).toEqual(['tribes'])
    expect(fetchHistoryMock).toHaveBeenCalledWith(client, USER)
  })

  it('지금 트라이브가 꺼진 트라이브여도 이름은 보이고, 바꿀 목록에는 활성 트라이브만 있다', async () => {
    const { client } = createStub()
    const view = await loadUserTribeView(client, USER, T3)

    expect(view.current).toEqual({ ok: true, value: { id: T3, name: '옛 트라이브' } })
    expect(view.options).toEqual({
      ok: true,
      value: [
        { id: T1, name: '낭만 미식가' },
        { id: T2, name: '아스팔트 레인저' },
        { id: T4, name: '숲속의 갱단' },
      ],
    })
  })

  it('다른 활성 트라이브가 없으면 바꿀 목록이 빈 배열이다(읽기 성공)', async () => {
    const { client } = createStub({ tribes: [TRIBES[0], TRIBES[2]] })
    const view = await loadUserTribeView(client, USER, T1)

    expect(view.options).toEqual({ ok: true, value: [] })
    expect(view.current.ok).toBe(true)
  })
})

describe('loadUserTribeView — 트라이브가 없는 유저', () => {
  it('current는 «아직 고르지 않음»(value null)이고 트라이브 표를 읽지 않는다', async () => {
    const { client, reads } = createStub()
    const view = await loadUserTribeView(client, USER, null)

    expect(view.current).toEqual({ ok: true, value: null })
    expect(view.options).toEqual({ ok: true, value: [] })
    expect(reads).toEqual([])
  })

  it('변경 이력은 읽는다(초기화로 트라이브가 비기 전의 기록이 남아 있을 수 있다)', async () => {
    const { client } = createStub()
    const view = await loadUserTribeView(client, USER, null)

    expect(view.history).toEqual({ ok: true, value: [HISTORY_ITEM] })
  })

  it('이력이 비어 있으면 «읽기 성공, 빈 목록»이다 — 읽지 못함과 다르다', async () => {
    fetchHistoryMock.mockResolvedValue([])
    const { client } = createStub()
    const view = await loadUserTribeView(client, USER, null)

    expect(view.history).toEqual({ ok: true, value: [] })
  })
})

describe('loadUserTribeView — 읽지 못함은 없음과 다르다', () => {
  it('트라이브 표 조회 오류: current·options가 읽지 못함이고, 이력은 영향이 없다', async () => {
    const { client } = createStub({ error: { message: 'boom' } })
    const view = await loadUserTribeView(client, USER, T1)

    expect(view.current).toEqual({ ok: false })
    expect(view.options).toEqual({ ok: false })
    expect(view.history.ok).toBe(true)
    expect(console.error).toHaveBeenCalled()
  })

  it('트라이브 표 조회 예외도 던지지 않고 읽지 못함이다', async () => {
    const { client } = createStub({ throws: true })
    const view = await loadUserTribeView(client, USER, T1)

    expect(view.current).toEqual({ ok: false })
    expect(view.options).toEqual({ ok: false })
  })

  it('유저의 tribe_id에 맞는 트라이브 행이 없으면 지금 트라이브는 읽지 못함이다(이름을 지어내지 않는다)', async () => {
    const { client } = createStub({ tribes: [TRIBES[1]] })
    const view = await loadUserTribeView(client, USER, T1)

    expect(view.current).toEqual({ ok: false })
    expect(view.options).toEqual({ ok: true, value: [{ id: T2, name: '아스팔트 레인저' }] })
    expect(console.error).toHaveBeenCalled()
  })

  it('이력을 읽지 못하면 history만 읽지 못함이다(던지지 않는다)', async () => {
    fetchHistoryMock.mockRejectedValue(new Error('user_tribe_changes 조회 실패: boom'))
    const { client } = createStub()
    const view = await loadUserTribeView(client, USER, T1)

    expect(view.history).toEqual({ ok: false })
    expect(view.current.ok).toBe(true)
    expect(view.options.ok).toBe(true)
    expect(console.error).toHaveBeenCalled()
  })

  it('트라이브가 없는 유저의 이력 읽기 실패도 읽지 못함이다', async () => {
    fetchHistoryMock.mockRejectedValue(new Error('boom'))
    const { client } = createStub()
    const view = await loadUserTribeView(client, USER, null)

    expect(view.history).toEqual({ ok: false })
    expect(view.current).toEqual({ ok: true, value: null })
  })
})
