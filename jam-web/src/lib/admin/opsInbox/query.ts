/**
 * 받은 기획함 읽기 조회 (티켓 20260930_1817) — 서버 전용(`createServiceClient`가 `next/headers`를 문다).
 *
 * **읽기만 한다.** `select`만 부르고 `insert`·`update`·`upsert`·`delete`는 부르지 않는다. 화면을 열거나 새로 고치는 것만으로
 * 상태가 바뀌지 않는다는 완료 조건이다(`__tests__/query.test.ts`가 지킨다). 「도착 → 검토중」 전환은 화면이 따로 요청하는
 * `POST /api/admin/ops-inbox/[bundleId]/open`이 한다.
 *
 * 묶음 상태는 저장하지 않고 항목 상태에서 계산하므로(`bundleStatus.ts`) 목록은 서버에서 계산한 뒤 거르고 정렬하고
 * 50건씩 자른다. 묶음 목록에는 제출 원본(`raw`, 최대 1MB)을 가져오지 않는다.
 *
 * ⚠️ **PostgREST 기본 페이지 상한(1000행)** — 에러 없이 잘린 목록이 돌아오므로 `range`로 끝까지 넘겨 전량을 받는다
 * (`badge-families-query.ts`의 `fetchActivityFamilyBadges`와 같은 방식이다).
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import { ADMIN_LIST_PAGE_SIZE, pageRange, totalPagesOf } from '@/lib/admin/list-params'
import { throwOnQueryError } from '@/lib/admin/queryError'
import { isUuid } from '@/lib/admin/uuid'
import {
  OPS_INBOX_TABS,
  computeBundleStatus,
  tabOfBundleStage,
  type OpsBundleStage,
  type OpsInboxTab,
} from '@/lib/admin/opsInbox/bundleStatus'

const FETCH_PAGE_SIZE = 1000
const ERROR_LABEL = 'ops-inbox'

// ── 목록 조건 ────────────────────────────────────────────────────────────────────────────────────

export const OPS_INBOX_SORT_KEYS = ['received_at', 'week', 'items'] as const
export type OpsInboxSortKey = (typeof OPS_INBOX_SORT_KEYS)[number]

export interface OpsInboxParams {
  tab: OpsInboxTab
  sortKey: OpsInboxSortKey
  sortDesc: boolean
  page: number
}

const DEFAULT_SORT: Pick<OpsInboxParams, 'sortKey' | 'sortDesc'> = { sortKey: 'received_at', sortDesc: true }

/**
 * `sort` 값을 읽는다. 표 머리 칸 클릭이 쓰는 공용 훅은 `received_at_desc`·`week_asc` 모양으로 쓰고(`list-params.ts`),
 * 설계의 `-received_at`(앞에 `-`이 내림차순)도 받는다. 목록에 없는 값은 기본(받은 시각 최신순)이다.
 */
function parseSort(raw: string | undefined): Pick<OpsInboxParams, 'sortKey' | 'sortDesc'> {
  if (!raw) return DEFAULT_SORT
  const suffix = /^(.+)_(asc|desc)$/.exec(raw)
  const prefixed = raw.startsWith('-') ? raw.slice(1) : null
  const key = suffix ? suffix[1] : (prefixed ?? raw)
  if (!(OPS_INBOX_SORT_KEYS as readonly string[]).includes(key)) return DEFAULT_SORT
  const desc = suffix ? suffix[2] === 'desc' : prefixed !== null
  return { sortKey: key as OpsInboxSortKey, sortDesc: desc }
}

/** URL 쿼리를 목록 조건으로 바꾼다. 모르는 값은 기본값(`tab=all`, 받은 시각 최신순, 1쪽)이다. */
export function parseOpsInboxParams(raw: Record<string, string | undefined>): OpsInboxParams {
  const tab = (OPS_INBOX_TABS as readonly string[]).includes(raw.tab ?? '') ? (raw.tab as OpsInboxTab) : 'all'
  const page = Math.max(1, parseInt(raw.page ?? '1', 10) || 1)
  return { tab, ...parseSort(raw.sort), page }
}

// ── 목록 ─────────────────────────────────────────────────────────────────────────────────────────

export interface OpsBundleListRow {
  /** DB 행 ID(`ops_bundles.id`). 상세 경로에 쓴다. 제출자가 정한 `bundle_id`가 아니다. */
  id: string
  week: string | null
  hypothesis: string | null
  author: string
  isSample: boolean
  formatErrorCount: number
  receivedAt: string
  itemCount: number
  stage: OpsBundleStage
  partialFailure: boolean
  /** 도착·검토중이 아닌 항목 수(「결정 3/12」). */
  decidedCount: number
}

