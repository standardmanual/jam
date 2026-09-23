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

function buildBadgesTable(rows: FixtureRow[]) {
  return {
    select: () => ({
      in: (_col: string, ids: string[]) => {
        const matched = rows.filter((r) => ids.includes(r.id))
        return {
          is: () => ({
            or: () => ({
              or: () =>
                Promise.resolve({
                  data: matched
                    .filter((r) => r.active)
                    .map((r) => ({ id: r.id, name: r.name, description: r.description })),
                  error: null,
                }),
            }),
          }),
        }
      },
    }),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      calledTables.push(table)
      if (table === 'tribes') return buildSimpleTable(tribes, ['id', 'name', 'description', 'tagline'])
      if (table === 'item_books') return buildSimpleTable(itemBooks, ['id', 'name', 'story_text', 'description'])
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
    { id: 'book-active', active: true, name: '활성 컬렉션', story_text: '활성 컬렉션 서사' },
    { id: 'book-inactive', active: false, name: '비활성 컬렉션', story_text: '비활성 컬렉션 서사' },
    { id: 'book-desc-only', active: true, name: '설명만 있는 컬렉션', story_text: null, description: '설명 필드 원문' },
  ]
  badges = [
    { id: 'badge-active', active: true, name: '활성 배지', description: '활성 배지 설명 원문' },
    { id: 'badge-inactive', active: false, name: '비활성 배지', description: '비활성 배지 설명' },
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

  it('limit 인자로 발췌 건수 상한을 조절한다', async () => {
    badges.push({ id: 'badge-active-2', active: true, name: '활성 배지2', description: '설명2' })
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
})
