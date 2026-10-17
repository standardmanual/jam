/**
 * 유저 조회 목록 쿼리 단일화(티켓 20260924_0951, 상위 티켓 §4.4 유저 행) — 목록 페이지
 * (`admin/users/page.tsx`)·전체 선택용 ID 조회(`api/admin/users/ids`)·내보내기
 * (`api/admin/users/export`)가 같은 필터 규칙(`parseUserListParams`)을 쓰도록 모은다.
 *
 * - 검색은 이름(`username`)·표시 이름(`display_name`)·이메일(`users.email`)이다. 이메일은
 *   가입할 때 `handle_new_user()` 트리거가 auth에서 복사한 값이라(이후 동기화 없음) auth
 *   스키마를 조회하지 않고 이 칸으로 검색한다. 검색어는 {@link sanitizeSearchTerm}을 거친다.
 * - 제재 상태 필터(`ban=banned|clean`)는 이용 정지 중인 user_id를 먼저 모아 `in`/`not.in`으로 건다.
 *   «정지 중» = `user_suspensions.lifted_at IS NULL`(티켓 20261017_1426, 옛 섀도우밴 `user_shadow_bans`는 읽지 않는다).
 *   정지 행은 소수라 URL 한도 안에 들어온다는 전제다(넘으면 PostgREST가 오류를 돌려주므로 조용히 틀린 목록이 나오지는 않는다).
 * - 보유 배지·아이템 수는 {@link countRowsByKey}로 센다(행째 세면 1,000행 상한에 잘린다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { isAdminAccount } from './auth'
import { countRowsByKey, type CountRowsClient } from './list-counts'
import { ADMIN_LIST_PAGE_SIZE, pageRange } from './list-params'
import { sanitizeSearchTerm } from './search-term'

type ServiceClient = ReturnType<typeof createServiceClient>

/** "필터 결과 전체 선택" 상한(상위 티켓 §6 결정 1) */
export const USER_SELECT_ALL_CAP = 1000

const READ_CHUNK_SIZE = 200

export const USER_LIST_COLUMNS =
  'id, email, username, display_name, created_at, is_admin, onboarding_completed_at, tribe:tribe_id(name), suspensions:user_suspensions(suspended_at, lifted_at)'

import { DEFAULT_USER_LIST_SORT, USER_LIST_SORT_OPTIONS, type UserListSort } from './user-list-options'

export { DEFAULT_USER_LIST_SORT, USER_LIST_SORT_OPTIONS }
export type { UserListSort }

const SORT_VALUES = new Set<string>(['createdAt_desc', 'createdAt_asc', 'username_asc', 'username_desc'])

export type OnboardingFilter = 'done' | 'pending'
export type BanFilter = 'banned' | 'clean'

export interface UserListParams {
  q: string
  tribeId: string | undefined
  onboarding: OnboardingFilter | undefined
  ban: BanFilter | undefined
  sort: UserListSort
}

/** URL(또는 API 쿼리) 파라미터 → 타입이 있는 목록 조건. 세 화면이 전부 이 함수를 거친다. */
export function parseUserListParams(raw: Record<string, string | undefined>): UserListParams {
  return {
    q: sanitizeSearchTerm(raw.q ?? ''),
    tribeId: raw.tribe_id || undefined,
    onboarding: raw.onboarding === 'done' || raw.onboarding === 'pending' ? raw.onboarding : undefined,
    ban: raw.ban === 'banned' || raw.ban === 'clean' ? raw.ban : undefined,
    sort: raw.sort && SORT_VALUES.has(raw.sort) ? (raw.sort as UserListSort) : DEFAULT_USER_LIST_SORT,
  }
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스(`badge-list-query.ts`와 동일 관례) */
export interface UserListQuery<T> {
  is(column: string, value: null): UserListQuery<T>
  not(column: string, operator: string, value: unknown): UserListQuery<T>
  eq(column: string, value: string): UserListQuery<T>
  in(column: string, values: string[]): UserListQuery<T>
  or(filters: string): UserListQuery<T>
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): UserListQuery<T>
  range(
    from: number,
    to: number
  ): PromiseLike<{ data: T[] | null; count: number | null; error: { message: string } | null }>
}

/**
 * 검색·필터를 쿼리에 적용한다. `activeBanIds`는 제재 상태 필터가 있을 때만 호출부가 채워 준다
 * (`null` = 필터 없음). 제재 중인 유저가 한 명도 없는데 `banned`를 걸면 결과가 항상 비므로
 * 호출부가 쿼리를 아예 보내지 않는다({@link isEmptyBanFilter}).
 */
export function applyUserListFilters<T>(
  query: UserListQuery<T>,
  params: UserListParams,
  activeBanIds: string[] | null
): UserListQuery<T> {
  let next = query

  if (params.q) {
    next = next.or(`username.ilike.%${params.q}%,display_name.ilike.%${params.q}%,email.ilike.%${params.q}%`)
  }
  if (params.tribeId) next = next.eq('tribe_id', params.tribeId)
  if (params.onboarding === 'done') next = next.not('onboarding_completed_at', 'is', null)
  else if (params.onboarding === 'pending') next = next.is('onboarding_completed_at', null)

  if (params.ban === 'banned' && activeBanIds && activeBanIds.length > 0) {
    next = next.in('id', activeBanIds)
  } else if (params.ban === 'clean' && activeBanIds && activeBanIds.length > 0) {
    next = next.not('id', 'in', `(${activeBanIds.join(',')})`)
  }

  return next
}

