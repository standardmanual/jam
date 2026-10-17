/**
 * 운영 홈 구역 (티켓 20261006_1341 ②-c, 상위 20260930_1502 「채원 S1·S4 사전 판정」 「구역 상태」·승인 #12·#15·#16·#17·#18)
 *
 * 저장소에 jsdom·testing-library가 없어(`components/admin/ops/__tests__/home.test.tsx`와 같은 방식) 서버 컴포넌트를 `await`로 불러 얻은 요소를
 * `renderToStaticMarkup`으로 그려 모양을 고정한다. DB·읽기 함수는 모두 가짜로 바꾼다(실 DB에 닿지 않는다).
 *
 * 지키는 것:
 * - 이번 주 상태·신호·최근 이력·서비스 점검·주간 핵심 지표·배지 경제 흐름·통계 7구역 가운데 한 구역의 읽기를 던지게 하면 그 구역만 안내 카드 + [새로 고치기]이고 나머지는 그대로다
 * - 구역 안의 일부 출처만 실패하면(제재 수·한쪽 그래프·지난주 지표·통계 한 칸) 그 칸의 기존 오류 표시만 남고 구역은 안내 카드가 되지 않는다
 * - 이상 신호 3장·KPI 2장·경제 추이(`?trend=`)·통계 4칸의 링크가 옛 화면과 같고, 「카드 편성 공백」은 없고 미션 공백이 서비스 점검 넷째 칸이다
 * - 이번 주 상태는 이번 주와 다음 주 14일치를 읽고, 다음 주 줄은 S7 기준 요일(`nextWeekCheckFromWeekday`)을 따른다
 * - 시험 묶음 포함(`sample=1`)이 읽기와 링크에 이어진다
 * - 페이지·`_home` 소스에 `unstable_cache`·`revalidate`·주간 캘린더가 없고 `loading.tsx`가 없다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const hoisted = vi.hoisted(() => {
  /** 읽기를 던지게 할 구역·출처 키. 각 가짜 읽기가 자기 키를 보고 던진다. */
  const fail = new Set<string>()

  /** 어떤 메서드를 이어 불러도 자기 자신을 돌려주고, `await`하면 결과가 나오는 가짜 쿼리. */
  function query(result: unknown, reject = false) {
    const q: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: (value: unknown) => unknown, rejectFn: (reason: unknown) => unknown) =>
              (reject ? Promise.reject(result) : Promise.resolve(result)).then(resolve, rejectFn)
          }
          return () => q
        },
      }
    )
    return q
  }

  return {
    fail,
    query,
    counts: { badges: 12, poi: 34, item_books: 5, users: 1234, user_suspensions: 2, user_shadow_bans: 99, poi_blocks: 1, ops_bundles: 1 } as Record<string, number>,
    /** `from(table)`이 돌려줄 결과를 상황에 맞게 정한다. */
    /** 구역이 읽은 표 이름 — 옛 섀도우밴 표를 읽지 않는지 본다 */
    tablesRead: [] as string[],
    table(name: string) {
      hoisted.tablesRead.push(name)
      const boom = new Error(`${name} 조회 실패(시험)`)
      if (['badges', 'poi', 'item_books', 'users'].includes(name) && fail.has('stats')) return query(boom, true)
      if (name === 'badges' && fail.has('statsCell')) return query({ count: null, error: { message: '배지 수 조회 실패(시험)' } })
      if (name === 'user_suspensions' && (fail.has('service') || fail.has('shadow'))) return query(boom, true)
      if (name === 'poi_blocks' && fail.has('service')) return query(boom, true)
      if (name === 'ops_bundles' && fail.has('sampleCount')) return query({ count: null, error: { message: '시험 묶음 수 조회 실패(시험)' } })
      if (name in hoisted.counts) return query({ count: hoisted.counts[name], error: null })
      return query({ data: [], error: null })
    },
    calls: {
      compositions: [] as Array<Record<string, unknown>>,
      signals: [] as Array<Record<string, unknown>>,
      recent: [] as Array<Record<string, unknown>>,
      kpi: 0,
    },
    weekLoaded: { value: null as unknown },
    signalsValue: { value: [] as unknown[] },
    recordsValue: { value: [] as unknown[] },
    overrides: { value: {} as Record<string, unknown> },
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: (table: string) => hoisted.table(table) }),
}))

