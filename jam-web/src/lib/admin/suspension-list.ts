/**
 * 어드민 이용 정지 이력 목록 쿼리 (티켓 20261017_1426 2회) — `admin/abusing/page.tsx`의 «이용 정지» 탭이 쓴다.
 *
 * 정지는 걸 때마다 한 줄이고 푼 줄도 지우지 않는다(이력). 상태는 `lifted_at`으로 가른다:
 * 진행 중(`active`) = `lifted_at IS NULL`, 풀림(`lifted`) = `lifted_at IS NOT NULL`, 전체(`all`).
 * 최근 건 순(건 시각 내림차순)으로 고정한다. 검색은 유저 이름·이메일로 먼저 일치하는 id를 찾고 그 id로 좁힌다
 * (`abusing-list.ts`와 같은 방식 — 한 쿼리로 관계 칼럼을 OR로 걸 수 없다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { sanitizeSearchTerm } from './search-term'
import { ADMIN_LIST_PAGE_SIZE, pageRange } from './list-params'

type ServiceClient = ReturnType<typeof createServiceClient>

export type SuspensionListStatus = 'active' | 'lifted' | 'all'

export interface SuspensionRow {
  id: string
  user_id: string
  reason: string
  suspended_at: string
  suspended_by: string
  lifted_at: string | null
  lifted_by: string | null
  lift_note: string | null
  user: { id: string; email: string; username: string | null } | null
}

export interface SuspensionListParams {
  q: string
  status: SuspensionListStatus
}

/** 검색어와 일치하는 유저를 찾을 때 가져오는 최대 건수 — `.in()` 목록이 URL 상한에 걸리지 않게 한다 */
const SEARCH_MATCH_LIMIT = 100

const SUSPENSION_SELECT = '*, user:user_id(id, email, username)'

/** URL(또는 API 쿼리) 파라미터 → 목록 조건. 상태 기본값은 `active`이고 `all`을 `active`로 되돌리지 않는다. */
export function parseSuspensionListParams(raw: Record<string, string | undefined>): SuspensionListParams {
  return {
    q: sanitizeSearchTerm(raw.q ?? ''),
    status: raw.status === 'lifted' || raw.status === 'all' ? raw.status : 'active',
  }
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스(`abusing-list.ts`와 같은 관례) */
export interface SuspensionListQuery<T> {
  is(column: string, value: null): SuspensionListQuery<T>
  not(column: string, operator: string, value: unknown): SuspensionListQuery<T>
  in(column: string, values: string[]): SuspensionListQuery<T>
  order(column: string, options?: { ascending?: boolean }): SuspensionListQuery<T>
  range(
    from: number,
    to: number
  ): PromiseLike<{ data: T[] | null; count: number | null; error: { message: string } | null }>
}

/** 상태 조건을 쿼리에 건다. 정지 이력은 `lifted_at`만 본다. */
export function applySuspensionStatus<T>(query: SuspensionListQuery<T>, status: SuspensionListStatus): SuspensionListQuery<T> {
  if (status === 'active') return query.is('lifted_at', null)
  if (status === 'lifted') return query.not('lifted_at', 'is', null)
  return query
}

interface ListResult {
  rows: SuspensionRow[]
  total: number
  /** 조회에 실패하면 메시지 — 0건과 구분하려고 호출부가 던진다 */
  error: string | null
}

/** 정지 이력 한 쪽(최근 건 순). 조회가 실패하면 빈 목록 대신 `error`를 담는다. */
export async function fetchSuspensionListPage(
  supabase: ServiceClient,
  params: SuspensionListParams,
  page: number
): Promise<ListResult> {
  let userIds: string[] | null = null
  if (params.q) {
    const users = await supabase
      .from('users')
      .select('id')
      .or(`username.ilike.%${params.q}%,email.ilike.%${params.q}%`)
      .limit(SEARCH_MATCH_LIMIT)
    if (users.error) return { rows: [], total: 0, error: users.error.message }
    userIds = (users.data ?? []).map((row) => row.id)
    // 검색어에 일치하는 유저가 하나도 없으면 목록도 비어 있다
    if (userIds.length === 0) return { rows: [], total: 0, error: null }
  }

  let query = supabase
    .from('user_suspensions')
    .select(SUSPENSION_SELECT, { count: 'exact' }) as unknown as SuspensionListQuery<SuspensionRow>
  query = applySuspensionStatus(query, params.status)
  if (userIds) query = query.in('user_id', userIds)
  // 같은 시각에 건 정지가 있어도 쪽을 넘길 때 행이 겹치거나 빠지지 않게 id로 고정한다
  query = query.order('suspended_at', { ascending: false }).order('id')

  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)
  const { data, count, error } = await query.range(from, to)
  if (error) {
    console.error('[admin/suspensions] 목록 조회 오류:', error)
    return { rows: [], total: 0, error: error.message }
  }
  return { rows: data ?? [], total: count ?? 0, error: null }
}

/** 진행 중인 정지 건수(탭 라벨용). 조회에 실패하면 null(라벨에서 숨긴다). */
export async function fetchSuspensionActiveCount(supabase: ServiceClient): Promise<number | null> {
  const { count, error } = await supabase
    .from('user_suspensions')
    .select('id', { count: 'exact', head: true })
    .is('lifted_at', null)
  if (error) {
    console.error('[admin/suspensions] 진행 중 건수 조회 오류:', error)
    return null
  }
  return count ?? 0
}