/** 제재(이용 정지) 중 필터인데 정지 중인 유저가 없다 → 결과가 항상 빈 목록 */
export function isEmptyBanFilter(params: UserListParams, activeBanIds: string[] | null): boolean {
  return params.ban === 'banned' && (activeBanIds?.length ?? 0) === 0
}

/** 정렬을 건다 — 같은 값(가입 시각·이름 동률) 안에서 쪽 경계가 흔들리지 않도록 `id`를 보조 키로 둔다 */
export function applyUserListSort<T>(query: UserListQuery<T>, sort: UserListSort): UserListQuery<T> {
  const [column, direction] = sort.split('_') as ['createdAt' | 'username', 'asc' | 'desc']
  const ascending = direction === 'asc'
  const ordered =
    column === 'createdAt'
      ? query.order('created_at', { ascending })
      : query.order('username', { ascending, nullsFirst: false })
  return ordered.order('id', { ascending: true })
}

/** 정지 이력 한 줄에서 목록이 읽는 칸 */
export interface UserSuspensionState {
  suspended_at: string
  lifted_at: string | null
}

/** 진행 중인 정지(`lifted_at IS NULL`) 한 줄을 찾는다. 임베드가 이력 전체를 싣기 때문에 푼 줄은 건너뛴다. */
export function activeSuspensionOf(suspensions: readonly UserSuspensionState[] | null | undefined): UserSuspensionState | null {
  return suspensions?.find((row) => row.lifted_at === null) ?? null
}

/** 정지 기록을 한 번에 읽는 상한 — 이 값에 닿으면 잘렸을 수 있어 결과를 신뢰하지 않는다 */
export const SUSPENSION_FETCH_LIMIT = 1000

/**
 * 이용 정지 중인 user_id 전체(`lifted_at IS NULL`).
 *
 * 읽은 행이 `SUSPENSION_FETCH_LIMIT`에 닿으면 뒤쪽이 잘렸을 수 있으므로 조용히 틀린 결과 대신 오류를 던진다.
 * id를 `.in()`·`.not()`에 통째로 넣는 필터 구조는 수백 건에서 요청 주소 길이 한계가 먼저 오므로,
 * 정지 행이 실제로 수백 건에 가까워지면 필터를 서버 쪽 조인·RPC로 다시 설계한다(티켓 20260924_1636).
 */
export async function fetchSuspendedUserIds(supabase: ServiceClient): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_suspensions')
    .select('user_id')
    .is('lifted_at', null)
    .limit(SUSPENSION_FETCH_LIMIT)
  if (error) throw new Error(`[user-list] 정지 목록 조회 실패: ${error.message}`)
  if ((data?.length ?? 0) >= SUSPENSION_FETCH_LIMIT) {
    throw new Error(`[user-list] 정지 기록이 한도(${SUSPENSION_FETCH_LIMIT.toLocaleString('en-US')}건)를 넘어 제재 필터를 신뢰할 수 없습니다`)
  }
  return (data ?? []).map((row) => row.user_id)
}

interface RawUserRow {
  id: string
  email: string
  username: string | null
  display_name: string | null
  created_at: string
  is_admin: boolean
  onboarding_completed_at: string | null
  tribe: { name: string } | { name: string }[] | null
  suspensions: UserSuspensionState[] | null
}

