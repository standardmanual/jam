/**
 * 포인트 고액 원장 목록 쿼리 단일화(티켓 20260924_0950, 상위 티켓 §4.3) — 목록
 * (`admin/points/page.tsx`)·전체 선택용 ID 조회(`api/admin/points/ledger/ids`)·내보내기
 * (`api/admin/points/ledger/export`)가 같은 조건(기준액 이상, 사유·기간 필터, 정렬)을 쓰도록
 * `parseLedgerListParams`(URL → 타입) + `applyLedgerListQuery`(타입 → 쿼리)로 나눈다.
 *
 * 예전 화면은 원장 최근 50,000건을 통째로 받아 앞 20건만 잘라 보여 줬다(`lib/points/summary.ts`).
 * 이제는 DB에서 기준액 조건(`amount >= 기준액 OR amount <= -기준액`)으로 거른 결과를 한 쪽 50건씩
 * 보여 준다. 원장은 회계성 로그(append-only)라 이 화면에는 바꾸는 기능이 없고 내보내기만 있다.
 */
import type { PointTransactionRow } from '@/types/database'
import { HIGH_VALUE_THRESHOLD, adminReasonLabel } from '@/lib/points/reasons'

export type PointReason = PointTransactionRow['reason']

/** 사유 코드 → 표시 라벨. 운영자 지급·회수는 `admin_reason_label`로 다시 세분한다({@link ledgerReasonLabel}) */
export const REASON_KIND: Record<PointReason, string> = {
  badge_point_reward: '배지 보상',
  mission_point_reward: '미션 보상',
  admin_grant: '운영자 지급',
  admin_deduct: '운영자 회수',
  combine_fail_reward: '믹스 실패 보상',
  combine_recipe_reward: '믹스 보상',
  item_book_completion_point_reward: '컬렉션 완성 보상',
}

/** 사유 필터 선택지 — `REASON_KIND`의 키 순서 그대로 */
export const LEDGER_REASON_OPTIONS: { value: PointReason; label: string }[] = (
  Object.keys(REASON_KIND) as PointReason[]
).map((value) => ({ value, label: REASON_KIND[value] }))

/** 원장 한 줄의 사유 라벨 — 운영자 지급·회수는 어드민이 고른 세부 사유(CS 보상 등)를 보여 준다 */
export function ledgerReasonLabel(reason: PointReason, adminReasonCode: string | null): string {
  return reason === 'admin_grant' || reason === 'admin_deduct' ? adminReasonLabel(adminReasonCode) : REASON_KIND[reason]
}

/** 목록에 쓰는 컬럼만 select — 표시·내보내기에 필요한 값 전부(원장 행은 작다) */
export const LEDGER_COLUMNS = 'id, user_id, amount, reason, admin_reason_label, admin_reason_note, created_at'

export type LedgerRow = Pick<
  PointTransactionRow,
  'id' | 'user_id' | 'amount' | 'reason' | 'admin_reason_label' | 'admin_reason_note' | 'created_at'
>

/** 표에 그리는 한 줄 — 원장 행에 유저 이름과 사유 라벨을 붙인 것 */
export interface LedgerEntry {
  id: string
  user_id: string
  username: string | null
  amount: number
  label: string
  created_at: string
}

const LEDGER_SORTS = ['created_desc', 'created_asc', 'amount_desc', 'amount_asc'] as const
export type LedgerSort = (typeof LEDGER_SORTS)[number]

export const LEDGER_DEFAULT_SORT: LedgerSort = 'created_desc'

function isLedgerSort(value: string | undefined): value is LedgerSort {
  return !!value && (LEDGER_SORTS as readonly string[]).includes(value)
}

function isReason(value: string | undefined): value is PointReason {
  return !!value && (Object.keys(REASON_KIND) as string[]).includes(value)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** `YYYY-MM-DD`(한국 날짜)만 받는다 — 달력에 없는 날짜(`2026-02-30` 등)는 버린다 */
function parseKstDate(value: string | undefined): string | undefined {
  if (!value || !DATE_RE.test(value)) return undefined
  const ms = Date.parse(`${value}T00:00:00+09:00`)
  if (Number.isNaN(ms)) return undefined
  // Date.parse는 2월 30일을 3월 2일로 넘기므로 되돌려 같은 날짜인지 확인한다
  const roundTrip = new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return roundTrip === value ? value : undefined
}

export interface LedgerListParams {
  reason: PointReason | 'all'
  /** 조회 시작일(포함, 한국 날짜 `YYYY-MM-DD`) */
  from: string | undefined
  /** 조회 종료일(포함, 한국 날짜 `YYYY-MM-DD`) */
  to: string | undefined
  sort: LedgerSort
}

/** URL(또는 API 쿼리) 파라미터 → 타입이 있는 목록 조건. 세 곳이 전부 이 함수를 거친다. */
export function parseLedgerListParams(raw: Record<string, string | undefined>): LedgerListParams {
  return {
    reason: isReason(raw.reason) ? raw.reason : 'all',
    from: parseKstDate(raw.from),
    to: parseKstDate(raw.to),
    sort: isLedgerSort(raw.sort) ? raw.sort : LEDGER_DEFAULT_SORT,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 한국 날짜의 0시를 UTC ISO 문자열로 — 쿼리스트링에 `+`가 들어가지 않게 UTC로 바꿔 보낸다 */
function startOfDayKst(date: string, addDays = 0): string {
  return new Date(Date.parse(`${date}T00:00:00+09:00`) + addDays * DAY_MS).toISOString()
}

export interface LedgerListQueryResult<T> {
  data: T[] | null
  count: number | null
  error: { message: string } | null
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스 — 호출부는
 *  `supabase.from('point_transactions').select(...) as unknown as LedgerListQuery<Row>`로 좁혀 쓴다. */
export interface LedgerListQuery<T> {
  or(filters: string): LedgerListQuery<T>
  eq(column: string, value: string): LedgerListQuery<T>
  gte(column: string, value: string): LedgerListQuery<T>
  lt(column: string, value: string): LedgerListQuery<T>
  order(column: string, options?: { ascending?: boolean }): LedgerListQuery<T>
  range(from: number, to: number): PromiseLike<LedgerListQueryResult<T>>
}

const SORT_COLUMN: Record<LedgerSort, readonly [string, boolean]> = {
  created_desc: ['created_at', false],
  created_asc: ['created_at', true],
  amount_desc: ['amount', false],
  amount_asc: ['amount', true],
}

/**
 * 기준액 조건·사유·기간·정렬을 쿼리에 적용한다. 보조 정렬로 `id`를 항상 붙인다(같은 시각·같은
 * 금액 원장 사이의 페이징 안정성).
 */
export function applyLedgerListQuery<T>(query: LedgerListQuery<T>, params: LedgerListParams): LedgerListQuery<T> {
  let next = query.or(`amount.gte.${HIGH_VALUE_THRESHOLD},amount.lte.-${HIGH_VALUE_THRESHOLD}`)

  if (params.reason !== 'all') next = next.eq('reason', params.reason)
  if (params.from) next = next.gte('created_at', startOfDayKst(params.from))
  if (params.to) next = next.lt('created_at', startOfDayKst(params.to, 1))

  const [column, ascending] = SORT_COLUMN[params.sort]
  next = next.order(column, { ascending })
  next = next.order('id', { ascending: true })

  return next
}
