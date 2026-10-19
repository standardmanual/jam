/**
 * getTodayCards가 랭킹 보드 카드에 보는 사람의 규칙을 적용하는지 (티켓 20261019_1400, 20261019_1445 3-B)
 *
 * 확인하는 것:
 * 1. 트라이브 제한 미션을 가리키는 랭킹 보드 카드는 대상 트라이브가 아닌 유저에게 내려가지 않는다. 대상 트라이브 유저·허용 트라이브가 없는
 *    공통 미션·수동 지정 유저 카드는 그대로다. 접근을 읽지 못하면 미션 랭킹 보드 카드를 내린다(fail-closed).
 * 2. 보는 사람 id가 순위 계산(`computeRankingModeResult`)까지 내려간다 — 이용 정지 중인 본인을 본인 화면에 남기는 데 쓴다.
 * 3. `ranking_modes`는 홈 한 번 로드에서 한 번만 읽는다 — 트라이브 거름과 순위 계산이 같은 행을 나눠 쓴다 (티켓 20261019_1445 4회).
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/cards-ranking-board.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>

const fx = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, { message: string } | null>,
  /** `loadMissionTribeAccess` 호출 기록: [유저 id, 미션 id 목록] */
  tribeCalls: [] as [string, string[]][],
  /** 유저의 트라이브와 미션별 허용 트라이브 */
  userTribeId: null as string | null,
  allowedByMission: {} as Record<string, string[]>,
  tribeError: null as Error | null,
  /** `computeRankingModeResult` 호출 기록: [랭킹 모드 id, 옵션] */
  rankingCalls: [] as [string, { viewerUserId?: string } | undefined][],
  /** 읽은 표 이름(조회 순서대로, 중복 포함) */
  reads: [] as string[],
}))

function fakeSupabase() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    const filters: ((row: Row) => boolean)[] = []
    for (const op of ['select', 'lte', 'gte', 'overlaps', 'order', 'is', 'eq', 'or']) builder[op] = () => builder
    builder.in = (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]))
      return builder
    }
    builder.then = (resolve: (v: unknown) => void) => {
      fx.reads.push(table)
      return Promise.resolve({
        data: (fx.tables[table] ?? []).filter((row) => filters.every((f) => f(row))),
        error: fx.errors[table] ?? null,
      }).then(resolve)
    }
    return builder
  }
  return { from }
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeSupabase() }))
vi.mock('../exposure', () => ({ computeUserExposureTags: async () => ['all'] }))
vi.mock('@/lib/missions/visibility-server', () => ({
  loadMissionVisibilityContext: async () => ({
    completedMissionIds: new Set<string>(),
    gatedBadges: new Map(),
    ownedTierByBadgeName: new Map(),
    ownedTierByFamilyKey: new Map(),
  }),
  loadMissionTribeAccess: async (userId: string, missionIds: string[]) => {
    fx.tribeCalls.push([userId, [...missionIds]])
    if (fx.tribeError) throw fx.tribeError
    return {
      userTribeId: fx.userTribeId,
      allowedTribeIdsByMission: new Map(Object.entries(fx.allowedByMission)),
    }
  },
}))
vi.mock('@/lib/ranking/rankingDataSource', () => ({
  computeRankingModeResult: async (mode: { id: string }, _client: unknown, options?: { viewerUserId?: string }) => {
    fx.rankingCalls.push([mode.id, options])
    return { entries: [], totalParticipants: 0 }
  },
}))

import { fetchRankingBoardData, getTodayCards } from '../cards'

function cardRow(overrides: Row): Row {
  return {
    id: 'c',
    template_type: 'ranking_board',
    layout_type: 'ranking_list',
    title: '제목',
    subtitle: null,
    cover_image_url: null,
    badge_ids: [],
    mission_id: null,
    item_book_id: null,
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: ['all'],
    starts_at: '2026-10-01T00:00:00Z',
    ends_at: '2026-12-31T00:00:00Z',
    sort_order: 0,
    is_active: true,
    created_at: '2026-09-30T00:00:00Z',
    created_by: null,
    ranking_mode_id: null,
    content_type_id: null,
    image_source: null,
    description: null,
    ...overrides,
  }
}

