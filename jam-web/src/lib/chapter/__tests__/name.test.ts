/**
 * lib/chapter/name — 챕터 이름 조회 (티켓 20261019_1316 2회)
 *
 * 고정하는 것:
 * - `chapter_names`를 (tribe_id, chapter_no)로 읽는다. 이름 표가 0행이어도(행 없음) 동작한다.
 * - 행이 없거나 name이 null·빈 문자열·공백뿐이면 null이다(전각 공백 포함). 값이 있으면 저장된 그대로 돌려준다.
 * - 읽지 못하면(조회 오류·예외) `{ ok: false }`이고 `console.error`를 남긴다 — «이름 없음»(`{ ok: true, name: null }`)과 구분된다. 던지지 않는다.
 * - 트라이브 id가 비었거나 챕터 번호가 잘못되면 표를 읽지 않고 이름 없음이다.
 * 공용 DB는 부르지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/name.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getChapterName, normalizeChapterName } from '../name'

const TRIBE = '22222222-2222-4222-8222-222222222222'

type Result = { data: unknown; error: unknown }

function fakeClient(result: Result | (() => Promise<Result>)) {
  const calls: Array<{ table: string; select: string | null; eq: Array<[string, unknown]> }> = []
  const client = {
    from: (table: string) => {
      const call = { table, select: null as string | null, eq: [] as Array<[string, unknown]> }
      calls.push(call)
      const builder = {
        select: (columns: string) => {
          call.select = columns
          return builder
        },
        eq: (column: string, value: unknown) => {
          call.eq.push([column, value])
          return builder
        },
        maybeSingle: async () => (typeof result === 'function' ? result() : result),
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

describe('getChapterName — 이름이 있을 때', () => {
  it('(트라이브 id, 챕터 번호)로 chapter_names의 name을 읽는다', async () => {
    const { client, calls } = fakeClient({ data: { name: '단골' }, error: null })
    const result = await getChapterName(client, TRIBE, 3)
    expect(result).toEqual({ ok: true, name: '단골' })
    expect(calls).toEqual([
      {
        table: 'chapter_names',
        select: 'name',
        eq: [
          ['tribe_id', TRIBE],
          ['chapter_no', 3],
        ],
      },
    ])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('값이 있으면 저장된 그대로 돌려준다 (앞뒤 공백도 고치지 않는다)', async () => {
    const { client } = fakeClient({ data: { name: ' 단골 ' }, error: null })
    expect(await getChapterName(client, TRIBE, 3)).toEqual({ ok: true, name: ' 단골 ' })
  })
})

describe('getChapterName — 이름이 비었을 때는 null이다 (사용자 결정 3)', () => {
  it('이름 표가 0행이다 (행 없음)', async () => {
    const { client } = fakeClient({ data: null, error: null })
    expect(await getChapterName(client, TRIBE, 2)).toEqual({ ok: true, name: null })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('name이 null이다', async () => {
    const { client } = fakeClient({ data: { name: null }, error: null })
    expect(await getChapterName(client, TRIBE, 2)).toEqual({ ok: true, name: null })
  })

  it('name이 빈 문자열이다', async () => {
    const { client } = fakeClient({ data: { name: '' }, error: null })
    expect(await getChapterName(client, TRIBE, 2)).toEqual({ ok: true, name: null })
  })

  it.each([['공백 한 칸', ' '], ['공백 여러 칸', '     '], ['탭과 줄바꿈', '\t\n '], ['전각 공백', '　　']])(
    'name이 공백뿐이다 (%s)',
    async (_label, name) => {
      const { client } = fakeClient({ data: { name }, error: null })
      expect(await getChapterName(client, TRIBE, 2)).toEqual({ ok: true, name: null })
    }
  )
})

describe('normalizeChapterName', () => {
  it.each([
    [null, null],
    [undefined, null],
    ['', null],
    ['   ', null],
    [42, null],
    ['단골', '단골'],
    [' 단골 ', ' 단골 '],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeChapterName(raw)).toBe(expected)
  })
})

describe('getChapterName — 읽지 못함은 «이름 없음»과 구분된다', () => {
  it('조회 오류는 { ok: false }이고 console.error를 남긴다', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'permission denied' } })
    const result = await getChapterName(client, TRIBE, 2)
    expect(result).toEqual({ ok: false })
    expect(result).not.toEqual({ ok: true, name: null })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('permission denied')
  })

  it('조회가 던져도 던지지 않고 { ok: false }이다', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('network down')
    })
    const result = await getChapterName(client, TRIBE, 2)
    expect(result).toEqual({ ok: false })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('network down')
  })
})

describe('getChapterName — 읽을 수 없는 입력', () => {
  it.each([
    ['트라이브 id가 비었다', '', 2],
    ['챕터 번호가 0이다', TRIBE, 0],
    ['챕터 번호가 음수다', TRIBE, -1],
    ['챕터 번호가 정수가 아니다', TRIBE, 1.5],
    ['챕터 번호가 NaN이다', TRIBE, Number.NaN],
  ])('%s → 표를 읽지 않고 이름 없음이다', async (_label, tribeId, chapterNo) => {
    const { client, calls } = fakeClient({ data: { name: '단골' }, error: null })
    expect(await getChapterName(client, tribeId, chapterNo)).toEqual({ ok: true, name: null })
    expect(calls).toHaveLength(0)
  })
})
