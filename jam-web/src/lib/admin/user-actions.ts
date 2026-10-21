/**
 * 유저 초기화·완전 삭제 공용 로직(티켓 20260924_0951) — 단건 라우트
 * (`api/admin/users/[id]/reset`, `api/admin/users/[id]`)와 유저 일괄 라우트
 * (`api/admin/users/bulk`)가 같은 함수를 쓴다. 본인·어드민 계정 차단은 호출부가 정한다
 * (단건은 403/400 응답, 일괄은 `partitionUserTargets`로 대상에서 뺀다) — 이 함수들은
 * 대상이 이미 걸러졌다고 보고 실행만 한다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { deleteAccount } from '@/lib/account/delete-account'
import type { InventoryRow, UserRow } from '@/types/database'

type ServiceClient = ReturnType<typeof createServiceClient>

export type UserActionFailure = { ok: false; status: 404 | 500; error: string }

export type ResetUserResult =
  | { ok: true; deletedActivityBadges: number; deletedInventoryItems: number }
  | UserActionFailure

/**
 * 유저 전체 초기화 (시뮬레이터 반복 테스트용)
 * 유지: users 계정, strava_connections 행(토큰·연동 상태), 팔로잉/팔로워 관계
 * 삭제: 활동·배지·아이템·미션·피드·POI드랍·드랍상태·아이템북완성·믹스성공·실패이력 전체
 * 초기화: initial_sync_done=false + strava last_synced_at=NULL
 *         → 다음 싱크가 "최초 연동"처럼 과거 이력 전체를 다시 불러온다 (연동은 유지)
 */
