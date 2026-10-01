/**
 * 밸런스 평가가 읽는 서비스 상태 (티켓 20260930_1459 조각 A).
 *
 * 규칙 R1~R3·R6·R7은 이 묶음 밖의 사실이 필요하다: 지금 열린 컬렉션(`item_books`), 다른 묶음의 아직 만들어지지 않은 신규 개방
 * (`ops_bundle_items`), 보상 배지의 포인트와 같은 계열 배지의 포인트(`badges`). 읽기만 한다 — `select` 계열만 부른다.
 *
 * **읽기 실패는 그 상태를 쓰는 규칙만 「점검 못 함」으로 넘긴다**(`StateRead`의 `ok: false`). 한 조회가 실패해도 다른 조회와
 * 평가 전체는 이어진다. 서비스 클라이언트는 인자로 받는다(`query.ts`가 `createServiceClient()`를 만들어 넘기고, 테스트는 가짜를
 * 넘긴다). 모듈이 서버 전용 코드를 끌어오지 않도록 클라이언트 타입만 가져온다.
 *
 * 다른 묶음의 신규 개방은 **시험이 아닌 묶음의 반려·취소·실패가 아닌 `collection_launch`** 를 센다. 만들어진 자원 ID가 있는 항목도
 * 목록에 넣고 `resourceCreated`로 표시한다 — R2·R3(개방 속도)은 이미 만든 개방도 센 개수라서 모두 세고, R1(동시 개방 수)은 만들어진 것을
 * DB 컬렉션(`books`)에서 이미 세므로 `resourceCreated`가 아닌 것만 항목에서 더한다(두 번 세지 않는다. 티켓 20260930_1459 조각 B).
 * 지금 평가하는 묶음은 뺀다(그 항목은 평가 입력으로 따로 들어온다). 그래서 시험 묶음끼리는 서로 세지 않는다.
 *
 * 평가할 `collection_launch` 항목이 없는 묶음은 컬렉션·다른 묶음 조회를 건너뛴다(`BalanceReferences.hasLaunches`). 건너뛴 상태는
 * `ok: false`이지만 그 상태를 쓰는 규칙(R1~R3)은 신규 개방 항목이 있어야 돌므로 「점검 못 함」으로 나오지 않는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
import type { ItemBookVisibilityFields } from '@/lib/itembook/visibility'
import { isUuid } from '@/lib/admin/uuid'
import { BALANCE_SKIPPED_STATUSES } from './rules'
import { countOpenCollectionsAt, isCountBadgeCondition, readTimeValue } from './evaluate'

type ServiceClient = ReturnType<typeof createServiceClient>

const FETCH_PAGE_SIZE = 1000
const LOG_LABEL = 'ops-inbox/balance'

/** 읽은 결과. `ok: false`면 그 상태를 쓰는 규칙이 「점검 못 함」이 된다(읽지 못한 경우와, 쓸 규칙이 없어 읽지 않은 경우). */
export type StateRead<T> = { ok: true; data: T } | { ok: false }

/**
 * 다른 묶음의 신규 개방 하나(`collection_launch` 항목). 시각은 읽을 수 있는 ISO 문자열이고, 못 읽으면 `null`이다.
 * `resourceCreated`는 컬렉션이 이미 만들어졌는지(`created_resource`가 있음)다 — 만들어졌으면 R1은 DB 컬렉션에서 세므로 항목에서 더하지 않는다.
 */
export interface PendingLaunch {
  itemId: string
  startsAt: string | null
  endsAt: string | null
  resourceCreated: boolean
}

/** 같은 계열의 기존 배지 하나(R7). `countType`은 횟수형 여부이고 조건을 읽지 못하면 `null`이다. */
export interface ExistingFamilyBadge {
  id: string
  pointReward: number
  countType: boolean | null
}

/** 평가 입력이 가리키는 외부 자원: 보상 배지 ID(R6)와 계열 이름(R7), 그리고 평가할 신규 개방(`collection_launch`) 항목이 있는지(R1~R3). */
export interface BalanceReferences {
  rewardBadgeIds: string[]
  familyKeys: string[]
  /** 평가할 `collection_launch` 항목이 하나라도 있는지. 없으면 컬렉션·다른 묶음 조회를 건너뛴다. */
  hasLaunches: boolean
}

