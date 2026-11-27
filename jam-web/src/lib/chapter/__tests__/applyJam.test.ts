/**
 * lib/chapter/applyJam — 챕터 진행값 적립 래퍼 (티켓 20261127_1727, B4 이중 쓰기)
 *
 * 고정하는 것:
 * - RPC 인자는 `{ p_user_id, p_amount, p_event_key, p_promote }`이고 `promote`가 그대로 간다.
 * - `duplicate`는 정상(기록 없음), `no_chapter`·`user_suspended`는 `skipped`로 정상(기록 없음).
 * - RPC 오류·해석 못 할 응답·예외·`invalid_input`은 `{ ok: false }`이고 `chapter_jam_apply_failed`를 남긴다.
 * - 중복이 아닌데 `applied`가 보낸 양과 다르면 `chapter_jam_mismatch`를 남긴다(결과는 `ok: true`).
 * - 입력(`amount`가 1 이상의 정수 아님, `eventKey` 빔)이 맞지 않으면 RPC를 부르지 않는다.
 * - 던지지 않는다. 기록 자체가 실패해도 던지지 않는다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트와 목만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/applyJam.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const logMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))

import { applyChapterJam } from '../applyJam'

const USER = '11111111-1111-4111-8111-111111111111'
const KEY = 'activity_settlement:act-1'

function fakeClient(result: { data: unknown; error: unknown } | (() => Promise<never>)) {
  const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>(async () =>
    typeof result === 'function' ? result() : result
  )
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

const APPLIED = { ok: true, duplicate: false, applied: 90, promote: false, chapterNo: 2, chapterJam: 190, requiredJam: 1120, reachedChapters: [] }

beforeEach(() => {
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('applyChapterJam — 적립', () => {
  it('RPC에 p_user_id·p_amount·p_event_key·p_promote(false)를 보내고 응답을 해석해 돌려준다', async () => {
    const { client, rpc } = fakeClient({ data: APPLIED, error: null })

    const result = await applyChapterJam(client, { userId: USER, amount: 90, eventKey: KEY, promote: false })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('chapter_jam_apply', { p_user_id: USER, p_amount: 90, p_event_key: KEY, p_promote: false })
    expect(result).toEqual({ ok: true, duplicate: false, skipped: null, applied: 90, chapterNo: 2, chapterJam: 190, reachedChapters: [] })
    expect(logMock).not.toHaveBeenCalled()
  })

  it('promote가 true면 그대로 true로 보낸다 (C2a 전환용)', async () => {
    const { client, rpc } = fakeClient({ data: { ...APPLIED, promote: true, reachedChapters: [3] }, error: null })

    const result = await applyChapterJam(client, { userId: USER, amount: 90, eventKey: KEY, promote: true })

    expect(rpc).toHaveBeenCalledWith('chapter_jam_apply', expect.objectContaining({ p_promote: true }))
    expect(result).toMatchObject({ ok: true, reachedChapters: [3] })
  })

  it('duplicate는 ok: true, duplicate: true이고 기록하지 않는다', async () => {
    const { client } = fakeClient({ data: { ok: true, duplicate: true, applied: 0, chapterNo: 2, chapterJam: 190, reachedChapters: [] }, error: null })

    const result = await applyChapterJam(client, { userId: USER, amount: 90, eventKey: KEY, promote: false })

    expect(result).toMatchObject({ ok: true, duplicate: true, skipped: null, applied: 0 })
    expect(logMock).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it.each(['no_chapter', 'user_suspended'] as const)('%s는 skipped로 정상 처리하고 기록하지 않는다', async (error) => {
    const { client } = fakeClient({ data: { ok: false, error }, error: null })

    const result = await applyChapterJam(client, { userId: USER, amount: 90, eventKey: KEY, promote: false })

    expect(result).toMatchObject({ ok: true, skipped: error, applied: 0, chapterNo: null, chapterJam: null })
    expect(logMock).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('applyChapterJam — 실패는 던지지 않고 기록한다', () => {
  it('RPC 오류면 {ok:false}이고 console.error와 chapter_jam_apply_failed를 남긴다', async () => {
    const { client } = fakeClient({ data: null, error: { message: '적립 장애' } })

    const result = await applyChapterJam(client, { userId: USER, amount: 90, eventKey: KEY, promote: false })

    expect(result).toEqual({ ok: false })
    expect(console.error).toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith(
      'points',
      'chapter_jam_apply_failed',
      USER,
      expect.objectContaining({ eventKey: KEY, amount: 90, error: expect.stringContaining('적립 장애') })
    )
  })

  it.each([
    ['null', null],
    ['배열', [APPLIED]],
    ['문자열', 'ok'],
    ['ok 없음', { applied: 90 }],
    ['ok가 문자열', { ok: 'true', applied: 90 }],
  ])('해석 못 할 응답(%s)이면 {ok:false}이고 기록한다', async (_label, data) => {
    const { client } = fakeClient({ data, error: null })

    await expect(applyChapterJam(client, { userId: USER, amount: 90, eventKey: KEY, promote: false })).resolves.toEqual({ ok: false })

    expect(logMock).toHaveBeenCalledWith('points', 'chapter_jam_apply_failed', USER, expect.objectContaining({ eventKey: KEY }))
  })

  it('invalid_input 거절은 {ok:false}이고 기록한다', async () => {
    const { client } = fakeClient({ data: { ok: false, error: 'invalid_input' }, error: null })

    await expect(applyChapterJam(client, { userId: USER, amount: 90, eventKey: KEY, promote: false })).resolves.toEqual({ ok: false })

    expect(logMock).toHaveBeenCalledWith(
      'points',
      'chapter_jam_apply_failed',
      USER,
      expect.objectContaining({ error: expect.stringContaining('invalid_input') })
    )
  })

  it('RPC 호출이 예외로 거부돼도 던지지 않고 기록한다', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('네트워크 끊김')
    })

    await expect(applyChapterJam(client, { userId: USER, amount: 90, eventKey: KEY, promote: false })).resolves.toEqual({ ok: false })

    expect(logMock).toHaveBeenCalledWith(
      'points',
      'chapter_jam_apply_failed',
      USER,
      expect.objectContaining({ error: expect.stringContaining('네트워크 끊김') })
    )
  })

  it('기록 자체가 거부돼도 던지지 않는다', async () => {
    logMock.mockRejectedValue(new Error('기록 장애'))
    const { client } = fakeClient({ data: null, error: { message: '적립 장애' } })

    await expect(applyChapterJam(client, { userId: USER, amount: 90, eventKey: KEY, promote: false })).resolves.toEqual({ ok: false })
  })
})

describe('applyChapterJam — 어긋남', () => {
  it('중복이 아닌데 applied가 보낸 양과 다르면 chapter_jam_mismatch를 남기고 결과는 ok: true다', async () => {
    const { client } = fakeClient({ data: { ...APPLIED, applied: 60 }, error: null })

    const result = await applyChapterJam(client, { userId: USER, amount: 90, eventKey: KEY, promote: false })

    expect(result).toMatchObject({ ok: true, duplicate: false, applied: 60 })
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_jam_mismatch', USER, expect.objectContaining({ eventKey: KEY, amount: 90, applied: 60 }))
  })

  it('applied가 숫자가 아니어도(0으로 본다) 어긋남으로 남긴다', async () => {
    const { client } = fakeClient({ data: { ok: true, duplicate: false }, error: null })

    await applyChapterJam(client, { userId: USER, amount: 90, eventKey: KEY, promote: false })

    expect(logMock).toHaveBeenCalledWith('points', 'chapter_jam_mismatch', USER, expect.objectContaining({ amount: 90, applied: 0 }))
  })
})

describe('applyChapterJam — 입력 검사', () => {
  it.each([
    ['0', 0, KEY],
    ['음수', -5, KEY],
    ['소수', 1.5, KEY],
    ['NaN', Number.NaN, KEY],
    ['eventKey가 빈 문자열', 10, ''],
    ['eventKey가 공백뿐', 10, '   '],
  ])('%s이면 RPC를 부르지 않고 {ok:false}이며 기록한다', async (_label, amount, eventKey) => {
    const { client, rpc } = fakeClient({ data: APPLIED, error: null })

    await expect(applyChapterJam(client, { userId: USER, amount, eventKey, promote: false })).resolves.toEqual({ ok: false })

    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_jam_apply_failed', USER, expect.objectContaining({ amount }))
  })
})
