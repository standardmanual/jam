/**
 * 완성 판정 일치 시험 — 티켓 20261016_2340 2회-가
 *
 * 같은 사례표(fixtures/completion-parity-cases.json)로
 *  1) 코드 판정(`computeBookCompletion`)이 기대값과 같은지,
 *  2) DB 장착 함수 시험 파일(supabase/tests/222_completion_parity.test.sql)이 같은 사례표를 담고 있는지 확인한다.
 * SQL 쪽 실행은 카리나가 한다. 사례표가 코드와 SQL에서 갈라지지 않게 2)가 문자 단위가 아니라 JSON 내용으로 대조한다.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { buildFilledByBook } from '../filled-by-book'
import {
  COMPLETION_BADGE_TYPES,
  computeBookCompletion,
  isBookCompleted,
  type CompletionBadgeInput,
} from '../completion-basis'
import fixture from './fixtures/completion-parity-cases.json'

interface FixtureBadge {
  key: string
  name: string
  type: string
  rarity?: string | null
  dropExcluded?: boolean
  deleted?: boolean
}
interface FixtureCase {
  name: string
  tierMode: boolean
  sql?: boolean
  badges: FixtureBadge[]
  slotted: string[]
  expect: {
    tier: string | null
    total: number
    filled: number
    complete: boolean
    tiers?: Record<string, { total: number; filled: number; complete: boolean }>
  }
}

const BOOK = 'book-under-test'
const cases = fixture.cases as FixtureCase[]

function toInputs(c: FixtureCase): CompletionBadgeInput[] {
  return c.badges.map((b) => ({
    id: b.key,
    item_book_id: BOOK,
    type: b.type,
    drop_excluded: b.dropExcluded ?? false,
    name: b.name,
    rarity: b.rarity === undefined ? 'common' : b.rarity,
    deleted_at: b.deleted ? '2026-10-01T00:00:00Z' : null,
  }))
}

describe('완성 판정 사례표 (코드)', () => {
  it('사례표가 비어 있지 않고 SQL 대상 사례를 포함한다', () => {
    expect(cases.length).toBeGreaterThan(20)
    expect(cases.filter((c) => c.sql !== false).length).toBeGreaterThan(15)
    expect(cases.some((c) => c.tierMode)).toBe(true)
    expect(cases.some((c) => !c.tierMode)).toBe(true)
  })

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const result = computeBookCompletion(toInputs(c), new Set<string>(), {
      filledByBook: new Map([[BOOK, new Set(c.slotted)]]),
      tierModeBookIds: c.tierMode ? new Set([BOOK]) : undefined,
    }).get(BOOK)

    // 분모가 없는 사례는 결과 행 자체가 없다(= 총 0칸, 미완성)
    expect({
      tier: result?.tier ?? null,
      total: result?.total ?? 0,
      filled: result?.filled ?? 0,
      complete: result?.complete ?? false,
    }).toEqual({
      tier: c.expect.tier,
      total: c.expect.total,
      filled: c.expect.filled,
      complete: c.expect.complete,
    })

    if (c.expect.tiers) {
      for (const [tier, e] of Object.entries(c.expect.tiers)) {
        const t = result?.tiers[tier]
        expect({ total: t?.total, filled: t?.filled, complete: t?.complete }).toEqual(e)
      }
    }
    // 옛 컬렉션은 등급 정보를 만들지 않는다
    if (!c.tierMode) expect(result?.tiers ?? {}).toEqual({})
  })

  it('filledByBook 없이 filledBadgeIds 하나로 줘도 같은 결과다', () => {
    for (const c of cases) {
      const a = computeBookCompletion(toInputs(c), new Set(c.slotted), {
        tierModeBookIds: c.tierMode ? new Set([BOOK]) : undefined,
      }).get(BOOK)
      const b = computeBookCompletion(toInputs(c), new Set<string>(), {
        filledByBook: new Map([[BOOK, new Set(c.slotted)]]),
        tierModeBookIds: c.tierMode ? new Set([BOOK]) : undefined,
      }).get(BOOK)
      expect(a, c.name).toEqual(b)
    }
  })
})

describe('컬렉션별 분자', () => {
  it('다른 컬렉션 슬롯에 꽂힌 같은 배지는 분자에 들지 않는다', () => {
    const badges: CompletionBadgeInput[] = [
      { id: 'x', item_book_id: 'book-b', type: 'item', drop_excluded: false },
      { id: 'y', item_book_id: 'book-b', type: 'item', drop_excluded: false },
    ]
    // x는 book-a 슬롯에 꽂혀 있고 현재 소속은 book-b다
    const filledByBook = buildFilledByBook({
      slots: [
        { item_book_id: 'book-a', badge_id: 'x' },
        { item_book_id: 'book-b', badge_id: 'y' },
      ],
      checkinBadgesByBook: new Map(),
      earnedCheckinBadgeIds: new Set(),
    })
    const r = computeBookCompletion(badges, new Set<string>(), { filledByBook }).get('book-b')!
    expect(r.filledIds).toEqual(['y'])
    expect(r.complete).toBe(false)
  })

  it('컬렉션마다 따로 판정한다', () => {
    const badges: CompletionBadgeInput[] = [
      { id: 'a1', item_book_id: 'book-a', type: 'item', drop_excluded: false },
      { id: 'b1', item_book_id: 'book-b', type: 'item', drop_excluded: false },
      { id: 'b2', item_book_id: 'book-b', type: 'item', drop_excluded: false },
    ]
    const filledByBook = new Map([
      ['book-a', new Set(['a1'])],
      ['book-b', new Set(['b1'])],
    ])
    const r = computeBookCompletion(badges, new Set<string>(), { filledByBook })
    expect(r.get('book-a')!.complete).toBe(true)
    expect(r.get('book-b')!.complete).toBe(false)
  })

  it('tier_mode 컬렉션과 옛 컬렉션을 한 번에 섞어 줘도 각자 규칙으로 센다', () => {
    const badges: CompletionBadgeInput[] = [
      { id: 'o1', item_book_id: 'old', type: 'item', drop_excluded: false, name: 'X', rarity: 'common' },
      { id: 'o2', item_book_id: 'old', type: 'item', drop_excluded: false, name: 'X', rarity: 'rare' },
      { id: 't1', item_book_id: 'tier', type: 'item', drop_excluded: false, name: 'X', rarity: 'common' },
      { id: 't2', item_book_id: 'tier', type: 'item', drop_excluded: false, name: 'X', rarity: 'rare' },
    ]
    const filledByBook = new Map([
      ['old', new Set(['o1'])],
      ['tier', new Set(['t1'])],
    ])
    const r = computeBookCompletion(badges, new Set<string>(), {
      filledByBook,
      tierModeBookIds: new Set(['tier']),
    })
    expect(r.get('old')).toMatchObject({ total: 2, filled: 1, complete: false, tier: null })
    expect(r.get('tier')).toMatchObject({ total: 1, filled: 1, complete: true, tier: 'common' })
  })
})

describe('isBookCompleted', () => {
  const badges: CompletionBadgeInput[] = [
    { id: 'a', item_book_id: 'book-a', type: 'item', drop_excluded: false },
    { id: 'b', item_book_id: 'book-a', type: 'item', drop_excluded: false },
  ]
  const incomplete = computeBookCompletion(badges, new Set(['a'])).get('book-a')
  const complete = computeBookCompletion(badges, new Set(['a', 'b'])).get('book-a')

  it('옛 완성 기록이 있으면 계산이 미완성이어도 완성이다', () => {
    expect(isBookCompleted(new Set(['book-a']), 'book-a', incomplete)).toBe(true)
  })
  it('기록이 없고 계산이 완성이면 완성이다', () => {
    expect(isBookCompleted(new Set(), 'book-a', complete)).toBe(true)
  })
  it('기록도 없고 계산도 미완성이면 미완성이다', () => {
    expect(isBookCompleted(new Set(), 'book-a', incomplete)).toBe(false)
  })
  it('계산 결과가 없는 컬렉션은 기록이 있을 때만 완성이다', () => {
    expect(isBookCompleted(new Set(), 'book-z', undefined)).toBe(false)
    expect(isBookCompleted(new Set(['book-z']), 'book-z', undefined)).toBe(true)
  })
})

describe('분모 배지 종류 기본값', () => {
  it('item과 checkin이다', () => {
    expect([...COMPLETION_BADGE_TYPES]).toEqual(['item', 'checkin'])
  })
  it('다른 종류는 분모에 들지 않는다', () => {
    const badges: CompletionBadgeInput[] = [
      { id: 'a', item_book_id: 'book-a', type: 'item', drop_excluded: false },
      { id: 'p', item_book_id: 'book-a', type: 'activity', drop_excluded: false },
    ]
    expect(computeBookCompletion(badges, new Set(['a'])).get('book-a')!.complete).toBe(true)
  })
})

describe('SQL 시험 파일과 사례표 동기화', () => {
  it('222_completion_parity.test.sql이 같은 사례표를 담고 있다', () => {
    const sqlPath = path.resolve(__dirname, '../../../../supabase/tests/222_completion_parity.test.sql')
    const sql = readFileSync(sqlPath, 'utf-8')
    const m = /\$fixture\$([\s\S]*?)\$fixture\$/.exec(sql)
    expect(m, 'SQL 시험 파일에 $fixture$ 구간이 있어야 한다').not.toBeNull()
    expect(JSON.parse(m![1])).toEqual(fixture)
  })
})
