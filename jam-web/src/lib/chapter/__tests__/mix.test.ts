/**
 * lib/chapter/mix — 챕터 점수 «믹스 성공» (티켓 20261019_1315 3회)
 *
 * 고정하는 것:
 * - `record_combine_success_with_id`의 응답(`{ id: uuid, is_recipe_first: boolean }`)을 계약대로 읽는다. 알려진 모양이 아니면 null이다.
 * - 올바른 응답이면 성공 행 id를 원천 id로 `mix_success`를 센다(수량 1, 날짜 생략).
 * - 계약 밖 응답이면 점수를 세지 않고 `chapter_score_failed`(sourceId null)를 남긴다. 던지지 않는다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트만 쓴다. 믹스 엔진과의 연결(호출 순서·시험 믹스 제외)은 `lib/combine/__tests__/combine-engine.test.ts`가 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/mix.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const logMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))

import { awardMixSuccessScore, parseMixSuccessRecord, recordMixScoreFailure } from '../mix'

const USER = '11111111-1111-4111-8111-111111111111'
const LOG_ID = '33333333-3333-4333-8333-333333333333'

function fakeClient(result: { data: unknown; error: unknown } = { data: [{ score_added: 20, current_chapter: null, reached_chapters: [] }], error: null }) {
  const rpc = vi.fn(async () => result)
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

beforeEach(() => {
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('parseMixSuccessRecord — 응답 계약', () => {
  it('id가 UUID 문자열이고 is_recipe_first가 boolean이면 읽는다', () => {
    expect(parseMixSuccessRecord({ id: LOG_ID, is_recipe_first: true })).toEqual({ id: LOG_ID, isRecipeFirst: true })
    expect(parseMixSuccessRecord({ id: LOG_ID, is_recipe_first: false })).toEqual({ id: LOG_ID, isRecipeFirst: false })
  })

  it('대문자 UUID도 UUID로 본다', () => {
    expect(parseMixSuccessRecord({ id: LOG_ID.toUpperCase(), is_recipe_first: false })?.id).toBe(LOG_ID.toUpperCase())
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['boolean(옛 함수의 응답)', true],
    ['문자열', LOG_ID],
    ['배열', [{ id: LOG_ID, is_recipe_first: true }]],
    ['빈 객체', {}],
    ['id 없음', { is_recipe_first: true }],
    ['id가 null', { id: null, is_recipe_first: true }],
    ['id가 UUID가 아닌 문자열', { id: 'abc', is_recipe_first: true }],
    ['id가 빈 문자열', { id: '', is_recipe_first: true }],
    ['id가 숫자', { id: 1, is_recipe_first: true }],
    ['is_recipe_first 없음', { id: LOG_ID }],
    ['is_recipe_first가 null', { id: LOG_ID, is_recipe_first: null }],
    ['is_recipe_first가 문자열', { id: LOG_ID, is_recipe_first: 'false' }],
  ])('알려진 모양이 아니면 null이다: %s', (_label, data) => {
    expect(parseMixSuccessRecord(data)).toBeNull()
  })
})

describe('awardMixSuccessScore', () => {
  it('올바른 응답이면 성공 행 id를 원천 id로 mix_success를 1회 센다 — 날짜는 생략한다', async () => {
    const { client, rpc } = fakeClient()

    await awardMixSuccessScore(client, USER, { id: LOG_ID, is_recipe_first: false })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('chapter_add_score', {
      p_user_id: USER,
      p_activity_kind: 'mix_success',
      p_source_id: LOG_ID,
      p_amount: 1,
    })
    expect(logMock).not.toHaveBeenCalled()
  })

  it('같은 응답을 두 번 보내면 같은 (kind, 원천 id)다', async () => {
    const { client, rpc } = fakeClient()

    await awardMixSuccessScore(client, USER, { id: LOG_ID, is_recipe_first: true })
    await awardMixSuccessScore(client, USER, { id: LOG_ID, is_recipe_first: true })

    const calls = rpc.mock.calls as unknown as [string, Record<string, unknown>][]
    expect(calls[0][1].p_source_id).toBe(calls[1][1].p_source_id)
    expect(calls[0][1].p_activity_kind).toBe(calls[1][1].p_activity_kind)
  })

  it('계약 밖 응답이면 점수를 세지 않고 chapter_score_failed(sourceId null)를 남긴다', async () => {
    const { client, rpc } = fakeClient()

    await awardMixSuccessScore(client, USER, { id: 'not-a-uuid', is_recipe_first: true })

    expect(rpc).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledWith(
      'points',
      'chapter_score_failed',
      USER,
      expect.objectContaining({ kind: 'mix_success', sourceId: null, amount: 1, occurredOn: null })
    )
  })

  it('점수 RPC가 오류를 내도 던지지 않는다(awardChapterScore가 성공 행 id로 기록한다)', async () => {
    const { client } = fakeClient({ data: null, error: { message: '점수 장애' } })

    await expect(awardMixSuccessScore(client, USER, { id: LOG_ID, is_recipe_first: true })).resolves.toBeUndefined()

    expect(logMock).toHaveBeenCalledWith('points', 'chapter_score_failed', USER, expect.objectContaining({ kind: 'mix_success', sourceId: LOG_ID }))
  })
})

describe('recordMixScoreFailure', () => {
  it('원천 id 없이 mix_success 실패를 남긴다', async () => {
    await recordMixScoreFailure(USER, 'RPC 오류')

    expect(logMock).toHaveBeenCalledWith(
      'points',
      'chapter_score_failed',
      USER,
      expect.objectContaining({ kind: 'mix_success', sourceId: null, error: 'RPC 오류' })
    )
  })

  it('기록 자체가 던져도 던지지 않는다', async () => {
    logMock.mockRejectedValue(new Error('기록 장애'))

    await expect(recordMixScoreFailure(USER, 'RPC 오류')).resolves.toBeUndefined()
  })
})
