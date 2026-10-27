/**
 * 생태계 상황판 페이지 조립 (티켓 20261026_2027 3-1)
 *
 * 구역은 `_sections`의 가짜(표식만 그리는 컴포넌트)로 바꿔 **페이지가 하는 일**만 본다: 머리, 구역 순서, 구역마다 `Suspense`,
 * `?node=` 해석(허용 밖 값은 선택 없음), 스냅샷을 한 번만 읽어 세 구역에 같이 넘기기, 운영 홈에서 옮겨 온 세 구역(주간 핵심 지표·배지 경제 흐름·통계)의 위치와 `?trend=` 전달(티켓 20261026_2027 3-2). 구역 안의 읽기·격리는 `sections.test.tsx`가 본다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const hoisted = vi.hoisted(() => ({
  props: {} as Record<string, Record<string, unknown>>,
  startSnapshot: vi.fn(),
  startKpiWeekly: vi.fn(),
  suspended: new Set<string>(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/admin/kpiWeeklyPair', () => ({ startKpiWeekly: hoisted.startKpiWeekly }))

vi.mock('../_sections', () => ({
  startSnapshot: hoisted.startSnapshot,
  SummarySection: (props: Record<string, unknown>) => stub('summary', props),
  GoalSection: (props: Record<string, unknown>) => stub('goal', props),
  MapSection: (props: Record<string, unknown>) => stub('map', props),
  PolicySection: (props: Record<string, unknown>) => stub('policy', props),
  KpiSection: (props: Record<string, unknown>) => stub('kpi', props),
  TrendSection: (props: Record<string, unknown>) => stub('trend', props),
  StatsSection: (props: Record<string, unknown>) => stub('stats', props),
}))

function stub(key: string, props: Record<string, unknown>): ReactElement {
  hoisted.props[key] = props
  if (hoisted.suspended.has(key)) throw new Promise(() => {})
  return <div data-section={key} />
}

import EcosystemPage, { dynamic } from '../page'

const READ = Promise.resolve({ ok: false as const })
const KPI_PROMISE = Promise.resolve({ thisWeek: { metrics: null, error: null }, lastWeek: { metrics: null, error: null } })

async function renderPage(query: Record<string, string | string[] | undefined> = {}): Promise<string> {
  return renderToStaticMarkup(await EcosystemPage({ searchParams: Promise.resolve(query) }))
}

function sectionOrder(markup: string): string[] {
  return [...markup.matchAll(/data-section="([a-z]+)"/g)].map((match) => match[1])
}

beforeEach(() => {
  hoisted.props = {}
  hoisted.suspended.clear()
  hoisted.startSnapshot.mockReset()
  hoisted.startSnapshot.mockReturnValue(READ)
  hoisted.startKpiWeekly.mockReset()
  hoisted.startKpiWeekly.mockReturnValue(KPI_PROMISE)
})

describe('생태계 상황판 페이지', () => {
  it('캐시하지 않는 동적 페이지다', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('머리 다음에 요약 → 목표 대비 → 순환 지도 → 정책 패널 → 주간 핵심 지표 → 배지 경제 흐름 → 통계 순서로 둔다', async () => {
    const markup = await renderPage()
    expect(markup).toContain('생태계 상황판')
    expect(sectionOrder(markup)).toEqual(['summary', 'goal', 'map', 'policy', 'kpi', 'trend', 'stats'])
  })

  it('주간 지표는 한 번만 읽어 주간 핵심 지표에 넘긴다', async () => {
    await renderPage()
    expect(hoisted.startKpiWeekly).toHaveBeenCalledTimes(1)
    expect(hoisted.props.kpi.kpi).toBe(KPI_PROMISE)
  })

  it('?trend=는 배지 경제 흐름에 그대로 넘기고(같은 키가 둘이면 값 없음), 선택한 마디도 함께 넘긴다', async () => {
    await renderPage({ trend: '7', node: 'inventory' })
    expect(hoisted.props.trend).toEqual({ trendParam: '7', node: 'inventory' })
    await renderPage({ trend: ['30', '7'] })
    expect(hoisted.props.trend).toEqual({ trendParam: undefined, node: null })
  })

  it('스냅샷은 한 번만 읽어 요약·목표 대비·지도에 같은 약속을 넘긴다', async () => {
    await renderPage()
    expect(hoisted.startSnapshot).toHaveBeenCalledTimes(1)
    expect(hoisted.props.summary.read).toBe(READ)
    expect(hoisted.props.goal.read).toBe(READ)
    expect(hoisted.props.map.read).toBe(READ)
  })

  it('?node=가 허용 마디면 지도와 정책 패널에 선택으로 넘긴다', async () => {
    await renderPage({ node: 'inventory' })
    expect(hoisted.props.map.selected).toBe('inventory')
    expect(hoisted.props.policy.node).toBe('inventory')
  })

  it('?node=가 없거나 허용 밖 값이거나 중복이면 선택 없음이다', async () => {
    for (const node of [undefined, '', 'unknown', 'INVENTORY', ['inventory', 'capsule']]) {
      hoisted.props = {}
      await renderPage({ node })
      expect(hoisted.props.map.selected).toBeNull()
      expect(hoisted.props.policy.node).toBeNull()
    }
  })

  it('node·trend 밖의 쿼리는 읽지 않는다 (sample 값이 와도 구역 인자에 섞이지 않는다)', async () => {
    await renderPage({ trend: '30', sample: '1', node: 'sync' })
    expect(Object.keys(hoisted.props.map).sort()).toEqual(['read', 'selected'])
    expect(Object.keys(hoisted.props.policy)).toEqual(['node'])
    expect(Object.keys(hoisted.props.kpi)).toEqual(['kpi'])
    expect(Object.keys(hoisted.props.trend).sort()).toEqual(['node', 'trendParam'])
    expect(Object.keys(hoisted.props.stats)).toEqual([])
  })

  it('한 구역을 읽는 중이어도 머리와 다른 구역은 그대로 보이고 그 구역 자리에는 스켈레톤이 있다', async () => {
    hoisted.suspended.add('goal')
    const markup = await renderPage()
    expect(markup).toContain('생태계 상황판')
    expect(sectionOrder(markup)).toEqual(['summary', 'map', 'policy', 'kpi', 'trend', 'stats'])
    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-label="불러오는 중"')
  })
})
