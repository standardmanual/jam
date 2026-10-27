/**
 * 홈피드 미리보기 조회 (티켓 20261026_2025 1회차) — 가짜 서비스 클라이언트로 확인한다.
 *
 * 확인하는 것:
 * 1. 같은 날짜에서 트라이브를 바꾸면 트라이브 전용 미션 소개 카드가 나타나고 사라진다(랭킹 보드 카드도 같다).
 * 2. 날마다 기간·노출 태그 판정을 따로 한다(저장된 날씨는 날마다 다르고, 고른 날씨가 저장값보다 우선한다).
 * 3. 승인 전 카드는 실제 카드 뒤에 `pending`으로 붙고, 도착·검토중만 읽으며, 태그가 안 맞으면 빠진다.
 * 4. 날마다 카드 수 = `entries.length`, 모양별 개수의 합과 같다.
 * 5. 읽기가 실패하면 던진다(빈 목록으로 보이지 않는다).
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/homePreview/__tests__/load.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>

const fx = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, { message: string } | null>,
  /** 날짜별 저장된 날씨·특일 */
  inputs: {} as Record<string, { weather: string | null; specialDays: unknown[] | null }>,
}))

function fakeSupabase() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    const filters: ((row: Row) => boolean)[] = []
    for (const op of ['select', 'order', 'is', 'or']) builder[op] = () => builder
    builder.eq = (column: string, value: unknown) => {
      filters.push((row) => row[column] === value)
      return builder
    }
    builder.in = (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]))
      return builder
    }
    builder.lte = (column: string, value: string) => {
      filters.push((row) => Date.parse(row[column] as string) <= Date.parse(value))
      return builder
    }
    builder.gte = (column: string, value: string) => {
      filters.push((row) => Date.parse(row[column] as string) >= Date.parse(value))
      return builder
    }
    builder.then = (resolve: (v: unknown) => void) =>
      Promise.resolve(
        fx.errors[table]
          ? { data: null, error: fx.errors[table] }
          : { data: (fx.tables[table] ?? []).filter((row) => filters.every((f) => f(row))), error: null },
      ).then(resolve)
    return builder
  }
  return { from }
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeSupabase() }))
vi.mock('@/lib/today/exposure', () => ({ computeUserExposureTags: async () => ['all'] }))
vi.mock('@/lib/missions/visibility-server', () => ({
  loadMissionVisibilityContext: async () => ({}),
  loadMissionTribeAccess: async () => ({ userTribeId: null, allowedTribeIdsByMission: new Map() }),
}))
vi.mock('@/lib/ranking/rankingDataSource', () => ({ computeRankingModeResult: async () => ({ entries: [] }) }))
vi.mock('@/lib/admin/homePreview/dayInputs', () => ({
  readDayInputs: async (date: string) => {
    const v = fx.inputs[date] ?? { weather: null, specialDays: null }
    return { weather: v.weather, specialDays: v.specialDays, stored: v.weather !== null || v.specialDays !== null }
  },
}))

import { loadHomePreview, type HomePreviewViewer } from '../load'

const TRIBE_A = '11111111-1111-4111-8111-111111111111'
const TRIBE_B = '22222222-2222-4222-8222-222222222222'
const BUNDLE = '33333333-3333-4333-8333-333333333333'
/** 2026-10-05 12:00 KST */
const NOW = new Date('2026-10-05T03:00:00Z')

const VIEWER: HomePreviewViewer = { tribeId: null, timeOfDay: 'time_morning', newUser: false }

function cardRow(id: string, overrides: Row = {}): Row {
  return {
    id,
    template_type: 'editorial_article',
    layout_type: 'large_thumbnail',
    title: `카드 ${id}`,
    subtitle: null,
    cover_image_url: null,
    badge_ids: [],
    mission_id: null,
    item_book_id: null,
    region_label: null,
    body_markdown: null,
    target_href: null,
    exposure_tags: ['all'],
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-12-31T00:00:00Z',
    sort_order: 0,
    is_active: true,
    created_at: '2026-08-31T00:00:00Z',
    created_by: null,
    ranking_mode_id: null,
    content_type_id: null,
    image_source: null,
    description: null,
    shape: 'hero',
    ...overrides,
  }
}

