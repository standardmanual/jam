import {
  applyAbusingListFilters,
  parseAbusingListParams,
  searchFilterOf,
  statusFilterOf,
  type AbusingListQuery,
} from '../abusing-list'
import {
  describeBanLevelChange,
  parseExtendDays,
  summarizeBanExtend,
  summarizeBanRelease,
  summarizePoiBlockExtend,
  summarizePoiBlockRelease,
  untilFromDays,
} from '../abusing-bulk'
import { DEFAULT_POLICY } from '@/lib/abusing/policy'

const NOW = new Date('2026-09-24T00:00:00.000Z')
const NOW_ISO = NOW.toISOString()

describe('parseAbusingListParams', () => {
  it('빈 파라미터의 상태는 active, 정렬은 최신순이다', () => {
    const parsed = parseAbusingListParams({}, 'bans')
    expect(parsed.status).toBe('active')
    expect(parsed.sort).toEqual({ column: 'created_at', ascending: false })
  })

  it("상태 'all'·'expired'는 그대로 유지되고 알 수 없는 값은 active로 떨어진다", () => {
    expect(parseAbusingListParams({ status: 'all' }, 'bans').status).toBe('all')
    expect(parseAbusingListParams({ status: 'expired' }, 'poi-blocks').status).toBe('expired')
    expect(parseAbusingListParams({ status: 'x' }, 'bans').status).toBe('active')
  })

  it('검색어는 sanitizeSearchTerm을 거친다', () => {
    expect(parseAbusingListParams({ q: '홍,(길동)' }, 'bans').q).toBe('홍  길동')
  })

  it('머리 칸 정렬은 탭에 있는 컬럼만 받는다', () => {
    expect(parseAbusingListParams({ sort: 'level_desc' }, 'bans').sort).toEqual({ column: 'ban_level', ascending: false })
    expect(parseAbusingListParams({ sort: 'expires_asc' }, 'poi-blocks').sort).toEqual({ column: 'blocked_until', ascending: true })
    // POI 블록에는 레벨 컬럼이 없다
    expect(parseAbusingListParams({ sort: 'level_desc' }, 'poi-blocks').sort.column).toBe('created_at')
  })
})

describe('statusFilterOf', () => {
  it('제재의 활성은 영구(null)를 포함하고 만료는 포함하지 않는다', () => {
    expect(statusFilterOf('bans', 'active', NOW_ISO)).toBe(`expires_at.is.null,expires_at.gt.${NOW_ISO}`)
    expect(statusFilterOf('bans', 'expired', NOW_ISO)).toBe(`expires_at.lte.${NOW_ISO}`)
  })

  it('POI 블록은 blocked_until 기준이다', () => {
    expect(statusFilterOf('poi-blocks', 'active', NOW_ISO)).toBe(`blocked_until.gt.${NOW_ISO}`)
    expect(statusFilterOf('poi-blocks', 'expired', NOW_ISO)).toBe(`blocked_until.lte.${NOW_ISO}`)
  })

  it('전체는 필터가 없다', () => {
    expect(statusFilterOf('bans', 'all', NOW_ISO)).toBeNull()
  })
})

describe('searchFilterOf', () => {
  it('제재는 유저 id만, POI 블록은 유저·POI id를 OR로 묶는다', () => {
    expect(searchFilterOf('bans', { userIds: ['u1', 'u2'], poiIds: ['p1'] })).toBe('user_id.in.(u1,u2)')
    expect(searchFilterOf('poi-blocks', { userIds: ['u1'], poiIds: ['p1'] })).toBe('user_id.in.(u1),poi_id.in.(p1)')
    expect(searchFilterOf('poi-blocks', { userIds: [], poiIds: ['p1'] })).toBe('poi_id.in.(p1)')
  })

  it('일치가 하나도 없으면 null', () => {
    expect(searchFilterOf('bans', { userIds: [], poiIds: ['p1'] })).toBeNull()
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
    applyAbusingListFilters(query, 'bans', parseAbusingListParams({ status: 'expired' }, 'bans'), 'user_id.in.(u1)', NOW)
    expect(ors).toEqual([`expires_at.lte.${NOW_ISO}`, 'user_id.in.(u1)'])
  })

  it('전체 + 검색어 없음이면 아무 조건도 걸지 않는다', () => {
    const { query, ors } = recorder()
    applyAbusingListFilters(query, 'bans', parseAbusingListParams({ status: 'all' }, 'bans'), null, NOW)
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
  it('제재: 활성 hard·soft 수와 이미 만료된 수를 센다', () => {
    const rows = [
      { id: 'a', ban_level: 'hard', expires_at: null },
      { id: 'b', ban_level: 'hard', expires_at: '2026-10-01T00:00:00.000Z' },
      { id: 'c', ban_level: 'soft', expires_at: '2026-10-01T00:00:00.000Z' },
      { id: 'd', ban_level: 'soft', expires_at: '2026-09-01T00:00:00.000Z' },
    ]
    const summary = summarizeBanRelease(['a', 'b', 'c', 'd', 'gone'], rows, NOW)
    expect(summary.impact).toEqual({ hardCount: 2, softCount: 1, expiredCount: 1 })
    expect(summary.existingIds).toEqual(['a', 'b', 'c', 'd'])
    expect(summary.skipped).toEqual([{ id: 'gone', reason: '이미 해제됐어요' }])
  })

  it('POI 블록: 적용 중인 수와 이미 만료된 수를 센다', () => {
    const rows = [
      { id: 'a', blocked_until: '2026-09-27T00:00:00.000Z' },
      { id: 'b', blocked_until: '2026-09-20T00:00:00.000Z' },
    ]
    expect(summarizePoiBlockRelease(['a', 'b'], rows, NOW).impact).toEqual({ activeCount: 1, expiredCount: 1 })
  })
})

describe('연장 미리보기', () => {
  const until = untilFromDays(7, NOW) // 2026-10-01

  it('제재: 영구와 이미 더 긴 제재는 건너뛰고, 만료된 제재는 다시 적용되는 수로 센다', () => {
    const rows = [
      { id: 'perm', ban_level: 'hard', expires_at: null },
      { id: 'longer', ban_level: 'soft', expires_at: '2026-11-01T00:00:00.000Z' },
      { id: 'active', ban_level: 'soft', expires_at: '2026-09-28T00:00:00.000Z' },
      { id: 'expired', ban_level: 'soft', expires_at: '2026-09-01T00:00:00.000Z' },
    ]
    const summary = summarizeBanExtend(['perm', 'longer', 'active', 'expired'], rows, until, NOW)
    expect(summary.extendableIds).toEqual(['active', 'expired'])
    expect(summary.impact).toEqual({ reapplyCount: 1, permanentCount: 1 })
    expect(summary.skipped.map((s) => s.id).sort()).toEqual(['longer', 'perm'])
  })

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

describe('describeBanLevelChange', () => {
  it('배율이 달라지는 등급만 나열한다', () => {
    const text = describeBanLevelChange('soft', 'hard', DEFAULT_POLICY)
    // 기본 정책: soft rare 정상(1) → hard rare 차단(0), epic·common은 같다
    expect(text).toContain('Rare 정상 → 차단')
    expect(text).not.toContain('Common')
    expect(text).not.toContain('Epic')
  })

  it('모든 등급 배율이 같으면 그렇다고 알린다', () => {
    const same = { ...DEFAULT_POLICY, hard_rare_rate: 1, hard_mystic_rate: 0 }
    expect(describeBanLevelChange('soft', 'hard', same)).toContain('배율이 같아요')
  })
})
