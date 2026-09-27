/**
 * 컨텐츠 코퍼스 접근 계층 — 매핑·상한·활성 필터·반려 회귀 (티켓 20260923_2256)
 *
 * 지키는 것:
 * 1. 유형 ID가 매핑표에 없으면 DB를 조회하지 않고 빈 결과를 돌려준다(코퍼스 전체를
 *    읽는 경로가 없다)
 * 2. 추천·소개형(T02 등)은 활성 대상만 targets·quotes에 담고, 비활성은 둘 다에서 빠진다
 * 3. 글·세계관 노출형(T01 등)은 targets가 항상 비어 있고, quotes에는 비활성 컨텐츠도
 *    규칙대로 포함될 수 있다
 * 4. `limit` 인자로 종류별 발췌 건수 상한을 조절할 수 있다
 * 5. 원문(description·story_text)을 요약·재작성 없이 그대로 돌려준다
 * 6. `verifyActiveTargets`는 후보안 대상 ID를 재조회해 비활성이 섞이면 반려 사유를 담는다
 *
 * 실행: cd jam-web && npx vitest run src/lib/content-corpus/__tests__/content-corpus.test.ts
 */
import { beforeEach, describe, expect, it } from 'vitest'

interface FixtureRow {
  id: string
  active: boolean
  [key: string]: unknown
}

let tribes: FixtureRow[] = []
let itemBooks: FixtureRow[] = []
let badges: FixtureRow[] = []
let calledTables: string[] = []
let forceErrorTable: string | null = null

// `.in()`이 반환하는 Promise에 `.eq()`를 얹어, 같은 체인 시작점에서 "즉시 await"(원문 그대로
// 조회)과 "eq로 활성 필터까지 이어감"(활성 판정 조회) 두 경로를 모두 재현한다 — 실제
// supabase-js의 PostgrestFilterBuilder가 PromiseLike인 것과 같은 모양이다.
// `.select().eq()`(`.in()` 없이 바로 활성 전체를 조회하는 `listActive*Ids`, 티켓 20260927_2034)
// 경로도 sibling으로 함께 지원한다.
function buildSimpleTable(rows: FixtureRow[], selectColumns: string[]) {
  const project = (list: FixtureRow[]) =>
    list.map((r) => Object.fromEntries(selectColumns.map((c) => [c, r[c]])))
  return {
    select: () => ({
      in: (_col: string, ids: string[]) => {
        const matched = rows.filter((r) => ids.includes(r.id))
        const rawPromise = Promise.resolve({ data: project(matched), error: null })
        return Object.assign(rawPromise, {
          eq: (_col2: string, val: boolean) =>
            Promise.resolve({ data: project(matched.filter((r) => r.active === val)), error: null }),
        })
      },
      eq: (_col: string, val: boolean) =>
        Promise.resolve({ data: project(rows.filter((r) => r.active === val)), error: null }),
    }),
  }
}

// badges 조회도 두 경로를 재현한다: 즉시 await(원문 그대로, `fetchBadgeParentStatus`용)와
// `.is().or().or()`로 이어가는 활성 필터(`fetchActiveBadges`용, `.in()` 뒤에 붙는다).
// `listActiveBadgeIds`(티켓 20260927_2034)는 `.in()` 없이 `.select().is().or().or()`로
// 시작해 `.order().range()`까지 이어간다 — 같은 활성 필터 체인을 `.in()` 유무 양쪽에 붙인다.
function buildBadgesTable(rows: FixtureRow[]) {
  const selectColumns = ['id', 'name', 'description', 'item_book_id', 'tribe_id', 'deleted_at']
  const project = (list: FixtureRow[]) =>
    list.map((r) => Object.fromEntries(selectColumns.map((c) => [c, r[c]])))
  const activeFilterChain = (candidates: FixtureRow[]) => ({
    is: () => ({
      or: () => ({
        or: () => {
          const proj = project(candidates.filter((r) => r.active))
          return Object.assign(Promise.resolve({ data: proj, error: null }), {
            order: () => ({
              range: (start: number, end: number) =>
                Promise.resolve({ data: proj.slice(start, end + 1), error: null }),
            }),
          })
        },
      }),
    }),
  })
  return {
    select: () => ({
      in: (_col: string, ids: string[]) => {
        const matched = rows.filter((r) => ids.includes(r.id))
        const rawPromise = Promise.resolve({ data: project(matched), error: null })
        return Object.assign(rawPromise, activeFilterChain(matched))
      },
      ...activeFilterChain(rows),
    }),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      calledTables.push(table)
      if (table === forceErrorTable) {
        return { select: () => ({ in: () => Promise.resolve({ data: null, error: new Error('DB 조회 실패') }) }) }
      }
      if (table === 'tribes') return buildSimpleTable(tribes, ['id', 'name', 'description', 'tagline'])
      if (table === 'item_books')
        return buildSimpleTable(itemBooks, ['id', 'name', 'story_text', 'description', 'tribe_id'])
      if (table === 'badges') return buildBadgesTable(badges)
      throw new Error(`예상치 못한 테이블 조회: ${table}`)
    },
  }),
}))