function failIf(key: string) {
  if (hoisted.fail.has(key)) throw new Error(`${key} 읽기 실패(시험)`)
}

vi.mock('@/lib/admin/opsSignals/load', () => ({
  loadDayCompositions: vi.fn(async (options: Record<string, unknown>) => {
    hoisted.calls.compositions.push(options)
    failIf('week')
    return hoisted.weekLoaded.value ?? { bundles: [], compositions: [], sourceErrors: {} }
  }),
  loadOpsSignals: vi.fn(async (options: Record<string, unknown>) => {
    hoisted.calls.signals.push(options)
    failIf('signal')
    return { signals: hoisted.signalsValue.value, scanDates: [], compositions: [], includeSample: false, sourceErrors: {} }
  }),
}))

vi.mock('@/lib/admin/opsSignals/overrides', () => ({
  loadSignalOverrides: vi.fn(async () => hoisted.overrides.value),
}))

vi.mock('@/lib/admin/opsDecisions/read', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/opsDecisions/read')>()),
  listRecentOpsDecisions: vi.fn(async (_service: unknown, options: Record<string, unknown>) => {
    hoisted.calls.recent.push(options)
    failIf('history')
    return hoisted.recordsValue.value
  }),
}))

vi.mock('@/lib/admin/contentGaps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/contentGaps')>()),
  fetchContentGaps: vi.fn(async () => {
    failIf('service')
    return {
      missions: { result: { noIntroMission: false, gapDates: [], endingWithoutSuccessor: [], hasGap: false }, error: null },
      cards: { result: null, error: null },
    }
  }),
}))

vi.mock('@/lib/admin/kpiWeekly', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/kpiWeekly')>()),
  computeKpiWeeklyMetrics: vi.fn(async () => {
    const index = hoisted.calls.kpi
    hoisted.calls.kpi += 1
    failIf('kpi')
    // 두 번째 호출이 지난주 구간이다(`startKpiWeekly`가 이번 주 → 지난주 순서로 부른다).
    if (index % 2 === 1) failIf('kpiLast')
    return {
      missionAchievers: { value: index % 2 === 0 ? 9 : 4, definition: '' },
      badgeIssuance: { issued: { value: index % 2 === 0 ? 120 : 100, definition: '' }, duplicate: { value: null, reason: '' } },
      stravaSyncFailures: { value: index % 2 === 0 ? 3 : 1, definition: '' },
    }
  }),
}))

vi.mock('@/lib/admin/economyTrend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/economyTrend')>()),
  fetchBadgeIssuanceDaily: vi.fn(async () => {
    failIf('trend')
    failIf('trendBadge')
    return []
  }),
  fetchAmbientDropDaily: vi.fn(async () => {
    failIf('trend')
    return []
  }),
}))

vi.mock('@/lib/admin/weeklyCardMetrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/weeklyCardMetrics')>()),
  fetchWeeklyCardMetrics: vi.fn(async () => new Map()),
  fetchFirstEventKstDate: vi.fn(async () => null),
}))

import {
  KpiSection,
  RecentDecisionsSection,
  SECTION_NOTICE_TITLES,
  SampleSwitchSection,
  ServiceCheckSection,
  SignalSection,
  StatsSection,
  TrendSection,
  WeekStatusSection,
  startKpiWeekly,
} from '../_home/sections'
import { ServiceCheckRow } from '../DashboardSignals'
import { trendHref } from '../EconomyTrend'
import { buildDayCompositions } from '@/lib/admin/opsSignals/composition'
import { makeSignalResult, type OpsSignalOutcome } from '@/lib/admin/opsSignals/catalog'
import { shiftDateStr } from '@/lib/admin/today-calendar'
import { makeBundle, makeItem, kst } from '@/lib/admin/opsSignals/__tests__/fixtures'

