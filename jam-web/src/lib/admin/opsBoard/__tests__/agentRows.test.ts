/**
 * 에이전트 줄·일정 띠 계산 (티켓 20261026_2023 2회차, 어드민 상황판 PRD §6.5)
 *
 * 지키는 것: 이번 주 흐름 행의 열에서 읽은 한 줄(진행 중·결과·기록 없음·멈춤·대기 중), 다음 실행(꺼짐·켜짐), 일정 띠 7칸과 오늘.
 */
import { describe, expect, it } from 'vitest'
import { agentRowsOf, nextRoutineRunLabel, weekStripOf } from '@/lib/admin/opsBoard/agentRows'
import { computeWeekFlow } from '@/lib/admin/opsBoard/weekFlow'
import type { ScheduledJobDef } from '@/lib/admin/scheduledJobs.generated'
import { NOW, makeBundle, makeStage, makeStart } from './fixtures'

const ON: ScheduledJobDef[] = [{ name: '주간', enabled: true, schedule: { type: 'weekly', weekday: 2, hour: 9, minute: 0 } }]
const OFF: ScheduledJobDef[] = [{ ...ON[0], enabled: false }]

const thisWeekOf = (input: Parameters<typeof computeWeekFlow>[0]) => computeWeekFlow(input)[0]

describe('에이전트 줄', () => {
  it('네 줄이 이름·역할 순서대로 나온다', () => {
    const rows = agentRowsOf({ thisWeek: undefined, now: NOW, jobs: OFF })
    expect(rows.map((row) => `${row.name}·${row.role}`)).toEqual(['윤진·기획', '윈터·세계관 검수', '혜린·밸런스 점검', '카즈하·결과'])
  })

  it('이번 주 행이 없으면 모두 대기 중이고 상태 점이 없다', () => {
    const rows = agentRowsOf({ thisWeek: undefined, now: NOW, jobs: OFF })
    for (const row of rows) expect(row).toMatchObject({ line: '대기 중', screenState: null })
  })

  it('시작 기록만 있으면 기획은 「진행 중 · 시작 후 N분」이고 나머지는 대기 중이다', () => {
    const thisWeek = thisWeekOf({ bundles: [], starts: [makeStart({ startedAt: '2026-10-28T11:30:00+09:00' })], now: NOW })
    const rows = agentRowsOf({ thisWeek, now: NOW, jobs: OFF })
    expect(rows[0]).toMatchObject({ line: '진행 중 · 시작 후 30분', screenState: 'progress' })
    expect(rows[1].line).toBe('대기 중')
  })

  it('멈춘 루틴은 「진행 중」이라 쓰지 않고 문제로 알린다', () => {
    const thisWeek = thisWeekOf({ bundles: [], starts: [makeStart({ startedAt: '2026-10-27T01:00:00+09:00' })], now: NOW })
    expect(agentRowsOf({ thisWeek, now: NOW, jobs: OFF })[0]).toMatchObject({ line: '루틴이 멈췄어요', screenState: 'problem' })
  })

  it('묶음이 있으면 단계 기록의 결과가 한 줄이 되고 기록이 없으면 「기록 없음」이다', () => {
    const bundle = makeBundle({ statuses: ['arrived'], stages: [makeStage('plan', { outCount: 8 }), makeStage('world_review', { excludedCount: 2 })] })
    const rows = agentRowsOf({ thisWeek: thisWeekOf({ bundles: [bundle], starts: [], now: NOW }), now: NOW, jobs: OFF })
    expect(rows[0]).toMatchObject({ line: '8건', screenState: 'done' })
    expect(rows[1]).toMatchObject({ line: '2건 뺌', screenState: 'done' })
    expect(rows[2]).toMatchObject({ line: '기록 없음', screenState: 'done' })
    expect(rows[3]).toMatchObject({ line: '대기 중', screenState: null })
  })

  it('결과 열에 종료 항목이 있으면 건수와 함께 진행 중으로 읽는다', () => {
    const bundle = makeBundle({ statuses: ['ended', 'ended'] })
    const rows = agentRowsOf({ thisWeek: thisWeekOf({ bundles: [bundle], starts: [], now: NOW }), now: NOW, jobs: OFF })
    expect(rows[3].line).toBe('진행 중 · 2건')
  })
})

describe('다음 실행', () => {
  it('「주간」 작업이 꺼져 있으면 「예약 꺼짐」이다', () => {
    expect(nextRoutineRunLabel(NOW, OFF)).toBe('예약 꺼짐')
  })

  it('작업이 목록에 없어도 「예약 꺼짐」이다', () => {
    expect(nextRoutineRunLabel(NOW, [])).toBe('예약 꺼짐')
  })

  it('켜져 있으면 다음 실행 요일·시각이다(이번 주 화요일이 지났으면 다음 주 화요일)', () => {
    expect(nextRoutineRunLabel(NOW, ON)).toBe('화 09:00') // NOW는 수요일이라 다음 주 화요일
    expect(nextRoutineRunLabel(new Date('2026-10-26T12:00:00+09:00'), ON)).toBe('화 09:00') // 월요일이면 이번 주 화요일
  })

  it('에이전트 줄에 같은 문구가 붙는다', () => {
    expect(agentRowsOf({ thisWeek: undefined, now: NOW, jobs: ON })[0].nextRun).toBe('화 09:00')
  })
})

describe('일정 띠', () => {
  it('월~일 7칸이고 화·수·목에 표시가 붙는다', () => {
    const strip = weekStripOf(NOW)
    expect(strip.map((day) => day.weekday)).toEqual(['월', '화', '수', '목', '금', '토', '일'])
    expect(strip[0].date).toBe('2026-10-26')
    expect(strip.map((day) => day.marker)).toEqual([null, '기획', '결정 마감', '공개', null, null, null])
  })

  it('오늘 칸 하나만 isToday다', () => {
    const strip = weekStripOf(NOW) // 수요일
    expect(strip.filter((day) => day.isToday).map((day) => day.weekday)).toEqual(['수'])
  })

  it('일요일 밤(KST)도 그 주 안에서 오늘을 찾는다', () => {
    const strip = weekStripOf(new Date('2026-11-01T23:30:00+09:00'))
    expect(strip[0].date).toBe('2026-10-26')
    expect(strip.find((day) => day.isToday)?.weekday).toBe('일')
  })
})
