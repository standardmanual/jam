import { classifyBadgeTribeAssignment, type BadgeTribeAssignmentCandidate } from '../badge-list-bulk'

const TARGET = 'tribe-a'

function candidates(entries: Record<string, BadgeTribeAssignmentCandidate>) {
  return new Map(Object.entries(entries))
}

describe('classifyBadgeTribeAssignment', () => {
  it('컬렉션에 속하지 않은 활동 배지는 지정 가능하다', () => {
    const result = classifyBadgeTribeAssignment(
      ['b1'],
      candidates({ b1: { type: 'activity', item_book_id: null } }),
      new Map(),
      TARGET
    )
    expect(result.assignable).toEqual(['b1'])
    expect(result.skipped).toEqual([])
  })

  it('체크인 배지는 건너뛴다(저장 API가 트라이브를 null로 강제)', () => {
    const result = classifyBadgeTribeAssignment(
      ['b1'],
      candidates({ b1: { type: 'checkin', item_book_id: null } }),
      new Map(),
      TARGET
    )
    expect(result.assignable).toEqual([])
    expect(result.skipped).toEqual([{ id: 'b1', reason: '체크인 배지는 트라이브를 지정할 수 없습니다.' }])
  })

  it('소속 컬렉션의 트라이브가 다르면 건너뛴다', () => {
    const result = classifyBadgeTribeAssignment(
      ['b1'],
      candidates({ b1: { type: 'activity', item_book_id: 'book1' } }),
      new Map([['book1', 'tribe-b']]),
      TARGET
    )
    expect(result.assignable).toEqual([])
    expect(result.skipped[0]).toMatchObject({ id: 'b1', reason: '소속 컬렉션의 트라이브와 달라 지정할 수 없습니다.' })
  })

  it('소속 컬렉션에 트라이브가 없어도(null) 지정하려는 트라이브와 다르므로 건너뛴다', () => {
    const result = classifyBadgeTribeAssignment(
      ['b1'],
      candidates({ b1: { type: 'activity', item_book_id: 'book1' } }),
      new Map([['book1', null]]),
      TARGET
    )
    expect(result.assignable).toEqual([])
    expect(result.skipped).toHaveLength(1)
  })

  it('소속 컬렉션의 트라이브가 같으면 지정 가능하다', () => {
    const result = classifyBadgeTribeAssignment(
      ['b1'],
      candidates({ b1: { type: 'activity', item_book_id: 'book1' } }),
      new Map([['book1', TARGET]]),
      TARGET
    )
    expect(result.assignable).toEqual(['b1'])
  })

  it('조회되지 않은 id는 건너뛰고 입력 순서를 유지한다', () => {
    const result = classifyBadgeTribeAssignment(
      ['b1', 'missing', 'b2'],
      candidates({
        b1: { type: 'activity', item_book_id: null },
        b2: { type: 'item', item_book_id: null },
      }),
      new Map(),
      TARGET
    )
    expect(result.assignable).toEqual(['b1', 'b2'])
    expect(result.skipped).toEqual([{ id: 'missing', reason: '배지를 찾을 수 없습니다.' }])
  })
})