const SECTION_KEYS = ['week', 'signal', 'history', 'service', 'kpi', 'trend', 'stats'] as const
type SectionKey = (typeof SECTION_KEYS)[number]

/** 구역이 제대로 그려졌을 때 마크업에 있는 표식(안내 카드의 제목에는 없는 것). */
const OK_MARKER: Record<SectionKey, string> = {
  week: 'ops-week-status-heading',
  signal: 'ops-signal-panel-heading',
  history: 'ops-recent-decisions-heading',
  service: 'ops-service-check-heading',
  kpi: 'ops-weekly-kpi-heading',
  trend: 'aria-label="배지 경제 흐름"',
  stats: 'aria-label="통계"',
}

const NOTICE_TITLE: Record<SectionKey, string> = { ...SECTION_NOTICE_TITLES }

/** 글자 사이의 React 주석(`<!-- -->`)을 벗겨 문장으로 읽는다. */
const flat = (node: ReactElement) => renderToStaticMarkup(node).replace(/<!-- -->/g, '')

interface RenderOptions {
  includeSample?: boolean
  trend?: string
}

/** 운영 홈 7구역을 같은 조건으로 한 번씩 그린다(페이지가 구역마다 하는 일). */
async function renderAll(options: RenderOptions = {}): Promise<Record<SectionKey, string>> {
  const includeSample = options.includeSample ?? false
  const kpi = startKpiWeekly()
  const elements: Record<SectionKey, ReactElement> = {
    week: await WeekStatusSection({ includeSample }),
    signal: await SignalSection({ includeSample }),
    history: await RecentDecisionsSection({ includeSample }),
    service: await ServiceCheckSection({ kpi }),
    kpi: await KpiSection({ kpi }),
    trend: await TrendSection({ trendParam: options.trend, includeSample }),
    stats: await StatsSection(),
  }
  const out = {} as Record<SectionKey, string>
  for (const key of SECTION_KEYS) out[key] = flat(elements[key])
  return out
}

/** 2026-10-01(목) 12:00 KST — 이번 주는 9/28(월)~10/4(일)이다. */
const THURSDAY = new Date('2026-10-01T12:00:00+09:00')
/** 2026-10-02(금) 12:00 KST — 다음 주 줄을 보기 시작하는 요일(기본 금요일)이다. */
const FRIDAY = new Date('2026-10-02T12:00:00+09:00')

