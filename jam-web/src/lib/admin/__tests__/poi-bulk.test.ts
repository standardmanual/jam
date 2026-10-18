import { buildPoiCategoryPatch, classifyPoiDeletion } from '../poi-bulk'
import { resolvePoiRadiusMeters, EXACT_MATCH_RADIUS_BY_CATEGORY } from '@/lib/poi/radius-policy'
import { emptyCounts, type PoiDeletionCandidate } from '../poi-references'

describe('buildPoiCategoryPatch', () => {
  it('정확 매칭 반경 정책이 있는 카테고리는 모두 resolvePoiRadiusMeters와 같은 반경을 patch에 담는다', () => {
    for (const category of Object.keys(EXACT_MATCH_RADIUS_BY_CATEGORY)) {
      const patch = buildPoiCategoryPatch(category)
      // 정책이 있으면 기존 반경(999)을 넘겨도 정책값으로 덮인다 — resolvePoiRadiusMeters와 동일
      expect(patch).toEqual({ category, radius_meters: resolvePoiRadiusMeters(category, 999) })
    }
  })

  it('정책이 없는 카테고리는 radius_meters 없이 category만 담는다(기존 반경 유지와 동일한 결과)', () => {
    const patch = buildPoiCategoryPatch('cafe')
    expect(patch).toEqual({ category: 'cafe' })
    expect('radius_meters' in patch).toBe(false)
    // 정책이 없으면 resolvePoiRadiusMeters는 넘긴 값을 그대로 돌려준다 — patch가 radius_meters를
    // 빼는 것과 같은 결과(각 POI의 기존 값이 그대로 유지된다)
    expect(resolvePoiRadiusMeters('cafe', 123)).toBe(123)
  })
})

describe('classifyPoiDeletion', () => {
  function candidate(overrides: Partial<PoiDeletionCandidate> = {}): PoiDeletionCandidate {
    return { id: 'p1', name: '장소', counts: emptyCounts(), total: 0, ...overrides }
  }

  it('참조가 없는 장소는 삭제 가능으로 분류한다', () => {
    const candidates = new Map([['p1', candidate({ id: 'p1' })]])
    const result = classifyPoiDeletion(['p1'], candidates)
    expect(result).toEqual({ deletable: ['p1'], skipped: [] })
  })

  it('참조가 하나라도 있으면 단건 DELETE 409와 같은 형식의 사유로 건너뛴다', () => {
    const counts = { ...emptyCounts(), poi_drops: 3, user_checkin_badge_earns: 1 }
    const candidates = new Map([
      ['p1', candidate({ id: 'p1', name: '성수 카페', counts, total: 4 })],
    ])
    const result = classifyPoiDeletion(['p1'], candidates)

    expect(result.deletable).toEqual([])
    expect(result.skipped).toEqual([
      {
        id: 'p1',
        label: '성수 카페',
        reason: '이미 4건의 드랍·체크인·조회 이력이 있는 장소입니다(월드 드랍 기록 3건, 체크인 배지 획득 이력 1건). 비활성화를 이용해주세요.',
      },
    ])
  })

  it('존재하지 않는(candidates에 없는) id는 건너뛴다', () => {
    const result = classifyPoiDeletion(['missing'], new Map())
    expect(result.deletable).toEqual([])
    expect(result.skipped).toEqual([{ id: 'missing', reason: '장소를 찾을 수 없습니다.' }])
  })

  it('여러 id를 섞어도 각각 올바르게 분류한다', () => {
    const candidates = new Map([
      ['clean', candidate({ id: 'clean', total: 0 })],
      ['blocked', candidate({ id: 'blocked', counts: { ...emptyCounts(), poi_views: 2 }, total: 2 })],
    ])
    const result = classifyPoiDeletion(['clean', 'blocked', 'missing'], candidates)
    expect(result.deletable).toEqual(['clean'])
    expect(result.skipped.map((s) => s.id)).toEqual(['blocked', 'missing'])
  })
})
