/**
 * 어뷰징 화면 목록 쿼리 단일화(티켓 20260924_0952, 상위 티켓 §4.4 어뷰징 행) — 목록 페이지
 * (`admin/abusing/page.tsx`)와 전체 선택용 ID 조회(`api/admin/abusing/poi-blocks/ids`)가
 * 같은 필터 규칙({@link parseAbusingListParams})을 쓰도록 모은다.
 *
 * 활성 = 차단 만료 시각(`blocked_until`)이 지금보다 뒤.
 * 검색은 유저 이름·이메일과 POI 이름을 {@link sanitizeSearchTerm}으로
 * 정제한 뒤 먼저 일치하는 id를 찾고, 그 id로 목록을 좁힌다 — 한 쿼리로 두 관계(유저·POI)를 OR로
 * 걸 수 없기 때문이다.
 * 옛 섀도우밴(`user_shadow_bans`) 탭의 목록 조회는 티켓 20261021_1250(6-4 2회)에서 지웠다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { sanitizeSearchTerm } from './search-term'
import { ADMIN_LIST_PAGE_SIZE } from './list-params'
import { fetchSuspensionActiveCount } from './suspension-list'

type ServiceClient = ReturnType<typeof createServiceClient>

export type AbusingListTab = 'poi-blocks'
export type AbusingListStatus = 'active' | 'expired' | 'all'

/** "필터 결과 전체 선택" 상한(상위 티켓 §6 결정 1) */
export const ABUSING_SELECT_ALL_CAP = 1000

/** 검색어와 일치하는 유저·POI를 찾을 때 가져오는 최대 건수 — `.in()` 목록이 URL 상한에 걸리지 않게 한다 */
const SEARCH_MATCH_LIMIT = 100

export interface PoiBlockRow {
  id: string
  user_id: string
  poi_id: string
  blocked_until: string
  reason: string
  created_at: string
  user: { id: string; email: string; username: string | null } | null
  poi: { id: string; name: string } | null
}

/** 머리 칸 정렬 id → DB 컬럼. 표의 `columnHelper` id와 같아야 한다 */
export const ABUSING_SORT_COLUMNS: Record<AbusingListTab, Record<string, string>> = {
  'poi-blocks': { expires: 'blocked_until' },
}

export interface AbusingListSort {
  column: string
  ascending: boolean
}

export interface AbusingListParams {
  q: string
  status: AbusingListStatus
  sort: AbusingListSort
}

const DEFAULT_SORT: AbusingListSort = { column: 'created_at', ascending: false }

function parseSort(raw: string | undefined, tab: AbusingListTab): AbusingListSort {
  if (!raw) return DEFAULT_SORT
  for (const [id, column] of Object.entries(ABUSING_SORT_COLUMNS[tab])) {
    if (raw === `${id}_asc`) return { column, ascending: true }
    if (raw === `${id}_desc`) return { column, ascending: false }
  }
  return DEFAULT_SORT
}

/**
 * URL(또는 API 쿼리) 파라미터 → 목록 조건. 상태는 기본이 `active`이고 `all`을 `active`로
 * 되돌리지 않는다(`parseBadgeListParams`와 같은 규칙).
 */
export function parseAbusingListParams(raw: Record<string, string | undefined>, tab: AbusingListTab): AbusingListParams {
  return {
    q: sanitizeSearchTerm(raw.q ?? ''),
    status: raw.status === 'expired' || raw.status === 'all' ? raw.status : 'active',
    sort: parseSort(raw.sort, tab),
  }
}

/** 탭별 "만료 시각" 컬럼 */
const EXPIRY_COLUMN_OF = { 'poi-blocks': 'blocked_until' } as const

export function expiryColumnOf(tab: AbusingListTab): 'blocked_until' {
  return EXPIRY_COLUMN_OF[tab]
}

/**
 * 상태 필터를 PostgREST `or()` 조건 문자열로 만든다. `all`이면 null(필터 없음).
 * 장소 차단의 활성은 `blocked_until`이 지금보다 뒤이고 만료는 지금 이전이다.
 */
export function statusFilterOf(tab: AbusingListTab, status: AbusingListStatus, nowIso: string): string | null {
  if (status === 'all') return null
  const column = expiryColumnOf(tab)
  if (status === 'expired') return `${column}.lte.${nowIso}`
  return `${column}.gt.${nowIso}`
}

export interface AbusingSearchIds {
  userIds: string[]
  poiIds: string[]
}

