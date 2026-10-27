/**
 * 기획 상세 화면이 항목을 읽는 순수 함수 (티켓 20260930_1817).
 *
 * 항목의 제출 원본(`original`)은 자기 신고 JSON이라 모양을 믿지 않는다. 값이 없거나 모양이 달라도 화면이 죽지 않게
 * 「없음」으로 돌려준다. 직접 수정본(`edited`, 1818이 채운다)이 있으면 그 값을 먼저 읽는다.
 * 제출 문자열은 화면에서 React 텍스트 노드로만 그린다(HTML로 해석하지 않는다).
 */
import type { Json } from '@/types/database.generated'
import { kstDateKey, formatKstDay } from '@/lib/admin/opsInbox/labels'
import { BALANCE_TAB_LABEL } from '@/lib/admin/opsInbox/balance/messages'

export interface ViewableItem {
  original: Json
  edited: Json | null
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** 수정본에 값이 있으면 수정본, 아니면 제출 원본의 값이다. 없으면 undefined. */
export function itemField(item: ViewableItem, key: string): unknown {
  const edited = asRecord(item.edited)
  if (edited && edited[key] !== undefined && edited[key] !== null) return edited[key]
  return asRecord(item.original)?.[key]
}

/** 앞뒤 공백을 뗀 문자열. 문자열이 아니면 빈 문자열이다. */
export function itemText(item: ViewableItem, key: string): string {
  const value = itemField(item, key)
  return typeof value === 'string' ? value.trim() : ''
}

/** 「유저가 겪는 것」. */
export function userExperienceOf(item: ViewableItem): string {
  return itemText(item, 'user_experience')
}

/** `links`: 다른 항목의 `item_key` 목록. 문자열만 남긴다. */
export function linksOf(item: ViewableItem): string[] {
  const value = itemField(item, 'links')
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : []
}

export interface WorldReviewView {
  worldRelated: boolean | null
  winterReviewed: boolean | null
  reason: string
}

/** 세계관 검수 결과. 객체가 아니면 null이다. 불리언이 아닌 칸은 null(모름)로 둔다. */
export function worldReviewOf(item: ViewableItem): WorldReviewView | null {
  const review = asRecord(itemField(item, 'world_review'))
  if (!review) return null
  return {
    worldRelated: typeof review.world_related === 'boolean' ? review.world_related : null,
    winterReviewed: typeof review.winter_reviewed === 'boolean' ? review.winter_reviewed : null,
    reason: typeof review.reason === 'string' ? review.reason.trim() : '',
  }
}

/** 화면에 글로 그릴 값. 문자열은 그대로, 숫자·불리언은 글자로, 객체·배열은 JSON 한 줄, 값이 없으면 빈 문자열. */
export function describeValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

/** 객체의 「이름: 값」 목록. 객체가 아니면 null이다. 값이 비어 있는 칸은 뺀다. */
export function entriesOf(value: unknown): Array<{ key: string; text: string }> | null {
  const record = asRecord(value)
  if (!record) return null
  return Object.entries(record)
    .map(([key, entry]) => ({ key, text: describeValue(entry) }))
    .filter((entry) => entry.text !== '')
}

/** 글자 수(UTF-16 단위)가 `max`를 넘으면 자르고 「…」를 붙인다. */
export function truncateText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** 결정 전 상태(도착·검토중). */
export function isUndecidedStatus(status: string): boolean {
  return status === 'arrived' || status === 'reviewing'
}

// ── 목록 순서: 공개 시각 날짜별 묶음 ─────────────────────────────────────────────────────────────

interface Orderable {
  startsAt: string | null
  position: number
}

export interface OpsItemDayGroup<T> {
  /** KST 날짜 키 `YYYY-MM-DD`. 공개 시각이 없는 묶음은 null. */
  dayKey: string | null
  /** 「10/6(월)」. 공개 시각이 없는 묶음은 null. */
  dayLabel: string | null
  items: T[]
}

function startsAtTime(item: Orderable): number {
  const time = item.startsAt ? Date.parse(item.startsAt) : NaN
  return Number.isNaN(time) ? Infinity : time
}

/**
 * 공개 시각(KST) 날짜마다 묶는다. 날짜는 이른 순, 같은 날은 공개 시각 순(같으면 제출 순서), 공개 시각이 없거나
 * 읽을 수 없는 항목은 맨 끝 묶음에 제출 순서대로 둔다.
 */
export function groupItemsByDay<T extends Orderable>(items: readonly T[]): OpsItemDayGroup<T>[] {
  const dated = new Map<string, T[]>()
  const undated: T[] = []
  for (const item of items) {
    const key = kstDateKey(item.startsAt)
    if (key === null) {
      undated.push(item)
      continue
    }
    const list = dated.get(key)
    if (list) list.push(item)
    else dated.set(key, [item])
  }

  const groups: OpsItemDayGroup<T>[] = [...dated.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dayKey, list]) => ({
      dayKey,
      dayLabel: formatKstDay(list[0].startsAt),
      items: [...list].sort((a, b) => startsAtTime(a) - startsAtTime(b) || a.position - b.position),
    }))

  if (undated.length > 0) {
    groups.push({ dayKey: null, dayLabel: null, items: [...undated].sort((a, b) => a.position - b.position) })
  }
  return groups
}

