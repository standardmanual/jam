/**
 * 동기화 보류 — 조회와 고르기 (티켓 20261017_1425, 운영 로직 6.4절)
 *
 * 보류는 `lib/drop-engine/syncIssueRun.ts`가 만든다(이번 동기화로 받을 아이템 배지가 빈칸보다 많을 때 전부 보류).
 * 이 모듈은 보류를 읽고, 고르기를 `resolve_sync_pending_items` RPC 한 번으로 확정한다. 지급·고르지 않음 처리·발급 기록은 DB 함수가
 * 한 트랜잭션으로 하므로 같은 보류를 두 번 지급하지 않는다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 * 클라이언트가 쓸 타입·상수는 `pending-items-contract.ts`에 있다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PendingItemsPayload, PendingItemView, ResolvePendingPayload } from './pending-items-contract'

/** 보류가 있어 동기화를 시작하지 않을 때 던진다. `/api/strava/sync`가 409(`code: 'sync_pending_items'`)로 바꾼다. */
export class SyncPendingItemsError extends Error {
  readonly pendingCount: number

  constructor(pendingCount: number) {
    super(`동기화 보류 ${pendingCount}개가 남아 있어 동기화를 시작하지 않는다`)
    this.name = 'SyncPendingItemsError'
    this.pendingCount = pendingCount
  }
}

/** DB 함수가 돌려주는 실패 코드 */
export type ResolvePendingErrorCode = 'no_pending' | 'invalid_selection' | 'wrong_count' | 'inventory_not_found'

export type ResolvePendingResult =
  | ({ ok: true } & ResolvePendingPayload)
  | { ok: false; error: ResolvePendingErrorCode; /** `wrong_count`일 때 정확히 골라야 하는 개수 */ expected?: number }

const ERROR_CODES: readonly ResolvePendingErrorCode[] = ['no_pending', 'invalid_selection', 'wrong_count', 'inventory_not_found']

/** 대기 중(`pending`) 보류 개수. 읽지 못하면 던진다 — 보류가 있는데 없다고 보고 동기화하면 새 보류까지 고르기에서 닫힌다. */
export async function countPendingItems(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('sync_pending_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending')
  if (error) throw new Error(`sync_pending_items 개수 조회 실패: ${error.message}`)
  return count ?? 0
}

interface PendingRow {
  id: string
  badge_id: string
  rarity: PendingItemView['rarity']
}

interface BadgeRow {
  id: string
  name: string
  image_url: string | null
}

/** 대기 중 보류 목록과 빈칸 수, 골라야 할 개수. 보류가 없으면 `pendingCount` 0과 빈 목록이다. 읽지 못하면 던진다. */
export async function getPendingItems(supabase: SupabaseClient, userId: string): Promise<PendingItemsPayload> {
  const { data: rows, error } = await supabase
    .from('sync_pending_items')
    .select('id, badge_id, rarity')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new Error(`sync_pending_items 조회 실패: ${error.message}`)
  const pending = (rows ?? []) as PendingRow[]
  if (pending.length === 0) return { pendingCount: 0, freeSlots: 0, chooseCount: 0, items: [] }

  const badgeIds = [...new Set(pending.map((r) => r.badge_id))]
  const { data: badgeRows, error: badgeError } = await supabase.from('badges').select('id, name, image_url').in('id', badgeIds)
  if (badgeError) throw new Error(`보류 배지 조회 실패: ${badgeError.message}`)
  const badgeById = new Map(((badgeRows ?? []) as BadgeRow[]).map((b) => [b.id, b]))

  const { data: inventoryRow, error: inventoryError } = await supabase
    .from('inventory')
    .select('used_slots, max_slots')
    .eq('user_id', userId)
    .maybeSingle()
  if (inventoryError) throw new Error(`인벤토리 조회 실패: ${inventoryError.message}`)
  const inventory = inventoryRow as { used_slots: number; max_slots: number } | null
  const freeSlots = inventory ? Math.max(0, inventory.max_slots - inventory.used_slots) : 0

  return {
    pendingCount: pending.length,
    freeSlots,
    chooseCount: Math.min(freeSlots, pending.length),
    items: pending.map((r) => {
      const badge = badgeById.get(r.badge_id)
      return { id: r.id, badgeId: r.badge_id, name: badge?.name ?? '', imageUrl: badge?.image_url ?? null, rarity: r.rarity }
    }),
  }
}

/**
 * 고르기를 확정한다. 고른 보류를 지급하고 나머지를 «고르지 않음»으로 닫는다(되돌릴 수 없다).
 * DB 함수가 거절하는 경우(`no_pending`·`invalid_selection`·`wrong_count`·`inventory_not_found`)는 값으로 돌려준다.
 * RPC 오류나 해석할 수 없는 응답은 던진다.
 */
export async function resolvePendingItems(
  supabase: SupabaseClient,
  userId: string,
  chosenIds: readonly string[]
): Promise<ResolvePendingResult> {
  const { data, error } = await supabase.rpc('resolve_sync_pending_items', {
    p_user_id: userId,
    p_chosen_ids: [...chosenIds],
  })
  if (error) throw new Error(`resolve_sync_pending_items RPC 오류: ${error.message}`)

  const result = data as {
    ok?: boolean
    error?: string
    expected?: number
    granted?: number
    discarded?: number
    itemIds?: string[]
  } | null
  if (!result || typeof result.ok !== 'boolean') throw new Error('resolve_sync_pending_items 응답을 해석할 수 없다')

  if (result.ok) {
    return {
      ok: true,
      granted: Number(result.granted ?? 0),
      discarded: Number(result.discarded ?? 0),
      itemIds: Array.isArray(result.itemIds) ? result.itemIds : [],
    }
  }
  const code = ERROR_CODES.find((c) => c === result.error)
  if (!code) throw new Error(`resolve_sync_pending_items 알 수 없는 오류 코드: ${String(result.error)}`)
  return typeof result.expected === 'number' ? { ok: false, error: code, expected: result.expected } : { ok: false, error: code }
}
