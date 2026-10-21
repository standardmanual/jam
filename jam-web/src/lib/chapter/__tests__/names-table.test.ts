/**
 * lib/chapter/names-table — 챕터 이름 표의 읽기·저장 (티켓 20261019_1318 2회)
 *
 * 고정하는 것:
 * - 읽기: 트라이브는 비활성까지 `sort_order` 순 그대로, 챕터 번호는 정의대로, 이름은 값이 있는 칸만 담는다(NULL·공백뿐인 행은 «이름 없음»).
 * - 읽지 못하면 던진다(빈 표로 보이지 않는다). 이름 표가 읽기 상한에 닿으면 잘렸을 수 있어 던진다.
 * - 저장 본문: 앞뒤 공백을 지우고 20자 이하, 같은 칸 중복·잘못된 id·번호는 거절한다.
 * - 저장: 이름이 있는 칸은 upsert, 빈 칸은 행 삭제(읽기 쪽이 두 경우를 같게 본다). 없는 트라이브·챕터는 아무것도 쓰지 않는다.
 * - 화면용 diff: 앞뒤 공백을 지운 값이 같으면 바뀐 칸이 아니다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/names-table.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  CHAPTER_NAME_MAX_LENGTH,
  CHAPTER_NAMES_BODY_INVALID_MESSAGE,
  CHAPTER_NAMES_DUPLICATE_MESSAGE,
  CHAPTER_NAMES_TOO_LONG_MESSAGE,
  CHAPTER_NAMES_UNKNOWN_CELL_MESSAGE,
  ChapterNamesSaveError,
  cellKey,
  diffChapterNameCells,
  parseChapterNameChanges,
  readChapterNamesTable,
  saveChapterNameChanges,
} from '../names-table'
import { normalizeChapterName } from '../name'
import { createFakeNamesDb } from './fakeNamesDb'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

const seed = () => ({
  tribes: [
    { id: A, name: '러너', is_active: true, sort_order: 1 },
    { id: B, name: '워커', is_active: false, sort_order: 2 },
  ],
  chapter_definitions: [{ chapter_no: 1 }, { chapter_no: 2 }, { chapter_no: 3 }],
  chapter_names: [] as Array<Record<string, unknown>>,
})

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('readChapterNamesTable', () => {
  it('트라이브(비활성 포함)와 챕터 번호와 이름이 있는 칸을 돌려준다', async () => {
    const db = createFakeNamesDb({
      ...seed(),
      chapter_names: [
        { tribe_id: A, chapter_no: 2, name: '단골' },
        { tribe_id: B, chapter_no: 1, name: '새내기' },
      ],
    })
    const data = await readChapterNamesTable(db.client)
    expect(data.tribes).toEqual([
      { id: A, name: '러너', isActive: true },
      { id: B, name: '워커', isActive: false },
    ])
    expect(data.chapterNos).toEqual([1, 2, 3])
    expect(data.cells).toEqual([
      { tribeId: A, chapterNo: 2, name: '단골' },
      { tribeId: B, chapterNo: 1, name: '새내기' },
    ])
  })

  it('트라이브는 sort_order 순, 챕터 번호는 오름차순으로 읽는다(저장된 순서와 무관)', async () => {
    const db = createFakeNamesDb({
      ...seed(),
      tribes: [
        { id: B, name: '워커', is_active: false, sort_order: 2 },
        { id: A, name: '러너', is_active: true, sort_order: 1 },
      ],
      chapter_definitions: [{ chapter_no: 3 }, { chapter_no: 1 }, { chapter_no: 2 }],
    })
    const data = await readChapterNamesTable(db.client)
    expect(data.tribes.map((t) => t.id)).toEqual([A, B])
    expect(data.chapterNos).toEqual([1, 2, 3])
  })

  it('이름 표가 0행이어도 읽는다(초기 상태)', async () => {
    const db = createFakeNamesDb(seed())
    const data = await readChapterNamesTable(db.client)
    expect(data.cells).toEqual([])
    expect(data.tribes).toHaveLength(2)
  })

  it('NULL·빈 문자열·공백뿐인 이름 행은 «이름 없음»이라 칸에 담지 않는다(읽기 쪽 normalizeChapterName과 같다)', async () => {
    const rows = [
      { tribe_id: A, chapter_no: 1, name: null },
      { tribe_id: A, chapter_no: 2, name: '' },
      { tribe_id: A, chapter_no: 3, name: '  　 ' },
    ]
    const db = createFakeNamesDb({ ...seed(), chapter_names: rows })
    expect((await readChapterNamesTable(db.client)).cells).toEqual([])
    for (const r of rows) expect(normalizeChapterName(r.name)).toBeNull()
  })

  it.each(['tribes', 'chapter_definitions', 'chapter_names'])('%s를 읽지 못하면 던진다(빈 표처럼 보이지 않는다)', async (table) => {
    const db = createFakeNamesDb(seed())
    db.failOn.add(`${table}.select`)
    await expect(readChapterNamesTable(db.client)).rejects.toThrow()
  })

  it('이름 표가 읽기 상한(1,000행)에 닿으면 잘렸을 수 있어 던진다', async () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ tribe_id: A, chapter_no: i + 1, name: `이름${i}` }))
    const db = createFakeNamesDb({ ...seed(), chapter_names: many })
    await expect(readChapterNamesTable(db.client)).rejects.toThrow('잘렸을 수 있어')
  })
})

describe('parseChapterNameChanges', () => {
  const change = (over: Record<string, unknown> = {}) => ({ tribe_id: A, chapter_no: 1, name: '단골', ...over })

  it('앞뒤 공백(전각 포함)을 지운 이름을 돌려준다', () => {
    const r = parseChapterNameChanges({ changes: [change({ name: ' 　단골 ' })] })
    expect(r).toEqual({ ok: true, changes: [{ tribeId: A, chapterNo: 1, name: '단골' }] })
  })

  it('빈 문자열·공백뿐·null은 지우기(빈 이름)다', () => {
    const r = parseChapterNameChanges({ changes: [change({ name: '' }), change({ chapter_no: 2, name: '   ' }), change({ chapter_no: 3, name: null })] })
    expect(r).toEqual({
      ok: true,
      changes: [
        { tribeId: A, chapterNo: 1, name: '' },
        { tribeId: A, chapterNo: 2, name: '' },
        { tribeId: A, chapterNo: 3, name: '' },
      ],
    })
  })

  it('정확히 상한 길이는 받고, 한 글자 넘으면 거절한다(공백을 지운 뒤 글자 수)', () => {
    const atLimit = '가'.repeat(CHAPTER_NAME_MAX_LENGTH)
    expect(parseChapterNameChanges({ changes: [change({ name: ` ${atLimit} ` })] }).ok).toBe(true)
    expect(parseChapterNameChanges({ changes: [change({ name: `${atLimit}가` })] })).toEqual({ ok: false, error: CHAPTER_NAMES_TOO_LONG_MESSAGE })
  })

  it('이모지처럼 두 조각인 글자도 한 글자로 센다', () => {
    const name = '🙂'.repeat(CHAPTER_NAME_MAX_LENGTH)
    expect(parseChapterNameChanges({ changes: [change({ name })] }).ok).toBe(true)
  })

  it('같은 칸이 두 번 오면 거절한다', () => {
    expect(parseChapterNameChanges({ changes: [change(), change({ name: '다른' })] })).toEqual({ ok: false, error: CHAPTER_NAMES_DUPLICATE_MESSAGE })
  })

  it.each([
    ['본문이 객체가 아니다', null],
    ['changes가 배열이 아니다', { changes: 'x' }],
    ['tribe_id가 UUID가 아니다', { changes: [change({ tribe_id: 'abc' })] }],
    ['tribe_id가 문자열이 아니다', { changes: [change({ tribe_id: 3 })] }],
    ['chapter_no가 정수가 아니다', { changes: [change({ chapter_no: 1.5 })] }],
    ['chapter_no가 0이다', { changes: [change({ chapter_no: 0 })] }],
    ['chapter_no가 문자열이다', { changes: [change({ chapter_no: '1' })] }],
    ['name이 문자열도 null도 아니다', { changes: [change({ name: 7 })] }],
    ['name이 없다(undefined)', { changes: [{ tribe_id: A, chapter_no: 1 }] }],
  ])('%s → 거절', (_label, body) => {
    expect(parseChapterNameChanges(body)).toEqual({ ok: false, error: CHAPTER_NAMES_BODY_INVALID_MESSAGE })
  })

  it('빈 배열은 바뀐 것 없음으로 받는다', () => {
    expect(parseChapterNameChanges({ changes: [] })).toEqual({ ok: true, changes: [] })
  })
})

describe('saveChapterNameChanges', () => {
  it('이름이 있는 칸은 upsert하고 기존 행은 이름만 바꾼다', async () => {
    const db = createFakeNamesDb({ ...seed(), chapter_names: [{ tribe_id: A, chapter_no: 1, name: '옛이름' }] })
    const result = await saveChapterNameChanges(db.client, [
      { tribeId: A, chapterNo: 1, name: '새이름' },
      { tribeId: B, chapterNo: 2, name: '단골' },
    ])
    expect(result).toEqual({ ok: true, saved: 2, cleared: 0 })
    expect(db.tables.chapter_names.map((r) => [r.tribe_id, r.chapter_no, r.name]).sort()).toEqual(
      [
        [A, 1, '새이름'],
        [B, 2, '단골'],
      ].sort()
    )
    expect(db.tables.chapter_names.every((r) => typeof r.updated_at === 'string')).toBe(true)
  })

  it('빈 칸은 행을 지운다(이름 없음 = 행 없음)', async () => {
    const db = createFakeNamesDb({
      ...seed(),
      chapter_names: [
        { tribe_id: A, chapter_no: 1, name: '가' },
        { tribe_id: A, chapter_no: 2, name: '나' },
        { tribe_id: B, chapter_no: 1, name: '다' },
      ],
    })
    const result = await saveChapterNameChanges(db.client, [
      { tribeId: A, chapterNo: 1, name: '' },
      { tribeId: A, chapterNo: 3, name: '' },
    ])
    expect(result).toEqual({ ok: true, saved: 0, cleared: 2 })
    expect(db.tables.chapter_names.map((r) => [r.tribe_id, r.chapter_no])).toEqual([
      [A, 2],
      [B, 1],
    ])
  })

  it('이름 넣기와 지우기가 섞이면 넣은 뒤 지운다', async () => {
    const db = createFakeNamesDb({ ...seed(), chapter_names: [{ tribe_id: A, chapter_no: 1, name: '가' }] })
    await saveChapterNameChanges(db.client, [
      { tribeId: A, chapterNo: 1, name: '' },
      { tribeId: A, chapterNo: 2, name: '나' },
    ])
    expect(db.calls.filter((c) => c.startsWith('chapter_names.'))).toEqual(['chapter_names.upsert', 'chapter_names.delete'])
  })

  it('바뀐 칸이 없으면 DB를 부르지 않는다', async () => {
    const db = createFakeNamesDb(seed())
    expect(await saveChapterNameChanges(db.client, [])).toEqual({ ok: true, saved: 0, cleared: 0 })
    expect(db.calls).toEqual([])
  })

  it('없는 트라이브가 섞이면 아무것도 쓰지 않고 거절한다', async () => {
    const db = createFakeNamesDb(seed())
    const result = await saveChapterNameChanges(db.client, [
      { tribeId: A, chapterNo: 1, name: '가' },
      { tribeId: C, chapterNo: 1, name: '나' },
    ])
    expect(result).toEqual({ ok: false, error: CHAPTER_NAMES_UNKNOWN_CELL_MESSAGE })
    expect(db.tables.chapter_names).toEqual([])
    expect(db.calls.some((c) => c.endsWith('.upsert') || c.endsWith('.delete'))).toBe(false)
  })

  it('없는 챕터 번호가 섞이면 아무것도 쓰지 않고 거절한다', async () => {
    const db = createFakeNamesDb(seed())
    const result = await saveChapterNameChanges(db.client, [{ tribeId: A, chapterNo: 99, name: '가' }])
    expect(result).toEqual({ ok: false, error: CHAPTER_NAMES_UNKNOWN_CELL_MESSAGE })
    expect(db.tables.chapter_names).toEqual([])
  })

  it('저장 전 존재 확인을 읽지 못하면 던지고 아무것도 쓰지 않는다(partial 아님)', async () => {
    const db = createFakeNamesDb(seed())
    db.failOn.add('tribes.select')
    await expect(saveChapterNameChanges(db.client, [{ tribeId: A, chapterNo: 1, name: '가' }])).rejects.toMatchObject({ partial: false })
    expect(db.tables.chapter_names).toEqual([])
  })

  it('upsert가 실패하면 partial이 아니다', async () => {
    const db = createFakeNamesDb(seed())
    db.failOn.add('chapter_names.upsert')
    const err = await saveChapterNameChanges(db.client, [{ tribeId: A, chapterNo: 1, name: '가' }]).catch((e) => e)
    expect(err).toBeInstanceOf(ChapterNamesSaveError)
    expect(err.partial).toBe(false)
  })

  it('upsert는 됐는데 지우기가 실패하면 partial이다(일부만 저장됨)', async () => {
    const db = createFakeNamesDb({ ...seed(), chapter_names: [{ tribe_id: A, chapter_no: 2, name: '나' }] })
    db.failOn.add('chapter_names.delete')
    const err = await saveChapterNameChanges(db.client, [
      { tribeId: A, chapterNo: 1, name: '가' },
      { tribeId: A, chapterNo: 2, name: '' },
    ]).catch((e) => e)
    expect(err.partial).toBe(true)
    expect(db.tables.chapter_names.map((r) => r.chapter_no).sort()).toEqual([1, 2])
  })

  it('지우기만 하다 실패하면 partial이 아니다', async () => {
    const db = createFakeNamesDb({ ...seed(), chapter_names: [{ tribe_id: A, chapter_no: 2, name: '나' }] })
    db.failOn.add('chapter_names.delete')
    const err = await saveChapterNameChanges(db.client, [{ tribeId: A, chapterNo: 2, name: '' }]).catch((e) => e)
    expect(err.partial).toBe(false)
  })
})

describe('diffChapterNameCells — 화면의 바뀐 칸 계산', () => {
  const key = cellKey(A, 1)

  it('같은 값이면 바뀐 칸이 아니다', () => {
    expect(diffChapterNameCells({ [key]: '단골' }, { [key]: '단골' })).toEqual([])
  })

  it('앞뒤 공백만 다르면 바뀐 칸이 아니다', () => {
    expect(diffChapterNameCells({ [key]: '단골' }, { [key]: ' 단골 ' })).toEqual([])
    expect(diffChapterNameCells({}, { [key]: '   ' })).toEqual([])
  })

  it('새로 쓴 이름은 공백을 지운 값으로 돌려준다', () => {
    expect(diffChapterNameCells({}, { [key]: ' 단골 ' })).toEqual([{ tribeId: A, chapterNo: 1, name: '단골' }])
  })

  it('이름이 있던 칸을 비우면 빈 이름(지우기)으로 돌려준다', () => {
    expect(diffChapterNameCells({ [key]: '단골' }, { [key]: '' })).toEqual([{ tribeId: A, chapterNo: 1, name: '' }])
  })

  it('바뀐 칸만 담는다', () => {
    const other = cellKey(B, 3)
    expect(diffChapterNameCells({ [key]: '가', [other]: '나' }, { [key]: '가', [other]: '다' })).toEqual([{ tribeId: B, chapterNo: 3, name: '다' }])
  })
})
