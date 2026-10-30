/**
 * 받지 않은 믹스 결과 — 개수·목록·받기 (티켓 20261018_0055, 운영 로직 6.4·8.4절)
 *
 * 받지 않은 결과는 `combine_grant_results`(마이그레이션 236)가 만든다 — 결과가 들어갈 인벤토리 빈칸이 모자라면 결과 전부를
 * `combine_pending_results`에 남긴다(재료는 이미 소모됐다). 이 모듈은 그것을 읽고, 받기를 `combine_claim_pending` RPC 한 번으로
 * 확정한다. 지급·받음 표시·개체 이력은 DB 함수가 한 트랜잭션으로 하고 인벤토리 행과 결과 행을 잠그므로 같은 결과를 두 번
 * 지급하지 않는다(앱은 슬롯을 나눠 세지 않는다).
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 * 타입만 클라이언트가 가져와도 된다(`import type`).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** DB 함수가 돌려주는 받기 실패 코드 */
export type ClaimPendingErrorCode = 'user_suspended' | 'no_pending' | 'insufficient_slots' | 'inventory_not_found'

export type ClaimPendingResult =
  | { ok: true; granted: number; itemIds: string[] }
  | {
      ok: false
      error: ClaimPendingErrorCode
      /** `insufficient_slots`일 때 지금 인벤토리 빈칸 수 */
      free?: number
      /** `insufficient_slots`일 때 받으려면 필요한 빈칸 수(받지 않은 결과 개수) */
      needed?: number
    }

const CLAIM_ERROR_CODES: readonly ClaimPendingErrorCode[] = ['user_suspended', 'no_pending', 'insufficient_slots', 'inventory_not_found']

/** 받지 않은 결과 한 건을 화면에 내리는 모양 */
export interface PendingResultView {
  id: string
  /** 잠긴 결과는 빈 문자열이다 — 이름·그림을 알 수 없게 한다(운영 로직 7.3절) */
  badgeId: string
  /** 잠긴 결과는 빈 문자열이다 */
  name: string
  /** 잠긴 결과는 null이다 */
  imageUrl: string | null
  rarity: string
  locked: boolean
  /** 생긴 때(ISO 8601) */
  createdAt: string
}

export interface PendingResultsPayload {
  pendingCount: number
  /** 지금 인벤토리 빈칸 수 */
  freeSlots: number
  items: PendingResultView[]
}

/**
 * 받지 않은(`pending`) 믹스 결과 개수. 읽지 못하면 던진다 — 있는데 없다고 보고 새 믹스를 시작하면 재료가 또 소모되고
 * 결과가 더 쌓인다(`countPendingItems`와 같은 원칙).
 */
export async function getPendingCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('combine_pending_results')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending')
  if (error) throw new Error(`combine_pending_results 개수 조회 실패: ${error.message}`)
  return count ?? 0
}

interface PendingRow {
  id: string
  badge_id: string
  locked: boolean
  created_at: string
}

interface BadgeRow {
  id: string
  name: string
  image_url: string | null
  rarity: string
}

/** 받지 않은 결과 목록과 인벤토리 빈칸 수. 없으면 `pendingCount` 0과 빈 목록이다. 읽지 못하면 던진다. */
export async function listPendingResults(supabase: SupabaseClient, userId: string): Promise<PendingResultsPayload> {
  const { data: rows, error } = await supabase
    .from('combine_pending_results')
    .select('id, badge_id, locked, created_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new Error(`combine_pending_results 조회 실패: ${error.message}`)
  const pending = (rows ?? []) as PendingRow[]
  if (pending.length === 0) return { pendingCount: 0, freeSlots: 0, items: [] }

  // 등급은 잠긴 결과에도 보여 주므로 모두 읽는다. 이름·그림은 열린 결과에만 싣는다(7.3절).
  const badgeIds = [...new Set(pending.map((r) => r.badge_id))]
  const { data: badgeRows, error: badgeError } = await supabase
    .from('badges')
    .select('id, name, image_url, rarity')
    .in('id', badgeIds)
  if (badgeError) throw new Error(`받지 않은 결과 배지 조회 실패: ${badgeError.message}`)
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
    items: pending.map((r): PendingResultView => {
      const badge = badgeById.get(r.badge_id)
      const rarity = badge?.rarity ?? 'common'
      if (r.locked) {
        return {
          id: r.id,
          badgeId: '',
          name: '',
          imageUrl: null,
          rarity,
          locked: true,
          createdAt: r.created_at,
        }
      }
      return {
        id: r.id,
        badgeId: r.badge_id,
        name: badge?.name ?? '',
        imageUrl: badge?.image_url ?? null,
        rarity,
        locked: false,
        createdAt: r.created_at,
      }
    }),
  }
}

/**
 * 받지 않은 결과를 모두 받는다. 모두 들어갈 빈칸이 있어야 한다.
 * DB 함수가 거절하는 경우(`user_suspended`·`no_pending`·`insufficient_slots`·`inventory_not_found`)는 값으로 돌려준다.
 * RPC 오류나 해석할 수 없는 응답은 던진다.
 */
export async function claimPendingResults(supabase: SupabaseClient, userId: string): Promise<ClaimPendingResult> {
  const { data, error } = await supabase.rpc('combine_claim_pending', { p_user_id: userId })
  if (error) throw new Error(`combine_claim_pending RPC 오류: ${error.message}`)

  const result = data as {
    ok?: boolean
    error?: string
    free?: number
    needed?: number
    granted?: number
    itemIds?: string[]
  } | null
  if (!result || typeof result.ok !== 'boolean') throw new Error('combine_claim_pending 응답을 해석할 수 없다')

  if (result.ok) {
    return {
      ok: true,
      granted: Number(result.granted ?? 0),
      itemIds: Array.isArray(result.itemIds) ? result.itemIds : [],
    }
  }

  const code = result.error as ClaimPendingErrorCode
  if (!CLAIM_ERROR_CODES.includes(code)) throw new Error(`combine_claim_pending 알 수 없는 오류 코드: ${String(result.error)}`)
  return {
    ok: false,
    error: code,
    ...(result.free !== undefined ? { free: Number(result.free) } : {}),
    ...(result.needed !== undefined ? { needed: Number(result.needed) } : {}),
  }
}
