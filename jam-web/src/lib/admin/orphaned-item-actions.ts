/**
 * 미소유 아이템배지 폐기·재배정 공용 로직(티켓 20260924_0950) — `api/admin/item-badges/orphaned/bulk`
 * 라우트 하나가 쓴다. 폐기·재배정을 따로 받던 예전 라우트 두 개가 각자 반복하던 RPC 호출 루프와
 * 오류 코드 → 문구 표를 옮겨 왔다.
 *
 * 개체마다 RPC 한 번이 트랜잭션 하나라(`admin_destroy_orphaned_item`·`admin_reassign_orphaned_item`)
 * 여러 개체를 하나로 묶어 원자적으로 처리할 수 없다 — 그래서 결과는 "전부 성공 또는 전부 취소"가
 * 아니라 개체별 처리·건너뜀(사유 포함)이다(상위 티켓 §2 "유저 단위 작업" 규칙과 같다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { BulkResult, BulkSkip } from './bulk/shared'

type ServiceClient = ReturnType<typeof createServiceClient>

const IN_CHUNK_SIZE = 200
/** 재배정 한 번에 처리하는 상한(상위 티켓 §2 동작별 상한) — 서버 라우트와 화면이 같은 값을 쓴다 */
export const ORPHANED_REASSIGN_MAX_IDS = 200
/** 폐기 RPC를 동시에 부르는 개수 — 개체끼리 공유하는 행이 없어 병렬이 안전하다 */
const DESTROY_CONCURRENCY = 10

/** `admin_destroy_orphaned_item`이 돌려주는 error 코드 → 화면 문구 */
export const DESTROY_ERROR_LABEL: Record<string, string> = {
  item_not_found: '개체를 찾을 수 없습니다',
  already_destroyed: '이미 폐기된 개체입니다',
  not_orphaned: '소유자 없음 상태가 아닙니다 (다른 작업으로 상태가 이미 바뀌었을 수 있습니다)',
  destroy_failed: '폐기 처리에 실패했습니다',
}

/** `admin_reassign_orphaned_item`이 돌려주는 error 코드 → 화면 문구 */
export const REASSIGN_ERROR_LABEL: Record<string, string> = {
  item_not_found: '개체를 찾을 수 없습니다',
  not_orphaned: '소유자 없음 상태가 아닙니다 (다른 작업으로 상태가 이미 바뀌었을 수 있습니다)',
  inventory_not_found: '대상 유저의 인벤토리를 찾을 수 없습니다',
  inventory_full: '대상 유저의 인벤토리가 꽉 찼습니다',
  reassign_failed: '재배정 처리에 실패했습니다',
}

/** 대상 개체 한 건의 현재 상태 — 미리보기 분류와 건너뜀 라벨에 쓴다 */
export interface OrphanedItemInfo {
  id: string
  badgeId: string
  serialLabel: string
  inventoryId: string | null
  destroyedAt: string | null
}

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
}

