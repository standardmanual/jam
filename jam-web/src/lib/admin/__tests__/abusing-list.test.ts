import {
  applyAbusingListFilters,
  parseAbusingListParams,
  parseAbusingPageTab,
  searchFilterOf,
  statusFilterOf,
  type AbusingListQuery,
} from '../abusing-list'
import {
  parseExtendDays,
  summarizePoiBlockExtend,
  summarizePoiBlockRelease,
  untilFromDays,
} from '../abusing-bulk'

const NOW = new Date('2026-09-24T00:00:00.000Z')
const NOW_ISO = NOW.toISOString()

describe('parseAbusingPageTab (티켓 20261022_1134 2회: «정책 설정» 탭을 밸런스 설정으로 옮겼다)', () => {
  it('poi-blocks만 장소 블록 탭이고 suspensions는 이용 정지 탭이다', () => {
    expect(parseAbusingPageTab('poi-blocks')).toBe('poi-blocks')
    expect(parseAbusingPageTab('suspensions')).toBe('suspensions')
  })

  it('값이 없으면 이용 정지 탭이 기본이다', () => {
    expect(parseAbusingPageTab(undefined)).toBe('suspensions')
    expect(parseAbusingPageTab('')).toBe('suspensions')
  })

  it('옛 «정책 설정» 탭 주소(?tab=policy)와 옛 섀도우밴 탭 주소(?tab=bans)와 알 수 없는 값은 이용 정지 탭으로 떨어진다', () => {
    expect(parseAbusingPageTab('policy')).toBe('suspensions')
    expect(parseAbusingPageTab('bans')).toBe('suspensions')
    expect(parseAbusingPageTab('nope')).toBe('suspensions')
  })
})

describe('parseAbusingListParams', () => {
  it('빈 파라미터의 상태는 active, 정렬은 최신순이다', () => {
    const parsed = parseAbusingListParams({}, 'poi-blocks')
    expect(parsed.status).toBe('active')
    expect(parsed.sort).toEqual({ column: 'created_at', ascending: false })
  })

  it("상태 'all'·'expired'는 그대로 유지되고 알 수 없는 값은 active로 떨어진다", () => {
    expect(parseAbusingListParams({ status: 'all' }, 'poi-blocks').status).toBe('all')
    expect(parseAbusingListParams({ status: 'expired' }, 'poi-blocks').status).toBe('expired')
    expect(parseAbusingListParams({ status: 'x' }, 'poi-blocks').status).toBe('active')
  })

  it('검색어는 sanitizeSearchTerm을 거친다', () => {
    expect(parseAbusingListParams({ q: '홍,(길동)' }, 'poi-blocks').q).toBe('홍  길동')
  })

  it('머리 칸 정렬은 탭에 있는 컬럼만 받는다', () => {
    expect(parseAbusingListParams({ sort: 'expires_asc' }, 'poi-blocks').sort).toEqual({ column: 'blocked_until', ascending: true })
    // POI 블록에는 레벨 컬럼이 없다(옛 섀도우밴 레벨 정렬은 지웠다)
    expect(parseAbusingListParams({ sort: 'level_desc' }, 'poi-blocks').sort.column).toBe('created_at')
  })
})

describe('statusFilterOf', () => {
  it('POI 블록은 blocked_until 기준이다', () => {
    expect(statusFilterOf('poi-blocks', 'active', NOW_ISO)).toBe(`blocked_until.gt.${NOW_ISO}`)
    expect(statusFilterOf('poi-blocks', 'expired', NOW_ISO)).toBe(`blocked_until.lte.${NOW_ISO}`)
  })

  it('전체는 필터가 없다', () => {
    expect(statusFilterOf('poi-blocks', 'all', NOW_ISO)).toBeNull()
  })
})

