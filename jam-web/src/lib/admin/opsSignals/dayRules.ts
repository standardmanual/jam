/**
 * 날짜 구성 신호 4종 (티켓 20261001_1155, 순수 함수 — DB 접근 없음).
 *
 * 비어 있는 컨텐츠(A5·A8)·새 컨텐츠가 없는 날·겹침(A6·A7)·단조로운 흐름. 날짜별 구성(`composition.ts`)을 읽어 검사 날짜마다
 * 규칙을 돌린다. 날짜 구성 신호는 승인 전 항목도 센다(가정 15 — 반려·취소·실패만 뺀다).
 *
 * 항목 하나에 걸리는 문제(색 대기·문안 빈 항목·이미지 빈 항목)는 여러 날에 걸치는 카드가 날마다 되풀이되지 않도록 검사 날짜 가운데
 * 처음 걸치는 날에 한 번만 낸다. 단조로운 흐름도 같은 값(패턴·트라이브·모양 연속)은 한 번만 낸다.
 */
import { makeSignalResult, formatSignalDay, sortSignalResults, type OpsSignalResult } from '@/lib/admin/opsSignals/catalog'
import {
  isAllAudienceCard,
  type CompositionBundleItem,
  type CompositionCard,
  type DayComposition,
} from '@/lib/admin/opsSignals/composition'
import type { OpsSignalThresholdValues } from '@/lib/admin/opsSignals/thresholds'
import { shiftDateStr } from '@/lib/admin/today-calendar'
import { isImageShape } from '@/lib/today/shape'

export interface DayRuleContext {
  /** 검사 날짜와 그 앞 `monotonyWindowDays - 1`일의 구성(날짜 오름차순). */
  compositions: readonly DayComposition[]
  /** 검사하는 날짜(KST, 오름차순). */
  scanDates: readonly string[]
  thresholds: OpsSignalThresholdValues
}

export interface DayRuleResults {
  empty_content: OpsSignalResult[]
  no_new_content: OpsSignalResult[]
  overlap: OpsSignalResult[]
  monotony: OpsSignalResult[]
}

/** 노출 대상을 읽을 수 없는(「모름」) 카드인가. */
function hasUnknownAudience(card: CompositionCard): boolean {
  return card.exposureTags === 'unknown'
}

/** 신규 유저에게 보이는 카드: 노출 대상에 `all`·`new_user`·시간대(`time_*`) 태그가 있다(A7). */
function isVisibleToNewUser(card: CompositionCard): boolean {
  if (!Array.isArray(card.exposureTags)) return false
  return card.exposureTags.some((tag) => tag === 'all' || tag === 'new_user' || tag.startsWith('time_'))
}

function cardName(card: CompositionCard): string {
  return card.title.trim() === '' ? '제목 없는 카드' : card.title.trim()
}

function sampleOf(cards: readonly Pick<CompositionCard, 'isSample'>[]): boolean {
  return cards.some((card) => card.isSample)
}

// ── 비어 있는 컨텐츠 (A5·A8) ─────────────────────────────────────────────────────────────────────

function evaluateEmptyContent(ctx: DayRuleContext, days: ReadonlyMap<string, DayComposition>): OpsSignalResult[] {
  const { thresholds } = ctx
  const results: OpsSignalResult[] = []
  const reportedItems = new Set<string>()

  for (const date of ctx.scanDates) {
    const day = days.get(date)
    if (!day) continue
    const label = formatSignalDay(date)
    const count = day.cards.length

    // 항목 하나의 문제: 색 대기·문안 빈 항목·이미지 빈 항목
    for (const card of day.cards) {
      const problems: Array<{ reason: string; message: string }> = []
      if (card.colorPending === true) {
        problems.push({ reason: 'color', message: `「${cardName(card)}」 카드가 색을 기다리고 있어요.` })
      }
      if (!card.hasCopy) {
        problems.push({ reason: 'copy', message: `「${cardName(card)}」 카드의 문안이 비어 있어요.` })
      }
      if (card.imageMissing) {
        problems.push({ reason: 'image', message: `「${cardName(card)}」 카드에 이미지가 없어요.` })
      }
      for (const problem of problems) {
        const key = `${card.key}:${problem.reason}`
        if (reportedItems.has(key)) continue
        reportedItems.add(key)
        results.push(
          makeSignalResult(problem.message, {
            date,
            bundleId: card.bundleId,
            itemId: card.source === 'bundle' ? card.id : null,
            isSample: card.isSample,
          })
        )
      }
    }

    // 게재 카드 수
    if (count < thresholds.minLiveCards || count > thresholds.maxLiveCards) {
      const range = `${thresholds.minLiveCards}장 이상 ${thresholds.maxLiveCards}장 이하`
      results.push(
        makeSignalResult(
          count < thresholds.minLiveCards
            ? `${label}에 보이는 카드가 ${count}장이라 적어요. ${range}가 좋아요.`
            : `${label}에 보이는 카드가 ${count}장이라 많아요. ${range}가 좋아요.`,
          { date, isSample: sampleOf(day.cards) }
        )
      )
    }

    // 전원 대상 카드가 없는 날(노출 대상을 모르는 카드가 있으면 없다고 말할 수 없어 띄우지 않는다)
    if (!day.cards.some(isAllAudienceCard) && !day.cards.some(hasUnknownAudience)) {
      results.push(makeSignalResult(`${label}에 모두에게 보이는 카드가 없어요.`, { date, isSample: sampleOf(day.cards) }))
    }

    // 이미지가 없는 모양으로 편성된 대표 카드
    const representative = day.representative
    if (representative && representative.shape !== 'unknown' && !isImageShape(representative.shape)) {
      results.push(
        makeSignalResult(
          `${label}의 대표 카드 「${cardName(representative)}」의 모양(${representative.shape})에는 이미지가 없어요. 대표 카드는 이미지가 있는 모양이어야 해요.`,
          {
            date,
            bundleId: representative.bundleId,
            itemId: representative.source === 'bundle' ? representative.id : null,
            isSample: representative.isSample,
          }
        )
      )
    }
  }
  return results
}

