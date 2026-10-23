/**
 * 재료 소각 단계 — 믹스(`index.ts`)와 등급 올리기(`tierUp.ts`)가 같이 쓴다 (티켓 20261022_2119 2회)
 *
 * 믹스의 «4. 원본 아이템 소각» 단계를 그대로 뽑았다. 순서와 동작은 믹스에 있던 것과 같다.
 *  1) 개체를 소프트 삭제한다(`destroyed_at`을 세우고 `inventory_id`를 비운다).
 *  2) 소각한 개수만큼 인벤토리 칸을 반환한다(`release_inventory_slots` RPC).
 *  3) 개체마다 Consume 이벤트를 남긴다(`custody_events`).
 *
 * 1)이 실패하거나 개수가 맞지 않으면 `{ ok: false }`로 끝낸다 — 호출부가 보상 없이 중단한다. 2)·3)이 실패해도 소각은 이미 확정됐으므로
 * 로그만 남기고 `{ ok: true }`로 이어 간다(믹스가 원래 그렇게 했다). 호출부는 이 함수를 부르기 전에 소유·잠김·장착 여부를 이미 검사해야 한다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { ReleaseInventorySlotsResult } from '@/lib/inventory/slots'

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * 소각·지급이 일어날 때마다 갱신되는 `inventory.used_slots` 캐시 카운터의 로컬 사본.
 * 소각 단계가 칸을 반환하면 이 사본도 함께 갱신한다(20260912_2101).
 */
export type InventorySlotState = { id: string; used_slots: number; max_slots: number }

export interface BurnMaterialsInput {
  userId: string
  /** 재료를 가진 인벤토리. 칸을 반환하면 `used_slots`를 이 객체에서 갱신한다 */
  inventory: InventorySlotState
  /** 소각할 인벤토리 개체 id 전부 */
  itemIds: string[]
  /** 로그 머리말 — 어느 기능이 소각했는지 알 수 있게 `[combineRecipeAttempt]`처럼 넘긴다 */
  logPrefix: string
}

export type BurnMaterialsResult = { ok: true; destroyedCount: number } | { ok: false }

export async function burnMaterials(supabase: ServiceClient, input: BurnMaterialsInput): Promise<BurnMaterialsResult> {
  const { userId, inventory, itemIds, logPrefix } = input

  // 20260829_2101: 개체 파괴 방식이 소프트 삭제로 확정됐다(하드 삭제하면 CustodyEvent
  // 이력이 고아가 된다) — DELETE 대신 destroyed_at을 세운다. 레이스 판정 방식은 동일한
  // 원리를 유지한다: `.is('destroyed_at', null)`로 필터한 UPDATE는 Postgres가 행 단위로
  // 원자 처리하므로, 동일 재료로 API를 동시에 2회 호출해도 먼저 커밋된 요청만
  // itemIds 전체를 파괴하고 뒤늦은 요청은 이미 destroyed_at이 찍힌 행이라 매치되지 않는다.
  // 개수가 요청한 itemIds와 다르면 레이스로 판단해 보상 지급 없이 중단한다.
  // inventory_id도 함께 비운다 — 코드베이스 전반의 "owned = inventory_id IS NOT NULL"
  // 조회 관례가 destroyed_at을 모르는 채로도 파괴된 개체를 자동으로 걸러내게 하기 위함
  // (migrations/108 주석 참고).
  const destroyedAt = new Date().toISOString()
  const { data: destroyedRows, error: destroyError } = await supabase
    .from('inventory_items')
    .update({ destroyed_at: destroyedAt, inventory_id: null })
    .in('id', itemIds)
    .eq('inventory_id', inventory.id)
    .is('destroyed_at', null)
    .select('id')

  if (destroyError) {
    console.error(`${logPrefix} 아이템 소각 오류:`, destroyError)
    return { ok: false }
  }

  if (!destroyedRows || destroyedRows.length !== itemIds.length) {
    console.error(`${logPrefix} 소각된 행 수 불일치 — 동시 시도로 판단, 처리 중단`, {
      expected: itemIds.length,
      actual: destroyedRows?.length ?? 0,
      userId,
    })
    return { ok: false }
  }

  // used_slots 감소 — 소각한 재료 개수만큼 인벤토리 칸을 반환한다(20260912_2101).
  // release_inventory_slots() RPC(마이그레이션 173, 티켓 20260914_1813)가 inventory 행을
  // 잠근 채로 감소시키므로, 뒤이은 지급의 증가와 같은 인벤토리 행을 두고
  // 서로 다른 시점에 read-then-write하던 레이스가 사라진다. 클램프(GREATEST(0, ...))는
  // RPC 내부에서 처리한다.
  const { data: releaseRpcResult, error: releaseRpcError } = await supabase.rpc('release_inventory_slots', {
    p_inventory_id: inventory.id,
    p_count: destroyedRows.length,
  })
  if (releaseRpcError) {
    console.error(`${logPrefix} release_inventory_slots RPC 오류:`, releaseRpcError)
  } else {
    const releaseResult = releaseRpcResult as ReleaseInventorySlotsResult
    if (releaseResult.ok) {
      inventory.used_slots = releaseResult.usedSlots
    } else {
      console.error(`${logPrefix} release_inventory_slots 실패:`, releaseResult.reason)
    }
  }

  // Consume 이벤트 — actor 유저명을 스냅샷으로 기록한다(라이브 조인 의존 금지).
  const { data: actorRaw } = await supabase.from('users').select('username').eq('id', userId).maybeSingle()
  const actorUsername = (actorRaw as { username: string } | null)?.username ?? null
  const consumeEventsQuery = supabase.from('custody_events')
  const consumeEventsPayload = itemIds.map((id) => ({
    inventory_item_id: id,
    event_type: 'Consume' as const,
    actor_user_id: userId,
    actor_username: actorUsername,
  }))
  const { error: consumeEventError } = await consumeEventsQuery.insert(consumeEventsPayload)
  if (consumeEventError) {
    console.error(`${logPrefix} Consume 이벤트 기록 오류:`, consumeEventError)
  }

  return { ok: true, destroyedCount: destroyedRows.length }
}