export interface BalanceState {
  /** 노출 판정 칸만 읽은 컬렉션(R1). */
  books: StateRead<ItemBookVisibilityFields[]>
  /** 다른 묶음의 신규 개방(R1~R3). */
  otherLaunches: StateRead<PendingLaunch[]>
  /** 보상 배지 ID → `point_reward`. 찾은 배지만 들어 있다(R6). */
  badgePoints: StateRead<Record<string, number>>
  /** 계열 이름 → 그 계열의 기존 배지(R7). */
  familyBadges: StateRead<Record<string, ExistingFamilyBadge[]>>
}

// ── 순수 선별 ───────────────────────────────────────────────────────────────────────────────────

interface LaunchRow {
  id: string
  bundle_id: string
  status: string
  starts_at: string | null
  ends_at: string | null
  original: Json
  edited: Json | null
  created_resource: Json | null
}

interface BundleFlagRow {
  id: string
  is_sample: boolean
}

function recordOf(value: Json | null): Record<string, Json | undefined> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
}

/** 수정본이 있으면 수정본, 없으면 제출 원본의 시각을 읽는다(`readTimeValue`와 같은 규칙). 못 읽으면 `null`이다. */
function launchTime(row: LaunchRow, field: 'starts_at' | 'ends_at'): string | null {
  const edited = recordOf(row.edited)?.[field]
  const raw = edited !== undefined && edited !== null ? edited : recordOf(row.original)?.[field]
  const read = readTimeValue(raw, row[field], field === 'starts_at' ? 'start' : 'end')
  return read.ok ? new Date(read.value).toISOString() : null
}

/**
 * 다른 묶음의 신규 개방을 고른다(순수 함수). 지금 평가하는 묶음·시험 묶음·알 수 없는 묶음의 항목, 반려·취소·실패 항목은 뺀다.
 * 이미 자원이 만들어진 항목은 빼지 않고 `resourceCreated`로 표시한다(R2·R3은 센다, R1은 DB 컬렉션에서 이미 세므로 더하지 않는다).
 */
export function selectOtherLaunches(
  rows: readonly LaunchRow[],
  bundles: readonly BundleFlagRow[],
  currentBundleId: string
): PendingLaunch[] {
  const countedBundles = new Set(bundles.filter((b) => !b.is_sample && b.id !== currentBundleId).map((b) => b.id))
  return rows
    .filter(
      (row) =>
        countedBundles.has(row.bundle_id) && !BALANCE_SKIPPED_STATUSES.includes(row.status)
    )
    .map((row) => ({
      itemId: row.id,
      startsAt: launchTime(row, 'starts_at'),
      endsAt: launchTime(row, 'ends_at'),
      resourceCreated: row.created_resource !== null && row.created_resource !== undefined,
    }))
}

// ── 조회 ────────────────────────────────────────────────────────────────────────────────────────

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** PostgREST 기본 상한(1000행)에 잘리지 않게 끝까지 받는다. 조회 오류는 던진다. */
async function fetchAll<T>(page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await page(from, from + FETCH_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < FETCH_PAGE_SIZE) return all
  }
}

async function attempt<T>(label: string, read: () => Promise<T>): Promise<StateRead<T>> {
  try {
    return { ok: true, data: await read() }
  } catch (error) {
    console.error(`[admin/${LOG_LABEL}] 서비스 상태 조회 실패(${label}):`, error)
    return { ok: false }
  }
}

async function loadBooks(supabase: ServiceClient): Promise<ItemBookVisibilityFields[]> {
  return fetchAll((from, to) =>
    supabase.from('item_books').select('is_active, valid_from, valid_until').eq('is_active', true).order('id').range(from, to)
  )
}