export interface UserListRow {
  id: string
  email: string
  username: string | null
  displayName: string | null
  createdAt: string
  /** 화이트리스트 이메일 또는 `users.is_admin` — `isAdminAccount` 판정 */
  isAdmin: boolean
  onboarded: boolean
  tribeName: string | null
  /** 지금 이용 정지 중인가(`user_suspensions.lifted_at IS NULL`인 줄이 있다) */
  suspended: boolean
  /** 진행 중인 정지를 건 시각(ISO). 정지 중이 아니면 null */
  suspendedAt: string | null
  badgeCount: number
  itemCount: number
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

/** 조회 행 → 화면 행. 보유 수는 아직 채우지 않는다(0) */
export function toUserListRow(raw: RawUserRow): UserListRow {
  const active = activeSuspensionOf(raw.suspensions)
  return {
    id: raw.id,
    email: raw.email,
    username: raw.username,
    displayName: raw.display_name,
    createdAt: raw.created_at,
    isAdmin: isAdminAccount({ email: raw.email, is_admin: raw.is_admin }),
    onboarded: raw.onboarding_completed_at !== null,
    tribeName: firstOf(raw.tribe)?.name ?? null,
    suspended: active !== null,
    suspendedAt: active?.suspended_at ?? null,
    badgeCount: 0,
    itemCount: 0,
  }
}

export interface UserHoldingCounts {
  /** 유저별 보유 배지 수(요청한 id 전부 키로 존재) */
  badgeCountByUser: Record<string, number>
  /** 유저별 인벤토리 아이템 수 */
  itemCountByUser: Record<string, number>
}

/**
 * 유저별 보유 배지·아이템 수. 아이템은 유저 → 인벤토리 → 아이템 순으로 거쳐 센다(인벤토리는
 * 유저당 1행이라 200명 묶음에서도 1,000행을 넘지 않는다).
 */
export async function fetchUserHoldingCounts(supabase: ServiceClient, userIds: string[]): Promise<UserHoldingCounts> {
  const countClient = supabase as unknown as CountRowsClient
  const badgeCountByUser = await countRowsByKey(countClient, 'user_activity_badges', 'user_id', userIds)

  const inventoryIdByUser = new Map<string, string>()
  for (let i = 0; i < userIds.length; i += READ_CHUNK_SIZE) {
    const { data, error } = await supabase
      .from('inventory')
      .select('id, user_id')
      .in('user_id', userIds.slice(i, i + READ_CHUNK_SIZE))
    if (error) throw new Error(`[user-list] 인벤토리 조회 실패: ${error.message}`)
    for (const row of data ?? []) inventoryIdByUser.set(row.user_id, row.id)
  }

  const itemCountByInventory = await countRowsByKey(countClient, 'inventory_items', 'inventory_id', [
    ...inventoryIdByUser.values(),
  ])
  const itemCountByUser: Record<string, number> = {}
  for (const id of userIds) {
    const inventoryId = inventoryIdByUser.get(id)
    itemCountByUser[id] = inventoryId ? (itemCountByInventory[inventoryId] ?? 0) : 0
  }

  return { badgeCountByUser, itemCountByUser }
}

type RawQueryClient = {
  from(table: string): {
    select(columns: string, options?: { count: 'exact' }): UserListQuery<RawUserRow>
  }
}

async function resolveActiveBanIds(supabase: ServiceClient, params: UserListParams): Promise<string[] | null> {
  return params.ban ? fetchSuspendedUserIds(supabase) : null
}

/** 한 쪽(50건)의 유저 행 + 필터 결과 전체 건수 */
export async function fetchUserListPage(
  supabase: ServiceClient,
  params: UserListParams,
  page: number
): Promise<{ rows: UserListRow[]; total: number }> {
  const activeBanIds = await resolveActiveBanIds(supabase, params)
  if (isEmptyBanFilter(params, activeBanIds)) return { rows: [], total: 0 }

  const client = supabase as unknown as RawQueryClient
  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)
  const base = applyUserListFilters(client.from('users').select(USER_LIST_COLUMNS, { count: 'exact' }), params, activeBanIds)
  const { data, count, error } = await applyUserListSort(base, params.sort).range(from, to)
  if (error) throw new Error(`[user-list] 목록 조회 실패: ${error.message}`)

  const rows = (data ?? []).map((raw) => toUserListRow(raw))
  const { badgeCountByUser, itemCountByUser } = await fetchUserHoldingCounts(
    supabase,
    rows.map((r) => r.id)
  )
  for (const row of rows) {
    row.badgeCount = badgeCountByUser[row.id] ?? 0
    row.itemCount = itemCountByUser[row.id] ?? 0
  }

  return { rows, total: count ?? rows.length }
}

/** "필터 결과 전체 선택"용 ID 목록(상한 `cap`) + 필터 결과 전체 건수 */
export async function fetchUserListIds(
  supabase: ServiceClient,
  params: UserListParams,
  cap: number
): Promise<{ ids: string[]; total: number }> {
  const activeBanIds = await resolveActiveBanIds(supabase, params)
  if (isEmptyBanFilter(params, activeBanIds)) return { ids: [], total: 0 }

  const client = supabase as unknown as RawQueryClient
  const base = applyUserListFilters(client.from('users').select('id', { count: 'exact' }), params, activeBanIds)
  const { data, count, error } = await applyUserListSort(base, params.sort).range(0, cap - 1)
  if (error) throw new Error(`[user-list] ID 조회 실패: ${error.message}`)

  const ids = (data ?? []).map((row) => row.id)
  return { ids, total: count ?? ids.length }
}

/** 내보내기용 — 선택한 id의 유저 행(보유 수 제외). 200개씩 나눠 읽고 요청한 순서를 유지한다 */
export async function fetchUserRowsByIds(supabase: ServiceClient, ids: string[]): Promise<UserListRow[]> {
  const byId = new Map<string, UserListRow>()
  for (let i = 0; i < ids.length; i += READ_CHUNK_SIZE) {
    const { data, error } = await supabase
      .from('users')
      .select(USER_LIST_COLUMNS)
      .in('id', ids.slice(i, i + READ_CHUNK_SIZE))
    if (error) throw new Error(`[user-list] 내보내기 조회 실패: ${error.message}`)
    for (const raw of (data ?? []) as unknown as RawUserRow[]) byId.set(raw.id, toUserListRow(raw))
  }
  return ids.map((id) => byId.get(id)).filter((row): row is UserListRow => row !== undefined)
}
