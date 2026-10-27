/**
 * 운영 홈 페이지 조립 (티켓 20261006_1341 ②-c, 승인 #12·#18)
 *
 * 구역은 `_home/sections`의 가짜(표식만 그리는 동기 컴포넌트)로 바꿔 **페이지가 하는 일**만 본다: 머리, 구역 순서, 구역마다 `Suspense`,
 * 쿼리(`sample`·`trend`) 전달(주간 캘린더는 ③-d에서 일정표로 옮겨 `week`는 읽지 않는다), 주간 지표를 한 번만 읽어 두 구역에 같이 넘기기, 빠른 실행 4개의 링크.
 * 구역 안의 읽기·격리는 `home-sections.test.tsx`가 본다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const hoisted = vi.hoisted(() => ({
  props: {} as Record<string, Record<string, unknown>>,
  startKpiWeekly: vi.fn(),
  /** 이 구역은 읽는 중(Suspense 안에서 멈춘다)으로 만든다. */
  suspended: new Set<string>(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('../_home/sections', () => ({
  startKpiWeekly: hoisted.startKpiWeekly,
  BoardSection: (props: Record<string, unknown>) => stub('board', props),
  SignalSection: (props: Record<string, unknown>) => stub('signal', props),
  ServiceCheckSection: (props: Record<string, unknown>) => stub('service', props),
  RecentDecisionsSection: (props: Record<string, unknown>) => stub('history', props),
  KpiSection: (props: Record<string, unknown>) => stub('kpi', props),
  TrendSection: (props: Record<string, unknown>) => stub('trend', props),
  StatsSection: (props: Record<string, unknown>) => stub('stats', props),
  SampleSwitchSection: (props: Record<string, unknown>) => stub('switch', props),
}))

function stub(key: string, props: Record<string, unknown>): ReactElement {
  hoisted.props[key] = props
  // 읽는 중인 구역: 끝나지 않는 약속을 던지면 가장 가까운 Suspense의 대체 화면이 보인다.
  if (hoisted.suspended.has(key)) throw new Promise(() => {})
  return <div data-section={key} />
}

import AdminDashboardPage from '../page'

const KPI_PROMISE = Promise.resolve({ thisWeek: { metrics: null, error: null }, lastWeek: { metrics: null, error: null } })

async function renderPage(query: Record<string, string | string[] | undefined> = {}): Promise<string> {
  return renderToStaticMarkup(await AdminDashboardPage({ searchParams: Promise.resolve(query) }))
}

/** 마크업에서 구역 표식이 나오는 순서. */
function sectionOrder(markup: string): string[] {
  return [...markup.matchAll(/data-section="([a-z]+)"/g)].map((match) => match[1])
}

beforeEach(() => {
  hoisted.props = {}
  hoisted.suspended.clear()
  hoisted.startKpiWeekly.mockReset()
  hoisted.startKpiWeekly.mockReturnValue(KPI_PROMISE)
})

describe('운영 홈 머리 (승인 #12)', () => {
  it('제목은 「운영 홈」이고 부제가 있다. 「대시보드」는 없다', async () => {
    const out = await renderPage()
    expect(out).toContain('<h1 class="text-2xl font-bold">운영 홈</h1>')
    expect(out).toContain('이번 주 내가 할 일과 흐름을 한눈에 봐요')
    expect(out).not.toContain('대시보드')
  })

  it('시험 묶음 스위치는 머리의 구역 순서 맨 앞에 있고, 구역 영역은 aria-busy 틀 안에 있다', async () => {
    const out = await renderPage()
    expect(sectionOrder(out)[0]).toBe('switch')
    expect(out).toContain('aria-busy="false"')
  })
})

describe('구역 순서 (승인 #18)', () => {
  it('운영 상황판 → 신호 → 서비스 점검 → 최근 이력 → KPI → 경제 추이 → 통계 순서다(KPI·경제 추이·통계는 생태계 상황판으로 옮기기 전이라 아래쪽에 둔다)', async () => {
    expect(sectionOrder(await renderPage())).toEqual(['switch', 'board', 'signal', 'service', 'history', 'kpi', 'trend', 'stats'])
  })

  it('빠른 실행은 통계 다음이고 링크 4개가 같다', async () => {
    const out = await renderPage()
    expect(out.indexOf('data-section="stats"')).toBeLessThan(out.indexOf('빠른 실행'))
    const shortcuts = out.slice(out.indexOf('빠른 실행'))
    for (const [href, label] of [
      ['/admin/badges/new', '배지 등록'],
      ['/admin/poi/new', '장소 등록'],
      ['/admin/itembooks/new', '컬렉션 등록'],
      ['/admin/simulator', '시뮬레이터 실행'],
    ]) {
      expect(shortcuts).toContain(`href="${href}"`)
      expect(shortcuts).toContain(label)
    }
    expect(shortcuts.match(/<a /g)).toHaveLength(4)
  })

  it('주간 캘린더 구역이 없다(일정표로 옮겼다, 「일정표 보기」 링크는 운영 상황판 구역이 그린다)', async () => {
    await renderPage()
    expect(hoisted.props.calendar).toBeUndefined()
  })
})

describe('구역마다 Suspense + 스켈레톤 (승인 #18)', () => {
  it('한 구역이 읽는 중이어도 그 자리만 「불러오는 중」이고 다른 구역은 그대로 보인다', async () => {
    hoisted.suspended.add('signal')
    const out = await renderPage()
    expect(out.match(/role="status" aria-label="불러오는 중"/g)).toHaveLength(1)
    expect(sectionOrder(out)).toEqual(['switch', 'board', 'service', 'history', 'kpi', 'trend', 'stats'])
    // 대체 화면이 신호 자리(운영 상황판 다음, 서비스 점검 앞)에 있다
    expect(out.indexOf('data-section="board"')).toBeLessThan(out.indexOf('불러오는 중'))
    expect(out.indexOf('불러오는 중')).toBeLessThan(out.indexOf('data-section="service"'))
  })

  it('모든 구역이 읽는 중이면 구역마다 스켈레톤이 하나씩이다(스위치 자리는 role 없는 막대다)', async () => {
    for (const key of ['board', 'signal', 'service', 'history', 'kpi', 'trend', 'stats']) hoisted.suspended.add(key)
    const out = await renderPage()
    expect(out.match(/role="status" aria-label="불러오는 중"/g)).toHaveLength(7)
  })
})

describe('쿼리와 주간 지표', () => {
  it('sample=1이면 시험 묶음 포함 값이 읽는 구역들에 넘어가고, 키가 없거나 다른 값이면 꺼짐이다', async () => {
    await renderPage({ sample: '1' })
    for (const key of ['switch', 'board', 'signal', 'history', 'trend']) expect(hoisted.props[key].includeSample, key).toBe(true)
    await renderPage({})
    for (const key of ['switch', 'board', 'signal', 'history', 'trend']) expect(hoisted.props[key].includeSample, key).toBe(false)
    await renderPage({ sample: '0' })
    expect(hoisted.props.board.includeSample).toBe(false)
    await renderPage({ sample: ['1', '0'] })
    expect(hoisted.props.board.includeSample).toBe(true)
  })

  it('trend 쿼리를 구역에 넘기고 week는 무시한다(같은 키가 둘이면 값 없음으로 읽는다)', async () => {
    await renderPage({ trend: '7', week: '2026-09-21' })
    expect(hoisted.props.trend).toMatchObject({ trendParam: '7' })
    expect(hoisted.props.trend).not.toHaveProperty('weekParam')
    await renderPage({ trend: ['30', '7'] })
    expect(hoisted.props.trend.trendParam).toBeUndefined()
  })

  it('주간 지표는 페이지에서 한 번만 읽고 같은 약속을 서비스 점검·KPI에 넘긴다', async () => {
    await renderPage()
    expect(hoisted.startKpiWeekly).toHaveBeenCalledTimes(1)
    expect(hoisted.props.service.kpi).toBe(KPI_PROMISE)
    expect(hoisted.props.kpi.kpi).toBe(KPI_PROMISE)
  })
})
