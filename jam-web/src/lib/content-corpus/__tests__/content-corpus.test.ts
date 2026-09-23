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

// `.in()`이 반환하는 Promise에 `.eq()`를 얹어, 같은 체인 시작점에서 "즉시 await"(원문 그대로
// 조회)과 "eq로 활성 필터까지 이어감"(활성 판정 조회) 두 경로를 모두 재현한다 — 실제
// supabase-js의 PostgrestFilterBuilder가 PromiseLike인 것과 같은 모양이다.
function buildSimpleTable(rows: FixtureRow[], selectColumns: string[]) {
  return {
    select: () => ({
      in: (_col: string, ids: string[]) => {
        const matched = rows.filter((r) => ids.includes(r.id))
        const project = (list: FixtureRow[]) =>
          list.map((r) => Object.fromEntries(selectColumns.map((c) => [c, r[c]])))
        const rawPromise = Promise.resolve({ data: project(matched), error: null })
        return Object.assign(rawPromise, {
          eq: (_col2: string, val: boolean) =>
            Promise.resolve({ data: project(matched.filter((r) => r.active === val)), error: null }),
        })
      },
    }),
  }
}

// badges 조회도 두 경로를 재현한다: 즉시 await(원문 그대로, `fetchBadgeParentStatus`용)와
// `.is().or().or()`로 이어가는 활성 필터(`fetchActiveBadges`용).
function buildBadgesTable(rows: FixtureRow[]) {
  const selectColumns = ['id', 'name', 'description', 'item_book_id', 'tribe_id']
  return {
    select: () => ({
      in: (_col: string, ids: string[]) => {
        const matched = rows.filter((r) => ids.includes(r.id))
        const project = (list: FixtureRow[]) =>
          list.map((r) => Object.fromEntries(selectColumns.map((c) => [c, r[c]])))
        const rawPromise = Promise.resolve({ data: project(matched), error: null })
        return Object.assign(rawPromise, {
          is: () => ({
            or: () => ({
              or: () => Promise.resolve({ data: project(matched.filter((r) => r.active)), error: null }),
            }),
          }),
        })
      },
    }),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      calledTables.push(table)
      if (table === 'tribes') return buildSimpleTable(tribes, ['id', 'name', 'description', 'tagline'])
      if (table === 'item_books')
        return buildSimpleTable(itemBooks, ['id', 'name', 'story_text', 'description', 'tribe_id'])
      if (table === 'badges') return buildBadgesTable(badges)
      throw new Error(`예상치 못한 테이블 조회: ${table}`)
    },
  }),
}))

import { selectCorpusForType } from '../select'
import { verifyActiveTargets } from '../verify'

beforeEach(() => {
  calledTables = []
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
    const result = await selectCorpusForType('T01', { itemBookIds: ['book-tribe-inactive'] })
    expect(result.quotes).toEqual([{ kind: 'item_book', id: 'book-tribe-inactive', text: '소속 트라이브가 비활성' }])
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
})
