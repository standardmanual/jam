/**
 * 활성 판정 쿼리 3종 (티켓 20260923_2256, PRD §4; 상위 소속 반영 티켓 20260924_0015)
 *
 * - 트라이브: `tribes.is_active`
 * - 컬렉션(아이템북): `item_books.is_active` 이고, 소속 트라이브(`tribe_id`)가 있으면 그
 *   `tribes.is_active`도 필요
 * - 배지: `deleted_at IS NULL` + `valid_from`·`valid_until` 유효 기간 안(배지 엔진의 발급 후보
 *   필터 `jam-web/src/lib/badge-engine/index.ts` 1008~1014행과 같은 조건) 이고, 소속 컬렉션
 *   (`item_book_id`)·소속 트라이브(`tribe_id`)가 있으면 그 `is_active`도 필요
 *
 * 여기서 돌려주는 행만 "활성"이다 — id가 조회 결과에 없으면 비활성(또는 존재하지 않음)으로 본다.
 * 소속(`item_book_id`·`tribe_id`)이 NULL이면 그 조건은 통과로 본다. 유형당 쿼리 횟수는
 * 입력 id 개수와 무관하게 상수(배지 최대 3회, 컬렉션 최대 2회)다.
 */
import { createServiceClient } from '@/lib/supabase/server'

export interface ActiveTribeRow {
  id: string
  name: string
  description: string | null
  tagline: string | null
}

export interface ActiveItemBookRow {
  id: string
  name: string
  story_text: string | null
}

export interface ActiveBadgeRow {
  id: string
  name: string
  description: string
}

/** 배지 소속의 활성 여부만 담은 결과 — `verifyActiveTargets`가 반려 사유를 구분할 때만 쓴다. */
export interface BadgeParentStatus {
  id: string
  deleted: boolean
  itemBookInactive: boolean
  tribeInactive: boolean
}

function uniqueNonNull(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== null))]
}

// 상위 소속 활성 확인 전용 — 주어진 테이블에서 활성(`is_active`) id만 집합으로 돌려준다(쿼리 1회).
async function fetchActiveIds(table: 'item_books' | 'tribes', ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const supabase = createServiceClient()
  const { data, error } = await supabase.from(table).select('id').in('id', ids).eq('is_active', true)
  if (error) throw error
  return new Set(((data as { id: string }[] | null) ?? []).map((row) => row.id))
}

// 배지 행들의 소속 컬렉션·트라이브 중 활성인 id 집합을 함께 돌려준다(쿼리 최대 2회, 병렬).
async function fetchActiveParentIds(rows: { item_book_id: string | null; tribe_id: string | null }[]) {
  const [itemBookIds, tribeIds] = await Promise.all([
    fetchActiveIds('item_books', uniqueNonNull(rows.map((r) => r.item_book_id))),
    fetchActiveIds('tribes', uniqueNonNull(rows.map((r) => r.tribe_id))),
  ])
  return { itemBookIds, tribeIds }
}

export async function fetchActiveTribes(ids: string[]): Promise<ActiveTribeRow[]> {
  if (ids.length === 0) return []
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tribes')
    .select('id, name, description, tagline')
    .in('id', ids)
    .eq('is_active', true)
  if (error) throw error
  return (data as ActiveTribeRow[] | null) ?? []
}

export async function fetchActiveItemBooks(ids: string[]): Promise<ActiveItemBookRow[]> {
  if (ids.length === 0) return []
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('item_books')
    .select('id, name, story_text, tribe_id')
    .in('id', ids)
    .eq('is_active', true)
  if (error) throw error
  const rows = (data as (ActiveItemBookRow & { tribe_id: string | null })[] | null) ?? []
  if (rows.length === 0) return []
  const activeTribeIds = await fetchActiveIds('tribes', uniqueNonNull(rows.map((r) => r.tribe_id)))
  return rows
    .filter((r) => r.tribe_id === null || activeTribeIds.has(r.tribe_id))
    .map(({ id, name, story_text }) => ({ id, name, story_text }))
}

export async function fetchActiveBadges(ids: string[]): Promise<ActiveBadgeRow[]> {
  if (ids.length === 0) return []
  const supabase = createServiceClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('badges')
    .select('id, name, description, item_book_id, tribe_id')
    .in('id', ids)
    .is('deleted_at', null)
    .or(`valid_from.is.null,valid_from.lte.${now}`)
    .or(`valid_until.is.null,valid_until.gte.${now}`)
  if (error) throw error
  const rows =
    (data as (ActiveBadgeRow & { item_book_id: string | null; tribe_id: string | null })[] | null) ?? []
  if (rows.length === 0) return []
  const { itemBookIds: activeItemBookIds, tribeIds: activeTribeIds } = await fetchActiveParentIds(rows)
  return rows
    .filter(
      (r) =>
        (r.item_book_id === null || activeItemBookIds.has(r.item_book_id)) &&
        (r.tribe_id === null || activeTribeIds.has(r.tribe_id))
    )
    .map(({ id, name, description }) => ({ id, name, description }))
}

/**
 * 배지별 삭제 여부와 소속 컬렉션·트라이브의 비활성 여부를 돌려준다(유효 기간은 보지 않는다).
 * `verifyActiveTargets`가 반려 사유를 "배지 삭제됨"·"소속 트라이브 비활성"·"소속 컬렉션
 * 비활성"으로 구분할 때만 쓴다.
 */
export async function fetchBadgeParentStatus(ids: string[]): Promise<BadgeParentStatus[]> {
  if (ids.length === 0) return []
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('badges')
    .select('id, item_book_id, tribe_id, deleted_at')
    .in('id', ids)
  if (error) throw error
  const rows =
    (data as
      | { id: string; item_book_id: string | null; tribe_id: string | null; deleted_at: string | null }[]
      | null) ?? []
  const { itemBookIds: activeItemBookIds, tribeIds: activeTribeIds } = await fetchActiveParentIds(rows)
  return rows.map((r) => ({
    id: r.id,
    deleted: Boolean(r.deleted_at),
    itemBookInactive: r.item_book_id !== null && !activeItemBookIds.has(r.item_book_id),
    tribeInactive: r.tribe_id !== null && !activeTribeIds.has(r.tribe_id),
  }))
}