describe('searchFilterOf', () => {
  it('POI 블록은 유저·POI id를 OR로 묶는다', () => {
    expect(searchFilterOf('poi-blocks', { userIds: ['u1', 'u2'], poiIds: [] })).toBe('user_id.in.(u1,u2)')
    expect(searchFilterOf('poi-blocks', { userIds: ['u1'], poiIds: ['p1'] })).toBe('user_id.in.(u1),poi_id.in.(p1)')
    expect(searchFilterOf('poi-blocks', { userIds: [], poiIds: ['p1'] })).toBe('poi_id.in.(p1)')
  })

  it('일치가 하나도 없으면 null', () => {
    expect(searchFilterOf('poi-blocks', { userIds: [], poiIds: [] })).toBeNull()
  })
})

describe('applyAbusingListFilters', () => {
  function recorder() {
    const ors: string[] = []
    const query: AbusingListQuery<unknown> = {
      or: (filters) => (ors.push(filters), query),
      order: () => query,
      range: async () => ({ data: [], count: 0, error: null }),
    }
    return { query, ors }
  }

  it('상태와 검색 조건을 각각 or 하나로 건다(둘은 AND)', () => {
    const { query, ors } = recorder()
    applyAbusingListFilters(query, 'poi-blocks', parseAbusingListParams({ status: 'expired' }, 'poi-blocks'), 'user_id.in.(u1)', NOW)
    expect(ors).toEqual([`blocked_until.lte.${NOW_ISO}`, 'user_id.in.(u1)'])
  })

  it('전체 + 검색어 없음이면 아무 조건도 걸지 않는다', () => {
    const { query, ors } = recorder()
    applyAbusingListFilters(query, 'poi-blocks', parseAbusingListParams({ status: 'all' }, 'poi-blocks'), null, NOW)
    expect(ors).toEqual([])
  })
})

describe('parseExtendDays·untilFromDays', () => {
  it('1~365 정수만 받는다', () => {
    expect(parseExtendDays({ days: 7 })).toBe(7)
    for (const bad of [0, 366, 1.5, '7', null, undefined]) {
      expect(parseExtendDays({ days: bad })).toBeNull()
    }
    expect(parseExtendDays(undefined)).toBeNull()
  })

  it('연장 시각은 지금부터 N일 뒤다', () => {
    expect(untilFromDays(3, NOW).toISOString()).toBe('2026-09-27T00:00:00.000Z')
  })
})

describe('해제 미리보기', () => {
  it('POI 블록: 적용 중인 수와 이미 만료된 수를 센다', () => {
    const rows = [
      { id: 'a', blocked_until: '2026-09-27T00:00:00.000Z' },
      { id: 'b', blocked_until: '2026-09-20T00:00:00.000Z' },
    ]
    expect(summarizePoiBlockRelease(['a', 'b'], rows, NOW).impact).toEqual({ activeCount: 1, expiredCount: 1 })
  })

  it('POI 블록: 이미 없는 id는 건너뛰고 있는 id만 해제 대상으로 남긴다', () => {
    const rows = [{ id: 'a', blocked_until: '2026-09-27T00:00:00.000Z' }]
    const summary = summarizePoiBlockRelease(['a', 'gone'], rows, NOW)
    expect(summary.existingIds).toEqual(['a'])
    expect(summary.skipped).toEqual([{ id: 'gone', reason: '이미 해제됐어요' }])
  })
})

describe('연장 미리보기', () => {
  const until = untilFromDays(7, NOW) // 2026-10-01

  it('POI 블록: 이미 더 긴 차단은 건너뛰고 만료된 차단은 다시 적용된다', () => {
    const rows = [
      { id: 'longer', blocked_until: '2026-11-01T00:00:00.000Z' },
      { id: 'expired', blocked_until: '2026-09-01T00:00:00.000Z' },
    ]
    const summary = summarizePoiBlockExtend(['longer', 'expired'], rows, until, NOW)
    expect(summary.extendableIds).toEqual(['expired'])
    expect(summary.impact).toEqual({ reapplyCount: 1, permanentCount: 0 })
  })
})