import { isoWeekOrdinal, pickRotating, selectCorpusForType } from '../select'
import { verifyActiveTargets } from '../verify'

beforeEach(() => {
  calledTables = []
  forceErrorTable = null
  tribes = [
    { id: 'tribe-active', active: true, name: '숲속의 갱단', description: '숲의 설명', tagline: '태그라인' },
    { id: 'tribe-inactive', active: false, name: '작심삼일 클럽', description: '비활성 트라이브 설명', tagline: null },
  ]
  itemBooks = [
    { id: 'book-active', active: true, name: '활성 컬렉션', story_text: '활성 컬렉션 서사', tribe_id: null },
    { id: 'book-inactive', active: false, name: '비활성 컬렉션', story_text: '비활성 컬렉션 서사', tribe_id: null },
    {
      id: 'book-desc-only',
      active: true,
      name: '설명만 있는 컬렉션',
      story_text: null,
      description: '설명 필드 원문',
      tribe_id: null,
    },
    {
      id: 'book-tribe-inactive',
      active: true,
      name: '트라이브 비활성 컬렉션',
      story_text: '소속 트라이브가 비활성',
      tribe_id: 'tribe-inactive',
    },
  ]
  badges = [
    { id: 'badge-active', active: true, name: '활성 배지', description: '활성 배지 설명 원문', item_book_id: null, tribe_id: null },
    { id: 'badge-inactive', active: false, name: '비활성 배지', description: '비활성 배지 설명', item_book_id: null, tribe_id: null },
    {
      id: 'badge-book-inactive',
      active: true,
      name: '소속 컬렉션 비활성 배지',
      description: '소속 컬렉션이 비활성인 배지 설명',
      item_book_id: 'book-inactive',
      tribe_id: null,
    },
    {
      id: 'badge-tribe-inactive',
      active: true,
      name: '소속 트라이브 비활성 배지',
      description: '소속 트라이브가 비활성인 배지 설명',
      item_book_id: null,
      tribe_id: 'tribe-inactive',
    },
    {
      id: 'badge-deleted-tribe-inactive',
      active: false,
      name: '삭제됐고 소속 트라이브도 비활성인 배지',
      description: '삭제된 배지 설명',
      item_book_id: null,
      tribe_id: 'tribe-inactive',
      deleted_at: '2026-09-01T00:00:00Z',
    },
  ]
})

describe('selectCorpusForType — 매핑에 없는 유형', () => {
  it('T03은 매핑표에 없어 DB를 조회하지 않고 빈 결과를 돌려준다', async () => {
    const result = await selectCorpusForType('T03', {})
    expect(result.targets).toEqual([])
    expect(result.quotes).toEqual([])
    expect(calledTables).toEqual([])
  })
})