// ── 새 컨텐츠가 없는 날 ──────────────────────────────────────────────────────────────────────────

function evaluateNoNewContent(ctx: DayRuleContext, days: ReadonlyMap<string, DayComposition>): OpsSignalResult[] {
  const results: OpsSignalResult[] = []
  for (const date of ctx.scanDates) {
    const day = days.get(date)
    if (!day) continue
    const starting = day.cards.filter((card) => card.startsOnDay)
    if (starting.length < ctx.thresholds.minNewContentCards) {
      results.push(makeSignalResult(`${formatSignalDay(date)}에 새로 올라가는 카드가 없어요.`, { date, isSample: sampleOf(day.cards) }))
    }
  }
  return results
}

// ── 겹침 (A6·A7) ─────────────────────────────────────────────────────────────────────────────────

interface StartingItem {
  patternNo: string | null
  tribeId: string | null | 'unknown'
  isSample: boolean
}

/** 같은 값끼리 묶어 두 건 이상인 묶음만 돌려준다. */
function repeatedValues(items: readonly StartingItem[], pick: (item: StartingItem) => string | null): Array<[string, StartingItem[]]> {
  const groups = new Map<string, StartingItem[]>()
  for (const item of items) {
    const value = pick(item)
    if (value === null) continue
    const list = groups.get(value)
    if (list) list.push(item)
    else groups.set(value, [item])
  }
  return [...groups.entries()].filter(([, list]) => list.length >= 2)
}

function evaluateOverlap(ctx: DayRuleContext, days: ReadonlyMap<string, DayComposition>): OpsSignalResult[] {
  const { thresholds } = ctx
  const results: OpsSignalResult[] = []
  for (const date of ctx.scanDates) {
    const day = days.get(date)
    if (!day) continue
    const label = formatSignalDay(date)

    // 같은 패턴·트라이브: 그날 시작하는 운영 묶음 항목끼리만 본다(A6). 실제 카드에는 패턴·트라이브 칸이 없어 세지 않는다.
    const starting: StartingItem[] = [
      ...day.cards.filter((card) => card.source === 'bundle' && card.startsOnDay),
      ...day.bundleItems.filter((item: CompositionBundleItem) => item.startsOnDay),
    ]
    for (const [pattern, list] of repeatedValues(starting, (item) => item.patternNo?.trim() || null)) {
      results.push(
        makeSignalResult(`${label}에 같은 패턴(${pattern})의 항목이 ${list.length}건 겹쳐요.`, { date, isSample: sampleOf(list) })
      )
    }
    for (const [, list] of repeatedValues(starting, (item) =>
      item.tribeId !== null && item.tribeId !== 'unknown' ? item.tribeId : null
    )) {
      results.push(makeSignalResult(`${label}에 같은 트라이브의 항목이 ${list.length}건 겹쳐요.`, { date, isSample: sampleOf(list) }))
    }

    // 모양 개수: 그날 보이는 홈피드 카드 전부로 센다. 모양을 모르는 카드는 세지 않는다.
    const imageShaped = day.cards.filter((card) => isImageShape(card.shape))
    const nonImageShaped = day.cards.filter((card) => card.shape !== 'unknown' && !isImageShape(card.shape))
    const knownShapeCount = imageShaped.length + nonImageShaped.length
    if (imageShaped.length >= thresholds.overlapImageShapeCards) {
      results.push(
        makeSignalResult(
          `${label}에 이미지가 있는 모양의 카드가 ${imageShaped.length}장이에요. 큰 카드가 줄지어 서면 하루 홈이 단조로울 수 있어요.`,
          { date, isSample: sampleOf(imageShaped) }
        )
      )
    }
    if (knownShapeCount > 0 && nonImageShaped.length < thresholds.minNonImageShapeCards) {
      results.push(
        makeSignalResult(`${label}에 이미지가 없는 모양의 카드가 없어요. 큰 카드 사이에 작은 카드가 끼는 것이 좋아요.`, {
          date,
          isSample: sampleOf(day.cards),
        })
      )
    }

    // 신규 유저에게 보이는 카드
    const forNewUser = day.cards.filter(isVisibleToNewUser)
    if (forNewUser.length > thresholds.maxNewUserCards) {
      results.push(
        makeSignalResult(
          `${label}에 신규 유저에게 보이는 카드가 ${forNewUser.length}장이에요. ${thresholds.maxNewUserCards}장 이하로 맞춰 주세요.`,
          { date, isSample: sampleOf(forNewUser) }
        )
      )
    }
  }
  return results
}

