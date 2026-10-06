/**
 * 운영 홈(S1)의 계산 (티켓 20261006_1340 ②-b, 상위 20260930_1502 「채원 S1·S4 사전 판정 (2026-10-06 승인)」, 순수 함수 — DB 접근 없음).
 *
 * 화면 부품(`OpsWeekStatus`·`OpsSignalPanel`)이 그리기만 하도록 숫자와 구역 나누기를 여기서 한다. 서버·클라이언트 모두 불러온다.
 *
 * ## 이번 주 상태 (`computeWeekStatus`)
 * - 「이번 주」는 그 주 월~일(KST)에 기간이 하루라도 걸치는 항목이다.
 * - 세는 상태(도착~종료)의 항목은 날짜별 구성(`composition.ts`)에서 읽는다. 실제 카드·미션과 합친 항목은 합친 칸의 값, 곧 **실제 카드의 기간**으로
 *   겹침을 본다(상위 가정 1). 멈춘 상태(실패·반려·취소)는 구성에 올라가지 않으므로 항목 자기 기간으로 겹침을 본다.
 * - 다섯 칸: 승인 대기(도착 + 검토중) › 예약 등록 대기(승인됨 + 준비중, `stageOfItemStatus`의 `prepare`) › 예약됨 › 게재중 | 실패.
 *   단계 매핑은 `bundleStatus.ts`의 `stageOfItemStatus`·`stageCounts` 한 곳이다(여기서 다시 정하지 않는다). 실패는 단계가 아니라 따로 센다.
 * - 다섯 칸 밖: 종료·반려·취소는 각주로 따로 센다(상위 가정 4). 「패턴 제안」은 유저에게 나가는 항목이 아니라 날짜 구성에 없으므로 따로 센다.
 *   공개 시각을 읽을 수 없는 항목은 어느 주에도 둘 수 없어 빠지고 그 수를 각주로 알린다 — 이 둘은 그 주 묶음(`week` 칸이 같은 묶음)의 항목만 센다.
 * - 시험 묶음은 `includeSample`일 때만 센다. 센 숫자 가운데 시험 묶음에서 온 수를 칸마다 따로 담아 「시험 N개 포함」을 보인다.
 * - 10개 밖 상태 값은 세지 않는다(`stageCounts`와 같다).
 *
 * ## 다음 주 줄 (`showsNextWeekRow`)
 * 금요일부터(S7 `nextWeekCheckFromWeekday`) 또는 다음 주 기획이 이미 도착했으면 보인다. 신호 검사 범위와 같은 판정 함수(`checksNextWeek`)를 쓴다(상위 가정 6).
 *
 * ## 신호 구역 (`zoneSignals`)
 * 신호 13종은 뜸·이상 없음·확인 안 함 가운데 **한 구역에만** 들어간다. 뜬 신호는 중단 → 주의 → 참고 순서이고 같은 수준은 카탈로그 순서다.
 * 머리 숫자는 「종」 단위다(상위 가정 5). 뜬 신호가 0이어도 확인 안 함이 있으면 「이상 없어요」라고 쓰지 않는다.
 */
import { mondayOfWeek } from '@/lib/admin/cronSchedule'
import { stageCounts } from '@/lib/admin/opsInbox/bundleStatus'
import { OPS_ITEM_STATUSES } from '@/lib/admin/opsInbox/constants'
import { kstDateKey } from '@/lib/admin/opsInbox/labels'
import type { OpsSignalLevel, OpsSignalOutcome } from '@/lib/admin/opsSignals/catalog'
import {
  OPS_STOPPED_ITEM_STATUSES,
  checksNextWeek,
  isoWeekOfDate,
  parseTime,
  type DayComposition,
  type SignalBundleInput,
  type SignalBundleItemInput,
} from '@/lib/admin/opsSignals/composition'
import { shiftDateStr, todayKstDateString } from '@/lib/admin/today-calendar'

const KNOWN_STATUSES: ReadonlySet<string> = new Set(OPS_ITEM_STATUSES)
const PATTERN_PROPOSAL_KIND = 'pattern_proposal'

// ── 이번 주 상태 ─────────────────────────────────────────────────────────────────────────────────

/** 이번 주 상태의 다섯 칸. 순서가 곧 화면 순서다(승인 대기 › 예약 등록 대기 › 예약됨 › 게재중 | 실패). */
export const WEEK_CELL_KEYS = ['waiting', 'prepare', 'scheduled', 'live', 'failed'] as const
export type WeekCellKey = (typeof WEEK_CELL_KEYS)[number]

/** 칸 이름(화면 글자). */
export const WEEK_CELL_LABELS: Record<WeekCellKey, string> = {
  waiting: '승인 대기',
  prepare: '예약 등록 대기',
  scheduled: '예약됨',
  live: '게재중',
  failed: '실패',
}

export interface WeekCell {
  /** 칸의 항목 수(시험 묶음을 포함해서 볼 때는 시험이 더해진 합계다). */
  count: number
  /** 그 가운데 시험 묶음의 항목 수. 시험을 빼고 보면 늘 0이다. */
  sample: number
}

