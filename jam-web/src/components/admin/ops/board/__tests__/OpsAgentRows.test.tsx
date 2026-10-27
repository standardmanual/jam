/**
 * 운영 상황판 에이전트 줄·일정 띠 (티켓 20261026_2023 2회차, 어드민 상황판 PRD §6.5)
 *
 * 서버 렌더(`renderToStaticMarkup`)로 그린 모양을 고정한다. 줄·띠는 실제 계산(`agentRowsOf`·`weekStripOf`)으로 만든다.
 *
 * 지키는 것: 네 줄의 이름·역할·한 줄·상태 글자·다음 실행, 대기 중이면 상태 글자 없음, 일정 띠 7칸과 화·수·목 표시, 오늘 표시(테두리 + 글자 + aria-current).
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { agentRowsOf, weekStripOf } from '@/lib/admin/opsBoard/agentRows'
import { computeWeekFlow } from '@/lib/admin/opsBoard/weekFlow'
import { NOW, makeBundle, makeStage, makeStart } from '@/lib/admin/opsBoard/__tests__/fixtures'
import type { ScheduledJobDef } from '@/lib/admin/scheduledJobs.generated'
import { OpsAgentRows } from '../OpsAgentRows'

const flat = (node: ReactElement) => renderToStaticMarkup(node).replace(/<!-- -->/g, '')

const OFF: ScheduledJobDef[] = [{ name: '주간', enabled: false, schedule: { type: 'weekly', weekday: 2, hour: 9, minute: 0 } }]
const ON: ScheduledJobDef[] = [{ ...OFF[0], enabled: true }]

function render(input: { bundles?: ReturnType<typeof makeBundle>[]; starts?: ReturnType<typeof makeStart>[]; jobs?: ScheduledJobDef[] } = {}) {
  const thisWeek = computeWeekFlow({ bundles: input.bundles ?? [], starts: input.starts ?? [], now: NOW })[0]
  return flat(<OpsAgentRows agents={agentRowsOf({ thisWeek, now: NOW, jobs: input.jobs ?? OFF })} strip={weekStripOf(NOW)} />)
}

describe('에이전트 줄', () => {
  it('네 줄의 이름·역할이 순서대로 있다', () => {
    const out = render()
    const names = ['윤진', '윈터', '혜린', '카즈하']
    expect(names.map((name) => out.indexOf(name))).toEqual([...names.map((name) => out.indexOf(name))].sort((a, b) => a - b))
    for (const role of ['기획', '세계관 검수', '밸런스 점검', '결과']) expect(out).toContain(role)
    expect((out.match(/>대기 중</g) ?? []).length).toBe(4)
  })

  it('예약이 꺼져 있으면 줄마다 「예약 꺼짐」, 켜져 있으면 다음 실행 시각이다', () => {
    expect((render().match(/예약 꺼짐/g) ?? []).length).toBe(4)
    const on = render({ jobs: ON })
    expect(on).not.toContain('예약 꺼짐')
    expect((on.match(/화 09:00/g) ?? []).length).toBe(4)
  })

  it('시작 기록이 있으면 기획 줄이 「진행 중 · 시작 후 N분」 + 진행 중 상태 글자다', () => {
    const out = render({ starts: [makeStart({ startedAt: '2026-10-28T11:30:00+09:00' })] })
    expect(out).toContain('진행 중 · 시작 후 30분')
    expect(out).toContain('>진행 중<')
  })

  it('단계 기록이 있으면 결과 글과 「끝남」 상태 글자다', () => {
    const out = render({ bundles: [makeBundle({ statuses: ['arrived'], stages: [makeStage('plan', { outCount: 8 })] })] })
    expect(out).toContain('8건')
    expect(out).toContain('끝남')
    expect(out).toContain('기록 없음')
  })

  it('멈춘 루틴은 문제 상태 글자와 함께 움직인다', () => {
    const out = render({ starts: [makeStart({ startedAt: '2026-10-27T01:00:00+09:00' })] })
    expect(out).toContain('루틴이 멈췄어요')
    expect(out).toContain('문제')
    expect(out).toContain('motion-safe:animate-pulse')
  })

  it('한 줄을 넘기지 않게 말줄임하고 한국어 줄바꿈 클래스가 있다', () => {
    const out = render()
    expect(out).toContain('truncate')
    expect(out).toContain('break-keep wrap-break-word')
  })
})

describe('일정 띠', () => {
  it('월~일 7칸에 화(기획)·수(결정 마감)·목(공개) 표시가 있다', () => {
    const out = render()
    const strip = out.slice(out.indexOf('aria-label="이번 주 일정"'))
    expect((strip.match(/<li/g) ?? []).length).toBe(7)
    for (const text of ['기획', '결정 마감', '공개']) expect(strip).toContain(text)
    for (const weekday of ['월', '화', '수', '목', '금', '토', '일']) expect(strip).toContain(`>${weekday}<`)
  })

  it('오늘(수요일) 칸은 굵은 테두리·「오늘」 글자·aria-current다', () => {
    const out = render()
    expect(out.match(/aria-current="date"/g)).toHaveLength(1)
    expect(out).toContain('border-2 border-primary')
    expect(out).toContain('>오늘<')
  })
})
