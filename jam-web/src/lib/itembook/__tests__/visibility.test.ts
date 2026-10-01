/**
 * 컬렉션 노출 판정 — 공개됨(화면용)·노출 중(드랍·완성용) (티켓 20260930_1516, 결정 E1)
 *
 * 두 판정 × 비활성·시작 전·기간 안·종료 후·기간 없음, 그리고 쿼리 헬퍼가 같은 조건을 건다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/itembook/__tests__/visibility.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  applyDroppableItemBookFilter,
  applyLaunchedItemBookFilter,
  isItemBookDroppable,
  isItemBookLaunched,
  pickLaunchedItemBook,
  type ItemBookVisibilityFields,
} from '../visibility'

const NOW = '2026-10-01T03:00:00.000Z'
const BEFORE = '2026-09-30T00:00:00.000Z'
const AFTER = '2026-10-02T00:00:00.000Z'

function book(overrides: Partial<ItemBookVisibilityFields> = {}): ItemBookVisibilityFields {
  return { is_active: true, valid_from: null, valid_until: null, ...overrides }
}

describe('isItemBookLaunched — 공개됨(화면용)', () => {
  it('비활성이면 공개되지 않았다(기간이 안이어도)', () => {
    expect(isItemBookLaunched(book({ is_active: false, valid_from: BEFORE, valid_until: AFTER }), NOW)).toBe(false)
  })

  it('시작 전(valid_from이 미래)이면 공개되지 않았다', () => {
    expect(isItemBookLaunched(book({ valid_from: AFTER }), NOW)).toBe(false)
  })

  it('기간 안이면 공개됐다', () => {
    expect(isItemBookLaunched(book({ valid_from: BEFORE, valid_until: AFTER }), NOW)).toBe(true)
  })

  it('종료 후(valid_until이 과거)여도 공개된 상태다 — 보유자는 계속 본다(E1)', () => {
    expect(isItemBookLaunched(book({ valid_from: BEFORE, valid_until: '2026-09-30T12:00:00.000Z' }), NOW)).toBe(true)
  })

  it('기간이 없으면(둘 다 null) 활성인 한 공개됐다', () => {
    expect(isItemBookLaunched(book(), NOW)).toBe(true)
  })

  it('시작 시각이 지금과 같으면 공개됐다(경계 포함)', () => {
    expect(isItemBookLaunched(book({ valid_from: NOW }), NOW)).toBe(true)
  })

  it('DB 응답 표기(+00:00)와 지금(Z) 표기가 달라도 시각으로 비교한다', () => {
    expect(isItemBookLaunched(book({ valid_from: '2026-10-01T03:00:00+00:00' }), NOW)).toBe(true)
    expect(isItemBookLaunched(book({ valid_from: '2026-10-01T03:00:00.001+00:00' }), NOW)).toBe(false)
  })
})

describe('isItemBookDroppable — 노출 중(드랍·완성용)', () => {
  it('비활성이면 노출 중이 아니다', () => {
    expect(isItemBookDroppable(book({ is_active: false }), NOW)).toBe(false)
  })

  it('시작 전이면 노출 중이 아니다', () => {
    expect(isItemBookDroppable(book({ valid_from: AFTER }), NOW)).toBe(false)
  })

  it('기간 안이면 노출 중이다', () => {
    expect(isItemBookDroppable(book({ valid_from: BEFORE, valid_until: AFTER }), NOW)).toBe(true)
  })

  it('종료 후면 노출 중이 아니다 — 공개됨 판정과 갈리는 유일한 경우', () => {
    const ended = book({ valid_from: BEFORE, valid_until: '2026-09-30T12:00:00.000Z' })
    expect(isItemBookDroppable(ended, NOW)).toBe(false)
    expect(isItemBookLaunched(ended, NOW)).toBe(true)
  })

  it('기간이 없으면 활성인 한 노출 중이다', () => {
    expect(isItemBookDroppable(book(), NOW)).toBe(true)
  })

  it('종료 시각이 지금과 같으면 노출 중이다(경계 포함)', () => {
    expect(isItemBookDroppable(book({ valid_until: NOW }), NOW)).toBe(true)
  })
})

describe('pickLaunchedItemBook — 배지 상세의 컬렉션 카드(티켓 20261001_1205)', () => {
  const withId = (overrides: Partial<ItemBookVisibilityFields> = {}) => ({ id: 'book-1', ...book(overrides) })

  it('컬렉션이 없으면(null) 카드를 그리지 않는다', () => {
    expect(pickLaunchedItemBook(null, NOW)).toBeNull()
  })

  it('비활성이거나 시작 전인 컬렉션은 카드를 그리지 않는다 — 막다른 링크 방지', () => {
    expect(pickLaunchedItemBook(withId({ is_active: false }), NOW)).toBeNull()
    expect(pickLaunchedItemBook(withId({ valid_from: AFTER }), NOW)).toBeNull()
  })

  it('공개된 컬렉션은 그대로 돌려준다', () => {
    const open = withId({ valid_from: BEFORE, valid_until: AFTER })
    expect(pickLaunchedItemBook(open, NOW)).toBe(open)
  })

  it('기간이 끝난 컬렉션도 계속 보인다(E1)', () => {
    const ended = withId({ valid_from: BEFORE, valid_until: '2026-09-30T12:00:00.000Z' })
    expect(pickLaunchedItemBook(ended, NOW)).toBe(ended)
  })
})

/** 호출된 체인을 기록하는 쿼리 빌더 흉내 */
function recordingQuery() {
  const calls: { method: 'eq' | 'or'; args: unknown[] }[] = []
  const query = {
    eq(...args: [string, boolean]) {
      calls.push({ method: 'eq', args })
      return query
    },
    or(...args: [string]) {
      calls.push({ method: 'or', args })
      return query
    },
  }
  return { query, calls }
}

describe('쿼리 헬퍼 — 순수 판정과 같은 조건을 건다', () => {
  it('applyLaunchedItemBookFilter: is_active와 시작 시각 조건만, 종료 시각 조건은 없다', () => {
    const { query, calls } = recordingQuery()
    const result = applyLaunchedItemBookFilter(query, NOW)

    expect(result).toBe(query)
    expect(calls).toEqual([
      { method: 'eq', args: ['is_active', true] },
      { method: 'or', args: [`valid_from.is.null,valid_from.lte.${NOW}`] },
    ])
  })

  it('applyDroppableItemBookFilter: 공개됨 조건에 종료 시각 조건이 더해진다', () => {
    const { query, calls } = recordingQuery()
    const result = applyDroppableItemBookFilter(query, NOW)

    expect(result).toBe(query)
    expect(calls).toEqual([
      { method: 'eq', args: ['is_active', true] },
      { method: 'or', args: [`valid_from.is.null,valid_from.lte.${NOW}`] },
      { method: 'or', args: [`valid_until.is.null,valid_until.gte.${NOW}`] },
    ])
  })
})
