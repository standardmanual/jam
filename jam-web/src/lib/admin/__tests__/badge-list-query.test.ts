import { parseBadgeListParams } from '../badge-list-query'

describe('parseBadgeListParams', () => {
  it('빈 파라미터의 상태는 active(기본값)다', () => {
    expect(parseBadgeListParams({}).status).toBe('active')
  })

  it("상태 'all'은 'active'로 되돌아가지 않고 그대로 유지된다", () => {
    expect(parseBadgeListParams({ status: 'all' }).status).toBe('all')
  })

  it("상태 'inactive'는 그대로 유지되고 알 수 없는 값은 active로 떨어진다", () => {
    expect(parseBadgeListParams({ status: 'inactive' }).status).toBe('inactive')
    expect(parseBadgeListParams({ status: 'archived' }).status).toBe('active')
  })

  it('검색어는 sanitizeSearchTerm을 거친다(쉼표·괄호 제거)', () => {
    expect(parseBadgeListParams({ q: '성수,(카페)' }).q).toBe('성수  카페')
  })

  it('필터 값은 이름을 바꿔 그대로 넘어간다', () => {
    const parsed = parseBadgeListParams({
      type: 'checkin',
      rarity: 'rare',
      activity_type: 'running',
      poi_category: 'cafe',
      tribe_id: 't1',
      item_book_id: 'b1',
    })
    expect(parsed).toMatchObject({
      type: 'checkin',
      rarity: 'rare',
      activityType: 'running',
      poiCategory: 'cafe',
      tribeId: 't1',
      itemBookId: 'b1',
    })
  })
})
