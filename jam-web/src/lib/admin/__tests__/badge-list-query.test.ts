import { vi } from 'vitest'
import { fetchBadgeListPage, parseBadgeListParams } from '../badge-list-query'
import { UNKNOWN_IMAGE_SOURCE_FILTER } from '../contentImageSource'

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

describe('제작 경로(imageSource) 필터가 실제로 걸러낸다(티켓 20260925_0347)', () => {
  type Call = [method: string, ...args: unknown[]]

  /**
   * 호출된 체이닝 메서드를 기록하고, `range`에서 테이블별 결과로 끝나는 스텁.
   * 기본 DB 경로(badges 1회)와 체크인 카테고리 메모리 경로(badges·poi 각 1회) 모두에 쓴다.
   */
  function recordingSupabase(rowsByTable: Record<string, unknown[]> = {}) {
    const calls: Call[] = []
    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = new Proxy(
          {},
          {
            get: (_target, prop: string) => {
              if (prop === 'range') {
                const rows = rowsByTable[table] ?? []
                return async () => ({ data: rows, count: rows.length, error: null })
              }
              return (...args: unknown[]) => {
                calls.push([prop, ...args])
                return chain
              }
            },
          }
        )
        return {
          select: (...args: unknown[]) => {
            calls.push(['select', ...args])
            return chain
          },
        }
      },
    } as unknown as Parameters<typeof fetchBadgeListPage>[0]
    return { supabase, calls }
  }

  const imageSourceCalls = (calls: Call[]) => calls.filter(([, column]) => column === 'image_source')

  describe('DB 필터(applyBadgeListFilters)', () => {
    it.each([
      ['수동 제작', 'admin-generator'],
      ['윤진 자동', 'agent-generator'],
      ['아이콘 파이프라인', 'jam-img'],
    ])("%s(%s)는 .eq('image_source', 값)으로 건다", async (_label, value) => {
      const { supabase, calls } = recordingSupabase()
      await fetchBadgeListPage(supabase, parseBadgeListParams({ image_source: value }), 1)
      expect(imageSourceCalls(calls)).toEqual([['eq', 'image_source', value]])
    })

    it("미상(__unknown__)은 값 없음(NULL)만 고르는 .is('image_source', null)로 건다", async () => {
      const { supabase, calls } = recordingSupabase()
      await fetchBadgeListPage(supabase, parseBadgeListParams({ image_source: UNKNOWN_IMAGE_SOURCE_FILTER }), 1)
      expect(imageSourceCalls(calls)).toEqual([['is', 'image_source', null]])
    })

    it('필터가 없으면 image_source 조건을 걸지 않는다', async () => {
      const { supabase, calls } = recordingSupabase()
      await fetchBadgeListPage(supabase, parseBadgeListParams({}), 1)
      expect(imageSourceCalls(calls)).toEqual([])
    })

    it('계열순(전량 정렬 경로)에서도 같은 필터를 건다', async () => {
      const { supabase, calls } = recordingSupabase()
      await fetchBadgeListPage(supabase, parseBadgeListParams({ image_source: 'jam-img', sort: 'family_asc' }), 1)
      expect(imageSourceCalls(calls)).toEqual([['eq', 'image_source', 'jam-img']])
    })
  })

  describe('메모리 필터(fetchCheckinCategoryCandidates) — 체크인 지점 카테고리 경로', () => {
    const base = {
      description: null,
      type: 'checkin',
      rarity: 'common',
      image_url: null,
      condition_json: null,
      activity_types: [],
      patch_available: false,
      patch_price_krw: null,
      tribe_id: null,
      deleted_at: null,
      created_at: '2026-09-01T00:00:00Z',
      category: 'cafe',
      admin_category: null,
    }
    const badges = [
      { ...base, id: 'b-admin', name: '수동', image_source: 'admin-generator' },
      { ...base, id: 'b-agent', name: '윤진', image_source: 'agent-generator' },
      { ...base, id: 'b-icon', name: '아이콘', image_source: 'jam-img' },
      { ...base, id: 'b-null', name: '미상 null', image_source: null },
      { ...base, id: 'b-empty', name: '미상 빈값', image_source: '' },
    ]

    async function run(imageSource: string | undefined) {
      const { supabase, calls } = recordingSupabase({ badges })
      const raw: Record<string, string> = { type: 'checkin', poi_category: 'cafe' }
      if (imageSource) raw.image_source = imageSource
      const result = await fetchBadgeListPage(supabase, parseBadgeListParams(raw), 1)
      return { ids: result.badges.map((b) => b.id).sort(), total: result.total, calls }
    }

    it.each([
      ['수동 제작', 'admin-generator', ['b-admin']],
      ['윤진 자동', 'agent-generator', ['b-agent']],
      ['아이콘 파이프라인', 'jam-img', ['b-icon']],
    ])('%s(%s)는 그 값을 가진 배지만 남긴다', async (_label, value, expected) => {
      const { ids, total } = await run(value)
      expect(ids).toEqual(expected)
      expect(total).toBe(expected.length)
    })

    it('미상(__unknown__)은 값이 없거나 빈 배지만 남긴다', async () => {
      const { ids, total } = await run(UNKNOWN_IMAGE_SOURCE_FILTER)
      expect(ids).toEqual(['b-empty', 'b-null'])
      expect(total).toBe(2)
    })

    it('필터가 없으면 제작 경로와 무관하게 전부 남긴다', async () => {
      const { ids } = await run(undefined)
      expect(ids).toHaveLength(badges.length)
    })

    it('이 경로는 DB 쿼리에 image_source 조건을 걸지 않는다(메모리에서만 거른다)', async () => {
      const { calls } = await run('jam-img')
      expect(imageSourceCalls(calls)).toEqual([])
    })
  })
})
