/**
 * 받은 기획함 표·탭(S2)의 초기 렌더 (티켓 20260930_1817)
 *
 * jsdom이 없어 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양만 고정한다: 열 6개가 채워지는지, 「시험」 칩·새로 도착·
 * 결정 수·일부 실패·형식 오류 없음 표시, 행 링크, 제출 문자열이 HTML로 해석되지 않는지.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/ops-inbox',
  useSearchParams: () => new URLSearchParams(),
}))

import { OpsInboxTable, opsBundleHref } from '../OpsInboxTable'
import { OpsInboxTabs } from '../OpsInboxTabs'
import type { OpsBundleListRow } from '@/lib/admin/opsInbox/query'

function row(overrides: Partial<OpsBundleListRow> = {}): OpsBundleListRow {
  return {
    id: '4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee',
    week: '2026-W41',
    hypothesis: '월요일 카드가 미션 참여를 늘린다',
    author: '주간 루틴',
    isSample: true,
    formatErrorCount: 3,
    receivedAt: '2026-10-01T00:12:00Z',
    itemCount: 35,
    stage: 'arrived',
    partialFailure: false,
    decidedCount: 0,
    ...overrides,
  }
}

describe('OpsInboxTable', () => {
  it('열 6개 머리와 시험 묶음 한 줄이 채워진다', () => {
    const out = renderToStaticMarkup(<OpsInboxTable rows={[row()]} />)
    for (const header of ['주차·가설', '에이전트', '상태', '항목', '형식 오류', '받은 시각']) expect(out).toContain(header)
    expect(out).toContain('시험')
    expect(out).toContain('41주차 (10/5~10/11)')
    expect(out).toContain('월요일 카드가 미션 참여를 늘린다')
    expect(out).toContain('주간 루틴')
    expect(out).toContain('새로 도착')
    expect(out).toContain('35개')
    expect(out).toContain('3건')
    expect(out).toContain('10/1(목) 09:12')
  })

  it('행 링크는 DB 행 ID의 상세 경로다', () => {
    const out = renderToStaticMarkup(<OpsInboxTable rows={[row()]} />)
    expect(opsBundleHref('abc')).toBe('/admin/ops-inbox/abc')
    expect(out).toContain('href="/admin/ops-inbox/4ca7d1ad-43b2-41a3-9ed4-f03bc73604ee"')
  })

  it('새로 도착한 묶음은 글자를 굵게 그린다', () => {
    const arrived = renderToStaticMarkup(<OpsInboxTable rows={[row()]} />)
    expect(arrived).toContain('font-bold')
    const seen = renderToStaticMarkup(<OpsInboxTable rows={[row({ stage: 'scheduled' })]} />)
    expect(seen).not.toContain('font-bold')
  })

  it('검토 단계는 아랫줄에 「결정 3/12」를 보인다', () => {
    const out = renderToStaticMarkup(<OpsInboxTable rows={[row({ stage: 'review', decidedCount: 3, itemCount: 12 })]} />)
    expect(out).toContain('검토중')
    expect(out).toContain('결정 3/12')
    expect(renderToStaticMarkup(<OpsInboxTable rows={[row({ stage: 'scheduled' })]} />)).not.toContain('결정 ')
  })

  it('실패 항목이 있으면 「일부 실패」 칩이 붙는다', () => {
    const out = renderToStaticMarkup(<OpsInboxTable rows={[row({ stage: 'scheduled', partialFailure: true })]} />)
    expect(out).toContain('예약됨')
    expect(out).toContain('일부 실패')
  })

  it('형식 오류가 0이면 「없음」, 주차 형식이 틀리거나 없으면 「주차 없음」, 시험이 아니면 칩이 없다', () => {
    const out = renderToStaticMarkup(
      <OpsInboxTable rows={[row({ formatErrorCount: 0, week: 'oops', isSample: false, hypothesis: null })]} />
    )
    expect(out).toContain('없음')
    expect(out).toContain('주차 없음')
    expect(out).not.toContain('시험')
    expect(renderToStaticMarkup(<OpsInboxTable rows={[row({ week: null })]} />)).toContain('주차 없음')
  })

  it('제출 문자열(에이전트 이름·가설)은 HTML로 해석되지 않는다', () => {
    const out = renderToStaticMarkup(
      <OpsInboxTable rows={[row({ author: '<img src=x onerror=alert(1)>', hypothesis: '<script>alert(2)</script>' })]} />
    )
    expect(out).not.toContain('<img')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('OpsInboxTabs', () => {
  it('탭 4개와 숫자, 아래 내용을 그린다', () => {
    const out = renderToStaticMarkup(
      <OpsInboxTabs tab="decide" counts={{ all: 4, decide: 2, progress: 1, closed: 1 }}>
        <p>표 자리</p>
      </OpsInboxTabs>
    )
    for (const label of ['전체', '결정할 것', '진행 중', '끝남·멈춤']) expect(out).toContain(label)
    expect(out).toContain('>4<')
    expect(out).toContain('>2<')
    expect(out).toContain('표 자리')
    expect(out).toMatch(/aria-selected="true"[^>]*>결정할 것/)
  })
})
