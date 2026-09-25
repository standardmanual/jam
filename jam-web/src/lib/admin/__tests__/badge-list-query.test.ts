import { vi } from 'vitest'
import { fetchBadgeListPage, parseBadgeListParams } from '../badge-list-query'

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
      image_source: 'admin-generator',
    })
    expect(parsed).toMatchObject({
      type: 'checkin',
      rarity: 'rare',
      activityType: 'running',
      poiCategory: 'cafe',
      tribeId: 't1',
      itemBookId: 'b1',
      imageSource: 'admin-generator',
    })
  })

  it('제작 경로 필터가 없으면 imageSource는 undefined다(전체 조회)', () => {
    expect(parseBadgeListParams({}).imageSource).toBeUndefined()
  })

  it("제작 경로 필터 sentinel(__unknown__)도 그대로 넘어간다", () => {
    expect(parseBadgeListParams({ image_source: '__unknown__' }).imageSource).toBe('__unknown__')
  })
})

describe('fetchBadgeListPage — 기본 경로 조회 오류 처리(티켓 20260925_1941)', () => {
  /** 어떤 체이닝 메서드를 불러도 자기 자신을 돌려주고, `range`에서 주어진 결과로 끝나는 스텁 */
  function fakeSupabase(result: { data: unknown[] | null; count: number | null; error: { message: string } | null }) {
    const chain: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_target, prop) => (prop === 'range' ? async () => result : () => chain),
      }
    )
    return { from: () => ({ select: () => chain }) } as unknown as Parameters<typeof fetchBadgeListPage>[0]
  }

  it('조회가 오류를 돌려주면 빈 목록이 아니라 예외를 던진다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = fakeSupabase({ data: null, count: null, error: { message: 'column "x" does not exist' } })
    await expect(fetchBadgeListPage(supabase, parseBadgeListParams({}), 1)).rejects.toThrow(
      '[admin/badges] 조회 실패: column "x" does not exist'
    )
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('조회가 성공하면 기존 결과를 그대로 돌려준다', async () => {
    const rows = [{ id: 'g1' }, { id: 'g2' }]
    const supabase = fakeSupabase({ data: rows, count: 2, error: null })
    await expect(fetchBadgeListPage(supabase, parseBadgeListParams({}), 1)).resolves.toEqual({
      badges: rows,
      total: 2,
    })
  })

  it('결과가 비어 있으면 여전히 빈 목록이다', async () => {
    const supabase = fakeSupabase({ data: null, count: null, error: null })
    await expect(fetchBadgeListPage(supabase, parseBadgeListParams({}), 1)).resolves.toEqual({
      badges: [],
      total: 0,
    })
  })
})
