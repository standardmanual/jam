import { describe, expect, it } from 'vitest'
import { buildFilledByBook } from '../filled-by-book'

const none = new Set<string>()

describe('buildFilledByBook', () => {
  it('A 컬렉션에 장착한 X가 이후 B 소속으로 바뀌어도 B 집합에는 들지 않는다', () => {
    // X는 A 슬롯에 장착됐고, 지금은 B 소속 배지다(체크인 획득 이력은 없음)
    const result = buildFilledByBook({
      slots: [{ item_book_id: 'A', badge_id: 'X' }],
      checkinBadgesByBook: new Map(),
      earnedCheckinBadgeIds: none,
    })

    expect(result.get('A')).toEqual(new Set(['X']))
    // 키 없음과 빈 집합을 구분한다 — B는 채운 배지가 없으므로 키 자체가 없어야 한다.
    expect(result.has('B')).toBe(false)
    expect(result.get('B')).toBeUndefined()
  })

  it('체크인 획득 이력은 그 배지가 속한 북의 집합에만 들어간다', () => {
    const result = buildFilledByBook({
      slots: [],
      checkinBadgesByBook: new Map([
        ['A', ['c1', 'c2']],
        ['B', ['c3']],
      ]),
      earnedCheckinBadgeIds: new Set(['c1', 'c3']),
    })

    expect(result.get('A')).toEqual(new Set(['c1']))
    expect(result.get('B')).toEqual(new Set(['c3']))
  })

  it('슬롯과 체크인 획득 이력이 한 북의 집합에 합쳐진다', () => {
    const result = buildFilledByBook({
      slots: [{ item_book_id: 'A', badge_id: 'i1' }],
      checkinBadgesByBook: new Map([['A', ['c1']]]),
      earnedCheckinBadgeIds: new Set(['c1']),
    })

    expect(result.get('A')).toEqual(new Set(['i1', 'c1']))
  })

  it('슬롯도 획득 이력도 없는 북은 채운 배지가 없다', () => {
    const result = buildFilledByBook({
      slots: [{ item_book_id: 'A', badge_id: 'i1' }],
      checkinBadgesByBook: new Map([['B', ['c1']]]),
      earnedCheckinBadgeIds: none,
    })

    // 결과에 키가 없다 — 빈 집합이 들어 있는 것과 다르다(조회하는 쪽이 빈 집합으로 다룬다).
    expect(result.has('B')).toBe(false)
    expect(result.has('C')).toBe(false)
    expect([...result.keys()]).toEqual(['A'])
  })

  it('슬롯과 체크인 배지가 모두 비어 있으면 빈 Map이다', () => {
    const result = buildFilledByBook({ slots: [], checkinBadgesByBook: new Map(), earnedCheckinBadgeIds: none })

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })

  it('체크인 배지가 있어도 획득 이력이 전혀 없으면 빈 Map이다', () => {
    const result = buildFilledByBook({
      slots: [],
      checkinBadgesByBook: new Map([['A', ['c1']]]),
      earnedCheckinBadgeIds: none,
    })

    expect(result.size).toBe(0)
  })

  it('같은 배지가 여러 슬롯에 있어도 집합이라 중복이 없다', () => {
    const result = buildFilledByBook({
      slots: [
        { item_book_id: 'A', badge_id: 'i1' },
        { item_book_id: 'A', badge_id: 'i1' },
      ],
      checkinBadgesByBook: new Map([['A', ['i1']]]),
      earnedCheckinBadgeIds: new Set(['i1']),
    })

    expect(result.get('A')?.size).toBe(1)
  })
})