beforeEach(() => {
  hoisted.fail.clear()
  hoisted.calls.compositions.length = 0
  hoisted.calls.signals.length = 0
  hoisted.calls.recent.length = 0
  hoisted.calls.kpi = 0
  hoisted.tablesRead.length = 0
  hoisted.weekLoaded.value = null
  hoisted.signalsValue.value = []
  hoisted.recordsValue.value = []
  hoisted.overrides.value = {}
  hoisted.counts.ops_bundles = 1
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(THURSDAY)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── 구역별 격리 ──────────────────────────────────────────────────────────────────────────────────

describe('구역별 격리 (완료 조건)', () => {
  it('아무것도 던지지 않으면 7구역이 모두 그려지고 안내 카드는 없다', async () => {
    const out = await renderAll()
    for (const key of SECTION_KEYS) {
      expect(out[key], key).toContain(OK_MARKER[key])
      expect(out[key], key).not.toContain(NOTICE_TITLE[key])
      expect(out[key], key).not.toContain('새로 고치기')
    }
  })

  /** 구역마다 그 구역의 읽기를 던지게 하는 키(`service`는 구역이 직접 읽는 셋을 모두 던진다). */
  const FAIL_KEY: Record<SectionKey, string> = {
    week: 'week',
    signal: 'signal',
    history: 'history',
    service: 'service',
    kpi: 'kpi',
    trend: 'trend',
    stats: 'stats',
  }

  for (const key of SECTION_KEYS) {
    it(`${key}: 그 구역의 읽기를 던지게 하면 그 구역만 안내 카드 + [새로 고치기]이고 나머지는 그대로다`, async () => {
      hoisted.fail.add(FAIL_KEY[key])
      const out = await renderAll()
      expect(out[key]).toContain(NOTICE_TITLE[key])
      expect(out[key]).toContain('새로 고치기')
      expect(out[key]).not.toContain(OK_MARKER[key])
      for (const other of SECTION_KEYS.filter((k) => k !== key)) {
        expect(out[other], `${key} 실패 중 ${other}`).toContain(OK_MARKER[other])
        expect(out[other], `${key} 실패 중 ${other}`).not.toContain(NOTICE_TITLE[other])
      }
    })
  }

  it('안내 카드는 조회 실패 고정 문장이다(「서버에 문제가 있었을 수 있어요」)', async () => {
    hoisted.fail.add('history')
    const out = await renderAll()
    expect(out.history).toContain('서버에 문제가 있었을 수 있어요. 새로 고쳐 다시 불러와 주세요')
  })

  it('통계 안내 카드는 서비스 키 설정을 알린다(옛 「서비스 클라이언트 오류」 배너를 대신한다)', async () => {
    hoisted.fail.add('stats')
    const out = await renderAll()
    expect(out.stats).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(out.stats).toContain(SECTION_NOTICE_TITLES.stats)
  })
})

describe('구역 안의 일부 출처만 실패하면 구역은 안내 카드가 되지 않는다', () => {
  it('서비스 점검: 제재 수만 못 읽으면 그 칸만 오류 카드이고 나머지 세 칸은 그대로다', async () => {
    hoisted.fail.add('shadow')
    const out = await renderAll()
    expect(out.service).toContain('ops-service-check-heading')
    expect(out.service).not.toContain(SECTION_NOTICE_TITLES.service)
    expect(out.service).toContain('불러오지 못했어요 — user_suspensions')
    expect(out.service).toContain('차단 POI 수')
    expect(out.service).toContain('미션 공백')
  })

  it('서비스 점검: 주간 지표를 못 읽으면 Strava 칸만 오류 카드이고 주간 핵심 지표 구역은 안내 카드다', async () => {
    hoisted.fail.add('kpi')
    const out = await renderAll()
    expect(out.service).toContain('ops-service-check-heading')
    expect(out.service).toContain('Strava 동기화 실패 건수')
    expect(out.service).toContain('불러오지 못했어요 — kpi')
    expect(out.kpi).toContain(SECTION_NOTICE_TITLES.kpi)
  })

  it('주간 핵심 지표: 지난주만 못 읽으면 두 장은 그대로이고 「지난주 대비 비교 불가」다', async () => {
    hoisted.fail.add('kpiLast')
    const out = await renderAll()
    expect(out.kpi).toContain('ops-weekly-kpi-heading')
    expect(out.kpi).toContain('지난주 대비 비교 불가')
    expect(out.kpi).not.toContain(SECTION_NOTICE_TITLES.kpi)
  })

  it('배지 경제 흐름: 한쪽 그래프만 못 읽으면 그 그래프만 오류 카드다', async () => {
    hoisted.fail.add('trendBadge')
    const out = await renderAll()
    expect(out.trend).toContain('aria-label="배지 경제 흐름"')
    expect(out.trend).not.toContain(SECTION_NOTICE_TITLES.trend)
    expect(out.trend).toContain('불러오지 못했어요.')
    expect(out.trend).toContain('일별 앰비언트 드랍량')
    expect(out.trend).toContain('기간 내 없음')
  })

  it('통계: 한 칸만 못 읽으면 그 칸만 「—」이고 나머지 칸의 숫자는 그대로다', async () => {
    hoisted.fail.add('statsCell')
    const out = await renderAll()
    expect(out.stats).not.toContain(SECTION_NOTICE_TITLES.stats)
    expect(out.stats).toContain('—')
    expect(out.stats).toContain('>34<')
    expect(out.stats).toContain('>1,234<')
    expect(out.stats).toContain('text-red-700')
  })
})

// ── 이번 주 상태 ─────────────────────────────────────────────────────────────────────────────────

/** 하루짜리 드랍 일정 항목(날짜 카드가 아니라 날짜 구성 신호에 끼어들지 않는다). */
const dropItem = (over: Parameters<typeof makeItem>[0] = {}) => makeItem({ kind: 'drop_schedule', original: {}, ...over })

function loadedWeek(bundles: ReturnType<typeof makeBundle>[]) {
  const dates = Array.from({ length: 14 }, (_, i) => shiftDateStr('2026-09-28', i))
  return {
    bundles,
    compositions: buildDayCompositions({ cards: [], missions: [], bundles }, dates),
    sourceErrors: {},
  }
}

describe('WeekStatusSection', () => {
  it('이번 주와 다음 주 14일치를 한 번에 읽고(월요일부터 +13일) 시험 묶음 포함 값을 넘긴다', async () => {
    await WeekStatusSection({ includeSample: true })
    expect(hoisted.calls.compositions).toEqual([{ from: '2026-09-28', to: '2026-10-11', includeSample: true }])
    hoisted.calls.compositions.length = 0
    await WeekStatusSection({ includeSample: false })
    expect(hoisted.calls.compositions).toEqual([{ from: '2026-09-28', to: '2026-10-11', includeSample: false }])
  })

  it('읽은 묶음으로 다섯 칸을 센다', async () => {
    hoisted.weekLoaded.value = loadedWeek([
      makeBundle([dropItem({ status: 'arrived' }), dropItem({ status: 'reviewing' }), dropItem({ status: 'live' })], { week: '2026-W40' }),
    ])
    const out = flat(await WeekStatusSection({ includeSample: false }))
    expect(out).toContain('새로 도착 1 · 검토중 1')
    expect(out).toContain('받은 기획함에서 결정하기')
    expect(out).toContain('9/28(월)~10/4(일)')
  })

  it('재료 하나라도 못 읽었으면(sourceErrors) 숫자를 틀리게 보이지 않고 안내 카드다', async () => {
    hoisted.weekLoaded.value = { ...loadedWeek([]), sourceErrors: { cards: '카드 조회 실패(시험)' } }
    const out = flat(await WeekStatusSection({ includeSample: false }))
    expect(out).toContain(SECTION_NOTICE_TITLES.week)
    expect(out).not.toContain('이번 주에 올라온 기획이 없어요')
  })

  it('묶음을 못 읽었으면(null) 안내 카드다(「이번 주에 올라온 기획이 없어요」로 보이지 않는다)', async () => {
    hoisted.weekLoaded.value = { bundles: null, compositions: [], sourceErrors: { bundles: '묶음 조회 실패(시험)' } }
    const out = flat(await WeekStatusSection({ includeSample: false }))
    expect(out).toContain(SECTION_NOTICE_TITLES.week)
    expect(out).not.toContain('이번 주에 올라온 기획이 없어요')
  })

  it('이번 주에 올라온 기획이 없으면 빈 상태 + 받은 기획함 링크다', async () => {
    const out = flat(await WeekStatusSection({ includeSample: false }))
    expect(out).toContain('이번 주에 올라온 기획이 없어요')
    expect(out).toContain('href="/admin/ops-inbox"')
  })

  it('다음 주 줄: 목요일에는 없고(다음 주 기획도 안 왔을 때) 금요일부터 있다', async () => {
    hoisted.weekLoaded.value = loadedWeek([makeBundle([dropItem({ status: 'arrived' })], { week: '2026-W40' })])
    expect(flat(await WeekStatusSection({ includeSample: false }))).not.toContain('다음 주')
    vi.setSystemTime(FRIDAY)
    const friday = flat(await WeekStatusSection({ includeSample: false }))
    expect(friday).toContain('다음 주')
    expect(friday).toContain('10/5(월)~10/11(일)')
  })

  it('다음 주 줄의 기준 요일은 S7에서 바꾼 값(nextWeekCheckFromWeekday)을 따른다', async () => {
    hoisted.weekLoaded.value = loadedWeek([makeBundle([dropItem({ status: 'arrived' })], { week: '2026-W40' })])
    hoisted.overrides.value = { nextWeekCheckFromWeekday: 6 } // 토요일부터
    vi.setSystemTime(FRIDAY)
    expect(flat(await WeekStatusSection({ includeSample: false }))).not.toContain('다음 주')
    vi.setSystemTime(new Date('2026-10-03T12:00:00+09:00'))
    expect(flat(await WeekStatusSection({ includeSample: false }))).toContain('다음 주')
  })

  it('다음 주 기획이 이미 도착했으면 목요일에도 다음 주 줄이 있다', async () => {
    hoisted.weekLoaded.value = loadedWeek([makeBundle([dropItem({ status: 'arrived', startsAt: kst('2026-10-07', '09:00'), endsAt: kst('2026-10-07', '23:00') })], { week: '2026-W41' })])
    expect(flat(await WeekStatusSection({ includeSample: false }))).toContain('다음 주')
  })

  it('시험 묶음 포함이면 링크에 sample=1이 이어진다', async () => {
    hoisted.weekLoaded.value = loadedWeek([makeBundle([dropItem({ status: 'arrived' })], { week: '2026-W40' })])
    const out = flat(await WeekStatusSection({ includeSample: true }))
    expect(out).toContain('href="/admin/ops-inbox?tab=decide&amp;sample=1"')
  })
})

// ── 신호·최근 이력·시험 스위치 ───────────────────────────────────────────────────────────────────

describe('SignalSection·RecentDecisionsSection', () => {
  it('시험 묶음 포함 값을 읽기에 넘기고 줄 링크에 이어 붙인다', async () => {
    const signal: OpsSignalOutcome = {
      key: 'execution_failed',
      name: '실행 실패',
      level: 'stop',
      state: 'raised',
      uncheckedReason: null,
      results: [makeSignalResult('실행에 실패했어요', { bundleId: 'bundle-a', itemId: 'item-a' })],
    }
    hoisted.signalsValue.value = [signal]
    const on = flat(await SignalSection({ includeSample: true }))
    expect(hoisted.calls.signals).toEqual([{ includeSample: true }])
    expect(on).toContain('실행에 실패했어요')
    expect(on).toContain('href="/admin/ops-inbox/bundle-a?item=item-a&amp;sample=1"')
    const off = flat(await SignalSection({ includeSample: false }))
    expect(off).toContain('href="/admin/ops-inbox/bundle-a?item=item-a"')
  })

  it('최근 이력: 시험 묶음 포함 값을 넘기고, 0건이면 「아직 기록이 없어요」다', async () => {
    const out = flat(await RecentDecisionsSection({ includeSample: true }))
    expect(hoisted.calls.recent).toEqual([{ includeSample: true }])
    expect(out).toContain('아직 기록이 없어요')
    expect(out).toContain('href="/admin/ops-inbox?sample=1"')
  })

  it('최근 이력: 줄은 그 항목의 받은 기획함 상세로 가고 문장은 결정 기록과 같다', async () => {
    hoisted.recordsValue.value = [
      {
        id: 'd1',
        createdAt: kst('2026-10-01', '09:12'),
        action: 'approve',
        actorType: 'agent',
        agentName: '',
        bundleId: 'bundle-z',
        itemId: 'item-z',
        kind: 'home_feed_card',
        patternNo: 'P03',
        isSample: false,
      },
    ]
    const out = flat(await RecentDecisionsSection({ includeSample: false }))
    expect(out).toContain('href="/admin/ops-inbox/bundle-z?item=item-z"')
    // 에이전트 이름이 비면 「에이전트()가」가 아니라 「에이전트가」다(가정 7)
    expect(out).toContain('에이전트가 ')
    expect(out).not.toContain('에이전트()')
  })
})

describe('SampleSwitchSection', () => {
  it('시험 묶음이 0개면 스위치 옆에 「지금 시험 묶음이 없어요」를 보인다', async () => {
    hoisted.counts.ops_bundles = 0
    const out = flat(await SampleSwitchSection({ includeSample: false }))
    expect(out).toContain('시험 묶음 포함해서 보기')
    expect(out).toContain('꺼짐')
    expect(out).toContain('지금 시험 묶음이 없어요')
    hoisted.counts.ops_bundles = 1
    expect(flat(await SampleSwitchSection({ includeSample: true }))).toContain('켜짐')
    expect(flat(await SampleSwitchSection({ includeSample: true }))).not.toContain('지금 시험 묶음이 없어요')
  })

  it('시험 묶음 수를 못 읽으면 없다고 단정하지 않는다', async () => {
    hoisted.counts.ops_bundles = 0
    hoisted.fail.add('sampleCount')
    const out = flat(await SampleSwitchSection({ includeSample: false }))
    expect(out).toContain('시험 묶음 포함해서 보기')
    expect(out).not.toContain('지금 시험 묶음이 없어요')
  })
})

// ── 옛 화면과 같은 링크·승인 항목 ────────────────────────────────────────────────────────────────

describe('옛 화면과 같은 링크 (완료 조건)', () => {
  it('이상 신호 3장: Strava·제재·차단 POI 링크가 같고, 미션 공백이 넷째 칸이다(승인 #16)', async () => {
    const out = (await renderAll()).service
    expect(out).toContain('href="/admin/strava-backfill"')
    expect(out.match(/href="\/admin\/abusing"/g)).toHaveLength(2)
    expect(out).toContain('href="/admin/missions"')
    expect(out).toContain('Strava 동기화 실패 건수')
    expect(out).toContain('유효 제재 수')
    expect(out).toContain('차단 POI 수')
    expect(out).toContain('미션 공백')
    expect(out).toContain('lg:grid-cols-4')
  })

  it('서비스 점검의 제재 집계는 이용 정지(user_suspensions)를 읽고 옛 섀도우밴 표는 읽지 않는다(티켓 20261017_1426)', async () => {
    const out = (await renderAll()).service
    expect(hoisted.tablesRead).toContain('user_suspensions')
    expect(hoisted.tablesRead).not.toContain('user_shadow_bans')
    expect(out).not.toContain('>99<') // 옛 표의 시험 값(99)이 화면에 나오지 않는다
  })

  it('「카드 편성 공백」 카드는 없다(승인 #15)', async () => {
    const out = await renderAll()
    for (const key of SECTION_KEYS) expect(out[key]).not.toContain('카드 편성 공백')
  })

  it('KPI 2장: 미션 달성자 수·배지 발급량이고 지난주 대비가 있다', async () => {
    const out = (await renderAll()).kpi
    expect(out).toContain('미션 달성자 수')
    expect(out).toContain('배지 발급량')
    expect(out.match(/지난주 대비/g)).toHaveLength(2)
    expect(out).toContain('지난주 대비 +5')
    expect(out).toContain('지난주 대비 +20')
  })

  it('경제 추이: 기간 전환 링크가 ?trend= 그대로이고 sample을 유지하며 week는 더하지 않는다(가정 8, 주간 캘린더는 일정표로 옮겼다)', async () => {
    const plain = (await renderAll()).trend
    expect(plain).toContain('href="/admin?trend=7"')
    expect(plain).toContain('href="/admin?trend=30"')
    const kept = (await renderAll({ includeSample: true })).trend
    expect(kept).toContain('href="/admin?trend=7&amp;sample=1"')
    expect(kept).toContain('href="/admin?trend=30&amp;sample=1"')
    expect(trendHref(7)).toBe('/admin?trend=7')
    expect(trendHref(30, true)).toBe('/admin?trend=30&sample=1')
  })

  it('경제 추이: ?trend=7이면 7일 보기가 현재이고 그 밖의 값은 30일이다', async () => {
    const seven = (await renderAll({ trend: '7' })).trend
    expect(seven).toMatch(/aria-current="true"[^>]*>7일/)
    const other = (await renderAll({ trend: 'abc' })).trend
    expect(other).toMatch(/aria-current="true"[^>]*>30일/)
  })

  it('통계 4칸: 링크가 같다', async () => {
    const out = (await renderAll()).stats
    for (const href of ['/admin/badges', '/admin/poi', '/admin/itembooks', '/admin/users']) expect(out).toContain(`href="${href}"`)
    for (const label of ['배지', 'POI', '컬렉션', '유저']) expect(out).toContain(`>${label}<`)
  })
})

describe('빨간 카드 글자색 text-red-700 (승인 #17)', () => {
  it('서비스 점검의 이상 강조·오류 카드는 text-red-700이고 text-red-600은 없다', () => {
    const out = flat(
      ServiceCheckRow({
        stravaSyncFailures: { value: 3, previousValue: 1, error: null },
        suspensions: { value: null, error: '조회 실패(시험)' },
        blockedPoi: { value: 0, error: null },
        missionGaps: { result: { noIntroMission: true, gapDates: [], endingWithoutSuccessor: [], hasGap: true }, error: null },
      })
    )
    expect(out).toContain('text-red-700')
    expect(out).not.toContain('text-red-600')
    // 글자(문단·목록)는 red-500을 쓰지 않는다. 장식 아이콘만 red-500이다.
    expect(out.match(/<(p|li)\b[^>]*text-red-500/g)).toBeNull()
  })
})

// ── 소스 규칙 ────────────────────────────────────────────────────────────────────────────────────

describe('소스 규칙', () => {
  const adminDir = path.join(process.cwd(), 'src/app/admin')
  const homeDir = path.join(adminDir, '_home')
  const sources = [path.join(adminDir, 'page.tsx'), ...readdirSync(homeDir).map((name) => path.join(homeDir, name))]

  /** 주석 줄을 뺀 코드. 설명 글이 이 단어들을 적을 수 있어 코드 줄만 본다. */
  const codeOf = (file: string) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n')

  it('페이지·_home 소스에 unstable_cache·revalidate·React cache가 없다(운영 홈은 캐시하지 않는다)', () => {
    expect(sources.length).toBeGreaterThanOrEqual(2)
    for (const file of sources) expect(codeOf(file), path.basename(file)).not.toMatch(/unstable_cache|revalidate|\bcache\(/)
  })

  it('주간 캘린더 구역이 없다(일정표로 옮겼다 — 「일정표 보기」 링크는 이번 주 상태 컴포넌트가 그린다)', () => {
    expect(existsSync(path.join(homeDir, 'CalendarSection.tsx'))).toBe(false)
    expect(existsSync(path.join(adminDir, 'WeeklyCalendar.tsx'))).toBe(false)
    for (const file of sources) expect(codeOf(file), path.basename(file)).not.toMatch(/CalendarSection|WeeklyCalendar|weekParam/)
  })

  it('app/admin/loading.tsx를 만들지 않는다(구역별 스켈레톤)', () => {
    expect(existsSync(path.join(adminDir, 'loading.tsx'))).toBe(false)
  })
})
