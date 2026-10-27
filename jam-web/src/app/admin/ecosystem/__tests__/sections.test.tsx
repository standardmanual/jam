/**
 * 생태계 상황판 구역 (티켓 20261026_2027 3-1)
 *
 * 저장소에 jsdom이 없어 서버 컴포넌트를 `await`로 불러 얻은 요소를 `renderToStaticMarkup`으로 그린다. 읽기는 모두 가짜다(실 DB에 닿지 않는다).
 * 지키는 것:
 * - 스냅샷을 읽으면 요약·목표 대비·지도가 그려지고, 정상·주의·중단·부족·읽지 못함·목표 없음 여섯 상태가 모두 화면에 나온다
 * - 스냅샷 읽기가 던지면 목표 대비·지도 구역만 안내 카드이고(요약은 비움), 정책 패널은 그대로다
 * - 정책 패널은 마디를 고르지 않으면 설정값·개발 요청을 읽지 않고, 고르면 읽는다
 * - 개발 요청 목록을 못 읽으면 정책 패널만 안내 카드이고 스냅샷 구역은 그대로다
 * - 열린 요청이 있는 정책은 「요청 N번 접수됨」으로 보인다
 * - 운영 홈에서 옮겨 온 주간 핵심 지표·배지 경제 흐름·통계(티켓 20261026_2027 3-2): 한 구역의 읽기를 던지게 하면 그 구역만 안내 카드이고,
 *   일부 출처만 실패하면 그 칸의 기존 오류 표시만 남으며, 기간 전환 링크가 `/admin/ecosystem?trend=`이고 선택한 마디를 유지하고 `sample`은 붙지 않는다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { fixtureSnapshot } from '@/components/admin/ecosystem/__tests__/fixtures'
import type { PolicyItem } from '@/lib/admin/policyDashboard/types'

const hoisted = vi.hoisted(() => {
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
    loadSnapshot: vi.fn(),
    listRequests: vi.fn(),
    liveValues: vi.fn(),
    policies: [] as unknown[],
    /** 읽기를 던지게 할 구역·출처 키(`kpi`·`kpiLast`·`trend`·`trendBadge`·`stats`·`statsCell`). */
    fail: new Set<string>(),
    kpiCalls: { value: 0 },
    counts: { badges: 12, poi: 34, item_books: 5, users: 1234 } as Record<string, number>,
    table(name: string) {
      const boom = new Error(`${name} 조회 실패(시험)`)
      if (hoisted.fail.has('stats')) return query(boom, true)
      if (name === 'badges' && hoisted.fail.has('statsCell')) return query({ count: null, error: { message: '배지 수 조회 실패(시험)' } })
      return query({ count: hoisted.counts[name] ?? 0, error: null })
    },
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ from: (table: string) => hoisted.table(table) }) }))
vi.mock('@/lib/admin/kpiWeekly', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/kpiWeekly')>()),
  computeKpiWeeklyMetrics: vi.fn(async () => {
    const index = hoisted.kpiCalls.value
    hoisted.kpiCalls.value += 1
    if (hoisted.fail.has('kpi')) throw new Error('kpi 읽기 실패(시험)')
    // 두 번째 호출이 지난주 구간이다(`startKpiWeekly`가 이번 주 → 지난주 순서로 부른다).
    if (index % 2 === 1 && hoisted.fail.has('kpiLast')) throw new Error('kpiLast 읽기 실패(시험)')
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
    if (hoisted.fail.has('trend') || hoisted.fail.has('trendBadge')) throw new Error('배지 발급량 읽기 실패(시험)')
    return []
  }),
  fetchAmbientDropDaily: vi.fn(async () => {
    if (hoisted.fail.has('trend')) throw new Error('앰비언트 드랍량 읽기 실패(시험)')
    return []
  }),
}))
vi.mock('@/lib/admin/ecosystem/load', () => ({ loadEcosystemSnapshot: hoisted.loadSnapshot }))
vi.mock('@/lib/admin/devRequests/store', () => ({ listDevRequests: hoisted.listRequests }))
vi.mock('@/lib/admin/policyDashboard/liveValues', () => ({ loadPolicyLiveValues: hoisted.liveValues }))
vi.mock('@/lib/admin/policyDashboard/policiesData', () => ({
  get POLICIES_DATA() {
    return hoisted.policies
  },
}))

