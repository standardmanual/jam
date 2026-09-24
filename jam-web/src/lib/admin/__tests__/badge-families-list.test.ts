/**
 * 배지 계열 목록 — `listFamilies`의 필터·정렬·쪽 나누기와 URL 조건 파싱 (티켓 20260924_0949)
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/badge-families-list.test.ts
 */
import type { BadgeCondition, BadgeRarity } from '@/types/database'
import type { FamilyBadge } from '../badge-families'

let fakeBadges: FamilyBadge[] = []
let fakeError: { message: string } | null = null

vi.mock('@/lib/supabase/server', () => {
  // fetchActivityFamilyBadges의 체인: from → select → eq → is → order → range
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    range: async (from: number, to: number) =>
      fakeError ? { data: null, error: fakeError } : { data: fakeBadges.slice(from, to + 1), error: null },
  }
  return { createServiceClient: () => ({ from: () => chain }) }
})

const { listFamilies } = await import('../badge-families-query')
const { parseFamilyListParams } = await import('../badge-families')

let seq = 0
/** 계열 하나(레벨형) — `levels`개의 배지를 만든다 */
function family(name: string, activityType: string, levels: number, metric: 'distance_km' | 'elevation_gain_m' = 'distance_km'): FamilyBadge[] {
  const key = `${activityType}:${name}`
  return Array.from({ length: levels }, (_, i) => {
    seq += 1
    return {
      id: `b-${seq}`,
      name,
      description: '',
      rarity: null as BadgeRarity | null,
      level: i + 1,
      family_key: key,
      sort_order: 5,
      image_url: i === 0 ? 'https://cdn.example.com/x.png' : null,
      condition_json: { activity_type: activityType, [metric]: (i + 1) * 10 } as BadgeCondition,
      activity_types: [activityType],
      deleted_at: null,
      admin_category: null,
    } as FamilyBadge
  })
}

const params = (raw: Record<string, string> = {}) => parseFamilyListParams(raw)

beforeEach(() => {
  seq = 0
  fakeError = null
  fakeBadges = [
    ...family('밤의 보행자', 'walking', 3),
    ...family('언덕의 도전자', 'hiking', 5, 'elevation_gain_m'),
    ...family('새벽 러너', 'running', 2),
  ]
})

describe('parseFamilyListParams', () => {
  it('빈 파라미터는 조건 없음·기본순·1쪽이다', () => {
    expect(parseFamilyListParams({})).toEqual({ q: '', activityType: null, conditionKey: null, sort: 'default', page: 1 })
  })

  it('URL 키(activity_type·condition_key)를 조건으로 옮기고, 알 수 없는 정렬은 기본순으로 떨어진다', () => {
    expect(
      parseFamilyListParams({ q: ' 러너 ', activity_type: 'running', condition_key: 'distance_km', sort: 'count_desc', page: '3' })
    ).toEqual({ q: '러너', activityType: 'running', conditionKey: 'distance_km', sort: 'count_desc', page: 3 })
    expect(parseFamilyListParams({ sort: 'popular' }).sort).toBe('default')
  })

  it('쪽 번호가 잘못되면 1쪽이다', () => {
    expect(parseFamilyListParams({ page: '0' }).page).toBe(1)
    expect(parseFamilyListParams({ page: 'abc' }).page).toBe(1)
  })
})

describe('listFamilies — 필터', () => {
  it('조건이 없으면 전체 계열과 활동 배지 수를 돌려준다', async () => {
    const result = await listFamilies(params())
    expect(result.error).toBeNull()
    expect(result.all).toHaveLength(3)
    expect(result.matched).toHaveLength(3)
    expect(result.badgeCount).toBe(10)
  })

  it('검색어로 좁히되 전체(all)는 그대로다', async () => {
    const result = await listFamilies(params({ q: '러너' }))
    expect(result.matched.map((f) => f.name)).toEqual(['새벽 러너'])
    expect(result.items).toHaveLength(1)
    expect(result.all).toHaveLength(3)
  })

  it('종목·조건 지표로 좁힌다', async () => {
    expect((await listFamilies(params({ activity_type: 'hiking' }))).matched.map((f) => f.name)).toEqual(['언덕의 도전자'])
    expect((await listFamilies(params({ condition_key: 'elevation_gain_m' }))).matched.map((f) => f.name)).toEqual([
      '언덕의 도전자',
    ])
  })

  it('조건에 맞는 계열이 없으면 빈 목록이다', async () => {
    const result = await listFamilies(params({ q: '없는 계열' }))
    expect(result.matched).toEqual([])
    expect(result.items).toEqual([])
    expect(result.page).toBe(1)
  })
})

describe('listFamilies — 정렬', () => {
  const names = async (sort: string) => (await listFamilies(params({ sort }))).matched.map((f) => f.name)

  it('계열명 사전순(오름·내림)', async () => {
    expect(await names('name_asc')).toEqual(['밤의 보행자', '새벽 러너', '언덕의 도전자'])
    expect(await names('name_desc')).toEqual(['언덕의 도전자', '새벽 러너', '밤의 보행자'])
  })

  it('배지 수(단계 수) 정렬', async () => {
    expect(await names('count_desc')).toEqual(['언덕의 도전자', '밤의 보행자', '새벽 러너'])
    expect(await names('count_asc')).toEqual(['새벽 러너', '밤의 보행자', '언덕의 도전자'])
  })

  it('기본순은 종목 탭 순서(걷기 → 러닝 → 하이킹 …)를 따른다', async () => {
    const result = await listFamilies(params())
    expect(result.matched.map((f) => f.activityType)).toEqual(['walking', 'running', 'hiking'])
  })
})

describe('listFamilies — 쪽 나누기(50건)', () => {
  beforeEach(() => {
    fakeBadges = Array.from({ length: 120 }, (_, i) =>
      family(`계열 ${String(i).padStart(3, '0')}`, 'walking', 1)
    ).flat()
  })

  it('한 쪽에 50건씩 자르고 전체 건수는 matched로 알 수 있다', async () => {
    const first = await listFamilies(params({ sort: 'name_asc' }))
    expect(first.matched).toHaveLength(120)
    expect(first.items).toHaveLength(50)
    expect(first.items[0].name).toBe('계열 000')
    expect(first.items[49].name).toBe('계열 049')

    const third = await listFamilies(params({ sort: 'name_asc', page: '3' }))
    expect(third.items).toHaveLength(20)
    expect(third.items[0].name).toBe('계열 100')
  })

  it('마지막 쪽을 넘긴 요청은 마지막 쪽으로 맞춘다', async () => {
    const result = await listFamilies(params({ sort: 'name_asc', page: '99' }))
    expect(result.page).toBe(3)
    expect(result.items).toHaveLength(20)
  })

  it('필터 결과 전체 선택용 키는 쪽과 무관하게 조건에 맞는 계열 전체다', async () => {
    const result = await listFamilies(params({ q: '계열 01', page: '2' }))
    expect(result.matched.map((f) => f.key)).toHaveLength(10)
    expect(result.matched.every((f) => f.key.startsWith('walking:계열 01'))).toBe(true)
  })
})

describe('listFamilies — 조회 오류', () => {
  it('배지 조회가 실패하면 error를 돌려준다(호출부가 부분 목록으로 그리지 않게)', async () => {
    fakeError = { message: 'db down' }
    const result = await listFamilies(params())
    expect(result.error).toBe('db down')
    expect(result.matched).toEqual([])
  })
})
