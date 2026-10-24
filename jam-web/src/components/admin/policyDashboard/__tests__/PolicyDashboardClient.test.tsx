/**
 * 정책 대시보드 화면 (티켓 20261022_1717) — 서버 렌더(`renderToStaticMarkup`)로 그린 모양만 고정한다. 지키는 것:
 * - 설정 화면에서 바꾸는 카드는 값을 읽어 보여 주고(`liveValues`), «밸런스 설정에서 바꾸기» 링크로 해당 구역에 이어진다
 * - 시스템 드랍 카드도 구역(`/admin/balance#ambient`)으로 이어지고 링크 글자는 «밸런스 설정에서 바꾸기»다. 카드 어디에도 옛 화면 링크와 «설정 화면에서 바꾸기» 링크가 없다 (7-3 3회가 마지막 옛 화면 링크를 옮겼다)
 * - 숫자 입력칸·«값 변경» 버튼 같은 직접 수정 컨트롤은 어디에도 없다
 * - 읽어 보여 줄 칸이 없는 카드(여러 칸)는 실측값 줄 없이 링크만 둔다. 검색창과 유형 탭은 그대로 있다
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { POLICIES_DATA } from '@/lib/admin/policyDashboard/policiesData'
import { PolicyDashboardClient } from '../PolicyDashboardClient'

const PICKED_IDS = [
  'ch1-core-loop', // 엔진 고정 규칙
  'ch4-intensity-light', // 잼 구역 링크 + 실측값
  'ch16-vehicle-speed-filter', // 어뷰징 구역 링크 + 실측값
  'ch7-locked-min-requirements', // 잠긴 구역 링크, 읽는 칸 없음
]

const policies = POLICIES_DATA.filter((p) => PICKED_IDS.includes(p.id))

const html = (liveValues: Record<string, unknown> = { intensity_light: 7, vehicle_speed_filter_kmh: 45 }) =>
  renderToStaticMarkup(
    <PolicyDashboardClient initialPolicies={policies} initialLiveValues={liveValues} updatedAt="2026-10-23T00:00:00.000Z" />,
  ).replace(/<!-- -->/g, '')

describe('PolicyDashboardClient — 값 읽기와 설정 화면 링크', () => {
  it('고른 정책이 모두 카드로 그려진다', () => {
    expect(policies).toHaveLength(PICKED_IDS.length)
    const out = html()
    for (const p of policies) expect(out).toContain(p.title)
  })

  it('잼 구역 카드는 실측값을 단위와 함께 보이고 «밸런스 설정에서 바꾸기»로 /admin/balance#jam에 이어진다', () => {
    const out = html()
    expect(out).toContain('현재 DB 실측값:')
    expect(out).toContain('>7배<')
    expect(out).toContain('href="/admin/balance#jam"')
    expect(out).toContain('밸런스 설정에서 바꾸기')
  })

  it('잠긴 아이템 배지 카드는 /admin/balance#locked로 이어지고 실측값 줄은 없다', () => {
    const out = html()
    expect(out).toContain('href="/admin/balance#locked"')
    // 실측값 줄은 읽을 칸이 있는 두 카드(잼·어뷰징)에만 있다
    expect(out.split('현재 DB 실측값:').length - 1).toBe(2)
  })

  it('어뷰징 카드는 실측값을 보이고 «밸런스 설정에서 바꾸기»로 /admin/balance#abusing에 이어진다', () => {
    const out = html()
    expect(out).toContain('>45km/h<')
    expect(out).toContain('href="/admin/balance#abusing"')
    expect(out).toMatch(/href="\/admin\/balance#abusing"[^>]*>밸런스 설정에서 바꾸기/)
    expect(out).not.toContain('href="/admin/abusing"')
  })

  it('시스템 드랍 카드는 /admin/balance#ambient로 이어지고 글자는 «밸런스 설정에서 바꾸기»다. 옛 화면 링크는 없다', () => {
    const ambient = POLICIES_DATA.filter((p) => p.id === 'ch9-ambient-schedule-hour')
    expect(ambient).toHaveLength(1)
    const out = renderToStaticMarkup(
      <PolicyDashboardClient initialPolicies={ambient} initialLiveValues={{ schedule_hour_kst: 9 }} updatedAt="2026-10-23T00:00:00.000Z" />,
    ).replace(/<!-- -->/g, '')
    expect(out).toContain('href="/admin/balance#ambient"')
    expect(out).toMatch(/href="\/admin\/balance#ambient"[^>]*>밸런스 설정에서 바꾸기/)
    expect(out).not.toContain('href="/admin/ambient-drop"')
  })

  it('모든 카드의 링크는 /admin/balance#구역이고, «설정 화면에서 바꾸기» 글자의 링크는 하나도 없다(링크 글자를 가르던 분기를 지웠다)', () => {
    const out = renderToStaticMarkup(
      <PolicyDashboardClient initialPolicies={POLICIES_DATA} initialLiveValues={{}} updatedAt="2026-10-23T00:00:00.000Z" />,
    ).replace(/<!-- -->/g, '')
    // «바꾸기» 링크는 설정 화면 링크다(카드의 다른 링크와 가른다)
    const changeLinks = [...out.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)</g)].filter((match) => match[2].includes('바꾸기'))
    expect(changeLinks.length).toBe(POLICIES_DATA.filter((p) => p.type === 'admin_link').length)
    for (const [, href, text] of changeLinks) {
      expect(href, href).toMatch(/^\/admin\/balance#[a-z]+$/)
      expect(text.trim(), href).toBe('밸런스 설정에서 바꾸기')
    }
    expect(out).not.toMatch(/<a [^>]*>설정 화면에서 바꾸기/)
  })

  it('값을 못 읽었으면 «조회 중»으로 보인다', () => {
    expect(html({})).toContain('조회 중')
  })

  it('직접 수정 컨트롤(숫자 입력칸, 값 변경·저장 버튼)이 없다', () => {
    const out = html()
    expect(out).not.toContain('type="number"')
    expect(out).not.toContain('값 변경')
    expect(out).not.toContain('값 수정')
    expect(out).not.toContain('저장 중')
  })

  it('검색창과 유형 탭은 그대로 있고 설정 화면 탭은 개수를 보인다', () => {
    const out = html()
    expect(out).toContain('type="text"')
    expect(out).toContain('정책명, 기준 수치')
    expect(out).toContain('설정 화면에서 바꾸기 (3)')
    expect(out).toContain('엔진 고정 규칙 (1)')
  })

  it('한국어 문구를 그리는 링크에 줄바꿈 클래스가 붙어 있다', () => {
    const out = html()
    const tag = /<a [^>]*href="\/admin\/balance#jam"[^>]*>/.exec(out)?.[0]
    expect(tag).toBeDefined()
    for (const c of ['break-keep', 'wrap-break-word', 'whitespace-nowrap']) {
      expect(tag, c).toContain(c)
    }
  })
})