/** 처음 선택할 항목: 목록 순서에서 결정 전 첫 항목, 없으면 첫 행, 항목이 없으면 null. */
export function defaultSelectedItem<T extends Orderable & { status: string }>(items: readonly T[]): T | null {
  const ordered = groupItemsByDay(items).flatMap((group) => group.items)
  return ordered.find((item) => isUndecidedStatus(item.status)) ?? ordered[0] ?? null
}

// ── 가운데 열 탭: 전체 · 결정할 것 · 형식 오류 · 멈춘 것 · 밸런스 경고 ───────────────────────────

export const OPS_ITEM_FILTERS = ['all', 'decide', 'error', 'stopped', 'balance'] as const
export type OpsItemFilter = (typeof OPS_ITEM_FILTERS)[number]

export const OPS_ITEM_FILTER_LABELS: Record<OpsItemFilter, string> = {
  all: '전체',
  decide: '결정할 것',
  error: '형식 오류',
  stopped: '멈춘 것',
  balance: BALANCE_TAB_LABEL,
}

interface Filterable {
  /** 항목 행 ID. 「밸런스 경고」 탭이 이 값으로 항목을 찾는다(없으면 그 탭에는 걸리지 않는다). */
  id?: string
  status: string
  formatErrors: readonly string[]
}

/**
 * 멈춘 것 = 표시줄 밖 상태(반려·취소·실패)인 항목이다. 밸런스 경고 = 항목 줄이 하나라도 있는 항목이다
 * (`balanceItemIds`: 밸런스 평가 결과에서 항목 줄이 있는 항목 ID, 티켓 20260930_1459).
 */
export function matchesItemFilter(item: Filterable, filter: OpsItemFilter, balanceItemIds?: ReadonlySet<string>): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'decide':
      return isUndecidedStatus(item.status)
    case 'error':
      return item.formatErrors.length > 0
    case 'stopped':
      return item.status === 'rejected' || item.status === 'cancelled' || item.status === 'failed'
    case 'balance':
      return item.id !== undefined && balanceItemIds?.has(item.id) === true
  }
}

/**
 * 트렌드 걸러 보기(`?trend=`, 티켓 20261026_2033 2회차): 목록을 주어진 항목 ID로 좁힌다. 순서는 그대로다.
 * `ids`가 없으면(걸러 보기 꺼짐) 목록을 그대로 돌려준다.
 */
export function narrowItemsToIds<T extends { id: string }>(items: readonly T[], ids: readonly string[] | null | undefined): readonly T[] {
  if (!ids) return items
  const allowed = new Set(ids)
  return items.filter((item) => allowed.has(item.id))
}

export function countByItemFilter(items: readonly Filterable[], balanceItemIds?: ReadonlySet<string>): Record<OpsItemFilter, number> {
  return {
    all: items.length,
    decide: items.filter((item) => matchesItemFilter(item, 'decide')).length,
    error: items.filter((item) => matchesItemFilter(item, 'error')).length,
    stopped: items.filter((item) => matchesItemFilter(item, 'stopped')).length,
    balance: items.filter((item) => matchesItemFilter(item, 'balance', balanceItemIds)).length,
  }
}
