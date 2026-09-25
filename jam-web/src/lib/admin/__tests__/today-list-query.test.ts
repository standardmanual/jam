/**
 * today-list-query.ts / today-bulk.ts — 투데이 목록 조건 해석·쿼리 적용·기간 종료 분류 유닛테스트
 * (티켓 20260924_0947)
 */
import { describe, it, expect } from 'vitest'
import { parseTodayListParams, applyTodayListQuery, type TodayListQuery } from '../today-list-query'
import { classifyTodayEndPeriod } from '../today-bulk'
import { UNKNOWN_IMAGE_SOURCE_FILTER } from '../contentImageSource'

interface RecordedCall {
  method: string
  args: unknown[]
}

/** 기록형 스텁 — 실제 필터·정렬 호출이 나갔는지만 기록한다(값 자체를 거르지는 않는다) */
function createStubQuery<T>() {
  const calls: RecordedCall[] = []
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args })
    return query
  }
  const query: TodayListQuery<T> = {
    lte: record('lte'),
    gte: record('gte'),
    eq: record('eq'),
    ilike: record('ilike'),
    is: record('is'),
    order: record('order'),
    range: async () => ({ data: [], count: 0, error: null }),
  } as TodayListQuery<T>
  return { query, calls }
}

const NOW = new Date('2026-09-24T03:00:00.000Z') // KST 2026-09-24 12:00

describe('parseTodayListParams', () => {
  it('빈 파라미터는 오늘(KST)·전체 템플릿·검색 없음·노출 순서 정렬이다', () => {
    expect(parseTodayListParams({}, NOW)).toEqual({
      date: '2026-09-24',
      template: undefined,
      q: '',
      sort: 'order',
    })
  })

  it('알려진 값은 타입이 있는 값으로 좁혀진다', () => {
    expect(
      parseTodayListParams({ date: '2026-09-30', template: 'ranking_board', q: '러닝', sort: 'title_desc' }, NOW)
    ).toEqual({ date: '2026-09-30', template: 'ranking_board', q: '러닝', sort: 'title_desc' })
  })

  it('잘못된 날짜·모르는 템플릿·모르는 정렬은 기본값으로 떨어진다', () => {
    expect(parseTodayListParams({ date: '2026-02-30', template: 'nope', sort: 'nope' }, NOW)).toMatchObject({
      date: '2026-09-24',
      template: undefined,
      sort: 'order',
    })
  })

  it('검색어의 필터 문법 문자는 공백으로 정제된다', () => {
    expect(parseTodayListParams({ q: 'a,b(c)%' }, NOW).q).toBe('a b c')
  })
})