// ── 단조로운 흐름 ────────────────────────────────────────────────────────────────────────────────

interface ShapeRun {
  shape: string
  dates: string[]
}

/** 대표 카드의 모양이 같은 날이 이어지는 구간(하루 이상)을 날짜 순서대로 모은다. 모양을 모르거나 대표가 없는 날은 구간을 끊는다. */
function buildShapeRuns(compositions: readonly DayComposition[]): ShapeRun[] {
  const runs: ShapeRun[] = []
  let current: ShapeRun | null = null
  for (const day of compositions) {
    const shape = day.representative?.shape
    const known = shape !== undefined && shape !== 'unknown'
    const continues = current !== null && known && current.shape === shape && shiftDateStr(current.dates[current.dates.length - 1], 1) === day.date
    if (continues && current) {
      current.dates.push(day.date)
      continue
    }
    current = known ? { shape, dates: [day.date] } : null
    if (current) runs.push(current)
  }
  return runs
}

function evaluateMonotony(ctx: DayRuleContext, days: ReadonlyMap<string, DayComposition>): OpsSignalResult[] {
  const { thresholds } = ctx
  const windowDays = thresholds.monotonyWindowDays
  const results: OpsSignalResult[] = []
  const reportedValues = new Set<string>()
  const runs = buildShapeRuns(ctx.compositions)
  const reportedRuns = new Set<ShapeRun>()

  for (const date of ctx.scanDates) {
    const windowStart = shiftDateStr(date, -(windowDays - 1))
    const windowReps: CompositionCard[] = []
    for (let cursor = windowStart; cursor <= date; cursor = shiftDateStr(cursor, 1)) {
      const rep = days.get(cursor)?.representative
      if (rep) windowReps.push(rep)
    }

    // 같은 패턴·트라이브
    const counts = new Map<string, { label: string; cards: CompositionCard[] }>()
    const add = (key: string, label: string, card: CompositionCard) => {
      const entry = counts.get(key)
      if (entry) entry.cards.push(card)
      else counts.set(key, { label, cards: [card] })
    }
    for (const rep of windowReps) {
      const pattern = rep.patternNo?.trim()
      if (pattern) add(`pattern:${pattern}`, `같은 패턴(${pattern})이`, rep)
      if (rep.tribeId !== null && rep.tribeId !== 'unknown') add(`tribe:${rep.tribeId}`, '같은 트라이브가', rep)
    }
    for (const [key, entry] of counts) {
      if (entry.cards.length < thresholds.monotonySamePatternCount || reportedValues.has(key)) continue
      reportedValues.add(key)
      results.push(
        makeSignalResult(`최근 ${windowDays}일 대표 카드에서 ${entry.label} ${entry.cards.length}번 나와요.`, {
          date,
          isSample: sampleOf(entry.cards),
        })
      )
    }

    // 같은 모양이 연속으로 대표
    for (const run of runs) {
      if (reportedRuns.has(run) || run.dates.length < thresholds.monotonySameShapeDays) continue
      const inWindow = run.dates.filter((runDate) => runDate >= windowStart && runDate <= date).length
      if (inWindow < thresholds.monotonySameShapeDays) continue
      reportedRuns.add(run)
      const reps = run.dates.map((runDate) => days.get(runDate)?.representative).filter((rep): rep is CompositionCard => !!rep)
      results.push(
        makeSignalResult(
          `같은 모양(${run.shape})이 ${run.dates.length}일 연속 대표 카드예요. (${formatSignalDay(run.dates[0])}~${formatSignalDay(run.dates[run.dates.length - 1])})`,
          { date, isSample: sampleOf(reps) }
        )
      )
    }
  }
  return results
}

/** 날짜 구성 신호 4종을 계산한다. 결과는 날짜 순이다. */
export function evaluateDayRules(ctx: DayRuleContext): DayRuleResults {
  const days = new Map(ctx.compositions.map((day) => [day.date, day]))
  return {
    empty_content: sortSignalResults(evaluateEmptyContent(ctx, days)),
    no_new_content: sortSignalResults(evaluateNoNewContent(ctx, days)),
    overlap: sortSignalResults(evaluateOverlap(ctx, days)),
    monotony: sortSignalResults(evaluateMonotony(ctx, days)),
  }
}
