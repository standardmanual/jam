import {
  parseOrphanedListParams,
  sortOrphanedRows,
  ORPHANED_DEFAULT_SORT,
  type OrphanedItemRow,
  type OrphanedSort,
} from '../orphaned-items-query'

function row(overrides: Partial<OrphanedItemRow> & Pick<OrphanedItemRow, 'id'>): OrphanedItemRow {
  return {
    serialLabel: 'A1',
    serialPrefix: 'A',
    serialNumber: 1,
    badgeId: 'b',
    badgeName: '배지',
    badgeImageUrl: null,
    badgeRarity: 'common',
    mintedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

const ROWS: OrphanedItemRow[] = [
  row({ id: 'r1', badgeName: '나무', serialPrefix: 'B', serialNumber: 10, mintedAt: '2026-09-03T00:00:00.000Z' }),
  row({ id: 'r2', badgeName: '가을', serialPrefix: 'A', serialNumber: 9, mintedAt: '2026-09-01T00:00:00.000Z' }),
  row({ id: 'r3', badgeName: '다람쥐', serialPrefix: 'A', serialNumber: 10, mintedAt: '2026-09-02T00:00:00.000Z' }),
  row({ id: 'r4', badgeName: '가을', serialPrefix: 'B', serialNumber: 2, mintedAt: '2026-09-02T00:00:00.000Z' }),
]

const idsOf = (rows: OrphanedItemRow[]) => rows.map((r) => r.id)

describe('parseOrphanedListParams', () => {
  it('정렬이 없거나 알 수 없으면 발급일 최신순이다', () => {
    expect(parseOrphanedListParams({}).sort).toBe(ORPHANED_DEFAULT_SORT)
    expect(ORPHANED_DEFAULT_SORT).toBe('minted_desc')
    expect(parseOrphanedListParams({ sort: 'popular' }).sort).toBe('minted_desc')
  })

  it('알려진 정렬 여섯 가지는 그대로 통과한다', () => {
    for (const sort of ['minted_desc', 'minted_asc', 'badge_asc', 'badge_desc', 'serial_asc', 'serial_desc']) {
      expect(parseOrphanedListParams({ sort }).sort).toBe(sort)
    }
  })
})

describe('sortOrphanedRows', () => {
  it('발급일 최신순·오래된순', () => {
    expect(idsOf(sortOrphanedRows(ROWS, 'minted_desc'))).toEqual(['r1', 'r3', 'r4', 'r2'])
    expect(idsOf(sortOrphanedRows(ROWS, 'minted_asc'))).toEqual(['r2', 'r3', 'r4', 'r1'])
  })

  it('배지 이름순 — 이름이 같으면 id로 순서를 고정한다', () => {
    expect(idsOf(sortOrphanedRows(ROWS, 'badge_asc'))).toEqual(['r2', 'r4', 'r1', 'r3'])
    expect(idsOf(sortOrphanedRows(ROWS, 'badge_desc'))).toEqual(['r3', 'r1', 'r2', 'r4'])
  })

  it('일련번호순 — 접두어 다음 숫자로 비교한다(문자열이면 10이 9보다 앞선다)', () => {
    expect(idsOf(sortOrphanedRows(ROWS, 'serial_asc'))).toEqual(['r2', 'r3', 'r4', 'r1'])
    expect(idsOf(sortOrphanedRows(ROWS, 'serial_desc'))).toEqual(['r1', 'r4', 'r3', 'r2'])
  })

  it('입력 배열을 바꾸지 않는다', () => {
    const before = idsOf(ROWS)
    sortOrphanedRows(ROWS, 'badge_asc')
    expect(idsOf(ROWS)).toEqual(before)
  })

  it('전체를 정렬한 뒤 쪽을 자르므로 쪽을 넘어도 순서가 이어지고 빠지거나 겹치는 행이 없다', () => {
    const many: OrphanedItemRow[] = Array.from({ length: 120 }, (_, i) =>
      row({
        id: `id${String(i).padStart(3, '0')}`,
        // 발급일이 겹치도록 일부러 30개 단위로 같은 값을 준다
        mintedAt: `2026-09-${String((i % 4) + 1).padStart(2, '0')}T00:00:00.000Z`,
      })
    )
    const sorts: OrphanedSort[] = ['minted_desc', 'minted_asc', 'badge_asc', 'serial_desc']

    for (const sort of sorts) {
      const sorted = sortOrphanedRows(many, sort)
      const pages = [sorted.slice(0, 50), sorted.slice(50, 100), sorted.slice(100, 150)]
      const flat = pages.flat()

      expect(flat).toHaveLength(120)
      expect(new Set(idsOf(flat)).size).toBe(120)
      // 같은 입력으로 다시 정렬해도 같은 순서(쪽을 다시 열어도 행이 움직이지 않는다)
      expect(idsOf(sortOrphanedRows([...many].reverse(), sort))).toEqual(idsOf(sorted))
    }
  })
})
