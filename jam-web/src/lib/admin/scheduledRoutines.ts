/**
 * 어드민 메인 캘린더의 Claude 예약 루틴 계산 (티켓 20260924_0905)
 *
 * `scheduledJobs.generated.ts`(원천은 `.claude/skills/jam-work/references/scheduled-jobs.md`,
 * `scripts/gen-scheduled-jobs.mjs`가 생성)가 유일한 원천이다. 이 파일은 그 정의를 "보고 있는
 * 주(weekStart)의 실제 발생 목록(날짜·시각·라벨·켜짐 여부)"으로 바꾸는 순수 함수만 담는다.
 *
 * 크론(`cronSchedule.ts`)과 달리 "매월 N일" 루틴은 특정 요일에 고정되지 않고 달력상의
 * 날짜에 매인다 — 그래서 요일만으로는 항상 같은 결과를 낼 수 없고, 보고 있는 주의 실제
 * 7개 날짜를 받아 그중 며칠에 그 날짜(day)가 있는지 확인해야 한다.
 */
import { shiftDateStr } from './today-calendar'
import { SCHEDULED_JOBS, type ScheduledJobDef } from './scheduledJobs.generated'

export interface RoutineOccurrence {
  /** 'YYYY-MM-DD' */
  date: string
  /** "09:00"처럼 화면에 그대로 찍을 시각 라벨 */
  time: string
  label: string
  /** 꺼진 루틴이면 false */
  enabled: boolean
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** weekStart(월요일)부터 schedule.weekday(cron 표준과 동일하게 0=일..6=토)까지 며칠 지났는지(0~6) */
function offsetFromMonday(weekday: number): number {
  return (weekday - 1 + 7) % 7
}

function occurrencesForJob(job: ScheduledJobDef, weekStart: string): RoutineOccurrence[] {
  const { schedule } = job
  switch (schedule.type) {
    case 'daily':
      return Array.from({ length: 7 }, (_, i) => ({
        date: shiftDateStr(weekStart, i),
        time: formatTime(schedule.hour, schedule.minute),
        label: job.name,
        enabled: job.enabled,
      }))

    case 'weekly':
      return [
        {
          date: shiftDateStr(weekStart, offsetFromMonday(schedule.weekday)),
          time: formatTime(schedule.hour, schedule.minute),
          label: job.name,
          enabled: job.enabled,
        },
      ]

    case 'weekly-labeled': {
      const date = shiftDateStr(weekStart, offsetFromMonday(schedule.weekday))
      return schedule.labels.map((sub) => ({
        date,
        time: formatTime(sub.hour, sub.minute),
        label: `${job.name}(${sub.label})`,
        enabled: job.enabled,
      }))
    }

    case 'monthly': {
      const occurrences: RoutineOccurrence[] = []
      for (let i = 0; i < 7; i++) {
        const date = shiftDateStr(weekStart, i)
        if (Number(date.slice(8, 10)) === schedule.day) {
          occurrences.push({ date, time: formatTime(schedule.hour, schedule.minute), label: job.name, enabled: job.enabled })
        }
      }
      return occurrences
    }

    default: {
      const exhaustive: never = schedule
      throw new Error(`알 수 없는 schedule.type: ${JSON.stringify(exhaustive)}`)
    }
  }
}

/** weekStart(월요일, 'YYYY-MM-DD') 주간에 대해 예약 루틴 발생 목록을 만든다. */
export function weeklyRoutineOccurrences(
  weekStart: string,
  jobs: ScheduledJobDef[] = SCHEDULED_JOBS
): RoutineOccurrence[] {
  return jobs.flatMap((job) => occurrencesForJob(job, weekStart))
}

/** 캘린더 항목 id. 같은 날짜에 시각이 다른 항목끼리 겹치지 않도록 시각을 포함한다(티켓 20260924_0930). */
export function routineOccurrenceId(occ: RoutineOccurrence): string {
  return `routine-${occ.date}-${occ.time}-${occ.label}`
}
