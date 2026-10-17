/**
 * computeBookCompletion — 컬렉션 완성 분모 통일 (티켓 20260921_1110)
 */
import { computeBookCompletion } from '../completion-basis'

function badge(id: string, drop_excluded = false, type = 'item', book = 'book-a') {
  return { id, item_book_id: book, type, drop_excluded }
}

describe('computeBookCompletion', () => {
  it('제외 배지를 장착해도 분자에 들어가지 않고 분모는 7이다', () => {
    const badges = Array.from({ length: 8 }, (_, i) => badge(`b${i}`, i === 7))
    const filled = new Set(['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b7'])
    const r = computeBookCompletion(badges, filled).get('book-a')!
    expect(r.total).toBe(7)
    expect(r.filled).toBe(6)
    expect(r.filledIds).not.toContain('b7')
    expect(r.complete).toBe(false)
  })

  it('제외 배지를 미보유한 채 나머지를 모두 장착하면 완성이다', () => {
    const badges = [badge('b0'), badge('b1'), badge('b2', true)]
    const r = computeBookCompletion(badges, new Set(['b0', 'b1'])).get('book-a')!
    expect(r.complete).toBe(true)
  })

  it('제외 배지가 없으면 기존 개수 비교와 결과가 같다', () => {
    const badges = [badge('b0'), badge('b1')]
    expect(computeBookCompletion(badges, new Set(['b0'])).get('book-a')!.complete).toBe(false)
    expect(computeBookCompletion(badges, new Set(['b0', 'b1'])).get('book-a')!.complete).toBe(true)
  })

  it('배지가 0개인 컬렉션은 완성이 아니다', () => {
    expect(computeBookCompletion([], new Set()).get('book-a')).toBeUndefined()
  })

  it('types 옵션이 분모에 반영된다', () => {
    const badges = [badge('i1'), badge('c1', false, 'checkin')]
    const filled = new Set(['i1'])
    expect(computeBookCompletion(badges, filled, { types: ['item'] }).get('book-a')!.complete).toBe(true)
    const both = computeBookCompletion(badges, filled, { types: ['item', 'checkin'] }).get('book-a')!
    expect(both.total).toBe(2)
    expect(both.complete).toBe(false)
  })
  it('(f) 등록 배지가 전부 드랍 제외이면 등록 배지 전체가 분모이고 전부 장착하면 완성이다', () => {
    const badges = [badge('b0', true), badge('b1', true)]
    const partial = computeBookCompletion(badges, new Set(['b0'])).get('book-a')!
    expect(partial.total).toBe(2)
    expect(partial.filled).toBe(1)
    expect(partial.complete).toBe(false)
    const full = computeBookCompletion(badges, new Set(['b0', 'b1'])).get('book-a')!
    expect(full.complete).toBe(true)
  })

  it('(g) 일부만 제외된 컬렉션은 기존과 같이 제외를 뺀다', () => {
    const badges = [badge('b0'), badge('b1', true)]
    const r = computeBookCompletion(badges, new Set(['b0'])).get('book-a')!
    expect(r.total).toBe(1)
    expect(r.complete).toBe(true)
  })

  it('(h) 전부 제외이지만 types 필터로 남은 배지가 없으면 완성이 아니다', () => {
    const badges = [badge('b0', true, 'checkin')]
    const r = computeBookCompletion(badges, new Set(['b0']), { types: ['item'] }).get('book-a')
    expect(r?.complete ?? false).toBe(false)
  })

  it('(i) 등록 배지가 0개면 완성이 아니다', () => {
    expect(computeBookCompletion([], new Set(['x'])).get('book-a')?.complete ?? false).toBe(false)
  })

  describe('통일 규칙 (티켓 20261016_2340 2회)', () => {
    it('소프트 삭제 배지는 분모에서 빠지고 꽂혀 있어도 분자에 들지 않는다', () => {
      const badges = [
        badge('b0'),
        badge('b1'),
        { ...badge('b2'), deleted_at: '2026-10-01T00:00:00Z' },
      ]
      const r = computeBookCompletion(badges, new Set(['b0', 'b1', 'b2'])).get('book-a')!
      expect(r.denomIds).toEqual(['b0', 'b1'])
      expect(r.filledIds).toEqual(['b0', 'b1'])
      expect(r.complete).toBe(true)
    })

    it('types를 주지 않으면 item과 checkin만 분모에 든다', () => {
      const badges = [badge('i1'), badge('c1', false, 'checkin'), badge('a1', false, 'activity')]
      const r = computeBookCompletion(badges, new Set(['i1'])).get('book-a')!
      expect(r.denomIds).toEqual(['i1', 'c1'])
      expect(r.complete).toBe(false)
    })

    it('옛 컬렉션 결과에는 등급 정보가 없다', () => {
      const r = computeBookCompletion([badge('b0')], new Set(['b0'])).get('book-a')!
      expect(r.tier).toBeNull()
      expect(r.tiers).toEqual({})
    })

    it('tier_mode 컬렉션은 꽂힌 등급의 이름 수로 센다', () => {
      const tierBadge = (id: string, name: string, rarity: string) => ({
        ...badge(id),
        name,
        rarity,
      })
      const badges = [
        tierBadge('xc', 'X', 'common'),
        tierBadge('yc', 'Y', 'common'),
        tierBadge('xr', 'X', 'rare'),
        tierBadge('yr', 'Y', 'rare'),
      ]
      const r = computeBookCompletion(badges, new Set(['xr']), {
        tierModeBookIds: new Set(['book-a']),
      }).get('book-a')!
      expect(r.tier).toBe('rare')
      expect(r.total).toBe(2)
      expect(r.filled).toBe(1)
      expect(r.complete).toBe(false)
      expect(r.tiers.common.filled).toBe(0)
      expect(r.tiers.rare.filled).toBe(1)
    })

    it('tierModeBookIds에 없는 컬렉션은 이름·등급이 있어도 배지 수로 센다', () => {
      const badges = [
        { ...badge('xc'), name: 'X', rarity: 'common' },
        { ...badge('xr'), name: 'X', rarity: 'rare' },
      ]
      const r = computeBookCompletion(badges, new Set(['xc'])).get('book-a')!
      expect(r.total).toBe(2)
      expect(r.complete).toBe(false)
    })
  })

  describe('filledByBook 옵션 (티켓 20260924_0937)', () => {
    it('배지 X가 A에 장착됐고 X의 컬렉션이 B로 바뀌어도 B의 분자에 X가 들지 않는다', () => {
      // X는 현재 B 소속(분모에 포함)이지만 장착은 A 슬롯에 있다
      const badges = [badge('x', false, 'item', 'book-b'), badge('y', false, 'item', 'book-b')]
      const filledByBook = new Map([
        ['book-a', new Set(['x'])],
        ['book-b', new Set(['y'])],
      ])
      const r = computeBookCompletion(badges, new Set(), { filledByBook }).get('book-b')!
      expect(r.filledIds).toEqual(['y'])
      expect(r.filled).toBe(1)
      expect(r.complete).toBe(false)
    })

    it('X가 A에 장착됐고 X가 A 소속이면 그대로 센다', () => {
      const badges = [badge('x', false, 'item', 'book-a')]
      const filledByBook = new Map([['book-a', new Set(['x'])]])
      const r = computeBookCompletion(badges, new Set(), { filledByBook }).get('book-a')!
      expect(r.filledIds).toEqual(['x'])
      expect(r.complete).toBe(true)
    })

    it('filledByBook에 없는 북은 빈 집합으로 센다', () => {
      const badges = [badge('x', false, 'item', 'book-b')]
      const r = computeBookCompletion(badges, new Set(['x']), { filledByBook: new Map() }).get('book-b')!
      expect(r.filled).toBe(0)
      expect(r.complete).toBe(false)
    })

    it('filledByBook 없이 호출하면 filledBadgeIds 하나로 종전과 같이 센다', () => {
      const badges = [badge('x', false, 'item', 'book-b')]
      const r = computeBookCompletion(badges, new Set(['x'])).get('book-b')!
      expect(r.filled).toBe(1)
      expect(r.complete).toBe(true)
    })
  })
})