export interface WeekStatus {
  /** 월요일(KST `YYYY-MM-DD`). */
  weekStart: string
  /** 일요일. */
  weekEnd: string
  cells: Record<WeekCellKey, WeekCell>
  /** 승인 대기의 속내: 새로 도착 + 검토중 = `cells.waiting.count`. */
  waitingDetail: { arrived: number; reviewing: number }
  /** 예약 등록 대기의 속내: 승인됨 + 준비중 = `cells.prepare.count`. */
  prepareDetail: { approved: number; preparing: number }
  /** 다섯 칸 밖 상태: 이번 주에 겹치는 종료·반려·취소 항목 수. */
  ended: number
  rejected: number
  cancelled: number
  /** 이번 주 묶음의 항목 가운데 공개 시각을 읽을 수 없어 어느 칸에도 못 둔 항목 수(패턴 제안은 뺀다). */
  noStart: number
  /** 이번 주 묶음의 패턴 제안 항목 수(날짜에 올라가는 항목이 아니라 다섯 칸에 세지 않는다). */
  patternProposals: number
  /** 이번 주에 겹치는 항목 수 = 다섯 칸 + 종료·반려·취소. */
  overlapping: number
  /** 다섯 칸 가운데 시험 묶음의 항목 수 합계. */
  sampleInCells: number
}

export interface WeekStatusInput {
  bundles: readonly SignalBundleInput[]
  /** 그 주 7일을 모두 담은 날짜별 구성(`loadDayCompositions`). 다른 날짜가 섞여 있어도 그 주만 쓴다. */
  compositions: readonly DayComposition[]
  /** 그 주 월요일(KST `YYYY-MM-DD`). */
  weekStart: string
  /** 시험 묶음을 포함해서 셀지. 기본은 `false`다. */
  includeSample?: boolean
}

/** 항목 자기 기간(공개 시각~종료 시각, 종료가 없거나 시작보다 이르면 공개한 날 하루)이 그 주(KST 날짜)에 걸치는가. 하루 겹침 판정(`composition.ts`)과 같다. */
function itemOverlapsWeek(item: Pick<SignalBundleItemInput, 'startsAt' | 'endsAt'>, weekStart: string, weekEnd: string): boolean {
  const startMs = parseTime(item.startsAt)
  if (startMs === null) return false
  const startDate = kstDateKey(item.startsAt)
  if (startDate === null) return false
  const endMs = parseTime(item.endsAt)
  const endDate = endMs === null || endMs < startMs ? startDate : (kstDateKey(item.endsAt) ?? startDate)
  return startDate <= weekEnd && endDate >= weekStart
}

function countStatus(statuses: readonly string[], status: string): number {
  return statuses.filter((value) => value === status).length
}

/** 이번 주(월~일) 상태 다섯 칸과 각주 숫자를 센다. */
export function computeWeekStatus(input: WeekStatusInput): WeekStatus {
  const includeSample = input.includeSample === true
  const weekStart = input.weekStart
  const weekEnd = shiftDateStr(weekStart, 6)
  const weekDates = new Set<string>()
  for (let i = 0; i < 7; i++) weekDates.add(shiftDateStr(weekStart, i))
  const week = isoWeekOfDate(weekStart)

  // 이번 주에 겹치는 항목(항목 ID → 상태·시험 여부). 같은 항목이 여러 날에 걸쳐도 한 번만 센다.
  const items = new Map<string, { status: string; isSample: boolean }>()
  const add = (id: string, status: string, isSample: boolean) => {
    if (isSample && !includeSample) return
    if (!items.has(id)) items.set(id, { status, isSample })
  }

  // 세는 상태: 날짜 구성의 칸. 합친 칸은 실제 카드·미션의 기간이 이 주에 걸치는지로 정해져 있다.
  for (const day of input.compositions) {
    if (!weekDates.has(day.date)) continue
    for (const card of day.cards) {
      if (card.source === 'bundle' && card.status !== null) add(card.id, card.status, card.isSample)
    }
    for (const entry of day.bundleItems) add(entry.itemId, entry.status, entry.isSample)
  }

  let noStart = 0
  let patternProposals = 0
  for (const bundle of input.bundles) {
    if (bundle.isSample && !includeSample) continue
    const inThisWeek = bundle.week === week
    for (const item of bundle.items) {
      if (!KNOWN_STATUSES.has(item.status)) continue
      if (item.kind === PATTERN_PROPOSAL_KIND) {
        if (inThisWeek) patternProposals += 1
        continue
      }
      // 멈춘 상태는 구성에 올라가지 않아 항목 자기 기간으로 겹침을 본다.
      if (OPS_STOPPED_ITEM_STATUSES.includes(item.status) && itemOverlapsWeek(item, weekStart, weekEnd)) {
        add(item.id, item.status, bundle.isSample)
      }
      if (inThisWeek && parseTime(item.startsAt) === null) noStart += 1
    }
  }

  const all = [...items.values()]
  const sampleOnly = all.filter((entry) => entry.isSample)
  const statuses = all.map((entry) => entry.status)
  const sampleStatuses = sampleOnly.map((entry) => entry.status)
  const stages = stageCounts(statuses)
  const sampleStages = stageCounts(sampleStatuses)

  const cells: Record<WeekCellKey, WeekCell> = {
    waiting: { count: stages.arrived + stages.review, sample: sampleStages.arrived + sampleStages.review },
    prepare: { count: stages.prepare, sample: sampleStages.prepare },
    scheduled: { count: stages.scheduled, sample: sampleStages.scheduled },
    live: { count: stages.live, sample: sampleStages.live },
    failed: { count: countStatus(statuses, 'failed'), sample: countStatus(sampleStatuses, 'failed') },
  }
  const ended = stages.ended
  const rejected = countStatus(statuses, 'rejected')
  const cancelled = countStatus(statuses, 'cancelled')

  return {
    weekStart,
    weekEnd,
    cells,
    waitingDetail: { arrived: countStatus(statuses, 'arrived'), reviewing: countStatus(statuses, 'reviewing') },
    prepareDetail: { approved: countStatus(statuses, 'approved'), preparing: countStatus(statuses, 'preparing') },
    ended,
    rejected,
    cancelled,
    noStart,
    patternProposals,
    overlapping: WEEK_CELL_KEYS.reduce((sum, key) => sum + cells[key].count, 0) + ended + rejected + cancelled,
    sampleInCells: WEEK_CELL_KEYS.reduce((sum, key) => sum + cells[key].sample, 0),
  }
}