/** 검색어에 일치한 id → `or()` 조건 문자열. 일치가 하나도 없으면 null */
export function searchFilterOf(tab: AbusingListTab, ids: AbusingSearchIds): string | null {
  const parts: string[] = []
  if (ids.userIds.length > 0) parts.push(`user_id.in.(${ids.userIds.join(',')})`)
  if (tab === 'poi-blocks' && ids.poiIds.length > 0) parts.push(`poi_id.in.(${ids.poiIds.join(',')})`)
  return parts.length > 0 ? parts.join(',') : null
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스(`badge-list-query.ts`와 동일 관례) */
export interface AbusingListQuery<T> {
  or(filters: string): AbusingListQuery<T>
  order(column: string, options?: { ascending?: boolean }): AbusingListQuery<T>
  range(
    from: number,
    to: number
  ): PromiseLike<{ data: T[] | null; count: number | null; error: { message: string } | null }>
}

/** 상태·검색 조건을 쿼리에 건다. `search`가 null이면 검색어가 없는 것이다 */
export function applyAbusingListFilters<T>(
  query: AbusingListQuery<T>,
  tab: AbusingListTab,
  params: AbusingListParams,
  search: string | null,
  now: Date
): AbusingListQuery<T> {
  let next = query
  const status = statusFilterOf(tab, params.status, now.toISOString())
  if (status) next = next.or(status)
  if (search) next = next.or(search)
  return next
}

async function resolveSearchIds(supabase: ServiceClient, tab: AbusingListTab, q: string): Promise<AbusingSearchIds | { error: string }> {
  const users = await supabase
    .from('users')
    .select('id')
    .or(`username.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(SEARCH_MATCH_LIMIT)
  if (users.error) return { error: users.error.message }

  let poiIds: string[] = []
  if (tab === 'poi-blocks') {
    const pois = await supabase.from('poi').select('id').ilike('name', `%${q}%`).limit(SEARCH_MATCH_LIMIT)
    if (pois.error) return { error: pois.error.message }
    poiIds = (pois.data ?? []).map((row) => row.id)
  }

  return { userIds: (users.data ?? []).map((row) => row.id), poiIds }
}

const POI_BLOCK_SELECT = '*, user:user_id(id, email, username), poi:poi_id(id, name)'
const TABLE_OF = { 'poi-blocks': 'poi_blocks' } as const

interface ListResult<T> {
  rows: T[]
  total: number
  /** 조회에 실패하면 메시지 — 0건과 구분하려고 호출부가 던지거나 500으로 돌려준다 */
  error: string | null
}

async function runList<T>(
  supabase: ServiceClient,
  tab: AbusingListTab,
  params: AbusingListParams,
  columns: string,
  range: [number, number],
  now: Date,
  ordered: boolean
): Promise<ListResult<T>> {
  let search: string | null = null
  if (params.q) {
    const matched = await resolveSearchIds(supabase, tab, params.q)
    if ('error' in matched) return { rows: [], total: 0, error: matched.error }
    search = searchFilterOf(tab, matched)
    // 검색어에 일치하는 유저·POI가 하나도 없으면 목록도 비어 있다
    if (!search) return { rows: [], total: 0, error: null }
  }

  let query = supabase.from(TABLE_OF[tab]).select(columns, { count: 'exact' }) as unknown as AbusingListQuery<T>
  query = applyAbusingListFilters(query, tab, params, search, now)
  if (ordered) {
    // 같은 값이 많은 정렬(레벨 등)에서도 쪽을 넘길 때 행이 겹치거나 빠지지 않게 id로 고정한다
    query = query.order(params.sort.column, { ascending: params.sort.ascending }).order('id')
  }

  const { data, count, error } = await query.range(range[0], range[1])
  if (error) {
    console.error(`[admin/abusing] ${tab} 목록 조회 오류:`, error)
    return { rows: [], total: 0, error: error.message }
  }
  return { rows: data ?? [], total: count ?? 0, error: null }
}

/** POI 차단 목록 한 쪽 */
export async function fetchPoiBlockListPage(
  supabase: ServiceClient,
  params: AbusingListParams,
  page: number,
  now: Date = new Date()
): Promise<ListResult<PoiBlockRow>> {
  const from = (Math.max(1, page) - 1) * ADMIN_LIST_PAGE_SIZE
  return runList<PoiBlockRow>(supabase, 'poi-blocks', params, POI_BLOCK_SELECT, [from, from + ADMIN_LIST_PAGE_SIZE - 1], now, true)
}

/**
 * "이 조건의 N건 모두 선택"이 부르는 전체 ID 조회. 목록 페이지와 같은 필터를 써서 화면의 총 건수와
 * 여기서 돌려주는 건수가 같다. 정렬은 필요 없다. 조회가 실패하면 빈 목록 대신 `error`를 담는다.
 */
export async function fetchAbusingListIds(
  supabase: ServiceClient,
  tab: AbusingListTab,
  params: AbusingListParams,
  cap: number = ABUSING_SELECT_ALL_CAP,
  now: Date = new Date()
): Promise<{ ids: string[]; total: number; error: string | null }> {
  const result = await runList<{ id: string }>(supabase, tab, params, 'id', [0, cap - 1], now, false)
  return { ids: result.rows.map((row) => row.id), total: result.total, error: result.error }
}

/**
 * 탭 라벨에 붙이는 활성 건수 — 조회에 실패하면 null(라벨에서 숨긴다).
 * 「이용 정지」 탭은 진행 중인 정지(`lifted_at IS NULL`) 건수다(티켓 20261017_1426).
 */
export async function fetchAbusingTabCounts(
  supabase: ServiceClient,
  now: Date = new Date()
): Promise<{ suspensions: number | null; poiBlocks: number | null }> {
  const nowIso = now.toISOString()
  const [suspensions, poiBlocks] = await Promise.all([
    fetchSuspensionActiveCount(supabase),
    supabase.from('poi_blocks').select('id', { count: 'exact', head: true }).gt('blocked_until', nowIso),
  ])
  if (poiBlocks.error) console.error('[admin/abusing] POI 차단 활성 건수 조회 오류:', poiBlocks.error)
  return { suspensions, poiBlocks: poiBlocks.error ? null : (poiBlocks.count ?? 0) }
}