import { startKpiWeekly } from '@/lib/admin/kpiWeeklyPair'
import { trendHref } from '../../EconomyTrend'
import { ECOSYSTEM_NOTICE_TITLES, GoalSection, KpiSection, MapSection, PolicySection, startSnapshot, StatsSection, SummarySection, TrendSection } from '../_sections'

const CODE_FIXED: PolicyItem = {
  id: 't-code',
  chapter: 8,
  chapterTitle: '인벤토리',
  title: '믹스 재료 수',
  type: 'code_constant',
  currentSpec: '5개 고정',
  userExperience: '재료',
  basisDoc: '운영 로직 8장',
  nodes: ['inventory'],
}

const html = (element: ReactElement | null) => (element === null ? '' : renderToStaticMarkup(element).replace(/<!-- -->/g, ''))
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

beforeEach(() => {
  hoisted.fail.clear()
  hoisted.kpiCalls.value = 0
  hoisted.loadSnapshot.mockReset()
  hoisted.listRequests.mockReset()
  hoisted.liveValues.mockReset()
  hoisted.loadSnapshot.mockResolvedValue(fixtureSnapshot())
  hoisted.listRequests.mockResolvedValue([])
  hoisted.liveValues.mockResolvedValue({})
  hoisted.policies = [CODE_FIXED]
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('스냅샷 구역', () => {
  it('요약·목표 대비·지도가 한 번의 읽기로 그려지고 여섯 상태가 모두 나온다', async () => {
    const read = startSnapshot()
    const summary = html(await SummarySection({ read }))
    const goal = html(await GoalSection({ read }))
    const map = html(await MapSection({ read, selected: null }))

    expect(hoisted.loadSnapshot).toHaveBeenCalledTimes(1)
    expect(textOf(summary)).toContain('주의 이상 2')
    expect(textOf(summary)).toContain('읽지 못함 2')
    const all = `${goal}${map}`
    for (const status of ['ok', 'warn', 'stop', 'insufficient', 'error', 'no_target']) {
      expect(all).toContain(`data-status="${status}"`)
    }
  })

  it('지도에 선택한 마디가 표시된다', async () => {
    const map = html(await MapSection({ read: startSnapshot(), selected: 'capsule' }))
    expect([...map.matchAll(/aria-current="true"/g)]).toHaveLength(1)
  })

  it('스냅샷 읽기가 던지면 목표 대비·지도만 안내 카드이고 요약은 비운다', async () => {
    hoisted.loadSnapshot.mockRejectedValue(new Error('읽기 실패(시험)'))
    const read = startSnapshot()
    expect(await SummarySection({ read })).toBeNull()
    const goal = html(await GoalSection({ read }))
    const map = html(await MapSection({ read, selected: null }))
    expect(textOf(goal)).toContain('목표 대비를 불러오지 못했어요')
    expect(textOf(goal)).toContain('새로 고치기')
    expect(textOf(map)).toContain('순환 지도를 불러오지 못했어요')
    // 안내 카드에 내부 오류 원문이 없다
    expect(`${goal}${map}`).not.toContain('읽기 실패(시험)')
  })

  it('서비스 클라이언트를 만들지 못해도 거절되지 않고 안내 카드가 된다', async () => {
    hoisted.loadSnapshot.mockImplementation(() => {
      throw new Error('서비스 키 없음(시험)')
    })
    const goal = html(await GoalSection({ read: startSnapshot() }))
    expect(textOf(goal)).toContain('목표 대비를 불러오지 못했어요')
  })
})

describe('정책 패널 구역', () => {
  it('마디를 고르지 않으면 설정값과 개발 요청을 읽지 않는다', async () => {
    const panel = html(await PolicySection({ node: null }))
    expect(hoisted.liveValues).not.toHaveBeenCalled()
    expect(hoisted.listRequests).not.toHaveBeenCalled()
    expect(textOf(panel)).toContain('지도에서 마디를 누르면')
  })

  it('마디를 고르면 열린(requested) 요청만 읽어 정책 카드에 잇는다', async () => {
    hoisted.listRequests.mockResolvedValue([{ id: 'req-9', no: 9, policyId: 't-code' }])
    const panel = html(await PolicySection({ node: 'inventory' }))
    expect(hoisted.listRequests).toHaveBeenCalledWith(expect.anything(), { status: 'requested' })
    expect(hoisted.liveValues).toHaveBeenCalledTimes(1)
    expect(textOf(panel)).toContain('믹스 재료 수')
    expect(textOf(panel)).toContain('요청 9번 접수됨')
  })

  it('열린 요청이 없으면 [개발 요청] 버튼이다', async () => {
    const panel = html(await PolicySection({ node: 'inventory' }))
    expect(textOf(panel)).toContain('개발 요청')
    expect(textOf(panel)).not.toContain('접수됨')
  })

  it('개발 요청 목록을 못 읽으면 정책 패널만 안내 카드고 스냅샷 구역은 그대로다', async () => {
    hoisted.listRequests.mockRejectedValue(new Error('개발 요청 조회 실패(시험)'))
    const panel = html(await PolicySection({ node: 'inventory' }))
    expect(textOf(panel)).toContain('정책을 불러오지 못했어요')
    expect(panel).not.toContain('조회 실패(시험)')

    const goal = html(await GoalSection({ read: startSnapshot() }))
    expect(goal).toContain('data-policy-id="ch19-kpi-stop"')
  })
})

// ── 운영 홈에서 옮겨 온 구역 (티켓 20261026_2027 3-2) ──────────────────────────────────────────────

const MOVED = ['kpi', 'trend', 'stats'] as const
type MovedKey = (typeof MOVED)[number]

/** 구역이 제대로 그려졌을 때 마크업에 있는 표식(안내 카드의 제목에는 없는 것). */
const OK_MARKER: Record<MovedKey, string> = {
  kpi: 'ops-weekly-kpi-heading',
  trend: 'aria-label="배지 경제 흐름"',
  stats: 'aria-label="통계"',
}

async function renderMoved(options: { trend?: string; node?: 'inventory' | null } = {}): Promise<Record<MovedKey, string>> {
  const kpi = startKpiWeekly()
  return {
    kpi: html(await KpiSection({ kpi })),
    trend: html(await TrendSection({ trendParam: options.trend, node: options.node ?? null })),
    stats: html(await StatsSection()),
  }
}

describe('운영 홈에서 옮겨 온 구역', () => {
  it('아무것도 던지지 않으면 세 구역이 모두 그려지고 안내 카드는 없다', async () => {
    const out = await renderMoved()
    for (const key of MOVED) {
      expect(out[key], key).toContain(OK_MARKER[key])
      expect(out[key], key).not.toContain(ECOSYSTEM_NOTICE_TITLES[key])
      expect(out[key], key).not.toContain('새로 고치기')
    }
  })

  for (const key of MOVED) {
    it(`${key}: 그 구역의 읽기를 던지게 하면 그 구역만 안내 카드 + [새로 고치기]이고 나머지는 그대로다`, async () => {
      hoisted.fail.add(key)
      const out = await renderMoved()
      expect(out[key]).toContain(ECOSYSTEM_NOTICE_TITLES[key])
      expect(out[key]).toContain('새로 고치기')
      expect(out[key]).not.toContain(OK_MARKER[key])
      for (const other of MOVED.filter((k) => k !== key)) {
        expect(out[other], `${key} 실패 중 ${other}`).toContain(OK_MARKER[other])
        expect(out[other], `${key} 실패 중 ${other}`).not.toContain(ECOSYSTEM_NOTICE_TITLES[other])
      }
    })
  }

  it('통계 안내 카드는 서비스 키 설정을 알린다', async () => {
    hoisted.fail.add('stats')
    const out = (await renderMoved()).stats
    expect(out).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('안내 카드에 내부 오류 원문이 없다', async () => {
    hoisted.fail.add('kpi')
    expect((await renderMoved()).kpi).not.toContain('읽기 실패(시험)')
  })

  it('주간 핵심 지표: 지난주만 못 읽으면 두 장은 그대로이고 「지난주 대비 비교 불가」다', async () => {
    hoisted.fail.add('kpiLast')
    const out = (await renderMoved()).kpi
    expect(out).toContain('ops-weekly-kpi-heading')
    expect(out).toContain('지난주 대비 비교 불가')
    expect(out).not.toContain(ECOSYSTEM_NOTICE_TITLES.kpi)
  })

  it('주간 핵심 지표: 미션 달성자 수·배지 발급량 두 장이고 지난주 대비가 있다', async () => {
    const out = (await renderMoved()).kpi
    expect(out).toContain('미션 달성자 수')
    expect(out).toContain('배지 발급량')
    expect(out.match(/지난주 대비/g)).toHaveLength(2)
    expect(out).toContain('지난주 대비 +5')
    expect(out).toContain('지난주 대비 +20')
  })

  it('배지 경제 흐름: 한쪽 그래프만 못 읽으면 그 그래프만 오류 카드다', async () => {
    hoisted.fail.add('trendBadge')
    const out = (await renderMoved()).trend
    expect(out).toContain('aria-label="배지 경제 흐름"')
    expect(out).not.toContain(ECOSYSTEM_NOTICE_TITLES.trend)
    expect(out).toContain('불러오지 못했어요.')
    expect(out).toContain('일별 앰비언트 드랍량')
    expect(out).toContain('기간 내 없음')
  })

  it('배지 경제 흐름: 기간 전환 링크는 /admin/ecosystem?trend= 이고 sample은 붙지 않는다', async () => {
    const out = (await renderMoved()).trend
    expect(out).toContain('href="/admin/ecosystem?trend=7"')
    expect(out).toContain('href="/admin/ecosystem?trend=30"')
    expect(out).not.toContain('sample')
    expect(trendHref(7)).toBe('/admin/ecosystem?trend=7')
  })

  it('배지 경제 흐름: 선택한 마디가 있으면 기간 전환 링크가 node를 유지한다', async () => {
    const out = (await renderMoved({ node: 'inventory' })).trend
    expect(out).toContain('href="/admin/ecosystem?trend=7&amp;node=inventory"')
    expect(out).toContain('href="/admin/ecosystem?trend=30&amp;node=inventory"')
    expect(trendHref(30, 'inventory')).toBe('/admin/ecosystem?trend=30&node=inventory')
  })

  it('배지 경제 흐름: ?trend=7이면 7일 보기가 현재이고 그 밖의 값은 30일이다', async () => {
    const seven = (await renderMoved({ trend: '7' })).trend
    expect(seven).toMatch(/aria-current="true"[^>]*>7일/)
    const other = (await renderMoved({ trend: 'abc' })).trend
    expect(other).toMatch(/aria-current="true"[^>]*>30일/)
  })

  it('통계: 한 칸만 못 읽으면 그 칸만 「—」이고 나머지 칸의 숫자는 그대로다', async () => {
    hoisted.fail.add('statsCell')
    const out = (await renderMoved()).stats
    expect(out).not.toContain(ECOSYSTEM_NOTICE_TITLES.stats)
    expect(out).toContain('—')
    expect(out).toContain('>34<')
    expect(out).toContain('>1,234<')
    expect(out).toContain('text-red-700')
  })

  it('통계 4칸: 링크가 같다', async () => {
    const out = (await renderMoved()).stats
    for (const href of ['/admin/badges', '/admin/poi', '/admin/itembooks', '/admin/users']) expect(out).toContain(`href="${href}"`)
    for (const label of ['배지', '장소', '컬렉션', '유저']) expect(out).toContain(`>${label}<`)
  })
})