function pendingRow(id: string, overrides: Row = {}): Row {
  return {
    id,
    bundle_id: BUNDLE,
    status: 'arrived',
    kind: 'home_feed_card',
    position: 0,
    original: {
      copy: { title: `승인 전 ${id}` },
      resource: { template_type: 'editorial_article', layout_type: 'large_thumbnail', sort_order: 0 },
      shape: 'brief',
      exposure_tags: ['all'],
      starts_at: '2026-10-05T00:00:00+09:00',
      ends_at: '2026-10-11T23:59:59+09:00',
      rationale: [{ kind: 'trend', label: '이유' }],
    },
    edited: null,
    starts_at: null,
    ends_at: null,
    ...overrides,
  }
}

function ids(day: { entries: { id: string }[] }): string[] {
  return day.entries.map((e) => e.id)
}

beforeEach(() => {
  fx.tables = {}
  fx.errors = {}
  fx.inputs = {}
})

describe('loadHomePreview — 트라이브 조건', () => {
  beforeEach(() => {
    fx.tables.today_cards = [
      cardRow('common'),
      cardRow('spot-a', { template_type: 'mission_spotlight', mission_id: 'm-a', sort_order: 1 }),
      cardRow('spot-open', { template_type: 'mission_spotlight', mission_id: 'm-open', sort_order: 2 }),
      cardRow('rank-a', { template_type: 'ranking_board', layout_type: 'ranking_list', ranking_mode_id: 'mode-a', sort_order: 3 }),
    ]
    fx.tables.mission_allowed_tribes = [{ mission_id: 'm-a', tribe_id: TRIBE_A }]
    fx.tables.ranking_modes = [{ id: 'mode-a', target_type: 'mission_participants', target_mission_id: 'm-a' }]
    fx.tables.missions = [
      { id: 'm-a', starts_at: '2026-09-01T00:00:00Z', ends_at: null, reward_points: null, reward_badge_ids: [], image_url: null },
      { id: 'm-open', starts_at: '2026-09-01T00:00:00Z', ends_at: null, reward_points: null, reward_badge_ids: [], image_url: null },
    ]
  })

  it('같은 날짜에서 트라이브를 바꾸면 트라이브 전용 카드가 나타나고 사라진다', async () => {
    const forA = await loadHomePreview({ fromDate: '2026-10-05', days: 1, viewer: { ...VIEWER, tribeId: TRIBE_A }, now: NOW })
    expect(ids(forA.days[0])).toEqual(['common', 'spot-a', 'spot-open', 'rank-a'])

    const forB = await loadHomePreview({ fromDate: '2026-10-05', days: 1, viewer: { ...VIEWER, tribeId: TRIBE_B }, now: NOW })
    expect(ids(forB.days[0])).toEqual(['common', 'spot-open'])

    const none = await loadHomePreview({ fromDate: '2026-10-05', days: 1, viewer: VIEWER, now: NOW })
    expect(ids(none.days[0])).toEqual(['common', 'spot-open'])
  })
})

