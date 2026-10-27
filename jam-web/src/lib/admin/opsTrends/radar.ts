/**
 * 트렌드 레이더 계산 (티켓 20261026_2033 2회차, 어드민 상황판 PRD §5.4·§6.4). 순수 함수만 둔다(서버 전용 모듈을 가져오지 않는다).
 *
 * - `readBundleTrends`: 묶음의 `trends`를 화면 모양으로 읽는다. 모양이 틀린 원소는 뺀다. `index`는 배열 안의 원래 자리라
 *   원소를 빼도 바뀌지 않는다(`?trend=` 쿼리가 가리키는 값).
 * - `trendLinkedItemIds`: 그 트렌드에서 나온 항목. 기획 이유 `trend`의 `sourceId`가 트렌드의 출처 번호에 드는 항목이고, 반려·취소 항목은 뺀다.
 * - `collectRadar`: 최근 `windowDays`일 안에 받은 묶음의 트렌드를 받은 시각 내림차순으로 모으고 결과별 건수를 센다.
 */
import type { Json } from '@/types/database.generated'
import { OPS_TREND_OUTCOMES, MAX_TREND_SERIES_POINTS, type OpsTrendOutcome } from '@/lib/admin/opsInbox/constants'
import { formatWeekRange } from '@/lib/admin/opsInbox/labels'
import { readOpsItemRationales } from '@/lib/admin/opsInbox/rationaleRead'

/** 레이더가 보는 기간(일). */
export const TREND_RADAR_WINDOW_DAYS = 14

export interface BundleTrend {
  /** 묶음 `trends[]` 안의 원래 자리(0부터). */
  index: number
  label: string
  /** 출처 번호(`ops_trend_sources.no`). 정수 또는 정수 문자열만 번호로 본다. */
  sourceNos: number[]
  summary: string
  series: number[] | null
  outcome: OpsTrendOutcome
  outcomeReason: string | null
}

/** 연결 항목을 세는 데 필요한 항목 값만. */
export interface RadarItem {
  id: string
  status: string
  original: Json
  edited: Json | null
}

export interface RadarBundle {
  id: string
  week: string | null
  title: string | null
  receivedAt: string
  trends: Json | null
  isSample: boolean
  items: readonly RadarItem[]
}

export interface RadarEntry {
  bundleId: string
  bundleTitle: string
  week: string | null
  receivedAt: string
  trend: BundleTrend
  linkedItemCount: number
}

export interface RadarSummary {
  used: number
  held: number
  excluded: number
}

export interface RadarResult {
  entries: RadarEntry[]
  summary: RadarSummary
}

const DAY_MS = 24 * 60 * 60 * 1000
const EXCLUDED_LINK_STATUSES = new Set(['rejected', 'cancelled'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** 출처 번호 한 개를 읽는다. 1 이상의 정수 또는 그 정수를 적은 문자열이면 번호, 아니면 null. */
export function readSourceNo(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 ? value : null
  if (typeof value === 'string' && /^\s*\d+\s*$/.test(value)) {
    const parsed = Number(value.trim())
    return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null
  }
  return null
}

function readSeries(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TREND_SERIES_POINTS) return null
  if (!value.every((point) => typeof point === 'number' && Number.isFinite(point))) return null
  return value as number[]
}

export function readBundleTrends(trends: Json | null | undefined): BundleTrend[] {
  if (!Array.isArray(trends)) return []
  const result: BundleTrend[] = []
  trends.forEach((entry, index) => {
    if (!isRecord(entry)) return
    const label = nonEmptyText(entry.label)
    const summary = nonEmptyText(entry.summary)
    const outcome = entry.outcome
    if (!label || !summary) return
    if (typeof outcome !== 'string' || !(OPS_TREND_OUTCOMES as readonly string[]).includes(outcome)) return
    const sourceNos: number[] = []
    if (Array.isArray(entry.source_ids)) {
      for (const raw of entry.source_ids) {
        const no = readSourceNo(raw)
        if (no !== null && !sourceNos.includes(no)) sourceNos.push(no)
      }
    }
    result.push({
      index,
      label,
      sourceNos,
      summary,
      series: readSeries(entry.series),
      outcome: outcome as OpsTrendOutcome,
      outcomeReason: nonEmptyText(entry.outcome_reason),
    })
  })
  return result
}

/** 그 묶음 항목 중 이 트렌드에서 나온 항목의 ID. 반려·취소 항목은 뺀다. */
export function trendLinkedItemIds(trend: Pick<BundleTrend, 'sourceNos'>, items: readonly RadarItem[]): string[] {
  if (trend.sourceNos.length === 0) return []
  const ids: string[] = []
  for (const item of items) {
    if (EXCLUDED_LINK_STATUSES.has(item.status)) continue
    const linked = readOpsItemRationales(item.edited ?? item.original).some((rationale) => {
      if (rationale.kind !== 'trend') return false
      const no = readSourceNo(rationale.sourceId)
      return no !== null && trend.sourceNos.includes(no)
    })
    if (linked) ids.push(item.id)
  }
  return ids
}

function bundleTitleOf(bundle: Pick<RadarBundle, 'title' | 'week'>): string {
  const title = bundle.title?.trim()
  if (title) return title
  return formatWeekRange(bundle.week)?.label ?? '제목 없는 기획'
}

export function collectRadar(input: {
  bundles: readonly RadarBundle[]
  now: Date
  windowDays?: number
  includeSample: boolean
}): RadarResult {
  const windowDays = input.windowDays ?? TREND_RADAR_WINDOW_DAYS
  const since = input.now.getTime() - windowDays * DAY_MS
  const entries: RadarEntry[] = []
  const summary: RadarSummary = { used: 0, held: 0, excluded: 0 }

  const inWindow = input.bundles
    .filter((bundle) => (input.includeSample ? true : !bundle.isSample))
    .map((bundle) => ({ bundle, receivedMs: Date.parse(bundle.receivedAt) }))
    .filter(({ receivedMs }) => !Number.isNaN(receivedMs) && receivedMs >= since)
    .sort((a, b) => b.receivedMs - a.receivedMs)

  for (const { bundle } of inWindow) {
    for (const trend of readBundleTrends(bundle.trends)) {
      summary[trend.outcome] += 1
      entries.push({
        bundleId: bundle.id,
        bundleTitle: bundleTitleOf(bundle),
        week: bundle.week,
        receivedAt: bundle.receivedAt,
        trend,
        linkedItemCount: trendLinkedItemIds(trend, bundle.items).length,
      })
    }
  }
  return { entries, summary }
}

export interface TrendFilter {
  label: string
  itemIds: string[]
}

/**
 * 기획 상세 쿼리 `?trend=`(트렌드 번호)를 항목 걸러 보기 값으로 바꾼다. 숫자가 아니거나, 그 번호의 트렌드가 없거나(범위 밖·모양이 틀려 빠진 원소),
 * 연결된 항목이 하나도 없으면 null이다(걸러 보기를 열지 않고 전체를 보인다).
 */
export function buildTrendFilter(
  rawTrend: string | undefined,
  trends: Json | null | undefined,
  items: readonly RadarItem[]
): TrendFilter | null {
  if (typeof rawTrend !== 'string' || !/^\d+$/.test(rawTrend)) return null
  const index = Number(rawTrend)
  const trend = readBundleTrends(trends).find((candidate) => candidate.index === index)
  if (!trend) return null
  const itemIds = trendLinkedItemIds(trend, items)
  return itemIds.length > 0 ? { label: trend.label, itemIds } : null
}
