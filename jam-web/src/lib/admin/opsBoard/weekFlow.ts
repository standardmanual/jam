/**
 * 주간 흐름 지도의 계산 (티켓 20261026_2023 1회차, 어드민 상황판 PRD §6.2, 순수 함수 — DB 접근 없음).
 *
 * 7단계 × 최근 5주. 서버·클라이언트가 같이 불러오므로 서버 전용 모듈을 가져오지 않는다(입력은 `types.ts`).
 *
 * - 규칙 1(묶음이 있는 주): 항목 상태를 `stageOfItemStatus`로 센다. 결정 열 = 도착+검토중, 예약 열 = 승인됨+준비중+예약됨,
 *   게재 열 = 게재중, 결과 열 = 종료. 가장 앞에 항목이 있는 열보다 앞은 `done`, 항목이 있는 열은 개수와 함께 `current`
 *   (정류장이 여러 개일 수 있다), 항목이 없는 뒤쪽 열은 `upcoming`이다. 반려·취소는 어느 열에도 세지 않는다. 센 항목이
 *   하나도 없으면(전부 반려·취소, 항목 0개) 결정 열이 `done`이고 뒤는 `upcoming`이다. 실패 항목은 예약 열에 문제 정류장
 *   (`problemCount`)을 더한다.
 * - 규칙 2(기획·세계관 검수·밸런스 점검 열): 묶음의 단계 기록이 있으면 `done` + 결과 글, 없으면 `done` + 「기록 없음」.
 * - 규칙 3(묶음 없이 시작 기록만 있는 주): 기획 열이 `current` + 「진행 중 · 시작 후 N분」, 멈춤이면 「문제」.
 * - 한 주에 묶음이 여럿이면 항목·단계 기록을 합쳐 한 행으로 센다. 제목은 가장 늦게 받은 묶음의 제목이다.
 * - 시험 묶음은 `includeSample`일 때만 센다. 10개 밖 상태 값·패턴 제안 항목은 세지 않는다.
 */
import { mondayOfWeek } from '@/lib/admin/cronSchedule'
import { stageOfItemStatus } from '@/lib/admin/opsInbox/bundleStatus'
import { kstDateKey } from '@/lib/admin/opsInbox/labels'
import { isRoutineStalled } from '@/lib/admin/opsInbox/routineStart'
import { isoWeekOfDate } from '@/lib/admin/opsSignals/composition'
import { shiftDateStr, todayKstDateString } from '@/lib/admin/today-calendar'
import type { ScreenState } from '@/lib/admin/opsBoard/screenState'
import type { BoardBundleInput, BoardRoutineStartInput } from '@/lib/admin/opsBoard/types'

export const FLOW_COLUMN_KEYS = ['plan', 'world_review', 'balance_check', 'decision', 'schedule', 'live', 'result'] as const
export type FlowColumnKey = (typeof FLOW_COLUMN_KEYS)[number]

export interface FlowColumn {
  key: FlowColumnKey
  label: string
  /** 맡은 쪽(에이전트 이름 또는 시스템·나). */
  owner: string
  /** 「내 결정」 열만 참이다(바탕색으로 구분). */
  emphasis: boolean
}

/** 주간 흐름의 7개 열(PRD §6.2). 순서가 곧 화면 순서다. */
export const FLOW_COLUMNS: readonly FlowColumn[] = [
  { key: 'plan', label: '기획', owner: '윤진', emphasis: false },
  { key: 'world_review', label: '세계관 검수', owner: '윈터', emphasis: false },
  { key: 'balance_check', label: '밸런스 점검', owner: '혜린', emphasis: false },
  { key: 'decision', label: '내 결정', owner: '나', emphasis: true },
  { key: 'schedule', label: '예약', owner: '시스템', emphasis: false },
  { key: 'live', label: '게재', owner: '시스템', emphasis: false },
  { key: 'result', label: '결과', owner: '카즈하', emphasis: false },
]

export type FlowPhase = 'done' | 'current' | 'upcoming'

export interface FlowColumnState {
  key: FlowColumnKey
  phase: FlowPhase
  /** 정류장의 항목 수. 개수를 세지 않는 열(에이전트 열·지나온 열·앞으로 올 열)은 null이다. */
  count: number | null
  screenState: ScreenState | null
  /** 작게 쓰는 글(「2건 뺌」, 「기록 없음」, 「시작 후 12분」, 「루틴이 멈췄어요」). */
  note: string | null
  /** 이 열에 더하는 문제 정류장의 항목 수(예약 열의 실패 항목). 없으면 0이다. */
  problemCount: number
}