export async function resetUserData(
  supabase: ServiceClient,
  userId: string,
  adminEmail: string
): Promise<ResetUserResult> {
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, initial_sync_done')
    .eq('id', userId)
    .maybeSingle()

  if (userError) return { ok: false, status: 500, error: userError.message }
  if (!userRow) return { ok: false, status: 404, error: '유저를 찾을 수 없습니다.' }

  // ── 1단계: 인벤토리 아이템 먼저 삭제 (poi_drops.id를 drop_id FK로 참조하므로 선행 필요) ──
  const { data: inventoryRaw, error: inventoryError } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (inventoryError) return { ok: false, status: 500, error: inventoryError.message }

  const inventory = inventoryRaw as Pick<InventoryRow, 'id'> | null
  let deletedItemCount = 0

  if (inventory) {
    const [{ count, error: itemErr }, { error: slotErr }] = await Promise.all([
      supabase.from('inventory_items').delete({ count: 'exact' }).eq('inventory_id', inventory.id),
      supabase.from('inventory').update({ used_slots: 0 }).eq('id', inventory.id),
    ])
    if (itemErr) return { ok: false, status: 500, error: itemErr.message }
    if (slotErr) return { ok: false, status: 500, error: slotErr.message }
    deletedItemCount = count ?? 0
  }

  // ── 1.5단계: 이 유저가 드랍한 POI를 "타인이" 주워서 보유 중인 inventory_items도 선삭제
  // (poi_drops 삭제 시 inventory_items.drop_id FK가 NO ACTION이라 남아있으면 위반됨 — 구모델
  // 레거시 데이터 대상)
  //
  // 20260829_2101 추가: 개체 정체성 모델 도입 이후 "이 유저가 드랍했지만 아직 아무도
  // 안 주워간" 개체는 소유자가 이미 없다(inventory_id NULL) — 1단계(inventory_id 기준
  // 삭제)가 못 잡는다. poi_drops.inventory_item_id로 직접 찾아 함께 지운다(FK가 CASCADE라
  // 두어도 되지만, 명시적으로 지워 로그의 deletedItemCount에도 반영되게 한다).
  const { data: droppedRows, error: droppedError } = await supabase
    .from('poi_drops')
    .select('id, inventory_item_id')
    .eq('dropper_user_id', userId)

  if (droppedError) return { ok: false, status: 500, error: droppedError.message }

  const droppedIds = (droppedRows ?? []).map((row) => (row as { id: string }).id)
  const droppedInventoryItemIds = (droppedRows ?? [])
    .map((row) => (row as { inventory_item_id: string | null }).inventory_item_id)
    .filter((id): id is string => Boolean(id))

  if (droppedIds.length > 0) {
    const { error: foreignItemErr } = await supabase
      .from('inventory_items')
      .delete()
      .in('drop_id', droppedIds)
    if (foreignItemErr) return { ok: false, status: 500, error: foreignItemErr.message }
  }
  if (droppedInventoryItemIds.length > 0) {
    const { error: newModelItemErr } = await supabase
      .from('inventory_items')
      .delete()
      .in('id', droppedInventoryItemIds)
    if (newModelItemErr) return { ok: false, status: 500, error: newModelItemErr.message }
  }

  // ── 2단계: 병렬 삭제 (inventory_items 제거 후 poi_drops 삭제 안전) ─────────
  // 20260829_2101 참고: 이 유저가 픽업한 개체는 1단계에서 inventory_id 기준으로 이미
  // 삭제됐고, poi_drops.inventory_item_id FK가 CASCADE라 그 픽업 기록(poi_drops row)도
  // 함께 사라진다 — 아래 "픽업 정보만 초기화(행은 유지)" UPDATE는 대상 행이 이미 없어
  // 사실상 no-op이 된다(에러는 아님). 구모델에서는 드랍한 사람의 원본 row와 픽업한
  // 사람의 개체가 서로 다른 row라 이 초기화가 유효했으나, 개체 정체성 모델에서는 둘이
  // 같은 row라 의미가 달라졌다 — 시뮬레이터 반복 테스트 목적상 문제 없다고 판단해 그대로 둔다.
  const poiDropsQuery = supabase.from('poi_drops')
  const poiDropsResetQuery = poiDropsQuery.update({ picked_up_by: null, picked_up_at: null, is_available: true }).eq('picked_up_by', userId)
  const [
    { count: deletedBadgeCount, error: e1 },
    { error: e2 },
    { error: e3 },
    { error: e4 },
    { error: e5 },
    { error: e6 },
  ] = await Promise.all([
    // 배지 기록
    supabase.from('user_activity_badges').delete({ count: 'exact' }).eq('user_id', userId),
    // 활동 피드 전체
    supabase.from('user_activity_feed').delete().eq('user_id', userId),
    // 이 유저가 드랍한 POI 배지 행 삭제
    supabase.from('poi_drops').delete().eq('dropper_user_id', userId),
    // 이 유저가 픽업한 POI 배지 → 픽업 정보 초기화 (행은 유지)
    poiDropsResetQuery,
    // 미션 완료 기록
    supabase.from('user_mission_completions').delete().eq('user_id', userId),
    // 미션 참여 기록
    supabase.from('user_mission_participations').delete().eq('user_id', userId),
  ])

  const parallelError = e1 ?? e2 ?? e3 ?? e4 ?? e5 ?? e6
  if (parallelError) return { ok: false, status: 500, error: parallelError.message }

  // ── 3단계: 드랍엔진 v2 상태 + 아이템북 완성 기록 삭제 ─────────
  // (user_item_book_slots는 inventory_items ON DELETE CASCADE로 이미 정리됨)
  // 20260910_1441: 믹스 실패 이력도 "초기 상태로 되돌린다"는 리셋 의미에 맞춰 함께 삭제한다.
  // 20261001_0631: 믹스 성공 이력(`user_combine_success_logs`)도 같은 이유로 함께 삭제한다 — 시도·성공
  // 횟수 지표가 이 기록에서 나오므로 남겨 두면 초기화한 유저의 횟수가 그대로 이어진다.
  const [{ error: e9 }, { error: e10 }, { error: e11 }, { error: e12 }] = await Promise.all([
    supabase.from('user_drop_state').delete().eq('user_id', userId),
    supabase.from('user_item_book_completions').delete().eq('user_id', userId),
    supabase.from('user_combine_fail_logs').delete().eq('user_id', userId),
    supabase.from('user_combine_success_logs').delete().eq('user_id', userId),
  ])
  const stateError = e9 ?? e10 ?? e11 ?? e12
  if (stateError) return { ok: false, status: 500, error: stateError.message }

  // ── 4단계: 싱크 이력 초기화 (연동 자체는 유지) ─────────
  // initial_sync_done=false + last_synced_at=NULL → 다음 싱크가 최초 연동처럼 전체 이력 재수집
  const usersQuery = supabase.from('users')
  const usersUpdateQuery = usersQuery.update({ initial_sync_done: false }).eq('id', userId)
  await usersUpdateQuery
  const stravaConnectionsQuery = supabase.from('strava_connections')
  // 끊김 행(disconnected_at)은 건너뛴다 — 동기화가 멈춘 연결이라 초기화할 커서가 없다(티켓 20261017_1422)
  const stravaUpdateQuery = stravaConnectionsQuery
    .update({ last_synced_at: null, backfill_completed: false })
    .eq('user_id', userId)
    .is('disconnected_at', null)
  const { error: stravaError } = await stravaUpdateQuery
  if (stravaError) return { ok: false, status: 500, error: stravaError.message }

  console.info(
    `[admin/users/reset] userId: ${userId}, 배지: ${deletedBadgeCount ?? 0}개, 아이템: ${deletedItemCount}개 (by admin: ${adminEmail})`
  )

  return {
    ok: true,
    deletedActivityBadges: deletedBadgeCount ?? 0,
    deletedInventoryItems: deletedItemCount,
  }
}

