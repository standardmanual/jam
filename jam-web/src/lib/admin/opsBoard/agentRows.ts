/**
 * 에이전트 줄과 이번 주 일정 띠의 계산 (티켓 20261026_2023 2회차, 어드민 상황판 PRD §6.5, 순수 함수 — DB 접근 없음).
 *
 * - 에이전트 줄: 윤진·윈터·혜린·카즈하 네 줄. 「지금 하는 일 또는 마지막 결과」는 이번 주 흐름 행의 해당 열에서 읽는다
 *   (`current`면 「진행 중 · 시작 후 N분」, `done`이면 `note`, 둘 다 아니면 「대기 중」).
 * - 다음 실행: `SCHEDULED_JOBS`의 「주간」 작업이 켜져 있으면 다음 실행 시각(KST), 꺼져 있으면 「예약 꺼짐」.
 * - 일정 띠: 월~일 7칸에 화(기획)·수(결정 마감)·목(공개)을 표시하고 오늘을 알린다.
 */
import { mondayOfWeek } from '@/lib/admin/cronSchedule'
import { SCHEDULED_JOBS, type ScheduledJobDef } from '@/lib/admin/scheduledJobs.generated'
import { weeklyRoutineOccurrences } from '@/lib/admin/scheduledRoutines'
import { shiftDateStr, todayKstDateString } from '@/lib/admin/today-calendar'
import type { ScreenState } from '@/lib/admin/opsBoard/screenState'
import type { FlowColumnKey, WeekFlowRow } from '@/lib/admin/opsBoard/weekFlow'

/** 다음 실행을 읽는 예약 작업 이름. */
export const WEEKLY_JOB_NAME = '주간'
export const ROUTINE_OFF_LABEL = '예약 꺼짐'
export const NO_NEXT_RUN_LABEL = '예정 없음'
const IDLE_LINE = '대기 중'
const DONE_FALLBACK_LINE = '완료'

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const

type AgentFlowKey = Extract<FlowColumnKey, 'plan' | 'world_review' | 'balance_check' | 'result'>

const AGENTS: ReadonlyArray<{ key: AgentFlowKey; name: string; role: string }> = [
  { key: 'plan', name: '윤진', role: '기획' },
  { key: 'world_review', name: '윈터', role: '세계관 검수' },
  { key: 'balance_check', name: '혜린', role: '밸런스 점검' },
  { key: 'result', name: '카즈하', role: '결과' },
]

export interface AgentRow {
  key: AgentFlowKey
  name: string
  role: string
  /** 지금 하는 일 또는 마지막 결과 한 줄. */
  line: string
  /** 점·글자로 보일 화면 상태. 대기 중이면 null이다. */
  screenState: ScreenState | null
  /** 다음 실행 예정(「화 09:00」), 꺼져 있으면 「예약 꺼짐」. */
  nextRun: string
}

/** 「주간」 작업의 다음 실행 문구. 꺼져 있거나 작업이 없으면 「예약 꺼짐」, 앞으로 올 실행이 없으면 「예정 없음」이다. */
export function nextRoutineRunLabel(now: Date, jobs: ScheduledJobDef[] = SCHEDULED_JOBS): string {
  const job = jobs.find((def) => def.name === WEEKLY_JOB_NAME)
  if (!job || !job.enabled) return ROUTINE_OFF_LABEL
  const thisMonday = mondayOfWeek(todayKstDateString(now))
  const next = [thisMonday, shiftDateStr(thisMonday, 7)]
    .flatMap((monday) => weeklyRoutineOccurrences(monday, [job]))
    .map((occ) => ({ occ, at: new Date(`${occ.date}T${occ.time}:00+09:00`).getTime() }))
    .filter((entry) => entry.at > now.getTime())
    .sort((a, b) => a.at - b.at)[0]
  if (!next) return NO_NEXT_RUN_LABEL
  // 달력 날짜는 UTC 자정으로 읽어야 요일이 밀리지 않는다(getUTCDay: 0=일). 월요일 시작 순서로 바꾼다.
  const weekday = WEEKDAY_LABELS[(new Date(`${next.occ.date}T00:00:00Z`).getUTCDay() + 6) % 7]
  return `${weekday} ${next.occ.time}`
}

/** 에이전트 네 줄. `thisWeek`은 이번 주 흐름 행(없으면 모두 대기 중). */
export function agentRowsOf(input: { thisWeek: WeekFlowRow | undefined; now: Date; jobs?: ScheduledJobDef[] }): AgentRow[] {
  const nextRun = nextRoutineRunLabel(input.now, input.jobs)
  return AGENTS.map((agent): AgentRow => {
    const column = input.thisWeek?.columns.find((col) => col.key === agent.key)
    const base = { key: agent.key, name: agent.name, role: agent.role, nextRun }
    if (!column || column.phase === 'upcoming') return { ...base, line: IDLE_LINE, screenState: null }
    if (column.phase === 'done') return { ...base, line: column.note ?? DONE_FALLBACK_LINE, screenState: 'done' }
    // 멈춘 루틴은 「진행 중」이라 쓰지 않는다.
    if (column.screenState === 'problem') return { ...base, line: column.note ?? '문제가 있어요', screenState: 'problem' }
    const detail = column.note ?? (column.count !== null ? `${column.count}건` : null)
    return { ...base, line: detail ? `진행 중 · ${detail}` : '진행 중', screenState: column.screenState ?? 'progress' }
  })
}

export interface WeekStripDay {
  /** KST `YYYY-MM-DD`. */
  date: string
  /** 「월」~「일」. */
  weekday: string
  /** 날짜의 일(1~31). */
  day: number
  /** 그날의 운영 표시(화 기획 · 수 결정 마감 · 목 공개). 없으면 null이다. */
  marker: string | null
  isToday: boolean
}

const WEEK_MARKERS: Record<number, string> = { 1: '기획', 2: '결정 마감', 3: '공개' }

/** 이번 주 월~일 7칸. */
export function weekStripOf(now: Date): WeekStripDay[] {
  const today = todayKstDateString(now)
  const monday = mondayOfWeek(today)
  return WEEKDAY_LABELS.map((weekday, index): WeekStripDay => {
    const date = shiftDateStr(monday, index)
    return { date, weekday, day: Number(date.slice(8, 10)), marker: WEEK_MARKERS[index] ?? null, isToday: date === today }
  })
}
