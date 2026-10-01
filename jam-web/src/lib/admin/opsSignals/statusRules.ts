/**
 * 항목·묶음 상태 신호 6종 (티켓 20261001_1155, 순수 함수 — DB 접근 없음).
 *
 * 실행 실패(A2)·예약 누락(가정 19)·루틴 실패(A1)·형식 오류(A4)·승인 마감 임박(A3)·에이전트가 뺀 항목(A4).
 * 입력의 묶음은 시험 묶음을 거른 뒤의 목록이다(거르기는 `compute.ts`가 한다). 항목 값은 수정본을 먼저 읽는다
 * (`itemView.itemField`). 신호 문장은 운영자가 읽는 쉬운 해요체다.
 */
import { computeBundleStatus, tabOfBundleStage } from '@/lib/admin/opsInbox/bundleStatus'
import { OPS_FIELD_UNKNOWN, readBundleExcludedItems } from '@/lib/admin/opsInbox/fields'
import { formatKstDayTime, kindLabel, kstDateKey } from '@/lib/admin/opsInbox/labels'
import { kstDayBoundsIso, shiftDateStr, todayKstDateString } from '@/lib/admin/today-calendar'
import { mondayOfWeek } from '@/lib/admin/cronSchedule'
import { OPS_WEEKDAY_LABELS, makeSignalResult, type OpsSignalResult } from '@/lib/admin/opsSignals/catalog'
import { isUndecidedStatus } from '@/lib/admin/opsInbox/itemView'
import {
  describeBundleItem,
  parseTime,
  type SignalBundleInput,
  type SignalBundleItemInput,
} from '@/lib/admin/opsSignals/composition'
import type { OpsSignalThresholdValues } from '@/lib/admin/opsSignals/thresholds'

export interface StatusRuleContext {
  now: Date
  /** 시험 묶음을 거른 뒤의 묶음 목록. */
  bundles: readonly SignalBundleInput[]
  thresholds: OpsSignalThresholdValues
}

const HOUR_MS = 3600_000
const DAY_MS = 24 * HOUR_MS
const EXCLUDED_STAGE_LABELS: Record<string, string> = { world_review: '세계관 검수', balance_check: '밸런스 점검' }

/** 「홈피드 카드 「봄맞이」」처럼 항목을 가리키는 말. */
function itemName(item: SignalBundleItemInput): string {
  return `${kindLabel(item.kind)} 「${describeBundleItem(item)}」`
}

/** 묶음을 가리키는 말: 대상 주차가 있으면 「2026-W41 묶음」, 없으면 받은 시각이다. */
function bundleName(bundle: SignalBundleInput): string {
  if (bundle.week) return `${bundle.week} 묶음`
  const received = formatKstDayTime(bundle.receivedAt)
  return received ? `${received}에 받은 묶음` : '받은 시각을 모르는 묶음'
}

/** 끝나지 않은 묶음인가: 받은 기획함 「결정할 것」·「진행 중」 탭에 속한다(A4). */
function isOpenBundle(bundle: SignalBundleInput): boolean {
  const stage = computeBundleStatus(bundle.items.map((item) => item.status)).stage
  return tabOfBundleStage(stage) !== 'closed'
}

// ── 실행 실패 (A2) ───────────────────────────────────────────────────────────────────────────────

/** 최근 `failureLookbackDays`일 안에 「실패」로 바뀐 항목(`updated_at` 기준). */
export function evaluateExecutionFailed(ctx: StatusRuleContext): OpsSignalResult[] {
  const sinceMs = ctx.now.getTime() - ctx.thresholds.failureLookbackDays * DAY_MS
  const results: OpsSignalResult[] = []
  for (const bundle of ctx.bundles) {
    for (const item of bundle.items) {
      if (item.status !== 'failed') continue
      const updatedMs = parseTime(item.updatedAt)
      if (updatedMs === null || updatedMs < sinceMs) continue
      results.push(
        makeSignalResult(`${itemName(item)}의 실행이 ${formatKstDayTime(item.updatedAt)}에 실패했어요.`, {
          date: kstDateKey(item.updatedAt),
          bundleId: bundle.id,
          itemId: item.id,
          isSample: bundle.isSample,
        })
      )
    }
  }
  return results
}

// ── 예약 누락 (가정 19) ──────────────────────────────────────────────────────────────────────────