/** 선택한 id의 현재 상태를 읽는다. 없는 id는 결과 맵에 없다. 조회가 실패하면 던진다. */
export async function fetchOrphanedItemInfos(
  supabase: ServiceClient,
  ids: string[]
): Promise<Map<string, OrphanedItemInfo>> {
  const infos = new Map<string, OrphanedItemInfo>()
  for (const idsChunk of chunk(ids, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('id, badge_id, serial_number, serial_prefix, inventory_id, destroyed_at')
      .in('id', idsChunk)
    if (error) throw new Error(`개체 조회 실패: ${error.message}`)
    for (const row of data ?? []) {
      infos.set(row.id, {
        id: row.id,
        badgeId: row.badge_id,
        serialLabel: `${row.serial_prefix ?? ''}${row.serial_number}`,
        inventoryId: row.inventory_id,
        destroyedAt: row.destroyed_at,
      })
    }
  }
  return infos
}

export interface OwnerlessClassification {
  /** 지금도 소유자가 없고 폐기되지 않은 개체 — 처리 대상 */
  eligible: string[]
  skipped: BulkSkip[]
}

/**
 * 선택을 "처리 대상"과 "건너뜀"으로 나눈다. 대상은 `inventory_id IS NULL AND destroyed_at IS NULL`
 * 인 개체다(활성 드랍 참조 여부의 최종 판정은 RPC가 한다). 선택 뒤 다른 작업으로 상태가 바뀐
 * 개체는 사유와 함께 건너뛴다.
 */
export function classifyOwnerless(ids: string[], infos: Map<string, OrphanedItemInfo>): OwnerlessClassification {
  const eligible: string[] = []
  const skipped: BulkSkip[] = []

  for (const id of ids) {
    const info = infos.get(id)
    if (!info) {
      skipped.push({ id, reason: DESTROY_ERROR_LABEL.item_not_found })
    } else if (info.destroyedAt !== null) {
      skipped.push({ id, label: `#${info.serialLabel}`, reason: DESTROY_ERROR_LABEL.already_destroyed })
    } else if (info.inventoryId !== null) {
      skipped.push({ id, label: `#${info.serialLabel}`, reason: DESTROY_ERROR_LABEL.not_orphaned })
    } else {
      eligible.push(id)
    }
  }

  return { eligible, skipped }
}

/** 폐기 미리보기 수치 — 처리 대상 개체 수와 그 배지 종류 수 */
export function summarizeDestroyImpact(
  eligible: string[],
  infos: Map<string, OrphanedItemInfo>
): { itemCount: number; badgeKindCount: number } {
  const badgeIds = new Set<string>()
  for (const id of eligible) {
    const info = infos.get(id)
    if (info) badgeIds.add(info.badgeId)
  }
  return { itemCount: eligible.length, badgeKindCount: badgeIds.size }
}

/**
 * 재배정 미리보기 수치 — 대상 유저의 빈 칸(`max_slots − used_slots`)과 재배정할 개수를 비교한다.
 * 모자라는 만큼은 `inventory_full`로 실패한다. `inventory`가 null이면 인벤토리가 없는 유저다.
 */
export function summarizeReassignImpact(
  itemCount: number,
  inventory: { max_slots: number; used_slots: number } | null
): { itemCount: number; hasInventory: number; freeSlots: number; shortCount: number } {
  if (!inventory) return { itemCount, hasInventory: 0, freeSlots: 0, shortCount: itemCount }
  const freeSlots = Math.max(0, inventory.max_slots - inventory.used_slots)
  return { itemCount, hasInventory: 1, freeSlots, shortCount: Math.max(0, itemCount - freeSlots) }
}

interface RpcOutcome {
  id: string
  ok: boolean
  error?: string
}

async function destroyOne(supabase: ServiceClient, id: string, adminId: string): Promise<RpcOutcome> {
  const { data, error } = await supabase.rpc('admin_destroy_orphaned_item', { p_item_id: id, p_admin_id: adminId })
  if (error) {
    console.error('[admin/item-badges/orphaned/bulk] 폐기 RPC 오류:', error)
    return { id, ok: false, error: 'destroy_failed' }
  }
  const result = data as { ok: boolean; error?: string }
  return { id, ok: result.ok, error: result.ok ? undefined : result.error }
}

async function reassignOne(
  supabase: ServiceClient,
  id: string,
  adminId: string,
  targetUserId: string
): Promise<RpcOutcome> {
  const { data, error } = await supabase.rpc('admin_reassign_orphaned_item', {
    p_item_id: id,
    p_admin_id: adminId,
    p_target_user_id: targetUserId,
  })
  if (error) {
    console.error('[admin/item-badges/orphaned/bulk] 재배정 RPC 오류:', error)
    return { id, ok: false, error: 'reassign_failed' }
  }
  const result = data as { ok: boolean; error?: string }
  return { id, ok: result.ok, error: result.ok ? undefined : result.error }
}

/** RPC 결과를 표준 일괄 결과(`processed`/`skipped`)로 묶는다 — 실패는 오류 코드를 문구로 바꿔 건너뜀에 넣는다 */
export function toBulkResult(
  outcomes: RpcOutcome[],
  infos: Map<string, OrphanedItemInfo>,
  labels: Record<string, string>
): BulkResult {
  const processed: string[] = []
  const skipped: BulkSkip[] = []
  for (const outcome of outcomes) {
    if (outcome.ok) {
      processed.push(outcome.id)
      continue
    }
    const info = infos.get(outcome.id)
    skipped.push({
      id: outcome.id,
      label: info ? `#${info.serialLabel}` : undefined,
      reason: labels[outcome.error ?? ''] ?? outcome.error ?? '처리에 실패했습니다',
    })
  }
  return { processed, skipped }
}

/**
 * 폐기를 실행한다. 개체끼리 공유하는 행이 없어 {@link DESTROY_CONCURRENCY}개씩 병렬로 부른다
 * (1,000건을 차례로 부르면 라우트 실행 시간 상한에 걸릴 수 있다).
 */
export async function destroyOrphanedItems(
  supabase: ServiceClient,
  ids: string[],
  adminId: string
): Promise<RpcOutcome[]> {
  const outcomes: RpcOutcome[] = []
  for (const group of chunk(ids, DESTROY_CONCURRENCY)) {
    outcomes.push(...(await Promise.all(group.map((id) => destroyOne(supabase, id, adminId)))))
  }
  return outcomes
}

/**
 * 재배정을 실행한다. 대상 유저의 `inventory` 행 하나를 모든 개체가 공유해(FOR UPDATE 락)
 * 병렬로 부르면 락 대기만 생기므로 차례로 부른다 — `used_slots` 증가 순서도 예측 가능해진다.
 * 중간에 대상 인벤토리가 꽉 차면 그 뒤 개체부터 `inventory_full`로 실패하고, 이미 처리된
 * 개체는 되돌리지 않는다.
 */
export async function reassignOrphanedItems(
  supabase: ServiceClient,
  ids: string[],
  adminId: string,
  targetUserId: string
): Promise<RpcOutcome[]> {
  const outcomes: RpcOutcome[] = []
  for (const id of ids) outcomes.push(await reassignOne(supabase, id, adminId, targetUserId))
  return outcomes
}
