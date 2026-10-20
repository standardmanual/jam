/**
 * lib/chapter/score — 챕터 점수 연결 (티켓 20261019_1315)
 *
 * 고정하는 것:
 * - `chapter_add_score`를 (유저, 활동 종류, 원천 id, 수량, 활동한 날)로 부르고 결과(센 점수·지금 챕터·오른 챕터 목록)를 돌려준다.
 *   `p_occurred_on`은 값이 없으면 키째 생략한다(null을 보내지 않는다 — DB 기본값 «오늘(KST)»을 쓰려면 생략이어야 한다).
 * - 수량 기본값은 1. 1 미만이면 DB를 부르지 않고 기록도 남기지 않는다. 정수가 아니면 부르지 않고 실패로 기록한다.
 * - 절대 던지지 않는다: RPC 오류·계약 밖 응답·예외는 `console.error`와 `engine_decision_log`(points, chapter_score_failed)에 남기고 `{ ok: false }`다.
 * - 챕터 오름 처리는 하지 않는다 — `reachedChapters`를 돌려주기만 한다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/score.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const logMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))

import { awardChapterScore } from '../score'

const USER = '11111111-1111-4111-8111-111111111111'
const SOURCE = '22222222-2222-4222-8222-222222222222'

type RpcResult = { data: unknown; error: unknown }

function fakeClient(result: RpcResult | (() => Promise<RpcResult>)) {
  const rpc = vi.fn(async () => (typeof result === 'function' ? result() : result))
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

const OK_ROW = { score_added: 20, current_chapter: 2, reached_chapters: [2] }

beforeEach(() => {
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('awardChapterScore — 성공', () => {
  it('chapter_add_score를 부르고 센 점수·지금 챕터·오른 챕터 목록을 돌려준다', async () => {
    const { client, rpc } = fakeClient({ data: [OK_ROW], error: null })

    const result = await awardChapterScore(client, { userId: USER, kind: 'capsule_open', sourceId: SOURCE })

    expect(result).toEqual({ ok: true, scoreAdded: 20, currentChapter: 2, reachedChapters: [2] })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('chapter_add_score', {
      p_user_id: USER,
      p_activity_kind: 'capsule_open',
      p_source_id: SOURCE,
      p_amount: 1,
    })
    expect(logMock).not.toHaveBeenCalled()
  })

  it('p_occurred_on은 값이 없으면 키째 생략하고, 값이 있으면 그대로 보낸다', async () => {
    const omitted = fakeClient({ data: [OK_ROW], error: null })
    await awardChapterScore(omitted.client, { userId: USER, kind: 'drop', sourceId: SOURCE })
    await awardChapterScore(omitted.client, { userId: USER, kind: 'drop', sourceId: SOURCE, occurredOn: null })
    await awardChapterScore(omitted.client, { userId: USER, kind: 'drop', sourceId: SOURCE, occurredOn: '' })
    for (const call of omitted.rpc.mock.calls as unknown as [string, Record<string, unknown>][]) {
      expect(Object.keys(call[1])).not.toContain('p_occurred_on')
    }

    const given = fakeClient({ data: [OK_ROW], error: null })
    await awardChapterScore(given.client, { userId: USER, kind: 'jam_earned', sourceId: SOURCE, amount: 90, occurredOn: '2026-09-12' })
    expect(given.rpc).toHaveBeenCalledWith('chapter_add_score', {
      p_user_id: USER,
      p_activity_kind: 'jam_earned',
      p_source_id: SOURCE,
      p_amount: 90,
      p_occurred_on: '2026-09-12',
    })
  })

  it('챕터가 아직 없으면(current_chapter null) null 그대로 돌려주고, 오른 챕터가 없으면 빈 목록이다', async () => {
    const { client } = fakeClient({ data: [{ score_added: 0, current_chapter: null, reached_chapters: [] }], error: null })

    const result = await awardChapterScore(client, { userId: USER, kind: 'pickup', sourceId: SOURCE })

    expect(result).toEqual({ ok: true, scoreAdded: 0, currentChapter: null, reachedChapters: [] })
  })

  it('챕터가 여러 단계 오르면 오른 챕터 번호를 모두 돌려준다(오름 처리는 하지 않는다)', async () => {
    const { client, rpc } = fakeClient({ data: [{ score_added: 800, current_chapter: 4, reached_chapters: [3, 4] }], error: null })

    const result = await awardChapterScore(client, { userId: USER, kind: 'collection_complete_mystic', sourceId: SOURCE })

    expect(result).toEqual({ ok: true, scoreAdded: 800, currentChapter: 4, reachedChapters: [3, 4] })
    // 챕터 오름 처리(소식·챕터 배지)는 다른 RPC·표를 건드릴 수 있지만 여기서는 점수 RPC 한 번뿐이다
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('awardChapterScore — 수량', () => {
  it.each([0, -3])('수량 %d는 DB를 부르지 않고 기록도 남기지 않는다', async (amount) => {
    const { client, rpc } = fakeClient({ data: [OK_ROW], error: null })

    const result = await awardChapterScore(client, { userId: USER, kind: 'jam_earned', sourceId: SOURCE, amount })

    expect(result).toEqual({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])('정수가 아닌 수량 %s는 DB를 부르지 않고 실패로 기록한다', async (amount) => {
    const { client, rpc } = fakeClient({ data: [OK_ROW], error: null })

    const result = await awardChapterScore(client, { userId: USER, kind: 'jam_earned', sourceId: SOURCE, amount })

    expect(result).toEqual({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER, expect.objectContaining({ kind: 'jam_earned', sourceId: SOURCE }))
  })
})

describe('awardChapterScore — 실패는 던지지 않고 기록한다', () => {
  it('RPC 오류는 { ok: false }이고 console.error와 engine_decision_log에 남는다', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'check_violation: 알 수 없는 활동 종류' } })

    const result = await awardChapterScore(client, {
      userId: USER,
      kind: 'jam_earned',
      sourceId: SOURCE,
      amount: 90,
      occurredOn: '2026-09-12',
    })

    expect(result).toEqual({ ok: false })
    expect(console.error).toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER, {
      kind: 'jam_earned',
      sourceId: SOURCE,
      amount: 90,
      occurredOn: '2026-09-12',
      error: expect.stringContaining('알 수 없는 활동 종류'),
    })
  })

  it('날짜를 보내지 않은 호출의 실패 기록은 occurredOn이 null이다', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })

    await awardChapterScore(client, { userId: USER, kind: 'locked_item_badge_open', sourceId: SOURCE })

    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER, expect.objectContaining({ amount: 1, occurredOn: null }))
  })

  it.each([
    ['null', null],
    ['빈 배열', []],
    ['배열이 아닌 객체', { score_added: 20, current_chapter: 2, reached_chapters: [2] }],
    ['센 점수가 숫자가 아님', [{ score_added: '20', current_chapter: 2, reached_chapters: [] }]],
    ['지금 챕터가 숫자도 null도 아님', [{ score_added: 20, current_chapter: '2', reached_chapters: [] }]],
    ['오른 챕터 목록이 배열이 아님', [{ score_added: 20, current_chapter: 2, reached_chapters: null }]],
    ['오른 챕터 목록에 숫자가 아닌 값', [{ score_added: 20, current_chapter: 2, reached_chapters: [2, 'x'] }]],
    ['첫 줄이 객체가 아님', [null]],
  ])('계약 밖 응답(%s)은 { ok: false }이고 기록한다', async (_label, data) => {
    const { client } = fakeClient({ data, error: null })

    const result = await awardChapterScore(client, { userId: USER, kind: 'mix_success', sourceId: SOURCE })

    expect(result).toEqual({ ok: false })
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER, expect.objectContaining({ error: expect.stringContaining('해석할 수 없는') }))
  })

  it('클라이언트가 예외를 던져도 던지지 않고 기록한다', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('network down')
    })

    await expect(awardChapterScore(client, { userId: USER, kind: 'mission_complete', sourceId: SOURCE })).resolves.toEqual({ ok: false })

    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER, expect.objectContaining({ error: expect.stringContaining('network down') }))
  })

  it('실패 기록 자체가 던져도 던지지 않는다', async () => {
    logMock.mockRejectedValue(new Error('로그 다운'))
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })

    await expect(awardChapterScore(client, { userId: USER, kind: 'drop', sourceId: SOURCE })).resolves.toEqual({ ok: false })
  })
})