/** 예약됨·준비중 항목의 공개 시각 + `missedScheduleMinutes`분이 지났다. 승인됨은 뺀다(1500 연결 전에는 멈춰 있는 것이 정상). */
export function evaluateMissedSchedule(ctx: StatusRuleContext): OpsSignalResult[] {
  const graceMs = ctx.thresholds.missedScheduleMinutes * 60_000
  const results: OpsSignalResult[] = []
  for (const bundle of ctx.bundles) {
    for (const item of bundle.items) {
      if (item.status !== 'scheduled' && item.status !== 'preparing') continue
      const startsMs = parseTime(item.startsAt)
      if (startsMs === null || ctx.now.getTime() < startsMs + graceMs) continue
      results.push(
        makeSignalResult(
          `${itemName(item)}의 공개 시각(${formatKstDayTime(item.startsAt)})이 지났는데 아직 공개되지 않았어요.`,
          { date: kstDateKey(item.startsAt), bundleId: bundle.id, itemId: item.id, isSample: bundle.isSample }
        )
      )
    }
  }
  return results
}

// ── 승인 마감 임박 (A3) ──────────────────────────────────────────────────────────────────────────

/** 도착·검토중 항목의 공개 시각이 `approvalDeadlineHours`시간 안이다. 이미 지났어도 같은 신호로 「공개 시각이 지났어요」라고 보인다. */
export function evaluateApprovalDeadline(ctx: StatusRuleContext): OpsSignalResult[] {
  const limitMs = ctx.now.getTime() + ctx.thresholds.approvalDeadlineHours * HOUR_MS
  const results: OpsSignalResult[] = []
  for (const bundle of ctx.bundles) {
    for (const item of bundle.items) {
      if (!isUndecidedStatus(item.status)) continue
      const startsMs = parseTime(item.startsAt)
      if (startsMs === null || startsMs > limitMs) continue
      const when = formatKstDayTime(item.startsAt)
      const message =
        startsMs <= ctx.now.getTime()
          ? `${itemName(item)}의 공개 시각(${when})이 지났는데 아직 승인되지 않았어요.`
          : `${itemName(item)}의 공개 시각(${when})까지 ${ctx.thresholds.approvalDeadlineHours}시간도 남지 않았는데 아직 승인되지 않았어요.`
      results.push(
        makeSignalResult(message, {
          date: kstDateKey(item.startsAt),
          bundleId: bundle.id,
          itemId: item.id,
          isSample: bundle.isSample,
        })
      )
    }
  }
  return results
}

// ── 형식 오류 (A4) ───────────────────────────────────────────────────────────────────────────────

/** 끝나지 않은 묶음 가운데 묶음이나 항목에 형식 오류 문장이 있는 묶음. 묶음 하나가 결과 한 건이다. */
export function evaluateFormatError(ctx: StatusRuleContext): OpsSignalResult[] {
  const results: OpsSignalResult[] = []
  for (const bundle of ctx.bundles) {
    if (!isOpenBundle(bundle)) continue
    const errors = new Set<string>(bundle.formatErrors)
    for (const item of bundle.items) for (const error of item.formatErrors) errors.add(error)
    if (errors.size === 0) continue
    results.push(
      makeSignalResult(`${bundleName(bundle)}에 형식 오류가 ${errors.size}건 있어요.`, {
        bundleId: bundle.id,
        isSample: bundle.isSample,
      })
    )
  }
  return results
}

// ── 에이전트가 뺀 항목 (A4) ──────────────────────────────────────────────────────────────────────

/**
 * 끝나지 않은 묶음의 뺀 항목(`excluded_items`). 목록을 읽을 수 없으면(「모름」이거나 제출 원본을 읽어 오지 못했으면) 그 묶음에
 * 「뺀 항목 목록을 읽지 못했어요」를 띄운다.
 */
export function evaluateExcludedItems(ctx: StatusRuleContext): OpsSignalResult[] {
  const results: OpsSignalResult[] = []
  for (const bundle of ctx.bundles) {
    if (!isOpenBundle(bundle)) continue
    const excluded = bundle.raw === null ? OPS_FIELD_UNKNOWN : readBundleExcludedItems(bundle.raw)
    if (excluded === OPS_FIELD_UNKNOWN) {
      results.push(
        makeSignalResult(`${bundleName(bundle)}의 뺀 항목 목록을 읽지 못했어요.`, {
          bundleId: bundle.id,
          isSample: bundle.isSample,
        })
      )
      continue
    }
    for (const entry of excluded) {
      const stage = entry.stage ? EXCLUDED_STAGE_LABELS[entry.stage] : null
      const key = entry.itemKey ? ` (항목 ${entry.itemKey})` : ''
      const matched = entry.itemKey ? bundle.items.find((item) => item.itemKey === entry.itemKey) : undefined
      results.push(
        makeSignalResult(`${stage ? `${stage}에서 ` : ''}에이전트가 항목을 뺐어요${key}. 사유: ${entry.reason}`, {
          bundleId: bundle.id,
          itemId: matched?.id ?? null,
          isSample: bundle.isSample,
        })
      )
    }
  }
  return results
}