describe('loadHomePreview — 날마다 판정', () => {
  it('기간은 날마다 따로 판정한다 — 둘째 날부터 시작하는 카드는 둘째 날부터 보인다', async () => {
    fx.tables.today_cards = [cardRow('always'), cardRow('from-day2', { starts_at: '2026-10-06T00:00:00+09:00', ends_at: '2026-10-07T23:59:59+09:00' })]
    const { days } = await loadHomePreview({ fromDate: '2026-10-05', days: 4, viewer: VIEWER, now: NOW })
    expect(days.map((d) => d.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'])
    expect(days.map(ids)).toEqual([['always'], ['from-day2', 'always'], ['from-day2', 'always'], ['always']])
  })

  it('저장된 날씨는 날마다 다르게 쓰이고, 고른 날씨가 있으면 그 값이 모든 날을 이긴다', async () => {
    fx.tables.today_cards = [cardRow('rain-only', { exposure_tags: ['weather_rain'] }), cardRow('clear-only', { exposure_tags: ['weather_clear'] })]
    fx.inputs = { '2026-10-05': { weather: 'rain', specialDays: null }, '2026-10-06': { weather: 'clear', specialDays: null } }

    const stored = await loadHomePreview({ fromDate: '2026-10-05', days: 3, viewer: VIEWER, now: NOW })
    expect(stored.days.map(ids)).toEqual([['rain-only'], ['clear-only'], []])
    expect(stored.days[0].inputs).toMatchObject({ weather: 'rain', stored: true, used: { weather: 'rain', specialDays: [] } })
    expect(stored.days[2].inputs).toMatchObject({ weather: null, stored: false, used: { weather: null } })

    const picked = await loadHomePreview({ fromDate: '2026-10-05', days: 3, viewer: { ...VIEWER, weather: 'clear' }, now: NOW })
    expect(picked.days.map(ids)).toEqual([['clear-only'], ['clear-only'], ['clear-only']])
    expect(picked.days[0].inputs).toMatchObject({ weather: 'rain', used: { weather: 'clear' } })
  })

  it('특일 태그는 저장된 특일에서 만들고, 고른 특일이 있으면 그 값을 쓴다', async () => {
    fx.tables.today_cards = [cardRow('holiday', { exposure_tags: ['holiday_today'] })]
    fx.inputs = { '2026-10-09': { weather: null, specialDays: [{ name: '한글날', type: 'holiday' }] } }

    const stored = await loadHomePreview({ fromDate: '2026-10-08', days: 3, viewer: VIEWER, now: NOW })
    expect(stored.days.map(ids)).toEqual([[], ['holiday'], []])
    expect(stored.days[1].inputs.used.specialDays).toEqual(['holiday_today'])

    const picked = await loadHomePreview({ fromDate: '2026-10-08', days: 1, viewer: { ...VIEWER, specialDays: ['holiday_today'] }, now: NOW })
    expect(ids(picked.days[0])).toEqual(['holiday'])
  })

  it('시간대와 신규 유저 태그가 노출을 가른다', async () => {
    fx.tables.today_cards = [cardRow('night', { exposure_tags: ['time_night'] }), cardRow('new', { exposure_tags: ['new_user'] })]
    const day = (await loadHomePreview({ fromDate: '2026-10-05', days: 1, viewer: { ...VIEWER, timeOfDay: 'time_night', newUser: true }, now: NOW })).days[0]
    expect(ids(day).sort()).toEqual(['new', 'night'])
    const other = (await loadHomePreview({ fromDate: '2026-10-05', days: 1, viewer: VIEWER, now: NOW })).days[0]
    expect(ids(other)).toEqual([])
  })

  it('꺼진 카드와 정렬: sort_order 오름차순', async () => {
    fx.tables.today_cards = [cardRow('b', { sort_order: 2 }), cardRow('off', { is_active: false }), cardRow('a', { sort_order: 1 })]
    const day = (await loadHomePreview({ fromDate: '2026-10-05', days: 1, viewer: VIEWER, now: NOW })).days[0]
    expect(ids(day)).toEqual(['a', 'b'])
  })
})

describe('loadHomePreview — 승인 전 카드', () => {
  it('승인 전 카드는 실제 카드 뒤에 pending으로 붙고 기획 이유를 싣는다', async () => {
    fx.tables.today_cards = [cardRow('live', { sort_order: 99 })]
    fx.tables.ops_bundle_items = [pendingRow('p-late', { position: 1, original: { ...(pendingRow('x').original as Row), resource: { template_type: 'editorial_article', sort_order: 5 } } }), pendingRow('p-first', { position: 2 })]
    const day = (await loadHomePreview({ fromDate: '2026-10-05', days: 1, viewer: VIEWER, bundleId: BUNDLE, now: NOW })).days[0]

    expect(day.entries.map((e) => [e.id, e.source])).toEqual([
      ['live', 'live'],
      ['p-first', 'pending'],
      ['p-late', 'pending'],
    ])
    expect(day.pendingCount).toBe(2)
    expect(day.entries[0].rationale).toEqual([])
    expect(day.entries[1].rationale).toEqual([{ kind: 'trend', label: '이유' }])
    expect(day.entries[1].card.title).toBe('승인 전 p-first')
  })

  it('도착·검토중이 아닌 항목, 다른 종류, 태그가 안 맞는 항목, 그날에 안 걸치는 항목은 뺀다', async () => {
    fx.tables.ops_bundle_items = [
      pendingRow('ok'),
      pendingRow('approved', { status: 'approved' }),
      pendingRow('reviewing', { status: 'reviewing' }),
      pendingRow('mission', { kind: 'mission' }),
      pendingRow('other-bundle', { bundle_id: '44444444-4444-4444-8444-444444444444' }),
      pendingRow('rain', { original: { ...(pendingRow('x').original as Row), exposure_tags: ['weather_rain'] } }),
      pendingRow('later', { original: { ...(pendingRow('x').original as Row), starts_at: '2026-10-09T00:00:00+09:00' } }),
    ]
    const { days } = await loadHomePreview({ fromDate: '2026-10-05', days: 5, viewer: VIEWER, bundleId: BUNDLE, now: NOW })
    const early = ['ok', 'reviewing']
    expect(days.map(ids)).toEqual([early, early, early, early, ['ok', 'reviewing', 'later']])
  })

  it('시각이 항목에 없으면 행 칸을 쓰고, 종료가 없으면 시작한 날 하루다', async () => {
    const base = pendingRow('row-time').original as Row
    const { starts_at: _s, ends_at: _e, ...withoutTimes } = base
    void _s
    void _e
    fx.tables.ops_bundle_items = [pendingRow('row-time', { original: withoutTimes, starts_at: '2026-10-06T10:00:00+09:00', ends_at: null })]
    const { days } = await loadHomePreview({ fromDate: '2026-10-05', days: 3, viewer: VIEWER, bundleId: BUNDLE, now: NOW })
    expect(days.map(ids)).toEqual([[], ['row-time'], []])
  })

  it('시작 시각을 읽을 수 없는 항목은 어느 날에도 놓지 않는다', async () => {
    const base = pendingRow('no-time').original as Row
    const { starts_at: _s, ends_at: _e, ...withoutTimes } = base
    void _s
    void _e
    fx.tables.ops_bundle_items = [pendingRow('no-time', { original: withoutTimes })]
    const { days } = await loadHomePreview({ fromDate: '2026-10-05', days: 2, viewer: VIEWER, bundleId: BUNDLE, now: NOW })
    expect(days.map(ids)).toEqual([[], []])
  })

  it('묶음을 주지 않으면 승인 전 카드를 읽지 않는다', async () => {
    fx.tables.ops_bundle_items = [pendingRow('p')]
    const day = (await loadHomePreview({ fromDate: '2026-10-05', days: 1, viewer: VIEWER, now: NOW })).days[0]
    expect(day.entries).toEqual([])
    expect(day.pendingCount).toBe(0)
  })
})

describe('loadHomePreview — 카드 수와 모양', () => {
  it('날마다 entries.length가 카드 수이고 모양별 개수의 합과 같다', async () => {
    fx.tables.today_cards = [
      cardRow('h1', { shape: 'hero' }),
      cardRow('h2', { shape: 'hero' }),
      cardRow('s1', { shape: 'square', starts_at: '2026-10-06T00:00:00+09:00' }),
    ]
    fx.tables.ops_bundle_items = [pendingRow('p')]
    const { days } = await loadHomePreview({ fromDate: '2026-10-05', days: 2, viewer: VIEWER, bundleId: BUNDLE, now: NOW })

    for (const day of days) {
      const total = Object.values(day.shapeCounts).reduce((sum, n) => sum + n, 0)
      expect(total).toBe(day.entries.length)
    }
    expect(days[0].shapeCounts).toEqual({ hero: 2, brief: 1 })
    expect(days[1].shapeCounts).toEqual({ hero: 2, square: 1, brief: 1 })
    expect(days[1].entries).toHaveLength(4)
  })
})

describe('loadHomePreview — 읽기 실패', () => {
  it.each(['today_cards', 'ranking_modes', 'mission_allowed_tribes', 'ops_bundle_items'])('%s 읽기가 실패하면 던진다', async (table) => {
    fx.tables.today_cards = [
      cardRow('spot', { template_type: 'mission_spotlight', mission_id: 'm-a' }),
      cardRow('rank', { template_type: 'ranking_board', ranking_mode_id: 'mode-a' }),
    ]
    fx.tables.ranking_modes = [{ id: 'mode-a', target_type: 'mission_participants', target_mission_id: 'm-a' }]
    fx.errors[table] = { message: '연결 오류' }
    await expect(loadHomePreview({ fromDate: '2026-10-05', days: 1, viewer: VIEWER, bundleId: BUNDLE, now: NOW })).rejects.toThrow(/조회 실패/)
  })
})
