/**
 * 내 차례 카드의 계산 (티켓 20261026_2023 1회차, 어드민 상황판 PRD §6.1, 순수 함수 — DB 접근 없음).
 *
 * 내 차례에는 「결정 필요」와 「문제」(실패 항목, 루틴 멈춤)만 뜬다. 카드 수가 상단 바 숫자다(`myTurnCount`).
 * 서버·클라이언트가 같이 불러오므로 서버 전용 모듈을 가져오지 않는다(입력은 `types.ts`).
 *
 * - 결정 필요: 묶음마다 도착·검토중 항목이 있으면 한 장. 패턴 제안도 결정할 항목이라 센다. 마감은 그 묶음 주의 수요일 18:00(KST).
 * - 문제: 실패 항목이 있는 묶음마다 한 장, 멈춘 루틴 시작 기록마다 한 장.
 * - 정렬: 문제 → 결정 필요. 결정 필요는 마감이 이른 순, 문제는 최근 순.
 */
import { stageOfItemStatus } from '@/lib/admin/opsInbox/bundleStatus'
import { OPS_RATIONALE_KINDS, type OpsRationaleKind } from '@/lib/admin/opsInbox/constants'
import { isRoutineStalled } from '@/lib/admin/opsInbox/routineStart'
import { shiftDateStr } from '@/lib/admin/today-calendar'
import { weekStartOfRecord } from '@/lib/admin/opsBoard/weekFlow'
import type { BoardBundleInput, BoardRoutineStartInput } from '@/lib/admin/opsBoard/types'

export type MyTurnKind = 'decide' | 'problem'
export type MyTurnReason = 'items' | 'failed_items' | 'routine_stalled'

export interface MyTurnReasonChip {
  kind: OpsRationaleKind
  count: number
}

export interface MyTurnCard {
  id: string
  kind: MyTurnKind
  reason: MyTurnReason
  title: string
  count: number
  /** 결정 필요 카드의 마감(ISO). 문제 카드는 null이다. */
  deadlineIso: string | null
  reasonChips: MyTurnReasonChip[]
  href: string
}

export interface MyTurnInput {
  bundles: readonly BoardBundleInput[]
  starts: readonly BoardRoutineStartInput[]
  now: Date
  includeSample?: boolean
}

export const MAX_REASON_CHIPS = 3
export const ROUTINE_STALLED_TITLE = '루틴이 멈췄어요'
const UNTITLED_BUNDLE = '이름 없는 기획'
const INBOX_PATH = '/admin/ops-inbox'
// 결정 마감: 그 주 수요일 18:00 KST (PRD §6.1). 월요일 + 2일.
const DEADLINE_WEEKDAY_OFFSET = 2
const DEADLINE_CLOCK = '18:00:00+09:00'

/** 묶음 주의 수요일 18:00 KST(ISO). 주를 읽을 수 없으면 null이다. */
export function decisionDeadlineIso(bundle: Pick<BoardBundleInput, 'week' | 'receivedAt'>): string | null {
  const monday = weekStartOfRecord(bundle.week, bundle.receivedAt)
  if (!monday) return null
  return new Date(`${shiftDateStr(monday, DEADLINE_WEEKDAY_OFFSET)}T${DEADLINE_CLOCK}`).toISOString()
}

function bundleTitle(bundle: BoardBundleInput): string {
  if (bundle.title && bundle.title.trim() !== '') return bundle.title
  return bundle.week ? `${bundle.week} 기획` : UNTITLED_BUNDLE
}

function reasonChipsOf(items: BoardBundleInput['items']): MyTurnReasonChip[] {
  const counts = new Map<OpsRationaleKind, number>()
  for (const item of items) {
    for (const rationale of item.rationales) counts.set(rationale.kind, (counts.get(rationale.kind) ?? 0) + 1)
  }
  return OPS_RATIONALE_KINDS.filter((kind) => counts.has(kind))
    .map((kind) => ({ kind, count: counts.get(kind) ?? 0 }))
    .sort((a, b) => b.count - a.count) // 같은 수는 종류 순서(정렬이 안정적이다)
    .slice(0, MAX_REASON_CHIPS)
}

interface SortableCard {
  card: MyTurnCard
  /** 정렬 기준 시각(ms). 결정 필요는 마감, 문제는 받은·시작한 시각이다. 읽을 수 없으면 NaN이다. */
  at: number
}

/** 내 차례 카드. 문제 → 결정 필요 순이다. */
export function computeMyTurn(input: MyTurnInput): MyTurnCard[] {
  const includeSample = input.includeSample === true
  const decide: SortableCard[] = []
  const problem: SortableCard[] = []

  for (const bundle of input.bundles) {
    if (bundle.isSample && !includeSample) continue
    const waiting = bundle.items.filter((item) => {
      const stage = stageOfItemStatus(item.status)
      return stage === 'arrived' || stage === 'review'
    })
    const failed = bundle.items.filter((item) => item.status === 'failed')
    const href = `${INBOX_PATH}/${bundle.id}`

    if (waiting.length > 0) {
      const deadlineIso = decisionDeadlineIso(bundle)
      decide.push({
        card: {
          id: `decide:${bundle.id}`,
          kind: 'decide',
          reason: 'items',
          title: bundleTitle(bundle),
          count: waiting.length,
          deadlineIso,
          reasonChips: reasonChipsOf(waiting),
          href,
        },
        at: deadlineIso ? Date.parse(deadlineIso) : Number.NaN,
      })
    }
    if (failed.length > 0) {
      problem.push({
        card: {
          id: `failed:${bundle.id}`,
          kind: 'problem',
          reason: 'failed_items',
          title: bundleTitle(bundle),
          count: failed.length,
          deadlineIso: null,
          reasonChips: [],
          href,
        },
        at: Date.parse(bundle.receivedAt),
      })
    }
  }

  for (const start of input.starts) {
    if (!isRoutineStalled(start.startedAt, start.bundleId, input.now)) continue
    problem.push({
      card: {
        id: `stalled:${start.id}`,
        kind: 'problem',
        reason: 'routine_stalled',
        title: ROUTINE_STALLED_TITLE,
        count: 1,
        deadlineIso: null,
        reasonChips: [],
        href: INBOX_PATH,
      },
      at: Date.parse(start.startedAt),
    })
  }

  // 읽을 수 없는 시각(NaN)은 맨 뒤로 보낸다.
  const compare = (a: number, b: number, direction: 'asc' | 'desc'): number => {
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) === Number.isNaN(b) ? 0 : Number.isNaN(a) ? 1 : -1
    return direction === 'asc' ? a - b : b - a
  }
  decide.sort((a, b) => compare(a.at, b.at, 'asc'))
  problem.sort((a, b) => compare(a.at, b.at, 'desc'))
  return [...problem, ...decide].map((entry) => entry.card)
}

/** 내 차례 카드 수. 상단 바 숫자와 같은 값이다. */
export function myTurnCount(cards: readonly MyTurnCard[]): number {
  return cards.length
}
