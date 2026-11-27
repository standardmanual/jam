/**
 * lib/chapter/read — 챕터 읽기 (티켓 20261019_1316 2회, 티켓 20261127_1734 게이지 읽기 모델)
 *
 * 고정하는 것:
 * - 내 챕터(`getMyChapter`): `{ ok, chapterNo, chapterJam, requiredJam, nextChapterNo, isLastChapter, progress, tribeName }`만 돌려준다.
 *   `user_chapters.chapter_jam`과 `chapter_definitions.required_jam`으로 계산하고 `total_score`·`required_score`를 읽지 않는다.
 * - 챕터가 없는 유저(행 없음·chapter_no NULL)는 값이 모두 null이고 `isLastChapter`는 false다. 마지막 챕터는 `requiredJam`·`nextChapterNo`·`progress`가 null, `isLastChapter`가 true다.
 * - 트라이브를 읽지 못하면 `tribeName: null`로 `ok: true`다. 챕터·정의 조회가 실패하면 `{ ok: false }`다.
 * - 다른 유저용(`getPublicChapter`): 트라이브와 챕터 번호만 돌려준다. 진행 키가 없고, `chapter_jam`·`required_jam`·`total_score`를 읽지도 않는다.
 * - 챕터는 숫자로만 표기한다(2026-10-21 결정): 응답에 name 키가 없고 챕터 이름 표를 읽지 않는다.
 * - 읽지 못함: 오류·예외·계약 밖 값이면 던지지 않고 `{ ok: false }`이며 `console.error`를 남긴다. «챕터 없음»과 구분된다.
 * 공용 DB는 부르지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/read.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMyChapter, getMyTribeName, getPublicChapter } from '../read'

const USER = '11111111-1111-4111-8111-111111111111'
const TRIBE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TRIBE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type Result = { data: unknown; error: unknown }
interface Call {
  table: string
  select: string | null
  eq: Array<[string, unknown]>
  order: unknown[] | null
}
type Handler = Result | ((call: Call) => Result | Promise<Result>)

/** 표마다 응답을 정해 둔 가짜. 정해 두지 않은 표를 읽으면 시험이 실패하도록 던진다 */
function fakeClient(tables: Record<string, Handler>) {
  const calls: Call[] = []
  const client = {
    from: (table: string) => {
      const call: Call = { table, select: null, eq: [], order: null }
      calls.push(call)
      const handler = tables[table]
      if (handler === undefined) throw new Error(`예상하지 못한 표 읽기: ${table}`)
      const run = async (): Promise<Result> => (typeof handler === 'function' ? handler(call) : handler)
      const builder = {
        select: (columns: string) => {
          call.select = columns
          return builder
        },
        eq: (column: string, value: unknown) => {
          call.eq.push([column, value])
          return builder
        },
        order: (...args: unknown[]) => {
          call.order = args
          return builder
        },
        maybeSingle: run,
        then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => run().then(resolve, reject),
      }
      return builder
    },
  } as unknown as SupabaseClient
  return { client, calls, tablesRead: () => calls.map((c) => c.table) }
}

/** 챕터 1~9의 필요 잼, 챕터 10은 마지막이라 NULL */
const DEFINITION_ROWS = [870, 1120, 1260, 1600, 1980, 2205, 2700, 3300, 3960, null].map((required_jam, i) => ({
  chapter_no: i + 1,
  required_jam,
}))

const definitions: Result = { data: DEFINITION_ROWS, error: null }
const userChapter = (chapter_no: number | null, chapter_jam: number): Result => ({ data: { chapter_no, chapter_jam }, error: null })
const userTribe = (tribeId: string | null): Result => ({
  data: { tribe: tribeId ? { id: tribeId, name: tribeId === TRIBE_A ? '트라이브 A' : '트라이브 B' } : null },
  error: null,
})

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  errorSpy.mockClear()
})

/** 객체 안의 모든 키 이름을 모은다 (중첩 포함) */
function allKeys(value: unknown): string[] {
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [k, ...allKeys(v)])
}

/** 내 챕터 읽기용 가짜: 세 표를 모두 갖춘다 */
function mineClient(chapter: Handler, defs: Handler = definitions, tribe: Handler = userTribe(TRIBE_A)) {
  return fakeClient({ user_chapters: chapter, chapter_definitions: defs, users: tribe })
}

