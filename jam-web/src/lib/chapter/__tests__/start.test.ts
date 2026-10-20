/**
 * lib/chapter/start — 챕터 1 시작 연결 (티켓 20261019_1316)
 *
 * 고정하는 것:
 * - `chapter_start`를 (p_user_id)로 부르고 표 모양 응답({score_added, current_chapter, reached_chapters})을 계약 검사로 읽는다.
 * - 오른 챕터가 있으면 오름 처리를 (유저, 오른 챕터 목록)으로 부른다(챕터 1 포함, 배지 판정을 건너뛰지 않는다). 이미 챕터가 있는 유저의 응답은 빈 목록이라 부르지 않는다.
 * - 절대 던지지 않는다: RPC 오류·예외·계약 밖 응답(시작한 뒤 챕터가 비어 있는 응답 포함)은 `console.error`와 `engine_decision_log`(points, chapter_start_failed)에 남기고 `{ ok: false }`다.
 *   오름 처리가 던져도 시작 결과는 그대로다.
 * - `ensureChapterStarted`는 `user_chapters.chapter_no`가 비어 있을 때만 시작한다(행 없음·NULL). 이미 챕터가 있으면 RPC를 부르지 않는다. 조회 실패는 시작하지 않고 기록한다.
 * 공용 DB와 실제 RPC는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/start.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { logMock, riseMock } = vi.hoisted(() => ({ logMock: vi.fn(), riseMock: vi.fn() }))

vi.mock('@/lib/engine-log', () => ({ logEngineDecision: (...args: unknown[]) => logMock(...args) }))
vi.mock('../rise', () => ({ processChapterRise: (...args: unknown[]) => riseMock(...args) }))

import { ensureChapterStarted, startChapter } from '../start'

const USER = '11111111-1111-4111-8111-111111111111'

type RpcResult = { data: unknown; error: unknown }

function fakeClient(result: RpcResult | (() => Promise<RpcResult>)) {
  const rpc = vi.fn(async () => (typeof result === 'function' ? result() : result))
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

/** `user_chapters` 조회와 `chapter_start` RPC를 받는 가짜 */
function fakeClientWithChapterRow(chapterRead: { data: unknown; error: unknown } | (() => Promise<{ data: unknown; error: unknown }>), startResult?: RpcResult) {
  const reads: string[] = []
  const rpc = vi.fn(async () => startResult ?? { data: [{ score_added: 0, current_chapter: 1, reached_chapters: [1] }], error: null })
  const client = {
    rpc,
    from: (table: string) => {
      reads.push(table)
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => (typeof chapterRead === 'function' ? chapterRead() : chapterRead) }),
        }),
      }
    },
  } as unknown as SupabaseClient
  return { client, rpc, reads }
}

const STARTED = { score_added: 0, current_chapter: 1, reached_chapters: [1] }

beforeEach(() => {
  logMock.mockReset()
  logMock.mockResolvedValue(undefined)
  riseMock.mockReset()
  riseMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {}).mockClear()
})

describe('startChapter — 성공', () => {
  it('chapter_start를 부르고 시작한 챕터와 오른 챕터 목록을 돌려준다', async () => {
    const { client, rpc } = fakeClient({ data: [STARTED], error: null })

    const result = await startChapter(client, USER)

    expect(result).toEqual({ ok: true, currentChapter: 1, reachedChapters: [1] })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('chapter_start', { p_user_id: USER })
    expect(logMock).not.toHaveBeenCalled()
  })

  it('오른 챕터가 있으면 오름 처리를 (유저, 오른 챕터 목록)으로 부른다 — 챕터 1만이어도, 쌓인 점수로 여럿이어도', async () => {
    const one = fakeClient({ data: [STARTED], error: null })
    const many = fakeClient({ data: [{ score_added: 0, current_chapter: 3, reached_chapters: [1, 2, 3] }], error: null })

    await startChapter(one.client, USER)
    await startChapter(many.client, USER)

    // 두 번째 인자(옵션)가 없다 — 이 연결은 동기화 끝 판정이 읽지 못하는 자리라 판정을 건너뛰지 않는다
    expect(riseMock.mock.calls).toEqual([
      [{ userId: USER, reachedChapters: [1] }],
      [{ userId: USER, reachedChapters: [1, 2, 3] }],
    ])
  })

  it('이미 챕터가 있는 유저의 응답(오른 챕터 없음)은 성공이고 오름 처리를 부르지 않는다', async () => {
    const { client } = fakeClient({ data: [{ score_added: 0, current_chapter: 4, reached_chapters: [] }], error: null })

    const result = await startChapter(client, USER)

    expect(result).toEqual({ ok: true, currentChapter: 4, reachedChapters: [] })
    expect(riseMock).not.toHaveBeenCalled()
  })

  it('오름 처리가 던져도 시작 결과는 그대로이고 시작 실패로 기록하지 않는다', async () => {
    riseMock.mockRejectedValue(new Error('오름 처리 장애'))
    const { client } = fakeClient({ data: [STARTED], error: null })

    const result = await startChapter(client, USER)

    expect(result).toEqual({ ok: true, currentChapter: 1, reachedChapters: [1] })
    expect(console.error).toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })
})

