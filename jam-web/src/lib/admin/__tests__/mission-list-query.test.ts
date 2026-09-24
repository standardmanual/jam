import {
  parseMissionListParams,
  applyMissionListQuery,
  missionStatusOf,
  missionTypesForKind,
  isGateMission,
  type MissionListQuery,
} from '../mission-list-query'

interface RecordedCall {
  method: string
  args: unknown[]
}

/** 기록형 스텁 — 어떤 필터 호출이 나갔는지만 기록한다 */
function createStubQuery<T>() {
  const calls: RecordedCall[] = []
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args })
    return query
  }
  const query = {
    ilike: record('ilike'),
    eq: record('eq'),
    gt: record('gt'),
    lt: record('lt'),
    lte: record('lte'),
    is: record('is'),
    not: record('not'),
    or: record('or'),
    order: record('order'),
    range: async () => ({ data: [], count: 0, error: null }),
  } as unknown as MissionListQuery<T>
  return { query, calls }
}

const NOW = new Date('2026-09-24T03:00:00.000Z')
const NOW_ISO = NOW.toISOString()

function filterCalls(calls: RecordedCall[]) {
  return calls.filter((c) => c.method !== 'order')
}

describe('parseMissionListParams', () => {
  it('빈 파라미터는 전부 기본값이다', () => {
    expect(parseMissionListParams({})).toEqual({
      q: '',
      kind: 'all',
      missionType: 'all',
      reward: 'all',
      state: 'all',
      sort: 'created_desc',
    })
  })

  it('알려진 값만 통과시키고 모르는 값은 기본값으로 되돌린다', () => {
    expect(
      parseMissionListParams({
        q: ' 한강 ',
        kind: 'gate',
        mission_type: 'distance',
        reward: 'points',
        state: 'ended',
        sort: 'ends_asc',
      })
    ).toEqual({ q: '한강', kind: 'gate', missionType: 'distance', reward: 'points', state: 'ended', sort: 'ends_asc' })

    const bad = parseMissionListParams({ kind: 'x', reward: 'y', state: 'z', sort: 'w' })
    expect(bad).toMatchObject({ kind: 'all', reward: 'all', state: 'all', sort: 'created_desc' })
  })

  it('검색어의 PostgREST 필터 문법 문자를 정제한다', () => {
    expect(parseMissionListParams({ q: 'a,b(c)%' }).q).not.toMatch(/[,()%]/)
  })
})

describe('applyMissionListQuery — 구분(일반/게이트)', () => {
  it('일반 = gate_axis와 gated_badge_id가 모두 null', () => {
    const { query, calls } = createStubQuery()
    applyMissionListQuery(query, parseMissionListParams({ kind: 'normal' }), NOW)
    expect(filterCalls(calls)).toEqual([
      { method: 'is', args: ['gate_axis', null] },
      { method: 'is', args: ['gated_badge_id', null] },
    ])
  })

  it('게이트 = 둘 중 하나라도 있음', () => {
    const { query, calls } = createStubQuery()
    applyMissionListQuery(query, parseMissionListParams({ kind: 'gate' }), NOW)
    expect(filterCalls(calls)).toEqual([{ method: 'or', args: ['gate_axis.not.is.null,gated_badge_id.not.is.null'] }])
  })
})

describe('applyMissionListQuery — 상태 필터 3종(기준 시각 하나)', () => {
  it('진행: starts_at <= now 그리고 ends_at이 null이거나 >= now', () => {
    const { query, calls } = createStubQuery()
    applyMissionListQuery(query, parseMissionListParams({ state: 'active' }), NOW)
    expect(filterCalls(calls)).toEqual([
      { method: 'lte', args: ['starts_at', NOW_ISO] },
      { method: 'or', args: [`ends_at.is.null,ends_at.gte.${NOW_ISO}`] },
    ])
  })

  it('예정: starts_at > now', () => {
    const { query, calls } = createStubQuery()
    applyMissionListQuery(query, parseMissionListParams({ state: 'upcoming' }), NOW)
    expect(filterCalls(calls)).toEqual([{ method: 'gt', args: ['starts_at', NOW_ISO] }])
  })

  it('종료: ends_at < now', () => {
    const { query, calls } = createStubQuery()
    applyMissionListQuery(query, parseMissionListParams({ state: 'ended' }), NOW)
    expect(filterCalls(calls)).toEqual([{ method: 'lt', args: ['ends_at', NOW_ISO] }])
  })
})

