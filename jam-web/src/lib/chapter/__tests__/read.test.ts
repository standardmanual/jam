/**
 * lib/chapter/read — 챕터 읽기 (티켓 20261019_1316 2회, 운영 로직 12.3절)
 *
 * 고정하는 것:
 * - 내 챕터(`getMyChapter`): 챕터 번호, 이름, 다음 챕터 번호, 다음 챕터까지의 비율. 챕터가 없는 유저(행 없음·chapter_no NULL)는 챕터 번호 null이고
 *   이름·다음 챕터·비율도 null이며 정의·트라이브 표를 읽지 않는다. 정의는 `chapter_definitions` 전체를 한 번 읽는다.
 * - 점수의 숫자는 응답에 없다: 두 응답의 키 목록을 고정하고, 키 이름에 score가 없으며, 읽은 점수 값이 응답 어디에도 나오지 않는다.
 * - 다른 유저용(`getPublicChapter`): 트라이브, 챕터 번호, 이름만 돌려준다. 진행 키가 없고, 점수 열(total_score)·챕터 정의 표를 읽지도 않는다.
 * - 이름: 이름 표가 0행·null·빈 문자열·공백뿐이면 null이다. 트라이브가 바뀐 유저는 챕터 숫자는 그대로이고 이름만 새 트라이브 것이다(지금 트라이브로 읽는다).
 *   트라이브가 없으면 이름 표를 읽지 않고 null이다.
 * - 읽지 못함: 어느 조회든 오류·예외·계약 밖 값이면 던지지 않고 `{ ok: false }`이며 `console.error`를 남긴다. «챕터 없음»(`{ ok: true, chapterNo: null, ... }`)과 구분된다.
 * 공용 DB는 부르지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/read.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMyChapter, getPublicChapter } from '../read'

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

/** 운영 로직 12.4절의 챕터 1~10 필요 점수 */
const DEFINITION_ROWS = [0, 1000, 2300, 3800, 5700, 8500, 11500, 15000, 19000, 23000].map((required_score, i) => ({
  chapter_no: i + 1,
  required_score,
}))

const definitions: Result = { data: DEFINITION_ROWS, error: null }
const userChapter = (chapter_no: number | null, total_score: number): Result => ({ data: { chapter_no, total_score }, error: null })
const userTribe = (tribeId: string | null): Result => ({
  data: { tribe: tribeId ? { id: tribeId, name: tribeId === TRIBE_A ? '트라이브 A' : '트라이브 B' } : null },
  error: null,
})

/** (트라이브, 챕터) → 이름을 돌려주는 이름 표. 없는 조합은 행 없음이다 */
function namesTable(rows: Array<{ tribe_id: string; chapter_no: number; name: string | null }>): Handler {
  return (call) => {
    const tribeId = call.eq.find(([c]) => c === 'tribe_id')?.[1]
    const chapterNo = call.eq.find(([c]) => c === 'chapter_no')?.[1]
    const row = rows.find((r) => r.tribe_id === tribeId && r.chapter_no === chapterNo)
    return { data: row ? { name: row.name } : null, error: null }
  }
}

const EMPTY_NAMES: Handler = { data: null, error: null }

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

