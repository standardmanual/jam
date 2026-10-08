/**
 * 패턴 사전 화면(S5)의 목록 계산 (티켓 20261008_1400, 상위 20260930_1503 ⑨a, 채원 판정 「⑨ 목록」). 순수 함수만 둔다 — 읽기는 페이지가 맡는다.
 *
 * - 주소 값(`view`·`status`)을 읽는다. 틀린 값은 기본값이다(`view=patterns`, `status=all`).
 * - 패턴·사용 횟수(`countOpsPatternUsage`)·취향 신호를 표 줄로 합친다. 못 읽은 재료는 0이 아니라 `null`로 남겨 화면이 「–」·「모름」으로 보이게 한다.
 * - 「전체」는 보관을 뺀 개수다(보관은 필터로만 보인다). 번호 순서는 읽기 함수(`listOpsPatterns`)의 숫자 순서를 그대로 쓴다.
 */
import type { OpsPatternStatus } from './constants'
import type { OpsPatternUsageCount } from './draw'
import type { OpsPatternRecord, OpsTasteSignalRecord } from './read'

export const PATTERN_VIEWS = ['patterns', 'common'] as const
export type PatternView = (typeof PATTERN_VIEWS)[number]
export const DEFAULT_PATTERN_VIEW: PatternView = 'patterns'

export const PATTERN_STATUS_FILTERS = ['all', 'active', 'paused', 'archived'] as const
export type PatternStatusFilter = (typeof PATTERN_STATUS_FILTERS)[number]
export const DEFAULT_PATTERN_STATUS_FILTER: PatternStatusFilter = 'all'

export const PATTERN_STATUS_FILTER_LABELS: Record<PatternStatusFilter, string> = {
  all: '전체',
  active: '사용 중',
  paused: '쉬는 중',
  archived: '보관',
}

export interface PatternListParams {
  view: PatternView
  status: PatternStatusFilter
}

/** `searchParams`(이미 한 값으로 정규화된 것)에서 탭과 상태 필터를 읽는다. 틀린 값·없는 값은 기본값이다. */
export function parsePatternListParams(params: Readonly<Record<string, string | undefined>>): PatternListParams {
  const view = PATTERN_VIEWS.find((candidate) => candidate === params.view) ?? DEFAULT_PATTERN_VIEW
  const status = PATTERN_STATUS_FILTERS.find((candidate) => candidate === params.status) ?? DEFAULT_PATTERN_STATUS_FILTER
  return { view, status }
}

/** 탭·필터 링크. 기본값은 쿼리에 넣지 않는다(같은 화면은 늘 같은 글자). */
export function patternListHref(params: Partial<PatternListParams> = {}): string {
  const query = new URLSearchParams()
  if (params.view && params.view !== DEFAULT_PATTERN_VIEW) query.set('view', params.view)
  if (params.status && params.status !== DEFAULT_PATTERN_STATUS_FILTER) query.set('status', params.status)
  const text = query.toString()
  return text ? `/admin/ops-patterns?${text}` : '/admin/ops-patterns'
}

/** 표의 한 줄. `null`은 못 읽었거나 모른다는 뜻이라 0으로 바꾸지 않는다. */
export interface PatternListRow {
  patternNo: string
  name: string
  /** 사전의 상태 값. 3값 밖이면 칩이 「상태 확인 필요」로 그린다. */
  status: string
  pauseReason: string | null
  /** 최근 4주 사용 횟수. 사용 기록을 못 읽었으면 `null`. */
  uses: number | null
  /** 마지막 사용(ISO). 한 번도 안 썼으면 `null`이고, 그것이 「쓴 적 없어요」다 — 사용 기록을 못 읽은 경우는 `uses`가 `null`이다. */
  lastUsedAt: string | null
  /** 샘플 수. `samples`가 배열이 아니면 `null`(「모름」). */
  sampleCount: number | null
  /** 이 패턴의 취향 신호 수. 취향 신호를 못 읽었으면 `null`. */
  estimateCount: number | null
  confirmedCount: number | null
}

export type PatternStatusCounts = Record<PatternStatusFilter, number>

function isPatternStatus(value: string): value is OpsPatternStatus {
  return value === 'active' || value === 'paused' || value === 'archived'
}

/** 샘플 수: 배열이면 길이, 아니면 `null`. */
export function sampleCountOf(samples: unknown): number | null {
  return Array.isArray(samples) ? samples.length : null
}

/**
 * 표 줄을 만든다. `usage`가 `null`이면 사용 기록을 못 읽은 것이고, 맵에 번호가 없으면(읽기는 됐는데 번호만 빠짐) 0회·쓴 적 없음으로 본다.
 * `signals`가 `null`이면 취향 신호를 못 읽은 것이다.
 */
export function buildPatternRows(
  patterns: readonly OpsPatternRecord[],
  usage: ReadonlyMap<string, OpsPatternUsageCount> | null,
  signals: readonly OpsTasteSignalRecord[] | null
): PatternListRow[] {
  return patterns.map((pattern) => {
    const used = usage === null ? null : (usage.get(pattern.patternNo) ?? { uses: 0, lastUsedAt: null })
    const own = signals === null ? null : signals.filter((signal) => signal.patternNo === pattern.patternNo)
    return {
      patternNo: pattern.patternNo,
      name: pattern.name,
      status: pattern.status,
      pauseReason: pattern.pauseReason,
      uses: used === null ? null : used.uses,
      lastUsedAt: used === null ? null : used.lastUsedAt,
      sampleCount: sampleCountOf(pattern.samples),
      estimateCount: own === null ? null : own.filter((signal) => signal.basis === 'estimate').length,
      confirmedCount: own === null ? null : own.filter((signal) => signal.basis === 'confirmed').length,
    }
  })
}

/** 상태별 개수. `all`은 보관을 뺀 개수다(3값 밖의 모르는 상태는 `all`에만 든다). */
export function countByStatus(rows: readonly Pick<PatternListRow, 'status'>[]): PatternStatusCounts {
  const counts: PatternStatusCounts = { all: 0, active: 0, paused: 0, archived: 0 }
  for (const row of rows) {
    if (isPatternStatus(row.status)) counts[row.status] += 1
    if (row.status !== 'archived') counts.all += 1
  }
  return counts
}

/** 필터에 맞는 줄. `all`은 보관을 뺀다. 번호 순서는 입력 그대로다. */
export function filterPatternRows<T extends Pick<PatternListRow, 'status'>>(rows: readonly T[], status: PatternStatusFilter): T[] {
  return rows.filter((row) => (status === 'all' ? row.status !== 'archived' : row.status === status))
}