describe('selectCorpusForType — 추천·소개형(T02)', () => {
  it('활성 배지만 targets·quotes에 담고 비활성은 빠진다', async () => {
    const result = await selectCorpusForType('T02', { badgeIds: ['badge-active', 'badge-inactive'] })
    expect(result.targets).toEqual([{ kind: 'badge', id: 'badge-active', name: '활성 배지' }])
    expect(result.quotes).toEqual([{ kind: 'badge', id: 'badge-active', text: '활성 배지 설명 원문' }])
  })

  it('배지 유형에 필요한 badges 테이블만 조회하고 tribes·item_books는 건드리지 않는다', async () => {
    await selectCorpusForType('T02', { badgeIds: ['badge-active'] })
    expect(calledTables).toEqual(['badges'])
  })

  it('원문을 요약·재작성 없이 그대로 돌려준다', async () => {
    const result = await selectCorpusForType('T02', { badgeIds: ['badge-active'] })
    expect(result.quotes[0].text).toBe('활성 배지 설명 원문')
  })

  it('배지 자체는 활성이지만 소속 컬렉션이 비활성이면 targets·quotes에서 빠진다', async () => {
    const result = await selectCorpusForType('T02', { badgeIds: ['badge-book-inactive'] })
    expect(result.targets).toEqual([])
    expect(result.quotes).toEqual([])
  })

  it('배지 자체는 활성이지만 소속 트라이브가 비활성이면 targets·quotes에서 빠진다', async () => {
    const result = await selectCorpusForType('T02', { badgeIds: ['badge-tribe-inactive'] })
    expect(result.targets).toEqual([])
    expect(result.quotes).toEqual([])
  })

  it('limit 인자로 발췌 건수 상한을 조절한다', async () => {
    badges.push({
      id: 'badge-active-2',
      active: true,
      name: '활성 배지2',
      description: '설명2',
      item_book_id: null,
      tribe_id: null,
    })
    const result = await selectCorpusForType(
      'T02',
      { badgeIds: ['badge-active', 'badge-active-2', 'badge-inactive'] },
      1
    )
    expect(result.targets).toHaveLength(1)
  })
})

describe('selectCorpusForType — 글·세계관 노출형(T01)', () => {
  it('targets는 항상 비어 있고, quotes에는 비활성 컨텐츠도 포함될 수 있다', async () => {
    const result = await selectCorpusForType('T01', {
      tribeIds: ['tribe-active'],
      itemBookIds: ['book-inactive'],
    })
    expect(result.targets).toEqual([])
    expect(result.quotes).toEqual(
      expect.arrayContaining([
        { kind: 'tribe', id: 'tribe-active', text: '태그라인\n숲의 설명' },
        { kind: 'item_book', id: 'book-inactive', text: '비활성 컬렉션 서사' },
      ])
    )
  })

  it('서사 유형에 필요한 tribes·item_books만 조회하고 badges는 건드리지 않는다', async () => {
    await selectCorpusForType('T01', { tribeIds: ['tribe-active'], itemBookIds: ['book-active'] })
    expect(calledTables).toEqual(['tribes', 'item_books'])
  })

  it('소속 트라이브가 비활성인 컬렉션도 서사 인용에는 영향이 없다(narrative는 소속 활성 조건 미적용)', async () => {
    // tribeIds를 안 줘서 tribe 종류는 auto로 함께 선택된다(티켓 20260927_2034) — 이 테스트는
    // item_book 인용에만 관심이 있으므로 부분 포함으로 확인한다.
    const result = await selectCorpusForType('T01', { itemBookIds: ['book-tribe-inactive'] })
    expect(result.quotes).toEqual(
      expect.arrayContaining([{ kind: 'item_book', id: 'book-tribe-inactive', text: '소속 트라이브가 비활성' }])
    )
  })
})