/** 지금(KST)이 속한 주의 월요일. */
export function weekStartOf(now: Date): string {
  return mondayOfWeek(todayKstDateString(now))
}

export interface NextWeekRowInput {
  now: Date
  /** 읽은 묶음. 읽지 못했으면 null이다(다음 주 기획이 도착했는지 모르므로 요일 판정만 쓴다). */
  bundles: readonly SignalBundleInput[] | null
  /** S7에서 바꿀 수 있는 기준값 `nextWeekCheckFromWeekday`(`loadSignalOverrides`가 읽고 기본은 금요일 5). */
  nextWeekCheckFromWeekday: number
  includeSample?: boolean
}

/** 다음 주 줄을 보일지. 신호 검사 범위가 다음 주를 보는 날과 같다(`checksNextWeek`). */
export function showsNextWeekRow(input: NextWeekRowInput): boolean {
  const nextWeek = isoWeekOfDate(shiftDateStr(weekStartOf(input.now), 7))
  const includeSample = input.includeSample === true
  const nextWeekArrived =
    input.bundles !== null && input.bundles.some((bundle) => (includeSample || !bundle.isSample) && bundle.week === nextWeek)
  return checksNextWeek(input.now, { nextWeekArrived, nextWeekCheckFromWeekday: input.nextWeekCheckFromWeekday })
}

// ── 신호 구역 ────────────────────────────────────────────────────────────────────────────────────

/** 수준 순서: 중단 → 주의 → 참고. */
const LEVEL_ORDER: Record<OpsSignalLevel, number> = { stop: 0, warn: 1, info: 2 }

export interface SignalZones {
  /** 뜬 신호. 중단 → 주의 → 참고 순서, 같은 수준은 카탈로그 순서다. */
  raised: OpsSignalOutcome[]
  /** 이상 없는 신호(계산했고 걸린 것이 없다). 카탈로그 순서다. */
  clear: OpsSignalOutcome[]
  /** 확인 안 함(`not_built`·`not_started`·`load_failed`). 카탈로그 순서다. */
  unchecked: OpsSignalOutcome[]
}

/** 신호를 세 구역으로 나눈다. 한 신호는 정확히 한 구역에만 들어간다. */
export function zoneSignals(signals: readonly OpsSignalOutcome[]): SignalZones {
  const raised = signals.filter((signal) => signal.state === 'raised').sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
  return {
    raised,
    clear: signals.filter((signal) => signal.state === 'clear'),
    unchecked: signals.filter((signal) => signal.state === 'unchecked'),
  }
}

/** 신호 머리 숫자: 수준마다 뜬 신호의 「종」 수(결과 건수가 아니다). */
export function signalLevelCounts(signals: readonly OpsSignalOutcome[]): Record<OpsSignalLevel, number> {
  const counts: Record<OpsSignalLevel, number> = { stop: 0, warn: 0, info: 0 }
  for (const signal of signals) {
    if (signal.state === 'raised') counts[signal.level] += 1
  }
  return counts
}

/** 뜬 신호가 0일 때의 문장. 확인 안 함이 있으면 「이상 없어요」라고 쓰지 않는다(확인하지 않은 신호를 안전하다고 오해하지 않게). */
export function noRaisedSignalsText(uncheckedCount: number): string {
  return uncheckedCount > 0 ? `뜬 신호가 없어요. 아직 확인하지 않은 신호가 ${uncheckedCount}종 있어요` : '뜬 신호가 없어요'
}