describe('getMyChapter — 챕터가 없는 유저', () => {
  const NO_CHAPTER = { ok: true, chapterNo: null, name: null, nextChapterNo: null, progress: null }

  it('user_chapters 행이 없다 → 챕터 번호 null, 정의·트라이브·이름 표는 읽지 않는다', async () => {
    const { client, tablesRead } = fakeClient({ user_chapters: { data: null, error: null } })
    expect(await getMyChapter(client, USER)).toEqual(NO_CHAPTER)
    expect(tablesRead()).toEqual(['user_chapters'])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('chapter_no가 NULL이다 (퀘스트 전, 점수만 쌓임) → 챕터 번호 null', async () => {
    const { client, tablesRead } = fakeClient({ user_chapters: userChapter(null, 640) })
    expect(await getMyChapter(client, USER)).toEqual(NO_CHAPTER)
    expect(tablesRead()).toEqual(['user_chapters'])
  })
})

describe('getMyChapter — 진행 비율', () => {
  async function read(chapterNo: number, totalScore: number) {
    const { client, calls } = fakeClient({
      user_chapters: userChapter(chapterNo, totalScore),
      chapter_definitions: definitions,
      users: userTribe(TRIBE_A),
      chapter_names: EMPTY_NAMES,
    })
    return { result: await getMyChapter(client, USER), calls }
  }

  it('챕터 2에 막 도달했다 → 0이고 다음 챕터는 3이다', async () => {
    const { result } = await read(2, 1000)
    expect(result).toEqual({ ok: true, chapterNo: 2, name: null, nextChapterNo: 3, progress: 0 })
  })

  it('중간이다 → 0.5', async () => {
    const { result } = await read(2, 1650)
    expect(result).toMatchObject({ ok: true, chapterNo: 2, nextChapterNo: 3, progress: 0.5 })
  })

  it('다음 챕터 직전이다 → 1이 아니라 0.99 (내림)', async () => {
    const { result } = await read(2, 2299)
    expect(result).toMatchObject({ ok: true, chapterNo: 2, nextChapterNo: 3, progress: 0.99 })
  })

  it('점수가 챕터 정의보다 커서 비율이 1로 잘린다', async () => {
    // 점수 함수는 오를 수 있는 만큼 한 번에 올리지만, 읽는 시점의 불일치(점수 반영 직후 등)에도 1을 넘지 않는다
    const { result } = await read(2, 9000)
    expect(result).toMatchObject({ ok: true, chapterNo: 2, nextChapterNo: 3, progress: 1 })
  })

  it('마지막 챕터이다 → 다음 챕터 번호와 비율이 null이다', async () => {
    const { result } = await read(10, 40000)
    expect(result).toEqual({ ok: true, chapterNo: 10, name: null, nextChapterNo: null, progress: null })
  })

  it('정의가 하나뿐이다 (챕터 1만) → 다음 챕터가 없다', async () => {
    const { client } = fakeClient({
      user_chapters: userChapter(1, 300),
      chapter_definitions: { data: [{ chapter_no: 1, required_score: 0 }], error: null },
      users: userTribe(TRIBE_A),
      chapter_names: EMPTY_NAMES,
    })
    expect(await getMyChapter(client, USER)).toEqual({ ok: true, chapterNo: 1, name: null, nextChapterNo: null, progress: null })
  })

  it('chapter_definitions는 전체를 한 번만 읽는다', async () => {
    const { calls } = await read(2, 1650)
    const definitionReads = calls.filter((c) => c.table === 'chapter_definitions')
    expect(definitionReads).toHaveLength(1)
    expect(definitionReads[0].select).toBe('chapter_no, required_score')
    expect(definitionReads[0].eq).toEqual([])
  })

  it('user_chapters는 이 유저의 행을 읽는다', async () => {
    const { calls } = await read(2, 1650)
    const row = calls.find((c) => c.table === 'user_chapters')
    expect(row?.eq).toEqual([['user_id', USER]])
    expect(row?.select).toBe('chapter_no, total_score')
  })
})

describe('getMyChapter — 점수의 숫자는 응답에 없다 (운영 로직 12.3절)', () => {
  const TOTAL = 1777 // 응답 어디에도 나오면 안 되는 값

  async function readWithScore() {
    const { client } = fakeClient({
      user_chapters: userChapter(2, TOTAL),
      chapter_definitions: definitions,
      users: userTribe(TRIBE_A),
      chapter_names: namesTable([{ tribe_id: TRIBE_A, chapter_no: 2, name: '단골' }]),
    })
    return getMyChapter(client, USER)
  }

  it('응답의 키 목록이 고정이다', async () => {
    const result = await readWithScore()
    expect(Object.keys(result).sort()).toEqual(['chapterNo', 'name', 'nextChapterNo', 'ok', 'progress'])
  })

  it('챕터가 없는 유저의 응답도 같은 키 목록이다', async () => {
    const { client } = fakeClient({ user_chapters: { data: null, error: null } })
    const result = await getMyChapter(client, USER)
    expect(Object.keys(result).sort()).toEqual(['chapterNo', 'name', 'nextChapterNo', 'ok', 'progress'])
  })

  it('키 이름에 score가 없고 읽은 점수 값이 어디에도 나오지 않는다', async () => {
    const result = await readWithScore()
    expect(allKeys(result).filter((k) => /score/i.test(k))).toEqual([])
    expect(JSON.stringify(result)).not.toContain(String(TOTAL))
    // 챕터 정의의 필요 점수(1000, 2300)나 둘의 차이(1300)도 싣지 않는다
    const json = JSON.stringify(result)
    for (const value of ['1000', '2300', '1300', '777', '550']) expect(json).not.toContain(value)
  })
})

describe('getMyChapter — 이름', () => {
  async function readName(names: Handler, tribe: Result = userTribe(TRIBE_A)) {
    const { client, tablesRead } = fakeClient({
      user_chapters: userChapter(3, 2500),
      chapter_definitions: definitions,
      users: tribe,
      chapter_names: names,
    })
    return { result: await getMyChapter(client, USER), tablesRead }
  }

  it('지금 트라이브의 이름 표에서 지금 챕터의 이름을 읽는다', async () => {
    const { result } = await readName(namesTable([{ tribe_id: TRIBE_A, chapter_no: 3, name: '단골' }]))
    expect(result).toMatchObject({ ok: true, chapterNo: 3, name: '단골' })
  })

  it('이름 표가 0행이어도 동작한다 (이름 null, 나머지는 그대로)', async () => {
    const { result } = await readName(EMPTY_NAMES)
    expect(result).toEqual({ ok: true, chapterNo: 3, name: null, nextChapterNo: 4, progress: 0.13 })
  })

  it.each([['null', null], ['빈 문자열', ''], ['공백뿐', '   ']])('name이 %s이면 null이다', async (_label, name) => {
    const { result } = await readName(namesTable([{ tribe_id: TRIBE_A, chapter_no: 3, name }]))
    expect(result).toMatchObject({ ok: true, chapterNo: 3, name: null })
  })

  it('트라이브가 바뀐 유저는 챕터 숫자는 그대로이고 이름만 새 트라이브 것이다', async () => {
    const names = namesTable([
      { tribe_id: TRIBE_A, chapter_no: 3, name: 'A의 단골' },
      { tribe_id: TRIBE_B, chapter_no: 3, name: 'B의 단골' },
    ])
    const before = (await readName(names, userTribe(TRIBE_A))).result
    const after = (await readName(names, userTribe(TRIBE_B))).result
    expect(before).toMatchObject({ chapterNo: 3, name: 'A의 단골', nextChapterNo: 4, progress: 0.13 })
    expect(after).toMatchObject({ chapterNo: 3, name: 'B의 단골', nextChapterNo: 4, progress: 0.13 })
  })

  it('새 트라이브에 이름이 없으면 옛 트라이브의 이름을 쓰지 않고 null이다', async () => {
    const { result } = await readName(namesTable([{ tribe_id: TRIBE_A, chapter_no: 3, name: 'A의 단골' }]), userTribe(TRIBE_B))
    expect(result).toMatchObject({ chapterNo: 3, name: null })
  })

  it('트라이브를 고르지 않은 유저는 이름 표를 읽지 않고 이름 null이다', async () => {
    const { result, tablesRead } = await readName(EMPTY_NAMES, userTribe(null))
    expect(result).toMatchObject({ ok: true, chapterNo: 3, name: null, nextChapterNo: 4 })
    expect(tablesRead()).not.toContain('chapter_names')
  })
})

describe('getPublicChapter — 다른 유저에게 보이는 것', () => {
  async function readPublic(chapter: Result, tribe: Result, names: Handler = EMPTY_NAMES) {
    const { client, calls } = fakeClient({ user_chapters: chapter, users: tribe, chapter_names: names })
    return { result: await getPublicChapter(client, USER), calls }
  }

  it('트라이브, 챕터 번호, 이름만 돌려준다', async () => {
    const { result } = await readPublic(
      userChapter(3, 2500),
      userTribe(TRIBE_A),
      namesTable([{ tribe_id: TRIBE_A, chapter_no: 3, name: '단골' }])
    )
    expect(result).toEqual({ ok: true, tribe: { id: TRIBE_A, name: '트라이브 A' }, chapterNo: 3, name: '단골' })
  })

  it('응답의 키 목록이 고정이다 — 진행(비율·다음 챕터)과 점수 키가 없다', async () => {
    const { result } = await readPublic(userChapter(3, 2500), userTribe(TRIBE_A))
    expect(Object.keys(result).sort()).toEqual(['chapterNo', 'name', 'ok', 'tribe'])
    expect(Object.keys((result as { tribe: object }).tribe).sort()).toEqual(['id', 'name'])
    const keys = allKeys(result)
    expect(keys.filter((k) => /score|progress|next/i.test(k))).toEqual([])
  })

  it('읽은 점수 값이 응답에 나오지 않는다', async () => {
    const { result } = await readPublic(userChapter(3, 2777), userTribe(TRIBE_A))
    expect(JSON.stringify(result)).not.toContain('2777')
  })

  it('점수 열과 챕터 정의 표를 읽지도 않는다', async () => {
    const { calls } = await readPublic(userChapter(3, 2500), userTribe(TRIBE_A))
    const row = calls.find((c) => c.table === 'user_chapters')
    expect(row?.select).toBe('chapter_no')
    expect(row?.eq).toEqual([['user_id', USER]])
    expect(calls.map((c) => c.table)).not.toContain('chapter_definitions')
  })

  it('챕터가 없는 유저는 챕터 번호 null이고 트라이브는 그대로 돌려준다', async () => {
    const { result, calls } = await readPublic({ data: { chapter_no: null }, error: null }, userTribe(TRIBE_A))
    expect(result).toEqual({ ok: true, tribe: { id: TRIBE_A, name: '트라이브 A' }, chapterNo: null, name: null })
    expect(calls.map((c) => c.table)).not.toContain('chapter_names')
  })

  it('user_chapters 행이 없는 유저도 챕터 번호 null이다', async () => {
    const { result } = await readPublic({ data: null, error: null }, userTribe(TRIBE_A))
    expect(result).toEqual({ ok: true, tribe: { id: TRIBE_A, name: '트라이브 A' }, chapterNo: null, name: null })
  })

  it('트라이브가 없는 유저는 tribe와 name이 null이고 챕터 번호는 그대로다', async () => {
    const { result, calls } = await readPublic(userChapter(3, 2500), userTribe(null))
    expect(result).toEqual({ ok: true, tribe: null, chapterNo: 3, name: null })
    expect(calls.map((c) => c.table)).not.toContain('chapter_names')
  })

  it('이름이 비어 있으면 null이다 (이름 표 0행)', async () => {
    const { result } = await readPublic(userChapter(3, 2500), userTribe(TRIBE_A), EMPTY_NAMES)
    expect(result).toMatchObject({ ok: true, chapterNo: 3, name: null })
  })

  it('트라이브가 바뀐 유저는 챕터 숫자는 그대로이고 이름만 새 트라이브 것이다', async () => {
    const names = namesTable([
      { tribe_id: TRIBE_A, chapter_no: 3, name: 'A의 단골' },
      { tribe_id: TRIBE_B, chapter_no: 3, name: 'B의 단골' },
    ])
    const before = (await readPublic(userChapter(3, 2500), userTribe(TRIBE_A), names)).result
    const after = (await readPublic(userChapter(3, 2500), userTribe(TRIBE_B), names)).result
    expect(before).toMatchObject({ chapterNo: 3, name: 'A의 단골', tribe: { id: TRIBE_A } })
    expect(after).toMatchObject({ chapterNo: 3, name: 'B의 단골', tribe: { id: TRIBE_B } })
  })
})

describe('읽지 못함은 «챕터 없음»과 구분된다', () => {
  const FAILED = { ok: false }
  const dbError: Result = { data: null, error: { message: 'permission denied' } }
  const boom: Handler = async () => {
    throw new Error('network down')
  }

  const mineCases: Array<[string, Record<string, Handler>]> = [
    ['user_chapters 오류', { user_chapters: dbError }],
    ['user_chapters 예외', { user_chapters: boom }],
    ['chapter_no가 해석할 수 없는 값', { user_chapters: { data: { chapter_no: 'three', total_score: 10 }, error: null } }],
    ['total_score가 해석할 수 없는 값', { user_chapters: { data: { chapter_no: 2, total_score: 'many' }, error: null } }],
    ['chapter_definitions 오류', { user_chapters: userChapter(2, 1500), chapter_definitions: dbError, users: userTribe(TRIBE_A) }],
    ['chapter_definitions 예외', { user_chapters: userChapter(2, 1500), chapter_definitions: boom, users: userTribe(TRIBE_A) }],
    [
      'chapter_definitions에 해석할 수 없는 행',
      { user_chapters: userChapter(2, 1500), chapter_definitions: { data: [{ chapter_no: 2, required_score: 'x' }], error: null }, users: userTribe(TRIBE_A) },
    ],
    [
      'chapter_definitions에 지금 챕터가 없다',
      { user_chapters: userChapter(4, 1500), chapter_definitions: { data: [{ chapter_no: 1, required_score: 0 }], error: null }, users: userTribe(TRIBE_A) },
    ],
    ['users 오류', { user_chapters: userChapter(2, 1500), chapter_definitions: definitions, users: dbError }],
    ['users 예외', { user_chapters: userChapter(2, 1500), chapter_definitions: definitions, users: boom }],
    [
      'users의 트라이브가 해석할 수 없는 모양',
      { user_chapters: userChapter(2, 1500), chapter_definitions: definitions, users: { data: { tribe: { id: 7 } }, error: null } },
    ],
    [
      'chapter_names 오류',
      { user_chapters: userChapter(2, 1500), chapter_definitions: definitions, users: userTribe(TRIBE_A), chapter_names: dbError },
    ],
    [
      'chapter_names 예외',
      { user_chapters: userChapter(2, 1500), chapter_definitions: definitions, users: userTribe(TRIBE_A), chapter_names: boom },
    ],
  ]

  it.each(mineCases)('내 챕터: %s → { ok: false }이고 console.error를 남긴다', async (_label, tables) => {
    const { client } = fakeClient(tables)
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
    ['chapter_names 오류', { user_chapters: userChapter(2, 1500), users: userTribe(TRIBE_A), chapter_names: dbError }],
    ['chapter_names 예외', { user_chapters: userChapter(2, 1500), users: userTribe(TRIBE_A), chapter_names: boom }],
  ]

  it.each(publicCases)('다른 유저용: %s → { ok: false }이고 console.error를 남긴다', async (_label, tables) => {
    const { client } = fakeClient(tables)
    const result = await getPublicChapter(client, USER)
    expect(result).toEqual(FAILED)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('조회 실패는 챕터 없음 응답과 같지 않다 (내 챕터)', async () => {
    const failed = await getMyChapter(fakeClient({ user_chapters: dbError }).client, USER)
    const none = await getMyChapter(fakeClient({ user_chapters: { data: null, error: null } }).client, USER)
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
    const result = await getMyChapter(
      fakeClient({ user_chapters: userChapter(2, 1500), chapter_definitions: definitions, users: userTribe(TRIBE_A), chapter_names: dbError }).client,
      USER
    )
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