describe('selectCorpusForType — 엣지 케이스', () => {
  it('badgeIds가 빈 배열이면 ID가 없는 것과 같이 활성 배지 중에서 자동 선택한다(selection: auto, 티켓 20260927_2034)', async () => {
    const result = await selectCorpusForType('T02', { badgeIds: [] })
    expect(result.selection).toEqual({ badge: 'auto' })
    expect(result.targets).toEqual([{ kind: 'badge', id: 'badge-active', name: '활성 배지' }])
    expect(calledTables).toContain('badges')
  })

  it('limit이 0이면 후보 ID가 있어도 빈 결과를 돌려준다(선택 방식은 explicit 그대로)', async () => {
    const result = await selectCorpusForType('T02', { badgeIds: ['badge-active'] }, 0)
    expect(result).toEqual({ typeId: 'T02', targets: [], quotes: [], selection: { badge: 'explicit' } })
  })

  it('tribes 조회가 오류를 던지면 selectCorpusForType도 그 오류를 그대로 던진다', async () => {
    forceErrorTable = 'tribes'
    await expect(selectCorpusForType('T01', { tribeIds: ['tribe-active'] })).rejects.toThrow('DB 조회 실패')
  })
})

describe('selectCorpusForType — 자동/명시 혼합 선택 (티켓 20260927_2034)', () => {
  it('T01을 ID 없이 부르면 tribe·item_book 둘 다 auto이고 활성 후보만 인용된다', async () => {
    const result = await selectCorpusForType('T01', {})
    expect(result.selection).toEqual({ tribe: 'auto', item_book: 'auto' })
    expect(result.quotes).toEqual(
      expect.arrayContaining([
        { kind: 'tribe', id: 'tribe-active', text: '태그라인\n숲의 설명' },
        { kind: 'item_book', id: 'book-active', text: '활성 컬렉션 서사' },
        { kind: 'item_book', id: 'book-desc-only', text: '설명 필드 원문' },
      ])
    )
    // 비활성이거나 소속 트라이브가 비활성인 컬렉션은 auto 후보에 없다.
    expect(result.quotes.some((q) => q.id === 'book-inactive')).toBe(false)
    expect(result.quotes.some((q) => q.id === 'book-tribe-inactive')).toBe(false)
  })

  it('T01에 itemBookIds만 명시하면 tribe는 auto, item_book은 explicit이다', async () => {
    const result = await selectCorpusForType('T01', { itemBookIds: ['book-inactive'] })
    expect(result.selection).toEqual({ tribe: 'auto', item_book: 'explicit' })
    // item_book은 explicit이라 비활성(book-inactive)도 규칙대로 인용된다.
    expect(result.quotes).toEqual(
      expect.arrayContaining([{ kind: 'item_book', id: 'book-inactive', text: '비활성 컬렉션 서사' }])
    )
  })

  it('T01에 tribeIds만 명시하면 tribe는 explicit, item_book은 auto다', async () => {
    const result = await selectCorpusForType('T01', { tribeIds: ['tribe-active'] })
    expect(result.selection).toEqual({ tribe: 'explicit', item_book: 'auto' })
    expect(result.quotes).toEqual(
      expect.arrayContaining([
        { kind: 'item_book', id: 'book-active', text: '활성 컬렉션 서사' },
        { kind: 'item_book', id: 'book-desc-only', text: '설명 필드 원문' },
      ])
    )
  })

  it('badgeIds를 명시하면 selection이 explicit이다', async () => {
    const result = await selectCorpusForType('T02', { badgeIds: ['badge-active'] })
    expect(result.selection).toEqual({ badge: 'explicit' })
  })
})

describe('pickRotating — 순환 선택 순수 함수', () => {
  it('후보가 limit 이하면 전부(정렬 순서 그대로) 돌려준다', () => {
    expect(pickRotating(['a', 'b'], 3, 10)).toEqual(['a', 'b'])
  })

  it('같은 weekOrdinal이면 항상 같은 결과다', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    expect(pickRotating(ids, 2, 7)).toEqual(pickRotating(ids, 2, 7))
  })

  it('후보가 limit보다 많으면 weekOrdinal이 바뀔 때 다른 결과가 나온다', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    expect(pickRotating(ids, 2, 0)).not.toEqual(pickRotating(ids, 2, 1))
  })

  it('끝에 닿으면 처음으로 순환한다(wrap-around)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    // weekOrdinal=4 → start=4(마지막 인덱스), limit=3 → [e, a, b] (a·b로 순환)
    expect(pickRotating(ids, 3, 4)).toEqual(['e', 'a', 'b'])
  })

  it('limit이 0이거나 후보가 없으면 빈 배열이다', () => {
    expect(pickRotating(['a', 'b'], 0, 5)).toEqual([])
    expect(pickRotating([], 3, 5)).toEqual([])
  })
})