describe('startChapter — 실패는 던지지 않고 기록한다', () => {
  it('RPC 오류는 { ok: false }이고 console.error와 engine_decision_log에 남는다', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'check_violation: 챕터 1 정의가 없습니다' } })

    const result = await startChapter(client, USER)

    expect(result).toEqual({ ok: false })
    expect(console.error).toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledTimes(1)
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_start_failed', USER, { error: expect.stringContaining('챕터 1 정의가 없습니다') })
    expect(riseMock).not.toHaveBeenCalled()
  })

  it.each([
    ['null', null],
    ['빈 배열', []],
    ['배열이 아닌 객체', STARTED],
    ['센 점수가 숫자가 아님', [{ score_added: '0', current_chapter: 1, reached_chapters: [1] }]],
    ['지금 챕터가 숫자도 null도 아님', [{ score_added: 0, current_chapter: '1', reached_chapters: [1] }]],
    ['오른 챕터 목록이 배열이 아님', [{ score_added: 0, current_chapter: 1, reached_chapters: null }]],
    ['오른 챕터 목록에 숫자가 아닌 값', [{ score_added: 0, current_chapter: 1, reached_chapters: [1, 'x'] }]],
    ['시작한 뒤에도 챕터가 비어 있음', [{ score_added: 0, current_chapter: null, reached_chapters: [] }]],
  ])('계약 밖 응답(%s)은 { ok: false }이고 기록하며 오름 처리를 부르지 않는다', async (_label, data) => {
    const { client } = fakeClient({ data, error: null })

    const result = await startChapter(client, USER)

    expect(result).toEqual({ ok: false })
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_start_failed', USER, { error: expect.stringContaining('해석할 수 없는') })
    expect(riseMock).not.toHaveBeenCalled()
  })

  it('클라이언트가 예외를 던져도 던지지 않고 기록한다', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('network down')
    })

    await expect(startChapter(client, USER)).resolves.toEqual({ ok: false })

    expect(logMock).toHaveBeenCalledWith('points', 'chapter_start_failed', USER, { error: expect.stringContaining('network down') })
  })

  it('실패 기록 자체가 던져도 던지지 않는다', async () => {
    logMock.mockRejectedValue(new Error('로그 다운'))
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })

    await expect(startChapter(client, USER)).resolves.toEqual({ ok: false })
  })
})

describe('ensureChapterStarted — 챕터가 비어 있을 때만 시작한다', () => {
  it('user_chapters에 행이 없으면 시작한다', async () => {
    const { client, rpc, reads } = fakeClientWithChapterRow({ data: null, error: null })

    await ensureChapterStarted(client, USER)

    expect(reads).toEqual(['user_chapters'])
    expect(rpc).toHaveBeenCalledWith('chapter_start', { p_user_id: USER })
    expect(riseMock).toHaveBeenCalledWith({ userId: USER, reachedChapters: [1] })
  })

  it('행은 있지만 chapter_no가 NULL이면(퀘스트 전 점수만 쌓임) 시작한다', async () => {
    const { client, rpc } = fakeClientWithChapterRow({ data: { chapter_no: null }, error: null })

    await ensureChapterStarted(client, USER)

    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('이미 챕터가 있으면 RPC도 오름 처리도 부르지 않는다', async () => {
    const { client, rpc } = fakeClientWithChapterRow({ data: { chapter_no: 2 }, error: null })

    await ensureChapterStarted(client, USER)

    expect(rpc).not.toHaveBeenCalled()
    expect(riseMock).not.toHaveBeenCalled()
    expect(logMock).not.toHaveBeenCalled()
  })

  it('조회 오류는 시작하지 않고 기록한다', async () => {
    const { client, rpc } = fakeClientWithChapterRow({ data: null, error: { message: 'read failed' } })

    await expect(ensureChapterStarted(client, USER)).resolves.toBeUndefined()

    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_start_failed', USER, { error: expect.stringContaining('read failed') })
  })

  it('조회가 예외를 던져도 던지지 않고 시작하지 않는다', async () => {
    const { client, rpc } = fakeClientWithChapterRow(async () => {
      throw new Error('network down')
    })

    await expect(ensureChapterStarted(client, USER)).resolves.toBeUndefined()

    expect(rpc).not.toHaveBeenCalled()
    expect(logMock).toHaveBeenCalledWith('points', 'chapter_start_failed', USER, { error: expect.stringContaining('network down') })
  })

  it('시작이 실패해도 던지지 않는다 — 다음 호출이 다시 시도한다', async () => {
    const { client } = fakeClientWithChapterRow({ data: null, error: null }, { data: null, error: { message: 'boom' } })

    await expect(ensureChapterStarted(client, USER)).resolves.toBeUndefined()

    expect(logMock).toHaveBeenCalledWith('points', 'chapter_start_failed', USER, { error: expect.stringContaining('boom') })
  })
})
