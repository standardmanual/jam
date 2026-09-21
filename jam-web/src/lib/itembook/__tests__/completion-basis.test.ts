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

  it('배지가 0개(전부 제외 포함)인 컬렉션은 완성이 아니다', () => {
    expect(computeBookCompletion([], new Set()).get('book-a')).toBeUndefined()
    const r = computeBookCompletion([badge('b0', true)], new Set(['b0'])).get('book-a')
    expect(r?.complete ?? false).toBe(false)
  })

  it('types 옵션이 분모에 반영된다', () => {
    const badges = [badge('i1'), badge('c1', false, 'checkin')]
    const filled = new Set(['i1'])
    expect(computeBookCompletion(badges, filled, { types: ['item'] }).get('book-a')!.complete).toBe(true)
    const both = computeBookCompletion(badges, filled, { types: ['item', 'checkin'] }).get('book-a')!
    expect(both.total).toBe(2)
    expect(both.complete).toBe(false)
  })
})