describe('applyMissionListQuery — 미션 유형·보상·검색·정렬', () => {
  it('미션 유형은 mission_type 단일값 필터다', () => {
    const { query, calls } = createStubQuery()
    applyMissionListQuery(query, parseMissionListParams({ mission_type: 'checkin' }), NOW)
    expect(filterCalls(calls)).toEqual([{ method: 'eq', args: ['mission_type', 'checkin'] }])
  })

  it('보상: 배지 = 배열이 비어 있지 않음', () => {
    const { query, calls } = createStubQuery()
    applyMissionListQuery(query, parseMissionListParams({ reward: 'badge' }), NOW)
    expect(filterCalls(calls)).toEqual([{ method: 'not', args: ['reward_badge_ids', 'eq', '{}'] }])
  })

  it('보상: 포인트 = reward_points > 0', () => {
    const { query, calls } = createStubQuery()
    applyMissionListQuery(query, parseMissionListParams({ reward: 'points' }), NOW)
    expect(filterCalls(calls)).toEqual([{ method: 'gt', args: ['reward_points', 0] }])
  })

  it('보상: 없음 = 배지 배열이 비고 포인트가 null이거나 0', () => {
    const { query, calls } = createStubQuery()
    applyMissionListQuery(query, parseMissionListParams({ reward: 'none' }), NOW)
    expect(filterCalls(calls)).toEqual([
      { method: 'eq', args: ['reward_badge_ids', '{}'] },
      { method: 'or', args: ['reward_points.is.null,reward_points.eq.0'] },
    ])
  })

  it('제목 검색은 ilike이고, 보조 정렬로 id를 항상 붙인다', () => {
    const { query, calls } = createStubQuery()
    applyMissionListQuery(query, parseMissionListParams({ q: '한강', sort: 'title_asc' }), NOW)
    expect(calls[0]).toEqual({ method: 'ilike', args: ['title', '%한강%'] })
    expect(calls.slice(-2)).toEqual([
      { method: 'order', args: ['title', { ascending: true }] },
      { method: 'order', args: ['id', { ascending: true }] },
    ])
  })

  it('종료일 정렬은 상시 미션(종료일 없음)을 어느 방향에서도 맨 뒤로 보낸다', () => {
    const { query, calls } = createStubQuery()
    applyMissionListQuery(query, parseMissionListParams({ sort: 'ends_desc' }), NOW)
    expect(calls[0]).toEqual({ method: 'order', args: ['ends_at', { ascending: false, nullsFirst: false }] })
  })
})

describe('missionStatusOf', () => {
  it('시작 전 = 예정, 종료일이 지남 = 종료, 그 밖 = 진행(종료일 없는 상시 포함)', () => {
    expect(missionStatusOf({ starts_at: '2026-09-25T00:00:00Z', ends_at: null }, NOW)).toBe('upcoming')
    expect(missionStatusOf({ starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-09-20T00:00:00Z' }, NOW)).toBe('ended')
    expect(missionStatusOf({ starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-10-01T00:00:00Z' }, NOW)).toBe('active')
    expect(missionStatusOf({ starts_at: '2026-09-01T00:00:00Z', ends_at: null }, NOW)).toBe('active')
  })
})

describe('연쇄 필터 — missionTypesForKind', () => {
  const rows = [
    { mission_type: 'distance', gate_axis: null, gated_badge_id: null },
    { mission_type: 'checkin', gate_axis: null, gated_badge_id: null },
    { mission_type: 'engine_condition', gate_axis: 'run:speed', gated_badge_id: null },
    { mission_type: 'distance', gate_axis: null, gated_badge_id: 'badge-1' },
  ] as Parameters<typeof missionTypesForKind>[0]

  it('구분이 게이트면 게이트 미션에 있는 유형만 남는다', () => {
    expect(missionTypesForKind(rows, 'gate')).toEqual(['distance', 'engine_condition'])
  })

  it('구분이 일반이면 일반 미션에 있는 유형만 남는다', () => {
    expect(missionTypesForKind(rows, 'normal')).toEqual(['distance', 'checkin'])
  })

  it('구분을 고르지 않으면 전체 유형이 저작 폼 순서로 나온다', () => {
    expect(missionTypesForKind(rows, 'all')).toEqual(['distance', 'checkin', 'engine_condition'])
  })

  it('isGateMission은 gate_axis 또는 gated_badge_id가 있으면 게이트다', () => {
    expect(isGateMission({ gate_axis: null, gated_badge_id: null })).toBe(false)
    expect(isGateMission({ gate_axis: 'a:b', gated_badge_id: null })).toBe(true)
    expect(isGateMission({ gate_axis: null, gated_badge_id: 'x' })).toBe(true)
  })
})
