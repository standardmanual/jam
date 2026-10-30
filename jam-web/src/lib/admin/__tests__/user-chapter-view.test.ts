/**
 * lib/admin/user-chapter-view — 어드민 유저 상세의 챕터 구역 읽기 (티켓 20261019_1318 2회)
 *
 * 고정하는 것:
 * - 지금 챕터·누적 점수, 오른 기록을 읽는다. 점수 기록(`chapter_score_events`)은 읽지 않는다(티켓 20261028_1742 2회에서 걷었다).
 * - 챕터가 없는 유저(행 없음, chapter_no NULL)는 «기록 없음»이지 읽기 실패가 아니다.
 * - 구역마다 실패가 독립이다 — 읽지 못한 구역만 `{ ok: false }`이고 로그가 남으며 다른 구역은 그대로다. 던지지 않는다.
 * - 챕터는 숫자로만 표기한다(2026-10-21 결정): 이름 표를 읽지 않고 값에 이름이 없다.
 * 공용 DB는 부르지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/user-chapter-view.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadUserChapterView } from '../user-chapter-view'

const USER = '11111111-1111-4111-8111-111111111111'

type Result = { data: unknown; error: { message: string } | null; count?: number | null }
type Call = { table: string; select: string | null; eq: Array<[string, unknown]>; order: Array<[string, boolean]>; limit: number | null }

/** 표마다 정해 둔 결과를 돌려주는 가짜 클라이언트. 함수면 부를 때 던지거나 값을 만든다 */
function fakeClient(results: Record<string, Result | (() => Result)>) {
  const calls: Call[] = []
  const client = {
    from: (table: string) => {
      const call: Call = { table, select: null, eq: [], order: [], limit: null }
      calls.push(call)
      const run = async (): Promise<Result> => {
        const r = results[table] ?? { data: [], error: null }
        return typeof r === 'function' ? r() : r
      }
      const builder: Record<string, unknown> = {
        select: (columns: string) => ((call.select = columns), builder),
        eq: (column: string, value: unknown) => (call.eq.push([column, value]), builder),
        order: (column: string, options?: { ascending?: boolean }) => (call.order.push([column, options?.ascending !== false]), builder),
        limit: (n: number) => ((call.limit = n), builder),
        maybeSingle: run,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
      }
      return builder
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  errorSpy.mockClear()
})

const happy = () => ({
  user_chapters: { data: { chapter_no: 3, total_score: 2450 }, error: null },
  chapter_ups: {
    data: [
      { chapter_no: 1, reached_at: '2026-09-01T00:00:00+00:00' },
      { chapter_no: 2, reached_at: '2026-09-20T03:00:00+00:00' },
      { chapter_no: 3, reached_at: '2026-10-15T06:30:00+00:00' },
    ],
    error: null,
  },
})

describe('loadUserChapterView — 정상', () => {
  it('지금 챕터와 점수, 오른 기록을 담는다', async () => {
    const { client } = fakeClient(happy())
    const view = await loadUserChapterView(client, USER)

    expect(view.current).toEqual({ ok: true, value: { chapterNo: 3, totalScore: 2450 } })
    expect(view.ups).toEqual({
      ok: true,
      value: [
        { chapterNo: 1, reachedAt: '2026-09-01T00:00:00+00:00' },
        { chapterNo: 2, reachedAt: '2026-09-20T03:00:00+00:00' },
        { chapterNo: 3, reachedAt: '2026-10-15T06:30:00+00:00' },
      ],
    })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('점수 기록 표(chapter_score_events)는 읽지 않는다', async () => {
    const { client, calls } = fakeClient(happy())
    await loadUserChapterView(client, USER)
    expect(calls.some((c) => c.table === 'chapter_score_events')).toBe(false)
  })

  it('챕터는 숫자로만 표기한다 — 이름 표를 읽지 않고 값에 이름이 없다', async () => {
    const { client, calls } = fakeClient(happy())
    const view = await loadUserChapterView(client, USER)
    expect(calls.map((c) => c.table).sort()).toEqual(['chapter_ups', 'user_chapters'])
    expect(JSON.stringify(view)).not.toContain('name')
  })

  it('오른 기록은 오른 시각 오름차순으로 읽는다', async () => {
    const { client, calls } = fakeClient(happy())
    await loadUserChapterView(client, USER)
    expect(calls.find((c) => c.table === 'chapter_ups')!.order[0]).toEqual(['reached_at', true])
  })
})

describe('loadUserChapterView — 챕터가 없는 유저는 기록 없음이다', () => {
  it('user_chapters 행이 없으면 챕터 없음, 점수 0이고 읽기 실패가 아니다', async () => {
    const { client } = fakeClient({ ...happy(), user_chapters: { data: null, error: null }, chapter_ups: { data: [], error: null } })
    const view = await loadUserChapterView(client, USER)
    expect(view.current).toEqual({ ok: true, value: { chapterNo: null, totalScore: 0 } })
    expect(view.ups).toEqual({ ok: true, value: [] })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('퀘스트 전에 점수가 쌓인 유저(chapter_no NULL)는 챕터 없음에 쌓인 점수를 보인다', async () => {
    const { client } = fakeClient({ ...happy(), user_chapters: { data: { chapter_no: null, total_score: 120 }, error: null } })
    const view = await loadUserChapterView(client, USER)
    expect(view.current).toEqual({ ok: true, value: { chapterNo: null, totalScore: 120 } })
  })
})

describe('loadUserChapterView — 구역마다 실패가 독립이다', () => {
  it.each([
    ['user_chapters', 'current', 'users/detail/chapter'],
    ['chapter_ups', 'ups', 'users/detail/chapter-ups'],
  ] as const)('%s를 읽지 못하면 %s만 읽기 실패이고 로그를 남긴다', async (table, section, label) => {
    const { client } = fakeClient({ ...happy(), [table]: { data: null, error: { message: `${table} 실패` } } })
    const view = await loadUserChapterView(client, USER)
    for (const key of ['current', 'ups'] as const) {
      expect(view[key].ok).toBe(key !== section)
    }
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain(label)
  })

  it('조회가 던져도 던지지 않고 그 구역만 읽기 실패다', async () => {
    const { client } = fakeClient({
      ...happy(),
      chapter_ups: () => {
        throw new Error('네트워크 끊김')
      },
    })
    const view = await loadUserChapterView(client, USER)
    expect(view.ups).toEqual({ ok: false })
    expect(view.current.ok).toBe(true)
  })

  it('계약 밖 값(문자열 점수, 숫자가 아닌 챕터)은 그 구역만 읽기 실패로 본다', async () => {
    const { client } = fakeClient({
      ...happy(),
      user_chapters: { data: { chapter_no: 3, total_score: 'x' }, error: null },
      chapter_ups: { data: [{ chapter_no: 'a', reached_at: '2026-10-15T06:30:00+00:00' }], error: null },
    })
    const view = await loadUserChapterView(client, USER)
    expect(view.current).toEqual({ ok: false })
    expect(view.ups).toEqual({ ok: false })
  })
})
