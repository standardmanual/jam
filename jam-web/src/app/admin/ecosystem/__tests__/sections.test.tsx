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
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { fixtureSnapshot } from '@/components/admin/ecosystem/__tests__/fixtures'
import type { PolicyItem } from '@/lib/admin/policyDashboard/types'

const hoisted = vi.hoisted(() => ({
  loadSnapshot: vi.fn(),
  listRequests: vi.fn(),
  liveValues: vi.fn(),
  policies: [] as unknown[],
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/lib/admin/ecosystem/load', () => ({ loadEcosystemSnapshot: hoisted.loadSnapshot }))
vi.mock('@/lib/admin/devRequests/store', () => ({ listDevRequests: hoisted.listRequests }))
vi.mock('@/lib/admin/policyDashboard/liveValues', () => ({ loadPolicyLiveValues: hoisted.liveValues }))
vi.mock('@/lib/admin/policyDashboard/policiesData', () => ({
  get POLICIES_DATA() {
    return hoisted.policies
  },
}))

import { GoalSection, MapSection, PolicySection, startSnapshot, SummarySection } from '../_sections'

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
    expect(hoisted.listRequests).toHaveBeenCalledWith({}, { status: 'requested' })
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
