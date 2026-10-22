/**
 * computeBookCompletion — 컬렉션 완성 분모 통일 (티켓 20260921_1110)
 */
import { computeBookCompletion } from '../completion-basis'
import { buildFilledByBook } from '../filled-by-book'

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

  /**
   * 컬렉션 등급 판별에서만 소프트 삭제 배지에 꽂힌 슬롯도 센다 (티켓 20261022_1139 2회, 2340 정리 ④)
   *
   * 222 `slot_item_into_book_tiered`의 `tier_mismatch` 판정과 시험 하네스의 등급 읽기가 `deleted_at`을 걸지 않는다. 분모·분자와 `tiers`는 그대로
   * 소프트 삭제 배지를 뺀다. 사례표(`completion-parity-cases.json`)는 SQL과 같은 사례를, 여기서는 SQL에 만들 수 없는 섞인 등급 순서를 확인한다.
   */
  describe('소프트 삭제 슬롯의 컬렉션 등급', () => {
    const DELETED = '2026-10-01T00:00:00Z'
    const tierBadge = (id: string, name: string, rarity: string, extra: Record<string, unknown> = {}) => ({
      ...badge(id),
      name,
      rarity,
      ...extra,
    })
    const options = { tierModeBookIds: new Set(['book-a']) }

    it('삭제된 배지에만 꽂았어도 그 등급이 컬렉션 등급이고 분자에는 들지 않는다', () => {
      const badges = [tierBadge('xc', 'X', 'common'), tierBadge('zc', 'Z', 'common', { deleted_at: DELETED })]
      const r = computeBookCompletion(badges, new Set(['zc']), options).get('book-a')!
      expect(r.tier).toBe('common')
      expect(r.total).toBe(1)
      expect(r.filled).toBe(0)
      expect(r.complete).toBe(false)
      expect(r.tiers.common.filledIds).toEqual([])
    })

    it('삭제된 배지의 등급에 살아 있는 배지가 없으면 tiers에 만들지 않고 표시 기준은 첫 등급이다', () => {
      const badges = [tierBadge('xc', 'X', 'common'), tierBadge('xr', 'X', 'rare', { deleted_at: DELETED })]
      const r = computeBookCompletion(badges, new Set(['xr']), options).get('book-a')!
      expect(r.tier).toBe('rare')
      expect(Object.keys(r.tiers)).toEqual(['common'])
      expect(r.total).toBe(1)
      expect(r.filled).toBe(0)
      expect(r.complete).toBe(false)
    })

    it('삭제된 배지의 등급이 살아 있는 배지의 등급보다 앞서면 앞선 등급이 컬렉션 등급이다', () => {
      const badges = [
        tierBadge('xc', 'X', 'common', { deleted_at: DELETED }),
        tierBadge('xr', 'X', 'rare'),
        tierBadge('yr', 'Y', 'rare'),
      ]
      // 삭제된 common 슬롯과 살아 있는 rare 슬롯이 섞였다(222는 같은 등급만 꽂게 하지만 이미 섞인 기록이 있을 수 있다)
      const r = computeBookCompletion(badges, new Set(['xc', 'xr']), options).get('book-a')!
      expect(r.tier).toBe('common')
      // common에는 살아 있는 배지가 없어 표시 기준은 첫 등급(rare)이다
      expect(r.total).toBe(2)
      expect(r.filled).toBe(1)
    })

    it('살아 있는 배지의 등급이 더 앞서면 삭제된 배지의 뒤 등급은 컬렉션 등급을 바꾸지 않는다', () => {
      const badges = [
        tierBadge('xc', 'X', 'common'),
        tierBadge('xr', 'X', 'rare', { deleted_at: DELETED }),
        tierBadge('yr', 'Y', 'rare'),
      ]
      const r = computeBookCompletion(badges, new Set(['xc', 'xr']), options).get('book-a')!
      expect(r.tier).toBe('common')
      expect(r.filled).toBe(1)
    })

    it('삭제된 배지를 아무도 꽂지 않았으면 결과가 이전과 같다', () => {
      const withDeleted = [tierBadge('xc', 'X', 'common'), tierBadge('zr', 'Z', 'rare', { deleted_at: DELETED })]
      const withoutDeleted = [tierBadge('xc', 'X', 'common')]
      expect(computeBookCompletion(withDeleted, new Set(['xc']), options).get('book-a')).toEqual(
        computeBookCompletion(withoutDeleted, new Set(['xc']), options).get('book-a')
      )
    })

    it('등급이 없는 삭제 배지와 삭제된 체크인 배지는 컬렉션 등급을 정하지 않는다', () => {
      const badges = [
        tierBadge('xc', 'X', 'common'),
        { ...badge('zn'), name: 'Z', rarity: null, deleted_at: DELETED },
        { ...badge('cr', false, 'checkin'), name: 'C', rarity: 'rare', deleted_at: DELETED },
      ]
      const r = computeBookCompletion(badges, new Set(['zn', 'cr']), options).get('book-a')!
      expect(r.tier).toBeNull()
    })

    it('옛 컬렉션은 삭제된 배지가 있어도 등급 정보를 만들지 않는다', () => {
      const badges = [tierBadge('xc', 'X', 'common'), tierBadge('zr', 'Z', 'rare', { deleted_at: DELETED })]
      const r = computeBookCompletion(badges, new Set(['zr'])).get('book-a')!
      expect(r.tier).toBeNull()
      expect(r.tiers).toEqual({})
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

  /**
   * 잠긴 개체는 완성으로 치지 않는다 (티켓 20261018_0056, 운영 로직 8.3절)
   *
   * 분자(채운 배지)는 장착 슬롯과 체크인 획득에서만 온다 — 인벤토리에 가진 개체를 세지 않는다. 잠긴 개체는 장착할 수 없으므로(서버 거절 + 마이그레이션 231 트리거)
   * 슬롯에 들지 않아 분자에도 들지 않는다. 이 시험은 «잠긴 채 인벤토리에만 있는 배지는 완성에 보태지 않는다»는 계약을 고정한다.
   */
  describe('잠긴 개체', () => {
    it('인벤토리에 잠긴 채 가진 배지는 슬롯이 없으므로 분자에 들지 않아 완성이 아니다', () => {
      const badges = [badge('b0'), badge('b1')]
      // b0은 장착했고 b1은 잠긴 채 인벤토리에만 있다(슬롯 없음)
      const filledByBook = buildFilledByBook({
        slots: [{ item_book_id: 'book-a', badge_id: 'b0' }],
        checkinBadgesByBook: new Map(),
        earnedCheckinBadgeIds: new Set(),
      })
      const r = computeBookCompletion(badges, new Set(), { filledByBook }).get('book-a')!
      expect(r.filledIds).toEqual(['b0'])
      expect(r.total).toBe(2)
      expect(r.complete).toBe(false)
    })

    it('열어서 장착하면 그때부터 분자에 든다', () => {
      const badges = [badge('b0'), badge('b1')]
      const filledByBook = buildFilledByBook({
        slots: [
          { item_book_id: 'book-a', badge_id: 'b0' },
          { item_book_id: 'book-a', badge_id: 'b1' },
        ],
        checkinBadgesByBook: new Map(),
        earnedCheckinBadgeIds: new Set(),
      })
      expect(computeBookCompletion(badges, new Set(), { filledByBook }).get('book-a')!.complete).toBe(true)
    })
  })
})
