/**
 * 활성 판정 쿼리 3종 (티켓 20260923_2256, PRD §4)
 *
 * - 트라이브: `tribes.is_active`
 * - 컬렉션(아이템북): `item_books.is_active`
 * - 배지: `deleted_at IS NULL` + `valid_from`·`valid_until` 유효 기간 안. 배지 엔진의
 *   발급 후보 필터(`jam-web/src/lib/badge-engine/index.ts` 1008~1014행)와 같은 조건이다.
 *
 * 여기서 돌려주는 행만 "활성"이다 — id가 조회 결과에 없으면 비활성(또는 존재하지 않음)으로 본다.
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
    .select('id, name, story_text')
    .in('id', ids)
    .eq('is_active', true)
  if (error) throw error
  return (data as ActiveItemBookRow[] | null) ?? []
}

export async function fetchActiveBadges(ids: string[]): Promise<ActiveBadgeRow[]> {
  if (ids.length === 0) return []
  const supabase = createServiceClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('badges')
    .select('id, name, description')
    .in('id', ids)
    .is('deleted_at', null)
    .or(`valid_from.is.null,valid_from.lte.${now}`)
    .or(`valid_until.is.null,valid_until.gte.${now}`)
  if (error) throw error
  return (data as ActiveBadgeRow[] | null) ?? []
}