function modeRow(id: string, overrides: Row = {}): Row {
  return { id, target_type: 'mission_participants', target_mission_id: null, target_user_ids: [], ...overrides }
}

const NOW = new Date('2026-10-20T03:00:00Z')

beforeEach(() => {
  fx.tables = {}
  fx.errors = {}
  fx.tribeCalls = []
  fx.userTribeId = null
  fx.allowedByMission = {}
  fx.tribeError = null
  fx.rankingCalls = []
  fx.reads = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

/** 제한 미션(m-tribe, 허용 트라이브 t-allowed)·공통 미션(m-common)·수동 지정 유저 카드가 한꺼번에 걸린 홈 */
function seedBoards() {
  fx.tables.today_cards = [
    cardRow({ id: 'card-tribe', sort_order: 1, ranking_mode_id: 'mode-tribe' }),
    cardRow({ id: 'card-common', sort_order: 2, ranking_mode_id: 'mode-common' }),
    cardRow({ id: 'card-manual', sort_order: 3, ranking_mode_id: 'mode-manual' }),
  ]
  fx.tables.ranking_modes = [
    modeRow('mode-tribe', { target_mission_id: 'm-tribe' }),
    modeRow('mode-common', { target_mission_id: 'm-common' }),
    modeRow('mode-manual', { target_type: 'manual_users', target_user_ids: ['u9'] }),
  ]
  fx.allowedByMission = { 'm-tribe': ['t-allowed'] }
}

describe('getTodayCards — 트라이브 제한 미션의 랭킹 보드 카드 (티켓 20261019_1400)', () => {
  it('대상이 아닌 트라이브 유저에게는 그 카드를 내리지 않는다', async () => {
    seedBoards()
    fx.userTribeId = 't-other'

    const cards = await getTodayCards('viewer', null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['card-common', 'card-manual'])
  })

  it('내린 카드의 순위는 계산하지도 않는다', async () => {
    seedBoards()
    fx.userTribeId = 't-other'

    await getTodayCards('viewer', null, NOW)

    expect(fx.rankingCalls.map(([modeId]) => modeId).sort()).toEqual(['mode-common', 'mode-manual'])
  })

  it('트라이브가 아직 없는 유저(온보딩 전)도 제한 미션 카드는 받지 못한다', async () => {
    seedBoards()
    fx.userTribeId = null

    const cards = await getTodayCards('viewer', null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['card-common', 'card-manual'])
  })

  it('대상 트라이브 유저에게는 그 카드가 그대로 내려간다', async () => {
    seedBoards()
    fx.userTribeId = 't-allowed'

    const cards = await getTodayCards('viewer', null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['card-tribe', 'card-common', 'card-manual'])
  })

  it('접근 판정은 보는 사람 id로, 미션 참가자 순위를 가리키는 미션만 묻는다', async () => {
    seedBoards()
    fx.userTribeId = 't-allowed'

    await getTodayCards('viewer', null, NOW)

    expect(fx.tribeCalls).toHaveLength(1)
    expect(fx.tribeCalls[0][0]).toBe('viewer')
    expect([...fx.tribeCalls[0][1]].sort()).toEqual(['m-common', 'm-tribe'])
  })

  it('랭킹 보드 카드가 없으면 트라이브 접근을 읽지 않는다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'other', template_type: 'badge_spotlight', layout_type: 'other' })]

    const cards = await getTodayCards('viewer', null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['other'])
    expect(fx.tribeCalls).toEqual([])
  })

  it('수동 지정 유저 카드만 있으면 트라이브 접근을 읽지 않는다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'card-manual', ranking_mode_id: 'mode-manual' })]
    fx.tables.ranking_modes = [modeRow('mode-manual', { target_type: 'manual_users', target_user_ids: ['u9'] })]

    const cards = await getTodayCards('viewer', null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['card-manual'])
    expect(fx.tribeCalls).toEqual([])
  })

  it('트라이브 접근을 읽지 못하면 미션 랭킹 보드 카드를 내린다(수동 지정 유저 카드는 그대로)', async () => {
    seedBoards()
    fx.tribeError = new Error('mission_allowed_tribes 조회 실패: boom')

    const cards = await getTodayCards('viewer', null, NOW)

    expect(cards.map((c) => c.id)).toEqual(['card-manual'])
  })
})