export interface WeekFlowRow {
  /** ISO 주차 `YYYY-Www`. */
  week: string
  /** 월요일(KST `YYYY-MM-DD`). */
  weekStart: string
  /** 일요일. */
  weekEnd: string
  /** 그 주에 가장 늦게 받은 묶음의 기획 제목. 묶음이 없거나 제목이 없으면 null이다. */
  title: string | null
  columns: FlowColumnState[]
  /** 그 주 실패 항목 수. */
  problemCount: number
}

export interface WeekFlowInput {
  bundles: readonly BoardBundleInput[]
  starts: readonly BoardRoutineStartInput[]
  now: Date
  /** 보일 주 수(이번 주부터 거꾸로). 기본 5. */
  weeks?: number
  includeSample?: boolean
}

const DEFAULT_WEEKS = 5
const PATTERN_PROPOSAL_KIND = 'pattern_proposal'
const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/

/** 묶음·시작 기록이 속한 주의 월요일(KST `YYYY-MM-DD`). `week` 칸이 맞지 않으면 받은 시각의 주로 본다. 둘 다 읽을 수 없으면 null이다. */
export function weekStartOfRecord(week: string | null | undefined, fallbackIso: string | null | undefined): string | null {
  const match = week ? WEEK_PATTERN.exec(week) : null
  if (match) {
    const weekNo = Number(match[2])
    if (weekNo >= 1 && weekNo <= 53) {
      // ISO 1주차는 1월 4일이 든 주다.
      return shiftDateStr(mondayOfWeek(`${match[1]}-01-04`), (weekNo - 1) * 7)
    }
  }
  const day = kstDateKey(fallbackIso)
  return day ? mondayOfWeek(day) : null
}

/** 센 항목: 10개 밖 상태·패턴 제안을 뺀 항목이다. */
function isCountedItem(status: string, kind: string | null): boolean {
  return kind !== PATTERN_PROPOSAL_KIND && (stageOfItemStatus(status) !== null || status === 'failed')
}

function upcoming(key: FlowColumnKey): FlowColumnState {
  return { key, phase: 'upcoming', count: null, screenState: null, note: null, problemCount: 0 }
}

function agentNote(sum: { excluded: number | null; out: number | null }): string | null {
  if (sum.excluded !== null && sum.excluded > 0) return `${sum.excluded}건 뺌`
  if (sum.out !== null) return `${sum.out}건`
  return null
}

function addNullable(total: number | null, value: number | null): number | null {
  if (value === null) return total
  return (total ?? 0) + value
}

type AgentKey = 'plan' | 'world_review' | 'balance_check'
const AGENT_KEYS: readonly AgentKey[] = ['plan', 'world_review', 'balance_check']

function agentColumn(key: AgentKey, bundles: readonly BoardBundleInput[]): FlowColumnState {
  const records = bundles.flatMap((bundle) => bundle.stages).filter((record) => record.stage === key)
  if (records.length === 0) return { key, phase: 'done', count: null, screenState: null, note: '기록 없음', problemCount: 0 }
  let excluded: number | null = null
  let out: number | null = null
  for (const record of records) {
    excluded = addNullable(excluded, record.excludedCount)
    out = addNullable(out, record.outCount)
  }
  return { key, phase: 'done', count: null, screenState: null, note: agentNote({ excluded, out }), problemCount: 0 }
}