async function loadOtherLaunches(supabase: ServiceClient, currentBundleId: string): Promise<PendingLaunch[]> {
  const bundles = await fetchAll((from, to) =>
    supabase.from('ops_bundles').select('id, is_sample').eq('is_sample', false).order('id').range(from, to)
  )
  const rows = await fetchAll((from, to) =>
    supabase
      .from('ops_bundle_items')
      .select('id, bundle_id, status, starts_at, ends_at, original, edited, created_resource')
      .eq('kind', 'collection_launch')
      .order('id')
      .range(from, to)
  )
  return selectOtherLaunches(rows, bundles, currentBundleId)
}

async function loadBadgePoints(supabase: ServiceClient, ids: readonly string[]): Promise<Record<string, number>> {
  const valid = ids.filter(isUuid)
  if (valid.length === 0) return {}
  const rows = await fetchAll((from, to) =>
    supabase.from('badges').select('id, point_reward').in('id', valid).order('id').range(from, to)
  )
  return Object.fromEntries(rows.map((row) => [row.id, row.point_reward]))
}

async function loadFamilyBadges(
  supabase: ServiceClient,
  familyKeys: readonly string[]
): Promise<Record<string, ExistingFamilyBadge[]>> {
  const rows = await fetchAll((from, to) =>
    supabase
      .from('badges')
      .select('id, family_key, point_reward, condition_json, deleted_at')
      .in('family_key', [...familyKeys])
      .order('id')
      .range(from, to)
  )
  const byFamily: Record<string, ExistingFamilyBadge[]> = {}
  for (const row of rows) {
    if (row.deleted_at !== null || row.family_key === null) continue
    ;(byFamily[row.family_key] ??= []).push({
      id: row.id,
      pointReward: row.point_reward,
      countType: isCountBadgeCondition(row.condition_json),
    })
  }
  return byFamily
}

/**
 * 평가에 필요한 서비스 상태를 읽는다. 조회마다 실패를 따로 받아 `ok: false`로 돌려주므로 이 함수는 던지지 않는다.
 * 보상 배지·계열 이름이 없으면 그 조회는 하지 않는다(빈 결과로 성공 처리). 평가할 `collection_launch` 항목이 없으면(`hasLaunches`가 거짓)
 * 컬렉션·다른 묶음 조회를 건너뛰고 `ok: false`로 둔다 — R1~R3은 그런 묶음에서 돌지 않으므로 어느 규칙도 「점검 못 함」이 되지 않는다.
 */
export async function loadBalanceState(
  supabase: ServiceClient,
  options: { currentBundleId: string; references: BalanceReferences }
): Promise<BalanceState> {
  const { currentBundleId, references } = options
  const skipped: StateRead<never> = { ok: false }
  const [books, otherLaunches, badgePoints, familyBadges] = await Promise.all([
    references.hasLaunches ? attempt('item_books', () => loadBooks(supabase)) : Promise.resolve<StateRead<ItemBookVisibilityFields[]>>(skipped),
    references.hasLaunches ? attempt('ops_bundle_items', () => loadOtherLaunches(supabase, currentBundleId)) : Promise.resolve<StateRead<PendingLaunch[]>>(skipped),
    references.rewardBadgeIds.length > 0
      ? attempt('badges(보상 배지)', () => loadBadgePoints(supabase, references.rewardBadgeIds))
      : Promise.resolve<StateRead<Record<string, number>>>({ ok: true, data: {} }),
    references.familyKeys.length > 0
      ? attempt('badges(계열)', () => loadFamilyBadges(supabase, references.familyKeys))
      : Promise.resolve<StateRead<Record<string, ExistingFamilyBadge[]>>>({ ok: true, data: {} }),
  ])
  return { books, otherLaunches, badgePoints, familyBadges }
}

/**
 * 지금 열려 있는(노출 중인) 컬렉션 수 — 설정 화면(S7)의 「지금 서비스」 상자가 쓴다. 읽기에 실패하면 던지지 않고 `ok: false`다.
 * 기획 상세의 「지금 열린 컬렉션」과 같은 판정(`isItemBookDroppable`)과 같은 읽기(`loadBooks`)다.
 */
export async function loadOpenCollectionsNow(supabase: ServiceClient, nowIso: string = new Date().toISOString()): Promise<StateRead<number>> {
  return attempt('item_books(열린 컬렉션 수)', async () => countOpenCollectionsAt(await loadBooks(supabase), nowIso))
}