export type HardDeleteUserResult =
  | { ok: true; deletedEmail: string; deletedActivityBadges: number; deletedInventoryItems: number }
  | UserActionFailure

/**
 * 어드민 삭제가 실패했을 때 화면에 나가는 고정 문구(티켓 20261021_1249). DB·Auth 오류 원문은 싣지 않고 서버 로그에만 남긴다.
 * 단건(`api/admin/users/[id]`)과 일괄(`api/admin/users/bulk`) 라우트가 같은 문구를 쓴다.
 */
export const ADMIN_DELETE_FAILED_MESSAGE = '계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.'

/**
 * 유저 계정 강제 완전 삭제 (티켓 20260909_0911, 지우는 규칙은 티켓 20261021_1249)
 * 초기화(`resetUserData`)와 달리 계정 자체를 지운다. 지우는 순서는 `deleteAccount`(`lib/account/delete-account.ts`)가
 * 갖는다 — 유저 탈퇴·«그래도 연결하기»와 같은 함수다: 준비 RPC(`prepare_account_deletion`: 법정 보관 기록 복사, 이력 이름 칸 비우기,
 * 소유 아이템 «없어짐» 처리) → 아바타 파일 삭제 → `auth.admin.deleteUser`.
 * `public.users.id`는 `auth.users(id)`를 `ON DELETE CASCADE`로 참조하므로(001_initial_schema), Admin API로 `auth.users` 행을
 * 지우면 `public.users`와 그 아래 모든 참조 테이블(strava_connections, inventory,
 * user_activity_badges 등)이 한 번의 DB 트랜잭션으로 연쇄 삭제된다. `public.users`를
 * 먼저 지우고 `auth.users`를 뒤이어 지우는 2단계 방식은 그 사이 상태가 갈라지는 창이
 * 생길 수 있어 채택하지 않았다.
 */
export async function hardDeleteUser(
  supabase: ServiceClient,
  userId: string,
  adminEmail: string
): Promise<HardDeleteUserResult> {
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, email, username')
    .eq('id', userId)
    .maybeSingle()

  if (userError) {
    console.error('[admin/users/delete] 유저 조회 실패:', userError.message)
    return { ok: false, status: 500, error: ADMIN_DELETE_FAILED_MESSAGE }
  }
  if (!userRow) return { ok: false, status: 404, error: '유저를 찾을 수 없습니다.' }

  const targetUser = userRow as Pick<UserRow, 'id' | 'email' | 'username'>

  // 삭제 전 주요 보유 수량을 집계해 감사 로그·응답에 남긴다(연쇄 삭제로 이후엔 조회 불가).
  const { count: deletedActivityBadges } = await supabase
    .from('user_activity_badges')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  const { data: inventoryRow } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  let deletedInventoryItems = 0
  const inventory = inventoryRow as Pick<InventoryRow, 'id'> | null
  if (inventory) {
    const { count } = await supabase
      .from('inventory_items')
      .select('*', { count: 'exact', head: true })
      .eq('inventory_id', inventory.id)
    deletedInventoryItems = count ?? 0
  }

  const deleted = await deleteAccount(supabase, userId)
  if (!deleted.ok) {
    // 오류 원문은 deleteAccount가 이미 서버 로그에 남겼다. 응답에는 고정 문구만 싣는다.
    if (deleted.code === 'not_found') return { ok: false, status: 404, error: '유저를 찾을 수 없습니다.' }
    console.error(`[admin/users/delete] 삭제 실패 userId: ${userId}, code: ${deleted.code} (by admin: ${adminEmail})`)
    return { ok: false, status: 500, error: ADMIN_DELETE_FAILED_MESSAGE }
  }

  const retainedTotal = Object.values(deleted.summary.retained).reduce((sum, n) => sum + n, 0)
  console.info(
    `[admin/users/delete] userId: ${userId}, email: ${targetUser.email}, 배지: ${deletedActivityBadges ?? 0}개, 아이템: ${deletedInventoryItems}개(없어짐 처리 ${deleted.summary.vanishedItems}개), 보관 복사 ${retainedTotal}건 (by admin: ${adminEmail})`
  )

  return {
    ok: true,
    deletedEmail: targetUser.email,
    deletedActivityBadges: deletedActivityBadges ?? 0,
    deletedInventoryItems,
  }
}