export interface OpsBundleListResult {
  /** 지금 쪽에 보일 묶음. */
  rows: OpsBundleListRow[]
  /** 실제로 적용한 쪽(요청한 쪽이 마지막 쪽을 넘으면 마지막 쪽으로 맞춘다). */
  page: number
  totalPages: number
  /** 지금 탭에 맞는 묶음 수(쪽 나누기 전). */
  total: number
  /** 탭별 묶음 수. 탭 제목의 숫자다. */
  counts: Record<OpsInboxTab, number>
}

interface BundleListSource {
  id: string
  week: string | null
  hypothesis: string | null
  author: string
  is_sample: boolean
  format_errors: Json
  received_at: string
}

interface ItemStatusSource {
  bundle_id: string
  status: string
}

/** jsonb 배열 칸에서 문자열만 뽑는다(모양이 틀려도 화면이 죽지 않게 한다). */
function stringList(value: Json | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function compareNullableLast<T>(a: T | null, b: T | null, compare: (x: T, y: T) => number, desc: boolean): number {
  if (a === null && b === null) return 0
  if (a === null) return 1 // 값이 없는 묶음은 방향과 무관하게 맨 끝이다
  if (b === null) return -1
  return desc ? compare(b, a) : compare(a, b)
}

function receivedTime(row: OpsBundleListRow): number {
  const time = Date.parse(row.receivedAt)
  return Number.isNaN(time) ? 0 : time
}

function sortRows(rows: OpsBundleListRow[], sortKey: OpsInboxSortKey, desc: boolean): OpsBundleListRow[] {
  const byKey = (a: OpsBundleListRow, b: OpsBundleListRow): number => {
    if (sortKey === 'items') return desc ? b.itemCount - a.itemCount : a.itemCount - b.itemCount
    if (sortKey === 'week') return compareNullableLast(a.week, b.week, (x, y) => (x < y ? -1 : x > y ? 1 : 0), desc)
    return desc ? receivedTime(b) - receivedTime(a) : receivedTime(a) - receivedTime(b)
  }
  return [...rows].sort((a, b) => {
    const primary = byKey(a, b)
    if (primary !== 0) return primary
    // 같은 값이면 받은 시각 최신순, 그래도 같으면 ID로 순서를 고정한다(쪽을 넘겨도 순서가 흔들리지 않게)
    const time = receivedTime(b) - receivedTime(a)
    if (time !== 0) return time
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * 묶음·항목 상태 원본에서 목록을 만든다(순수 함수). 묶음마다 항목 상태로 단계를 계산하고, 탭별 개수를 센 뒤,
 * 지금 탭으로 거르고 정렬하고 50건씩 자른다.
 */
export function buildOpsBundleList(
  bundles: readonly BundleListSource[],
  itemStatuses: readonly ItemStatusSource[],
  params: OpsInboxParams
): OpsBundleListResult {
  const statusesByBundle = new Map<string, string[]>()
  for (const item of itemStatuses) {
    const list = statusesByBundle.get(item.bundle_id)
    if (list) list.push(item.status)
    else statusesByBundle.set(item.bundle_id, [item.status])
  }

  const all: OpsBundleListRow[] = bundles.map((bundle) => {
    const statuses = statusesByBundle.get(bundle.id) ?? []
    const status = computeBundleStatus(statuses)
    return {
      id: bundle.id,
      week: bundle.week,
      hypothesis: bundle.hypothesis,
      author: bundle.author,
      isSample: bundle.is_sample,
      formatErrorCount: stringList(bundle.format_errors).length,
      receivedAt: bundle.received_at,
      itemCount: statuses.length,
      stage: status.stage,
      partialFailure: status.partialFailure,
      decidedCount: status.decidedCount,
    }
  })

  const counts: Record<OpsInboxTab, number> = { all: all.length, decide: 0, progress: 0, closed: 0 }
  for (const row of all) counts[tabOfBundleStage(row.stage)] += 1

  const matched = params.tab === 'all' ? all : all.filter((row) => tabOfBundleStage(row.stage) === params.tab)
  const sorted = sortRows(matched, params.sortKey, params.sortDesc)

  const totalPages = totalPagesOf(sorted.length, ADMIN_LIST_PAGE_SIZE)
  const page = Math.min(params.page, totalPages)
  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)

  return { rows: sorted.slice(from, to + 1), page, totalPages, total: sorted.length, counts }
}

const BUNDLE_LIST_COLUMNS = 'id, week, hypothesis, author, is_sample, format_errors, received_at'

/** 받은 기획함 목록. 묶음 전체와 항목 상태를 끝까지 받아 계산한다(조회 오류는 던져 `error.tsx`가 받는다). */
export async function listOpsBundles(params: OpsInboxParams): Promise<OpsBundleListResult> {
  const supabase = createServiceClient()

  const bundles: BundleListSource[] = []
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('ops_bundles')
      .select(BUNDLE_LIST_COLUMNS)
      .order('received_at', { ascending: false })
      .order('id')
      .range(from, from + FETCH_PAGE_SIZE - 1)
    throwOnQueryError(error, ERROR_LABEL)
    const page = data ?? []
    bundles.push(...page)
    if (page.length < FETCH_PAGE_SIZE) break
  }

  const itemStatuses: ItemStatusSource[] = []
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('ops_bundle_items')
      .select('bundle_id, status')
      .order('id')
      .range(from, from + FETCH_PAGE_SIZE - 1)
    throwOnQueryError(error, ERROR_LABEL)
    const page = data ?? []
    itemStatuses.push(...page)
    if (page.length < FETCH_PAGE_SIZE) break
  }

  return buildOpsBundleList(bundles, itemStatuses, params)
}

// ── 상세 ─────────────────────────────────────────────────────────────────────────────────────────

export interface OpsBundleHeader {
  id: string
  /** 제출자가 정한 묶음 식별자. 자기 신고라 제목으로 쓰지 않는다. */
  bundleId: string
  week: string | null
  hypothesis: string | null
  author: string
  isSample: boolean
  formatErrors: string[]
  receivedAt: string
}

export interface OpsItemRecord {
  id: string
  position: number
  /** 제출자가 정한 값. 묶음 안에서 겹칠 수 있어 선택·연결의 기준으로 쓰지 않는다. */
  itemKey: string | null
  kind: string | null
  patternNo: string | null
  startsAt: string | null
  endsAt: string | null
  status: string
  /** 제출 항목 원본(바뀌지 않는다). */
  original: Json
  /** 직접 수정본(1818이 채운다). */
  edited: Json | null
  formatErrors: string[]
  updatedAt: string
}

export interface OpsDecisionRecord {
  id: string
  itemId: string | null
  action: string
  actor: string
  batchId: string | null
  diff: Json | null
  reason: string | null
  slackResult: Json | null
  createdAt: string
}

export interface OpsBundleDetail {
  bundle: OpsBundleHeader
  /** `position` 순. */
  items: OpsItemRecord[]
  /** 최신순. */
  decisions: OpsDecisionRecord[]
}

const BUNDLE_DETAIL_COLUMNS = 'id, bundle_id, week, hypothesis, author, is_sample, format_errors, received_at'
const ITEM_DETAIL_COLUMNS =
  'id, position, item_key, kind, pattern_no, starts_at, ends_at, status, original, edited, format_errors, updated_at'
const DECISION_COLUMNS = 'id, item_id, action, actor, batch_id, diff, reason, slack_result, created_at'

/** 기획 상세. UUID가 아니거나 없는 묶음이면 null이다(조회 오류는 던진다). */
export async function getOpsBundleDetail(id: string): Promise<OpsBundleDetail | null> {
  if (!isUuid(id)) return null
  const supabase = createServiceClient()

  const bundleResult = await supabase.from('ops_bundles').select(BUNDLE_DETAIL_COLUMNS).eq('id', id).maybeSingle()
  throwOnQueryError(bundleResult.error, ERROR_LABEL)
  const bundle = bundleResult.data
  if (!bundle) return null

  const [itemsResult, decisionsResult] = await Promise.all([
    supabase.from('ops_bundle_items').select(ITEM_DETAIL_COLUMNS).eq('bundle_id', id).order('position'),
    supabase.from('ops_decisions').select(DECISION_COLUMNS).eq('bundle_id', id).order('created_at', { ascending: false }),
  ])
  throwOnQueryError(itemsResult.error, ERROR_LABEL)
  throwOnQueryError(decisionsResult.error, ERROR_LABEL)

  return {
    bundle: {
      id: bundle.id,
      bundleId: bundle.bundle_id,
      week: bundle.week,
      hypothesis: bundle.hypothesis,
      author: bundle.author,
      isSample: bundle.is_sample,
      formatErrors: stringList(bundle.format_errors),
      receivedAt: bundle.received_at,
    },
    items: (itemsResult.data ?? []).map((item) => ({
      id: item.id,
      position: item.position,
      itemKey: item.item_key,
      kind: item.kind,
      patternNo: item.pattern_no,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      status: item.status,
      original: item.original,
      edited: item.edited,
      formatErrors: stringList(item.format_errors),
      updatedAt: item.updated_at,
    })),
    decisions: (decisionsResult.data ?? []).map((decision) => ({
      id: decision.id,
      itemId: decision.item_id,
      action: decision.action,
      actor: decision.actor,
      batchId: decision.batch_id,
      diff: decision.diff,
      reason: decision.reason,
      slackResult: decision.slack_result,
      createdAt: decision.created_at,
    })),
  }
}