describe('applyTodayListQuery', () => {
  it('날짜는 KST 하루 경계에 걸치는 카드 조건(starts_at <= 끝, ends_at >= 시작)으로 적용된다', () => {
    const { query, calls } = createStubQuery()
    applyTodayListQuery(query, parseTodayListParams({ date: '2026-09-24' }, NOW))

    expect(calls[0]).toEqual({ method: 'lte', args: ['starts_at', '2026-09-24T14:59:59.999Z'] })
    expect(calls[1]).toEqual({ method: 'gte', args: ['ends_at', '2026-09-23T15:00:00.000Z'] })
  })

  it('템플릿·검색어가 없으면 그 조건은 걸지 않는다', () => {
    const { query, calls } = createStubQuery()
    applyTodayListQuery(query, parseTodayListParams({}, NOW))

    expect(calls.some((c) => c.method === 'eq')).toBe(false)
    expect(calls.some((c) => c.method === 'ilike')).toBe(false)
  })

  it('템플릿은 eq, 제목 검색은 ilike로 걸린다', () => {
    const { query, calls } = createStubQuery()
    applyTodayListQuery(query, parseTodayListParams({ template: 'drop_alert', q: '오늘' }, NOW))

    expect(calls).toContainEqual({ method: 'eq', args: ['template_type', 'drop_alert'] })
    expect(calls).toContainEqual({ method: 'ilike', args: ['title', '%오늘%'] })
  })

  it('기본 정렬은 노출 순서(sort_order 오름차순 → 시작일 내림차순)이고 id를 보조 정렬로 붙인다', () => {
    const { query, calls } = createStubQuery()
    applyTodayListQuery(query, parseTodayListParams({}, NOW))

    const orders = calls.filter((c) => c.method === 'order')
    expect(orders).toEqual([
      { method: 'order', args: ['sort_order', { ascending: true }] },
      { method: 'order', args: ['starts_at', { ascending: false }] },
      { method: 'order', args: ['id', { ascending: true }] },
    ])
  })

  it('제목 정렬은 title 컬럼으로, 최근 등록순은 created_at 내림차순으로 정렬한다', () => {
    const title = createStubQuery()
    applyTodayListQuery(title.query, parseTodayListParams({ sort: 'title_desc' }, NOW))
    expect(title.calls).toContainEqual({ method: 'order', args: ['title', { ascending: false }] })

    const created = createStubQuery()
    applyTodayListQuery(created.query, parseTodayListParams({ sort: 'created_desc' }, NOW))
    expect(created.calls).toContainEqual({ method: 'order', args: ['created_at', { ascending: false }] })
  })

  // 제작 경로 필터(티켓 20260925_1411) — mission-list-query.ts의 imageSource 필터와 같은 규칙
  it('제작 경로 필터가 없으면 eq·is를 걸지 않는다', () => {
    const { query, calls } = createStubQuery()
    applyTodayListQuery(query, parseTodayListParams({}, NOW))

    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'image_source')).toBe(false)
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'image_source')).toBe(false)
  })

  it('제작 경로 필터값이 있으면 image_source에 eq를 건다', () => {
    const { query, calls } = createStubQuery()
    applyTodayListQuery(query, parseTodayListParams({ image_source: 'admin-generator' }, NOW))

    expect(calls).toContainEqual({ method: 'eq', args: ['image_source', 'admin-generator'] })
  })

  it('제작 경로 필터가 sentinel(값 없음)이면 image_source에 is null을 건다', () => {
    const { query, calls } = createStubQuery()
    applyTodayListQuery(query, parseTodayListParams({ image_source: UNKNOWN_IMAGE_SOURCE_FILTER }, NOW))

    expect(calls).toContainEqual({ method: 'is', args: ['image_source', null] })
  })
})

describe('classifyTodayEndPeriod', () => {
  const card = (id: string, startsAt: string, endsAt: string) => ({
    id,
    title: `카드 ${id}`,
    starts_at: startsAt,
    ends_at: endsAt,
  })

  it('노출 중인 카드만 기간 종료 대상이 되고 이미 종료된 카드는 건너뛴다', () => {
    const result = classifyTodayEndPeriod(
      ['live', 'ended'],
      [
        card('live', '2026-09-20T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
        card('ended', '2026-09-01T00:00:00.000Z', '2026-09-10T00:00:00.000Z'),
      ],
      NOW
    )

    expect(result.endable).toEqual(['live'])
    expect(result.skipped).toEqual([{ id: 'ended', label: '카드 ended', reason: '이미 종료된 카드예요.' }])
  })

  it('종료 시각이 정확히 지금인 카드는 이미 종료된 것으로 본다', () => {
    const result = classifyTodayEndPeriod(['edge'], [card('edge', '2026-09-01T00:00:00.000Z', NOW.toISOString())], NOW)

    expect(result.endable).toEqual([])
    expect(result.skipped).toHaveLength(1)
  })

  it('아직 시작 전인 카드는 뒤집힌 기간이 생기므로 건너뛴다', () => {
    const result = classifyTodayEndPeriod(
      ['scheduled'],
      [card('scheduled', '2026-10-01T00:00:00.000Z', '2026-10-10T00:00:00.000Z')],
      NOW
    )

    expect(result.endable).toEqual([])
    expect(result.skipped[0].reason).toContain('시작 전')
  })

  it('DB에 없는 ID는 이미 삭제된 카드로 건너뛴다', () => {
    const result = classifyTodayEndPeriod(['ghost'], [], NOW)

    expect(result.endable).toEqual([])
    expect(result.skipped).toEqual([{ id: 'ghost', reason: '이미 삭제된 카드예요.' }])
  })
})