describe('isoWeekOrdinal — KST 기준 ISO 주차', () => {
  it('같은 주(월요일과 일요일)는 같은 값이다', () => {
    // 2026-09-28(월)~2026-10-04(일)은 같은 ISO 주차다.
    const monday = isoWeekOrdinal(new Date('2026-09-27T15:00:00Z')) // KST 2026-09-28 00:00
    const sunday = isoWeekOrdinal(new Date('2026-10-03T15:00:00Z')) // KST 2026-10-04 00:00
    expect(monday).toBe(sunday)
  })

  it('다음 주 월요일은 값이 1 늘어난다', () => {
    const thisMonday = isoWeekOrdinal(new Date('2026-09-27T15:00:00Z')) // KST 2026-09-28
    const nextMonday = isoWeekOrdinal(new Date('2026-10-04T15:00:00Z')) // KST 2026-10-05
    expect(nextMonday).toBe(thisMonday + 1)
  })

  it('KST 자정 경계(UTC 15:00)를 넘기면 날짜가 바뀐 것으로 계산한다', () => {
    const beforeMidnightKst = isoWeekOrdinal(new Date('2026-09-27T14:59:00Z')) // KST 2026-09-27 23:59(일)
    const afterMidnightKst = isoWeekOrdinal(new Date('2026-09-27T15:00:00Z')) // KST 2026-09-28 00:00(월)
    expect(afterMidnightKst).toBe(beforeMidnightKst + 1)
  })
})

describe('verifyActiveTargets', () => {
  it('모든 대상이 활성이면 ok:true, reasons는 빈 배열이다', async () => {
    const result = await verifyActiveTargets({
      targets: [{ kind: 'badge', id: 'badge-active', name: '활성 배지' }],
    })
    expect(result).toEqual({ ok: true, reasons: [] })
  })

  it('비활성 대상이 섞이면 ok:false와 반려 사유를 돌려준다', async () => {
    const result = await verifyActiveTargets({
      targets: [
        { kind: 'badge', id: 'badge-active', name: '활성 배지' },
        { kind: 'tribe', id: 'tribe-inactive', name: '작심삼일 클럽' },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toContain('tribe-inactive')
  })

  it('배지 자체는 활성이지만 소속 컬렉션이 비활성이면 사유를 "소속 컬렉션"으로 구분해 반려한다', async () => {
    const result = await verifyActiveTargets({
      targets: [{ kind: 'badge', id: 'badge-book-inactive', name: '소속 컬렉션 비활성 배지' }],
    })
    expect(result.ok).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toContain('소속 컬렉션')
  })

  it('배지 자체는 활성이지만 소속 트라이브가 비활성이면 사유를 "소속 트라이브"로 구분해 반려한다', async () => {
    const result = await verifyActiveTargets({
      targets: [{ kind: 'badge', id: 'badge-tribe-inactive', name: '소속 트라이브 비활성 배지' }],
    })
    expect(result.ok).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toContain('소속 트라이브')
  })

  it('컬렉션 대상도 소속 트라이브가 비활성이면 반려된다', async () => {
    const result = await verifyActiveTargets({
      targets: [{ kind: 'item_book', id: 'book-tribe-inactive', name: '트라이브 비활성 컬렉션' }],
    })
    expect(result.ok).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toContain('book-tribe-inactive')
  })

  it('삭제된 배지가 소속 비활성과 겹치면 사유를 삭제로 먼저 말한다', async () => {
    const result = await verifyActiveTargets({
      targets: [{ kind: 'badge', id: 'badge-deleted-tribe-inactive', name: '삭제된 배지' }],
    })
    expect(result.ok).toBe(false)
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toContain('삭제')
    expect(result.reasons[0]).not.toContain('소속')
  })
})
