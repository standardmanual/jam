/**
 * user_id로 inventory 행의 id를 조회하고, 없으면 즉석에서 생성한다(get-or-create).
 *
 * 정상 경로에서는 회원가입 시 handle_new_user() 트리거(129_inventory_policy_max_slots.sql)가
 * 이미 생성해 두므로 이 함수가 실제로 INSERT까지 가는 일은 거의 없다 — 티켓 20260906_2217:
 * 129 적용 이전에 가입한 유저 12명 전원의 inventory 행이 결측돼 드랍/픽업/인벤토리 조회가
 * 전부 "인벤토리를 불러오지 못했어요" 오류로 막힌 사고가 있었다. 백필 SQL
 * (seed_backfill_missing_inventory.sql)로 기존 결측은 해소했지만, 같은 종류의 결측이
 * 향후 재발해도(트리거 미실행·수동 DB 조작 등) 사용자가 막히지 않도록 하는 안전망이다.
 *
 * 동시 요청 경합(user_id UNIQUE 위반, Postgres 23505)은 정상 케이스로 보고 재조회로 흡수한다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { getInventoryPolicy } from '@/lib/inventory/policy'

export async function getOrCreateInventoryId(
  service: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<string | null> {
  const { data: invRaw } = await service
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (invRaw) return (invRaw as { id: string }).id

  const policy = await getInventoryPolicy()
  const { data: inserted, error: insertError } = await service
    .from('inventory')
    .insert({ user_id: userId, max_slots: policy.max_slots })
    .select('id')
    .single()

  if (inserted) {
    console.warn(
      `[inventory] get-or-create: user_id=${userId} 인벤토리 결측 발견 — 즉석 생성함 (회귀 감시, 티켓 20260906_2217)`
    )
    return (inserted as { id: string }).id
  }

  // 동시 요청이 먼저 INSERT를 끝냈다면 UNIQUE(user_id) 위반(23505) — 재조회로 회수한다.
  if (insertError?.code === '23505') {
    const { data: retryRaw } = await service
      .from('inventory')
      .select('id')
      .eq('user_id', userId)
      .single()
    if (retryRaw) return (retryRaw as { id: string }).id
  }

  console.error('[inventory] get-or-create 생성 실패:', insertError)
  return null
}