/** 규칙 1: 묶음이 있는 주의 사람·시스템 열 넷(결정·예약·게재·결과). */
function stageColumns(bundles: readonly BoardBundleInput[]): { columns: FlowColumnState[]; failed: number } {
  let decision = 0
  let schedule = 0
  let live = 0
  let ended = 0
  let failed = 0
  for (const bundle of bundles) {
    for (const item of bundle.items) {
      if (!isCountedItem(item.status, item.kind)) continue
      if (item.status === 'failed') {
        failed += 1
        continue
      }
      switch (stageOfItemStatus(item.status)) {
        case 'arrived':
        case 'review':
          decision += 1
          break
        case 'prepare':
        case 'scheduled':
          schedule += 1
          break
        case 'live':
          live += 1
          break
        case 'ended':
          ended += 1
          break
      }
    }
  }

  const defs: Array<{ key: 'decision' | 'schedule' | 'live' | 'result'; count: number; problem: number; state: ScreenState }> = [
    { key: 'decision', count: decision, problem: 0, state: 'decide' },
    { key: 'schedule', count: schedule, problem: failed, state: 'progress' },
    { key: 'live', count: live, problem: 0, state: 'live' },
    { key: 'result', count: ended, problem: 0, state: 'done' },
  ]
  const frontmost = defs.findIndex((def) => def.count > 0 || def.problem > 0)

  const columns = defs.map((def, index): FlowColumnState => {
    if (frontmost === -1) {
      // 센 항목이 없다: 결정 열까지만 지나왔고 뒤는 아직이다.
      return index === 0 ? { ...upcoming(def.key), phase: 'done' } : upcoming(def.key)
    }
    if (index < frontmost) return { ...upcoming(def.key), phase: 'done' }
    if (def.count === 0 && def.problem === 0) return upcoming(def.key)
    return {
      key: def.key,
      phase: 'current',
      count: def.count > 0 ? def.count : null,
      screenState: def.count > 0 ? def.state : 'problem',
      note: null,
      problemCount: def.problem,
    }
  })
  return { columns, failed }
}

/** 규칙 3: 묶음 없이 시작 기록만 있는 주. 기록이 없으면 null이다. */
function startOnlyColumns(starts: readonly BoardRoutineStartInput[], now: Date): FlowColumnState[] | null {
  if (starts.length === 0) return null
  const stalled = starts.some((start) => isRoutineStalled(start.startedAt, start.bundleId, now))
  const latest = Math.max(...starts.map((start) => Date.parse(start.startedAt)).filter((time) => !Number.isNaN(time)))
  const minutes = Number.isFinite(latest) ? Math.max(0, Math.floor((now.getTime() - latest) / 60_000)) : 0
  return FLOW_COLUMN_KEYS.map((key): FlowColumnState => {
    if (key !== 'plan') return upcoming(key)
    return {
      key,
      phase: 'current',
      count: null,
      screenState: stalled ? 'problem' : 'progress',
      note: stalled ? '루틴이 멈췄어요' : `시작 후 ${minutes}분`,
      problemCount: 0,
    }
  })
}

/** 최근 `weeks`주(이번 주부터 거꾸로)의 주간 흐름 행. 월요일 기준 ISO 주차다. */
export function computeWeekFlow(input: WeekFlowInput): WeekFlowRow[] {
  const weeks = input.weeks ?? DEFAULT_WEEKS
  const includeSample = input.includeSample === true
  const thisMonday = mondayOfWeek(todayKstDateString(input.now))

  const bundlesByWeek = new Map<string, BoardBundleInput[]>()
  for (const bundle of input.bundles) {
    if (bundle.isSample && !includeSample) continue
    const start = weekStartOfRecord(bundle.week, bundle.receivedAt)
    if (!start) continue
    bundlesByWeek.set(start, [...(bundlesByWeek.get(start) ?? []), bundle])
  }
  const startsByWeek = new Map<string, BoardRoutineStartInput[]>()
  for (const start of input.starts) {
    if (start.bundleId) continue
    const monday = weekStartOfRecord(start.week, start.startedAt)
    if (!monday) continue
    startsByWeek.set(monday, [...(startsByWeek.get(monday) ?? []), start])
  }

  return Array.from({ length: weeks }, (_, index): WeekFlowRow => {
    const weekStart = shiftDateStr(thisMonday, -7 * index)
    const bundles = bundlesByWeek.get(weekStart) ?? []
    const base = { week: isoWeekOfDate(weekStart), weekStart, weekEnd: shiftDateStr(weekStart, 6) }

    if (bundles.length > 0) {
      const latest = [...bundles].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))[0]
      const { columns: stage, failed } = stageColumns(bundles)
      const agents = AGENT_KEYS.map((key) => agentColumn(key, bundles))
      return { ...base, title: latest.title, columns: [...agents, ...stage], problemCount: failed }
    }

    const startOnly = startOnlyColumns(startsByWeek.get(weekStart) ?? [], input.now)
    return { ...base, title: null, columns: startOnly ?? FLOW_COLUMN_KEYS.map(upcoming), problemCount: 0 }
  })
}
