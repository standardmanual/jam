/**
 * 운영 상황판 「주간 흐름」 지도 (티켓 20261026_2023 2회차, 어드민 상황판 PRD §6.2)
 *
 * 서버 렌더(`renderToStaticMarkup`)로 그린 모양을 고정한다. 행은 실제 계산(`computeWeekFlow`)으로 만든다.
 *
 * 지키는 것: 7열 머리와 담당, 「내 결정」 열 강조, 행 머리(주차·제목·기간), 정류장(건수 + 화면 상태 글자), 문제 정류장,
 * 「기록 없음」, 빈 상태, 정류장 링크 대상(결정 필요·문제는 결정 패널, 그 밖은 일정표), 동작 줄이기 대응, 제목이 HTML로 해석되지 않는다.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { computeWeekFlow } from '@/lib/admin/opsBoard/weekFlow'
import { flowRowHrefs } from '@/lib/admin/opsBoard/rowLinks'
import { NOW, makeBundle, makeStage, makeStart } from '@/lib/admin/opsBoard/__tests__/fixtures'
import { OpsWeekFlowMap, rowRangeLabel, weekNumberLabel } from '../OpsWeekFlowMap'

const flat = (node: ReactElement) => renderToStaticMarkup(node).replace(/<!-- -->/g, '')

type Bundle = ReturnType<typeof makeBundle>

function render(bundles: Bundle[], options: { starts?: Parameters<typeof computeWeekFlow>[0]['starts']; includeSample?: boolean } = {}) {
  const includeSample = options.includeSample ?? false
  const rows = computeWeekFlow({ bundles, starts: options.starts ?? [], now: NOW, includeSample })
  return flat(<OpsWeekFlowMap rows={rows} rowHrefs={flowRowHrefs({ bundles, includeSample })} includeSample={includeSample} />)
}

describe('열 머리', () => {
  const out = render([makeBundle({ id: 'b1', statuses: ['arrived'] })])

  it('7개 열 이름이 순서대로 있다', () => {
    const labels = ['기획', '세계관 검수', '밸런스 점검', '내 결정', '예약', '게재', '결과']
    let at = -1
    for (const label of labels) {
      const found = out.indexOf(`>${label}<`)
      expect(found, label).toBeGreaterThan(at)
      at = found
    }
  })

  it('담당이 열마다 붙고 내 결정 열은 「나(운영자)」다', () => {
    for (const owner of ['윤진', '윈터', '혜린', '나(운영자)', '시스템', '카즈하']) expect(out).toContain(`>${owner}<`)
  })

  it('「내 결정」 열만 호박색 바탕으로 강조한다', () => {
    const header = out.slice(out.indexOf('role="row"'), out.indexOf('role="row"', out.indexOf('role="row"') + 1))
    expect(header.match(/bg-amber-50/g)).toHaveLength(1)
    expect(header.indexOf('bg-amber-50')).toBeGreaterThan(header.indexOf('>내 결정<') - 200)
  })
})

describe('행 머리', () => {
  it('주차·기획 제목·기간을 쓰고 5주를 이번 주부터 보인다', () => {
    const out = render([makeBundle({ id: 'b1', title: 'LP 리바이벌', statuses: ['arrived'] })])
    expect(out).toContain('44주차')
    expect(out).toContain('LP 리바이벌')
    expect(out).toContain('10/26~11/1')
    expect((out.match(/role="rowheader"/g) ?? []).length).toBe(5)
    expect(out.indexOf('44주차')).toBeLessThan(out.indexOf('43주차'))
    expect(out).toContain('40주차')
  })

  it('제목이 없으면 「제목 없음」이다', () => {
    expect(render([makeBundle({ title: null, statuses: ['arrived'] })])).toContain('제목 없음')
  })

  it('주차·기간 글자 만들기', () => {
    expect(weekNumberLabel('2026-W44')).toBe('44주차')
    expect(rowRangeLabel({ weekStart: '2026-10-26', weekEnd: '2026-11-01' })).toBe('10/26~11/1')
  })
})

describe('셀', () => {
  it('결정 필요 정류장은 「건수 · 결정 필요」이고 움직이며 결정 패널로 간다', () => {
    const out = render([makeBundle({ id: 'b1', statuses: ['arrived', 'reviewing'] })])
    expect(out).toContain('2 · 결정 필요')
    expect(out).toContain('motion-safe:animate-pulse')
    expect(out).toContain('href="/admin/ops-inbox/b1"')
  })

  it('예약·게재 정류장은 움직이지 않는 화면 상태 글자이고 일정표로 간다', () => {
    const out = render([makeBundle({ id: 'b1', statuses: ['scheduled', 'live'] })])
    expect(out).toContain('1 · 진행 중')
    expect(out).toContain('1 · 게재 중')
    expect(out).not.toContain('animate-pulse')
    expect(out).toContain('href="/admin/ops-schedule"')
    expect(out).not.toContain('href="/admin/ops-inbox/b1"')
  })

  it('일부 실패는 예약 열에 「문제 N」 정류장을 하나 더 쌓고 결정 패널로 간다', () => {
    const out = render([makeBundle({ id: 'b1', statuses: ['scheduled', 'failed', 'failed'] })])
    expect(out).toContain('1 · 진행 중')
    expect(out).toContain('문제 2')
    expect(out).toContain('border-destructive')
    expect(out).toContain('motion-safe:animate-pulse')
    expect(out).toContain('href="/admin/ops-inbox/b1"')
  })

  it('실패만 있으면 「문제 N」 하나뿐이다', () => {
    const out = render([makeBundle({ id: 'b1', statuses: ['failed'] })])
    expect(out.match(/문제 1/g)).toHaveLength(1)
    expect(out).not.toContain('>문제<')
  })

  it('단계 기록이 없는 에이전트 열은 「기록 없음」, 있으면 결과 글이다', () => {
    const out = render([makeBundle({ statuses: ['arrived'], stages: [makeStage('world_review', { excludedCount: 2 })] })])
    expect(out).toContain('2건 뺌')
    expect(out.match(/기록 없음/g)).toHaveLength(2)
  })

  it('앞으로 올 열은 빈 점이고 화면 읽기용 글자가 있다', () => {
    const out = render([makeBundle({ statuses: ['arrived'] })])
    expect(out).toContain('border border-muted-foreground')
    expect(out).toContain('아직이에요')
  })

  it('묶음 없이 시작 기록만 있는 주는 기획 열에 「진행 중 · 시작 후 N분」 정류장이다', () => {
    const out = render([], { starts: [makeStart({ startedAt: '2026-10-28T11:30:00+09:00' })] })
    expect(out).toContain('진행 중')
    expect(out).toContain('시작 후 30분')
    expect(out).not.toContain('최근 5주에 올라온 기획이 없어요')
  })

  it('멈춘 루틴은 문제 정류장이다', () => {
    const out = render([], { starts: [makeStart({ startedAt: '2026-10-27T01:00:00+09:00' })] })
    expect(out).toContain('루틴이 멈췄어요')
    expect(out).toContain('border-destructive')
  })

  it('시험 묶음 포함이면 정류장 링크에 sample=1이 이어진다', () => {
    const out = render([makeBundle({ id: 'b1', isSample: true, statuses: ['arrived', 'scheduled'] })], { includeSample: true })
    expect(out).toContain('href="/admin/ops-inbox/b1?sample=1"')
    expect(out).toContain('href="/admin/ops-schedule?sample=1"')
  })
})

describe('빈 상태와 가로 스크롤', () => {
  it('5주 모두 올라온 기획이 없으면 한 줄 안내 + 받은 기획함 링크이고 격자는 없다', () => {
    const out = render([])
    expect(out).toContain('최근 5주에 올라온 기획이 없어요')
    expect(out).toContain('href="/admin/ops-inbox"')
    expect(out).not.toContain('role="table"')
  })

  it('지도 영역만 가로 스크롤하고 최소 폭은 980px이다', () => {
    const out = render([makeBundle({ statuses: ['arrived'] })])
    expect(out).toContain('overflow-x-auto')
    expect(out).toContain('min-w-[980px]')
    expect(out).toContain('grid-cols-[120px_repeat(7,minmax(0,1fr))]')
  })

  it('한국어 줄바꿈 클래스가 있다', () => {
    expect(render([makeBundle({ statuses: ['arrived'] })])).toContain('break-keep wrap-break-word')
  })
})

describe('제목 안전', () => {
  it('기획 제목은 HTML로 해석되지 않는다', () => {
    const out = render([makeBundle({ title: '<script>alert(1)</script>', statuses: ['arrived'] })])
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })
})