describe('getTodayCards — 보는 사람 id를 순위 계산까지 내려보낸다 (티켓 20261019_1400)', () => {
  it('computeRankingModeResult가 viewerUserId를 받는다', async () => {
    seedBoards()
    fx.userTribeId = 't-allowed'

    await getTodayCards('viewer', null, NOW)

    expect(fx.rankingCalls).toHaveLength(3)
    for (const [, options] of fx.rankingCalls) expect(options).toEqual({ viewerUserId: 'viewer' })
  })
})

describe('getTodayCards — 랭킹모드는 한 번만 읽는다 (티켓 20261019_1445 4회)', () => {
  const rankingModeReads = () => fx.reads.filter((table) => table === 'ranking_modes').length

  it('트라이브 거름과 순위 계산이 함께 쓰는데도 ranking_modes를 한 번만 읽는다', async () => {
    seedBoards()
    fx.userTribeId = 't-allowed'

    await getTodayCards('viewer', null, NOW)

    expect(rankingModeReads()).toBe(1)
  })

  it('거름 뒤 남은 카드의 순위만 계산한다 — 읽는 횟수를 줄여도 결과는 같다', async () => {
    seedBoards()
    fx.userTribeId = 't-other'

    const cards = await getTodayCards('viewer', null, NOW)

    expect(rankingModeReads()).toBe(1)
    expect(cards.map((c) => c.id)).toEqual(['card-common', 'card-manual'])
    expect(fx.rankingCalls.map(([modeId]) => modeId).sort()).toEqual(['mode-common', 'mode-manual'])
    expect(cards.find((c) => c.id === 'card-common')?.resolved_href).toContain('m-common')
  })

  it('랭킹 보드 카드가 없으면 ranking_modes를 읽지 않는다', async () => {
    fx.tables.today_cards = [cardRow({ id: 'other', template_type: 'badge_spotlight', layout_type: 'other' })]

    await getTodayCards('viewer', null, NOW)

    expect(rankingModeReads()).toBe(0)
  })

  it('랭킹모드를 읽지 못하면 한 번만 시도하고, 카드는 그대로 두며 순위는 계산하지 않는다', async () => {
    seedBoards()
    fx.errors.ranking_modes = { message: 'connection reset' }
    fx.userTribeId = 't-other'

    const cards = await getTodayCards('viewer', null, NOW)

    expect(rankingModeReads()).toBe(1)
    expect(cards.map((c) => c.id)).toEqual(['card-tribe', 'card-common', 'card-manual'])
    expect(fx.rankingCalls).toEqual([])
    expect(fx.tribeCalls).toEqual([])
    expect(cards.every((c) => c.resolved_ranking === null)).toBe(true)
  })

  it('어드민 미리보기처럼 읽은 모드를 넘기지 않으면 fetchRankingBoardData가 직접 읽는다', async () => {
    seedBoards()
    const cards = (fx.tables.today_cards as never[]).map((row) => row as never)

    const byModeId = await fetchRankingBoardData(fakeSupabase(), cards)

    expect(rankingModeReads()).toBe(1)
    expect([...byModeId.keys()].sort()).toEqual(['mode-common', 'mode-manual', 'mode-tribe'])
  })

  it('읽은 모드를 넘기면 fetchRankingBoardData는 ranking_modes를 읽지 않고, 맵에 없는 모드는 순위 없이 둔다', async () => {
    seedBoards()
    const cards = (fx.tables.today_cards as never[]).map((row) => row as never)
    const preloaded = new Map([['mode-common', fx.tables.ranking_modes[1] as never]])

    const byModeId = await fetchRankingBoardData(fakeSupabase(), cards, 'viewer', preloaded)

    expect(rankingModeReads()).toBe(0)
    expect([...byModeId.keys()]).toEqual(['mode-common'])
    expect(fx.rankingCalls).toEqual([['mode-common', { viewerUserId: 'viewer' }]])
  })
})