// ── 루틴 실패 (A1) ───────────────────────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 루틴이 받은 기획함에 낸 묶음인가: 시험이 아니고 항목이 있다. `pattern_proposal` 항목이 있는 묶음은 월간, 없는 항목이 있는 묶음은 주간이다. */
function routineBundleKinds(bundle: SignalBundleInput): { weekly: boolean; monthly: boolean } {
  if (bundle.isSample) return { weekly: false, monthly: false }
  return {
    weekly: bundle.items.some((item) => item.kind !== 'pattern_proposal'),
    monthly: bundle.items.some((item) => item.kind === 'pattern_proposal'),
  }
}

/**
 * 루틴 실패. 주간 루틴은 이번 주 마감 요일 0시(KST) 이후 받은 실제 묶음 가운데 「패턴 제안」이 아닌 항목이 있는 묶음이, 월간 루틴은
 * 이번 달 마감 날짜 0시 이후 받은 실제 묶음 가운데 「패턴 제안」 항목이 있는 묶음이 마감 시각까지 없으면 실패다. `routine_run`은
 * 형식이 정해지지 않아 읽지 않는다. 시험 묶음은 스위치와 관계없이 루틴 결과로 세지 않는다.
 *
 * 점검 시작 시각(`routineCheckStartsAt`)이 없거나 아직 오지 않았으면 `null`이다(「아직 확인하지 않아요」). 시작 시각 이후에 시작한
 * 구간(그 주·그 달의 0시가 시작 시각 이후인 구간)만 본다 — 시작 전에 끝난 구간은 루틴이 낸 적이 없는 것이 정상이다.
 */
export function evaluateRoutineFailed(ctx: StatusRuleContext): OpsSignalResult[] | null {
  const { thresholds, now } = ctx
  const startsMs = parseTime(thresholds.routineCheckStartsAt)
  if (startsMs === null || now.getTime() < startsMs) return null

  const nowMs = now.getTime()
  const today = todayKstDateString(now)
  const results: OpsSignalResult[] = []

  const received = (bundle: SignalBundleInput) => parseTime(bundle.receivedAt)

  // 주간: 이번 주 마감 요일 0시 ~ 마감 시각
  const weekDate = shiftDateStr(mondayOfWeek(today), (thresholds.weeklyRoutineWeekday + 6) % 7)
  const weekWindowMs = Date.parse(kstDayBoundsIso(weekDate).startIso)
  const weekDeadlineMs = weekWindowMs + thresholds.weeklyRoutineDeadlineHour * HOUR_MS
  if (weekWindowMs >= startsMs && nowMs >= weekDeadlineMs) {
    const submitted = ctx.bundles.some((bundle) => {
      const at = received(bundle)
      return at !== null && at >= weekWindowMs && routineBundleKinds(bundle).weekly
    })
    if (!submitted) {
      const weekday = OPS_WEEKDAY_LABELS[thresholds.weeklyRoutineWeekday]
      results.push(
        makeSignalResult(
          `주간 루틴이 ${weekday}요일 ${thresholds.weeklyRoutineDeadlineHour}시까지 기획안을 내지 못했어요.`,
          { date: weekDate }
        )
      )
    }
  }

  // 월간: 이번 달 마감 날짜 0시 ~ 마감 시각
  const monthDate = `${today.slice(0, 7)}-${pad2(thresholds.monthlyRoutineDay)}`
  const monthWindowMs = Date.parse(kstDayBoundsIso(monthDate).startIso)
  const monthDeadlineMs = monthWindowMs + thresholds.monthlyRoutineDeadlineHour * HOUR_MS
  if (monthWindowMs >= startsMs && nowMs >= monthDeadlineMs) {
    const submitted = ctx.bundles.some((bundle) => {
      const at = received(bundle)
      return at !== null && at >= monthWindowMs && routineBundleKinds(bundle).monthly
    })
    if (!submitted) {
      results.push(
        makeSignalResult(
          `월간 루틴이 ${thresholds.monthlyRoutineDay}일 ${thresholds.monthlyRoutineDeadlineHour}시까지 기획안을 내지 못했어요.`,
          { date: monthDate }
        )
      )
    }
  }

  return results
}