const MINE_KEYS = ['chapterJam', 'chapterNo', 'isLastChapter', 'nextChapterNo', 'ok', 'progress', 'requiredJam', 'tribeName']

describe('getMyChapter — 챕터가 없는 유저', () => {
  const NO_CHAPTER = {
    ok: true,
    chapterNo: null,
    chapterJam: null,
    requiredJam: null,
    nextChapterNo: null,
    isLastChapter: false,
    progress: null,
    tribeName: null,
  }

  it('user_chapters 행이 없다 → 값이 모두 null, isLastChapter는 false', async () => {
    const { client } = mineClient({ data: null, error: null })
    expect(await getMyChapter(client, USER)).toEqual(NO_CHAPTER)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('chapter_no가 NULL이다 (퀘스트 전, 잼만 쌓임) → 값이 모두 null이다 (트라이브가 있어도 null)', async () => {
    const { client } = mineClient(userChapter(null, 640))
    expect(await getMyChapter(client, USER)).toEqual(NO_CHAPTER)
  })

  it('챕터가 없으면 정의·트라이브 읽기가 실패해도 챕터 없음으로 돌려준다', async () => {
    const dbError: Result = { data: null, error: { message: 'down' } }
    const { client } = mineClient({ data: null, error: null }, dbError, dbError)
    expect(await getMyChapter(client, USER)).toEqual(NO_CHAPTER)
  })

  it('응답의 키 목록이 고정이다', async () => {
    const { client } = mineClient({ data: null, error: null })
    expect(Object.keys(await getMyChapter(client, USER)).sort()).toEqual(MINE_KEYS)
  })
})

describe('getMyChapter — 진행', () => {
  async function read(chapterNo: number, chapterJam: number) {
    const { client, calls } = mineClient(userChapter(chapterNo, chapterJam))
    return { result: await getMyChapter(client, USER), calls }
  }

  it('챕터 2에 막 올라왔다 → 0이고 다음 챕터는 3이다', async () => {
    const { result } = await read(2, 0)
    expect(result).toEqual({
      ok: true,
      chapterNo: 2,
      chapterJam: 0,
      requiredJam: 1120,
      nextChapterNo: 3,
      isLastChapter: false,
      progress: 0,
      tribeName: '트라이브 A',
    })
  })

  it('중간이다 → 0.5', async () => {
    const { result } = await read(2, 560)
    expect(result).toMatchObject({ ok: true, chapterNo: 2, chapterJam: 560, requiredJam: 1120, nextChapterNo: 3, progress: 0.5 })
  })

  it('다 차기 직전이다 → 1이 아니라 0.99 (내림)', async () => {
    const { result } = await read(2, 1119)
    expect(result).toMatchObject({ ok: true, chapterNo: 2, nextChapterNo: 3, progress: 0.99, isLastChapter: false })
  })

  it('모은 잼이 필요 잼보다 커서 진행이 1로 잘린다 (chapterJam은 읽은 값 그대로)', async () => {
    const { result } = await read(2, 9000)
    expect(result).toMatchObject({ ok: true, chapterNo: 2, chapterJam: 9000, requiredJam: 1120, nextChapterNo: 3, progress: 1 })
  })

  it('챕터 10(마지막)이다 → requiredJam·nextChapterNo·progress가 null, isLastChapter가 true, chapterJam은 쌓인 값', async () => {
    const { result } = await read(10, 5400)
    expect(result).toEqual({
      ok: true,
      chapterNo: 10,
      chapterJam: 5400,
      requiredJam: null,
      nextChapterNo: null,
      isLastChapter: true,
      progress: null,
      tribeName: '트라이브 A',
    })
  })

  it('정의가 하나뿐이다 (챕터 1만) → 더 오를 수 없다', async () => {
    const { client } = mineClient(userChapter(1, 300), { data: [{ chapter_no: 1, required_jam: 870 }], error: null })
    expect(await getMyChapter(client, USER)).toMatchObject({ ok: true, chapterNo: 1, requiredJam: null, nextChapterNo: null, isLastChapter: true, progress: null })
  })

  it('응답의 키 목록이 고정이다', async () => {
    const { result } = await read(2, 560)
    expect(Object.keys(result).sort()).toEqual(MINE_KEYS)
    expect(Object.keys((await read(10, 5400)).result).sort()).toEqual(MINE_KEYS)
  })

  it('chapter_definitions는 전체를 한 번만 읽고 required_jam만 요구한다', async () => {
    const { calls } = await read(2, 560)
    const definitionReads = calls.filter((c) => c.table === 'chapter_definitions')
    expect(definitionReads).toHaveLength(1)
    expect(definitionReads[0].select).toBe('chapter_no, required_jam')
    expect(definitionReads[0].eq).toEqual([])
  })

  it('user_chapters는 이 유저의 행에서 chapter_no, chapter_jam만 읽는다', async () => {
    const { calls } = await read(2, 560)
    const row = calls.find((c) => c.table === 'user_chapters')
    expect(row?.eq).toEqual([['user_id', USER]])
    expect(row?.select).toBe('chapter_no, chapter_jam')
  })

  it('조회 인자 어디에도 total_score·required_score가 없다', async () => {
    const { calls } = await read(2, 560)
    expect(calls.map((c) => c.select ?? '').join(' ')).not.toMatch(/total_score|required_score/)
  })

  it('읽을 표는 user_chapters, chapter_definitions, users뿐이다 (이름 표를 읽지 않는다)', async () => {
    const { calls, result } = await read(3, 100)
    expect(calls.map((c) => c.table).sort()).toEqual(['chapter_definitions', 'user_chapters', 'users'])
    expect(allKeys(result)).not.toContain('name')
  })
})

describe('getMyChapter — 트라이브 이름', () => {
  it('지금 소속 트라이브 이름을 돌려준다', async () => {
    const { client } = mineClient(userChapter(3, 100), definitions, userTribe(TRIBE_B))
    expect(await getMyChapter(client, USER)).toMatchObject({ ok: true, tribeName: '트라이브 B' })
  })

  it('소속이 없으면 tribeName이 null이다', async () => {
    const { client } = mineClient(userChapter(3, 100), definitions, userTribe(null))
    expect(await getMyChapter(client, USER)).toMatchObject({ ok: true, chapterNo: 3, tribeName: null })
  })

  it('트라이브를 읽지 못해도 ok: true이고 tribeName은 null이며 console.error를 남긴다', async () => {
    const { client } = mineClient(userChapter(3, 100), definitions, { data: null, error: { message: 'boom' } })
    expect(await getMyChapter(client, USER)).toMatchObject({ ok: true, chapterNo: 3, chapterJam: 100, tribeName: null })
    expect(errorSpy).toHaveBeenCalled()
  })

  it('트라이브 읽기가 던져도 ok: true이고 tribeName은 null이다', async () => {
    const boom: Handler = async () => {
      throw new Error('network down')
    }
    const { client } = mineClient(userChapter(3, 100), definitions, boom)
    expect(await getMyChapter(client, USER)).toMatchObject({ ok: true, chapterNo: 3, tribeName: null })
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('getPublicChapter — 다른 유저에게 보이는 것', () => {
  async function readPublic(chapter: Result, tribe: Result) {
    const { client, calls } = fakeClient({ user_chapters: chapter, users: tribe })
    return { result: await getPublicChapter(client, USER), calls }
  }

  it('트라이브와 챕터 번호만 돌려준다', async () => {
    const { result } = await readPublic(userChapter(3, 2500), userTribe(TRIBE_A))
    expect(result).toEqual({ ok: true, tribe: { id: TRIBE_A, name: '트라이브 A' }, chapterNo: 3 })
  })

  it('응답의 키 목록이 고정이다 — 진행(잼·비율·다음 챕터)·점수·이름 키가 없다', async () => {
    const { result } = await readPublic(userChapter(3, 2500), userTribe(TRIBE_A))
    expect(Object.keys(result).sort()).toEqual(['chapterNo', 'ok', 'tribe'])
    expect(Object.keys((result as { tribe: object }).tribe).sort()).toEqual(['id', 'name'])
    const keys = allKeys(result)
    expect(keys.filter((k) => /score|jam|progress|next/i.test(k))).toEqual([])
  })

  it('응답에 잼·필요 잼·진행 키가 없다', async () => {
    const { result } = await readPublic(userChapter(3, 2777), userTribe(TRIBE_A))
    expect(JSON.stringify(result)).not.toContain('2777')
    expect(allKeys(result).filter((k) => /jam|progress|isLastChapter/i.test(k))).toEqual([])
  })

  it('chapter_jam·required_jam·total_score를 읽지도 않고, 챕터 정의 표·이름 표도 읽지 않는다', async () => {
    const { calls } = await readPublic(userChapter(3, 2500), userTribe(TRIBE_A))
    const row = calls.find((c) => c.table === 'user_chapters')
    expect(row?.select).toBe('chapter_no')
    expect(calls.map((c) => c.select ?? '').join(' ')).not.toMatch(/chapter_jam|required_jam|total_score|required_score/)
    expect(row?.eq).toEqual([['user_id', USER]])
    expect(calls.map((c) => c.table).sort()).toEqual(['user_chapters', 'users'])
  })

  it('챕터가 없는 유저는 챕터 번호 null이고 트라이브는 그대로 돌려준다', async () => {
    const { result } = await readPublic({ data: { chapter_no: null }, error: null }, userTribe(TRIBE_A))
    expect(result).toEqual({ ok: true, tribe: { id: TRIBE_A, name: '트라이브 A' }, chapterNo: null })
  })

  it('user_chapters 행이 없는 유저도 챕터 번호 null이다', async () => {
    const { result } = await readPublic({ data: null, error: null }, userTribe(TRIBE_A))
    expect(result).toEqual({ ok: true, tribe: { id: TRIBE_A, name: '트라이브 A' }, chapterNo: null })
  })

  it('트라이브가 없는 유저는 tribe가 null이고 챕터 번호는 그대로다', async () => {
    const { result } = await readPublic(userChapter(3, 2500), userTribe(null))
    expect(result).toEqual({ ok: true, tribe: null, chapterNo: 3 })
  })

  it('트라이브가 바뀐 유저는 챕터 숫자는 그대로이고 트라이브만 새 것이다', async () => {
    const before = (await readPublic(userChapter(3, 2500), userTribe(TRIBE_A))).result
    const after = (await readPublic(userChapter(3, 2500), userTribe(TRIBE_B))).result
    expect(before).toMatchObject({ chapterNo: 3, tribe: { id: TRIBE_A } })
    expect(after).toMatchObject({ chapterNo: 3, tribe: { id: TRIBE_B } })
  })
})

describe('읽지 못함은 «챕터 없음»과 구분된다', () => {
  const FAILED = { ok: false }
  const dbError: Result = { data: null, error: { message: 'permission denied' } }
  const boom: Handler = async () => {
    throw new Error('network down')
  }

  const mineCases: Array<[string, Handler, Handler]> = [
    ['user_chapters 오류', dbError, definitions],
    ['user_chapters 예외', boom, definitions],
    ['chapter_no가 해석할 수 없는 값', { data: { chapter_no: 'three', chapter_jam: 10 }, error: null }, definitions],
    ['chapter_jam이 해석할 수 없는 값', { data: { chapter_no: 2, chapter_jam: 'many' }, error: null }, definitions],
    ['chapter_jam이 음수', { data: { chapter_no: 2, chapter_jam: -1 }, error: null }, definitions],
    ['chapter_jam이 정수가 아님', { data: { chapter_no: 2, chapter_jam: 1.5 }, error: null }, definitions],
    ['chapter_jam이 NULL', { data: { chapter_no: 2, chapter_jam: null }, error: null }, definitions],
    ['chapter_definitions 오류', userChapter(2, 500), dbError],
    ['chapter_definitions 예외', userChapter(2, 500), boom],
    ['chapter_definitions에 해석할 수 없는 행', userChapter(2, 500), { data: [{ chapter_no: 2, required_jam: 'x' }], error: null }],
    ['required_jam이 0', userChapter(2, 500), { data: [{ chapter_no: 2, required_jam: 0 }], error: null }],
    ['required_jam이 정수가 아님', userChapter(2, 500), { data: [{ chapter_no: 2, required_jam: 10.5 }], error: null }],
    ['chapter_definitions가 목록이 아님', userChapter(2, 500), { data: { chapter_no: 2 }, error: null }],
    ['chapter_definitions에 지금 챕터가 없다', userChapter(4, 500), { data: [{ chapter_no: 1, required_jam: 870 }], error: null }],
  ]

  it.each(mineCases)('내 챕터: %s → { ok: false }이고 console.error를 남긴다', async (_label, chapter, defs) => {
    const { client } = mineClient(chapter, defs)
    const result = await getMyChapter(client, USER)
    expect(result).toEqual(FAILED)
    expect(errorSpy).toHaveBeenCalled()
  })

  const publicCases: Array<[string, Record<string, Handler>]> = [
    ['user_chapters 오류', { user_chapters: dbError, users: userTribe(TRIBE_A) }],
    ['user_chapters 예외', { user_chapters: boom, users: userTribe(TRIBE_A) }],
    ['chapter_no가 해석할 수 없는 값', { user_chapters: { data: { chapter_no: 0 }, error: null }, users: userTribe(TRIBE_A) }],
    ['users 오류', { user_chapters: userChapter(2, 1500), users: dbError }],
    ['users 예외', { user_chapters: userChapter(2, 1500), users: boom }],
    ['users의 트라이브가 해석할 수 없는 모양', { user_chapters: userChapter(2, 1500), users: { data: { tribe: { id: 7 } }, error: null } }],
  ]

  it.each(publicCases)('다른 유저용: %s → { ok: false }이고 console.error를 남긴다', async (_label, tables) => {
    const { client } = fakeClient(tables)
    const result = await getPublicChapter(client, USER)
    expect(result).toEqual(FAILED)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('조회 실패는 챕터 없음 응답과 같지 않다 (내 챕터)', async () => {
    const failed = await getMyChapter(mineClient(dbError).client, USER)
    const none = await getMyChapter(mineClient({ data: null, error: null }).client, USER)
    expect(failed).not.toEqual(none)
    expect(failed.ok).toBe(false)
    expect(none.ok).toBe(true)
  })

  it('조회 실패는 챕터 없음 응답과 같지 않다 (다른 유저용)', async () => {
    const failed = await getPublicChapter(fakeClient({ user_chapters: dbError, users: userTribe(TRIBE_A) }).client, USER)
    const none = await getPublicChapter(fakeClient({ user_chapters: { data: null, error: null }, users: userTribe(TRIBE_A) }).client, USER)
    expect(failed).not.toEqual(none)
    expect(failed.ok).toBe(false)
    expect(none.ok).toBe(true)
  })

  it('실패 응답에는 부분 값이 실리지 않는다', async () => {
    const result = await getMyChapter(mineClient(userChapter(2, 500), dbError).client, USER)
    expect(Object.keys(result)).toEqual(['ok'])
  })

  it('client.from 자체가 던져도 던지지 않는다', async () => {
    const client = {
      from: () => {
        throw new Error('client broke')
      },
    } as unknown as SupabaseClient
    expect(await getMyChapter(client, USER)).toEqual(FAILED)
    expect(await getPublicChapter(client, USER)).toEqual(FAILED)
  })
})

describe('getMyTribeName — 내 챕터 줄 앞에 붙는 트라이브 이름 (2026-11-09 사용자 지시)', () => {
  it('내 트라이브 이름만 돌려준다', async () => {
    const { client, calls } = fakeClient({ users: userTribe(TRIBE_A) })
    expect(await getMyTribeName(client, USER)).toBe('트라이브 A')
    // 점수·챕터 표는 읽지 않는다
    expect(calls.map((c) => c.table)).toEqual(['users'])
  })

  it('트라이브를 고르지 않았으면 null이다', async () => {
    const { client } = fakeClient({ users: userTribe(null) })
    expect(await getMyTribeName(client, USER)).toBeNull()
  })

  it('읽지 못하면 던지지 않고 null이며 console.error를 남긴다', async () => {
    const { client } = fakeClient({ users: { data: null, error: { message: 'boom' } } })
    expect(await getMyTribeName(client, USER)).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('getMyChapter의 응답 키는 고정 목록이다 — getMyTribeName을 따로 읽어도 키가 늘지 않는다', async () => {
    const { client } = mineClient(userChapter(3, 2500))
    const result = await getMyChapter(client, USER)
    expect(Object.keys(result).sort()).toEqual(MINE_KEYS)
  })
})

