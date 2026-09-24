/**
 * scheduledRoutines.ts — Claude 예약 루틴을 "그 주의 발생 목록"으로 바꾸는 순수 함수 유닛테스트
 * (티켓 20260924_0905)
 *
 * 지키는 것:
 * 1. 주간(weekly) 루틴은 지정한 요일의 날짜 하나에만 발생한다
 * 2. 선별(daily) 루틴은 7일 모두에 발생한다
 * 3. 주간 배포 승인(weekly-labeled) 루틴은 같은 날짜에 라벨이 다른 항목 2개를 만들고, id가 겹치지 않는다
 * 4. 월간(monthly) 루틴은 그 날짜(N일)가 보고 있는 주에 들어 있을 때만 발생한다
 * 5. 꺼진 루틴은 enabled: false로 나온다
 * 6. 실제 생성 파일(SCHEDULED_JOBS) 기준으로도 완료 조건의 예시가 그대로 성립한다
 */
import { describe, it, expect } from 'vitest'
import { weeklyRoutineOccurrences, routineOccurrenceId } from '../scheduledRoutines'
import { SCHEDULED_JOBS, type ScheduledJobDef } from '../scheduledJobs.generated'

const MONDAY = '2026-09-21' // 2026-09-24(목)가 속한 주의 월요일

describe('weeklyRoutineOccurrences — 커스텀 정의', () => {
  it('weekly 루틴은 지정한 요일 날짜 하나에만 발생한다(화요일=2 → 09-22)', () => {
    const jobs: ScheduledJobDef[] = [
      { name: '주간', enabled: true, schedule: { type: 'weekly', weekday: 2, hour: 9, minute: 0 } },
    ]
    expect(weeklyRoutineOccurrences(MONDAY, jobs)).toEqual([
      { date: '2026-09-22', time: '09:00', label: '주간', enabled: true },
    ])
  })

  it('daily 루틴은 7일 전부에 발생한다', () => {
    const jobs: ScheduledJobDef[] = [{ name: '선별', enabled: true, schedule: { type: 'daily', hour: 6, minute: 0 } }]
    const occ = weeklyRoutineOccurrences(MONDAY, jobs)
    expect(occ).toHaveLength(7)
    expect(occ.every((o) => o.time === '06:00' && o.label === '선별' && o.enabled)).toBe(true)
    expect(occ.map((o) => o.date)).toEqual([
      '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27',
    ])
  })

  it('weekly-labeled 루틴은 같은 날짜에 라벨이 다른 항목 2개를 만들고, id가 서로 다르다', () => {
    const jobs: ScheduledJobDef[] = [
      {
        name: '주간 배포 승인',
        enabled: true,
        schedule: {
          type: 'weekly-labeled',
          weekday: 4, // 목요일
          labels: [
            { label: '확인', hour: 15, minute: 0 },
            { label: '실행', hour: 23, minute: 59 },
          ],
        },
      },
    ]
    const occ = weeklyRoutineOccurrences(MONDAY, jobs)
    expect(occ).toEqual([
      { date: '2026-09-24', time: '15:00', label: '주간 배포 승인(확인)', enabled: true },
      { date: '2026-09-24', time: '23:59', label: '주간 배포 승인(실행)', enabled: true },
    ])
    const ids = occ.map(routineOccurrenceId)
    expect(new Set(ids).size).toBe(2) // 같은 날짜인데도 id가 겹치지 않는다(티켓 20260924_0930)
  })

  it('monthly 루틴은 그 날짜(N일)가 보고 있는 주에 들어 있을 때만 발생한다', () => {
    const jobs: ScheduledJobDef[] = [
      { name: '월간', enabled: true, schedule: { type: 'monthly', day: 1, hour: 9, minute: 0 } },
    ]
    // 2026-09-21 주(21~27일)에는 1일이 없다
    expect(weeklyRoutineOccurrences('2026-09-21', jobs)).toEqual([])
    // 2026-09-28 주(28일~10/4일)에는 10월 1일(목)이 있다
    expect(weeklyRoutineOccurrences('2026-09-28', jobs)).toEqual([
      { date: '2026-10-01', time: '09:00', label: '월간', enabled: true },
    ])
  })

  it('꺼진 루틴은 enabled: false로 나온다', () => {
    const jobs: ScheduledJobDef[] = [
      { name: '선별', enabled: false, schedule: { type: 'daily', hour: 6, minute: 0 } },
    ]
    expect(weeklyRoutineOccurrences(MONDAY, jobs).every((o) => o.enabled === false)).toBe(true)
  })

  it('여러 루틴을 함께 넘기면 정의 순서대로 이어붙인다', () => {
    const jobs: ScheduledJobDef[] = [
      { name: 'A', enabled: true, schedule: { type: 'weekly', weekday: 1, hour: 1, minute: 0 } },
      { name: 'B', enabled: true, schedule: { type: 'weekly', weekday: 1, hour: 2, minute: 0 } },
    ]
    expect(weeklyRoutineOccurrences(MONDAY, jobs).map((o) => o.label)).toEqual(['A', 'B'])
  })
})

describe('weeklyRoutineOccurrences — 실제 생성 파일(SCHEDULED_JOBS) 기준 완료 조건', () => {
  it('2026-09-21 주: 주간(화 09:00)·선별(매일 06:00)이 켜짐 상태로, 목요일에 주간 배포 승인 2건(15:00 확인·23:59 실행)이 서로 다른 id로 나온다', () => {
    const occ = weeklyRoutineOccurrences(MONDAY, SCHEDULED_JOBS)

    const weekly = occ.find((o) => o.label === '주간')
    expect(weekly).toEqual({ date: '2026-09-22', time: '09:00', label: '주간', enabled: true })

    const triage = occ.filter((o) => o.label === '선별')
    expect(triage).toHaveLength(7)
    expect(triage.every((o) => o.time === '06:00' && o.enabled)).toBe(true)

    const deployItems = occ.filter((o) => o.date === '2026-09-24' && o.label.startsWith('주간 배포 승인'))
    expect(deployItems).toHaveLength(2)
    expect(deployItems.map((o) => o.time).sort()).toEqual(['15:00', '23:59'])
    expect(new Set(deployItems.map(routineOccurrenceId)).size).toBe(2)

    // 이 주(9/21~27)에는 매월 1일이 없어 월간 루틴은 발생하지 않는다
    expect(occ.some((o) => o.label === '월간')).toBe(false)
  })

  it('2026-09-28 주: 10월 1일(목)에 월간 루틴이 09:00으로 나온다', () => {
    const occ = weeklyRoutineOccurrences('2026-09-28', SCHEDULED_JOBS)
    expect(occ.filter((o) => o.label === '월간')).toEqual([
      { date: '2026-10-01', time: '09:00', label: '월간', enabled: true },
    ])
  })
})
