/**
 * lib/admin/user-chapter-view — 어드민 유저 상세의 챕터 구역 읽기 (티켓 20261019_1318 2회)
 *
 * 고정하는 것:
 * - 지금 챕터·누적 점수, 오른 기록, 점수 기록 최근 50건(전체 건수 포함)을 읽는다.
 * - 챕터가 없는 유저(행 없음, chapter_no NULL)는 «기록 없음»이지 읽기 실패가 아니다.
 * - 구역마다 실패가 독립이다 — 읽지 못한 구역만 `{ ok: false }`이고 로그가 남으며 다른 구역은 그대로다. 던지지 않는다.
 * - 챕터는 숫자로만 표기한다(2026-10-21 결정): 이름 표를 읽지 않고 값에 이름이 없다.
 * - 활동 종류 12종은 모두 한글 이름이 있고, 사전에 없는 종류는 값 그대로 보인다.
 * 공용 DB는 부르지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/user-chapter-view.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CHAPTER_SCORE_KINDS } from '@/lib/chapter/kinds'
import {
  CHAPTER_SCORE_KIND_LABELS,
  USER_CHAPTER_SCORE_EVENT_LIMIT,
  chapterScoreKindLabel,
  loadUserChapterView,
} from '../user-chapter-view'

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
  chapter_score_events: {
    data: [
      { id: 'e2', activity_kind: 'capsule_open', occurred_on: '2026-10-20', unit_amount: 1, raw_score: 20, counted_score: 20, created_at: '2026-10-20T01:00:00+00:00' },
      { id: 'e1', activity_kind: 'jam_earned', occurred_on: '2026-10-19', unit_amount: 400, raw_score: 400, counted_score: 350, created_at: '2026-10-19T01:00:00+00:00' },
    ],
    error: null,
    count: 120,
  },
})

describe('loadUserChapterView — 정상', () => {
  it('지금 챕터와 점수, 오른 기록, 점수 기록을 담는다', async () => {
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
    expect(view.scoreEvents.ok && view.scoreEvents.value.total).toBe(120)
    expect(view.scoreEvents.ok && view.scoreEvents.value.rows.map((r) => [r.id, r.kindLabel, r.rawScore, r.countedScore])).toEqual([
      ['e2', '캡슐 열기', 20, 20],
      ['e1', '모은 잼', 400, 350],
    ])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('점수 기록은 최근 50건만, 최근순으로 읽고 전체 건수를 함께 센다', async () => {
    const { client, calls } = fakeClient(happy())
    await loadUserChapterView(client, USER)
    const events = calls.find((c) => c.table === 'chapter_score_events')!
    expect(USER_CHAPTER_SCORE_EVENT_LIMIT).toBe(50)
    expect(events.limit).toBe(50)
    expect(events.select).toContain('counted_score')
    expect(events.eq).toEqual([['user_id', USER]])
    expect(events.order[0]).toEqual(['created_at', false])
  })

  it('챕터는 숫자로만 표기한다 — 이름 표를 읽지 않고 값에 이름이 없다', async () => {
    const { client, calls } = fakeClient(happy())
    const view = await loadUserChapterView(client, USER)
    expect(calls.map((c) => c.table).sort()).toEqual(['chapter_score_events', 'chapter_ups', 'user_chapters'])
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
    const { client } = fakeClient({ ...happy(), user_chapters: { data: null, error: null }, chapter_ups: { data: [], error: null }, chapter_score_events: { data: [], error: null, count: 0 } })
    const view = await loadUserChapterView(client, USER)
    expect(view.current).toEqual({ ok: true, value: { chapterNo: null, totalScore: 0 } })
    expect(view.ups).toEqual({ ok: true, value: [] })
    expect(view.scoreEvents).toEqual({ ok: true, value: { rows: [], total: 0 } })
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
    ['chapter_score_events', 'scoreEvents', 'users/detail/chapter-score-events'],
  ] as const)('%s를 읽지 못하면 %s만 읽기 실패이고 로그를 남긴다', async (table, section, label) => {
    const { client } = fakeClient({ ...happy(), [table]: { data: null, error: { message: `${table} 실패` } } })
    const view = await loadUserChapterView(client, USER)
    for (const key of ['current', 'ups', 'scoreEvents'] as const) {
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
    expect(view.scoreEvents.ok).toBe(true)
  })
})

describe('활동 종류의 한글 이름', () => {
  it('점수를 쌓는 12종 모두 이름이 있다', () => {
    for (const kind of CHAPTER_SCORE_KINDS) {
      expect(CHAPTER_SCORE_KIND_LABELS[kind], kind).toBeTruthy()
      expect(chapterScoreKindLabel(kind)).toBe(CHAPTER_SCORE_KIND_LABELS[kind])
    }
    expect(Object.keys(CHAPTER_SCORE_KIND_LABELS).sort()).toEqual([...CHAPTER_SCORE_KINDS].sort())
  })

  it('운영 로직 12.2절의 활동 이름을 쓴다', () => {
    expect(chapterScoreKindLabel('jam_earned')).toBe('모은 잼')
    expect(chapterScoreKindLabel('locked_item_badge_open')).toBe('잠긴 아이템 배지 열기')
    expect(chapterScoreKindLabel('collection_complete_epic')).toBe('컬렉션 완성 (Epic)')
    expect(chapterScoreKindLabel('mix_success')).toBe('믹스 성공')
  })

  it('사전에 없는 종류(점수 규칙 행으로 더해진 종류)는 값 그대로 보인다', () => {
    expect(chapterScoreKindLabel('brand_new_kind')).toBe('brand_new_kind')
    // 객체 기본 속성 이름이 종류로 와도 사전 값으로 오해하지 않는다
    expect(chapterScoreKindLabel('constructor')).toBe('constructor')
  })
})
