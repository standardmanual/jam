/**
 * 남은 인벤토리 칸 알림 — 티켓 20261018_0056 (운영 로직 6.4절)
 *
 * 새 코드가 아이템 배지를 준 직후 이 한 곳을 부른다. DB 함수 `inventory_slot_alert_step`(마이그레이션 237)이 인벤토리 행을 잠그고
 * 남은 칸으로 단계(0·3·1)를 정해 «단계가 나빠졌는지»만 돌려준다. 나빠졌으면(notify) 여기서 `inventory_slots_low` 알림을 만든다.
 * 같은 단계는 한 번만 알리고, 빈칸이 늘어 단계가 풀리면 다시 줄어들 때 한 번 더 알릴 수 있다(함수 쪽 규칙).
 *
 * DB 트리거를 쓰지 않는 까닭: 옛 프로덕션 코드의 지급에서도 알림이 생겨 옛 알림 화면에 «알 수 없는 소식»이 보일 수 있다.
 * 그래서 새 코드가 지급하는 곳에서만 부른다.
 *
 * **던지지 않는다.** 알림은 본 흐름(지급·믹스·동기화)의 곁다리라 실패해도 본 흐름을 깨지 않는다. 실패는 로그만 남긴다.
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { createServiceClient } from '@/lib/supabase/server'

/** 알림 단계. 남은 칸이 2~3개면 3, 0~1개면 1이다 */
export type SlotAlertStage = 3 | 1

/**
 * `inventory_slot_alert_step`의 응답을 해석한다. 알림을 보내야 하는 응답(ok, notify, stage가 3 또는 1)일 때만 단계를 돌려주고,
 * 그 밖의 응답(보낼 필요 없음, 실패, 모양이 다른 값)은 null이다.
 */
export function parseSlotAlertStep(result: unknown): SlotAlertStage | null {
  if (!result || typeof result !== 'object') return null
  const r = result as { ok?: unknown; notify?: unknown; stage?: unknown }
  if (r.ok !== true || r.notify !== true) return null
  return r.stage === 3 || r.stage === 1 ? r.stage : null
}

/**
 * 지급 직후 남은 칸을 보고, 단계가 나빠졌으면 알림을 한 번 만든다.
 * @param supabase service_role 클라이언트. 생략하면 새로 만든다
 */
export async function notifyInventorySlotsLow(userId: string, supabase?: SupabaseClient): Promise<void> {
  try {
    const client = supabase ?? (createServiceClient() as unknown as SupabaseClient)
    const { data, error } = await client.rpc('inventory_slot_alert_step', { p_user_id: userId })
    if (error) {
      console.error(`[slotAlert] inventory_slot_alert_step RPC 오류 (userId: ${userId}):`, error)
      return
    }
    const stage = parseSlotAlertStep(data)
    if (stage === null) return

    const { data: inv, error: invError } = await client
      .from('inventory')
      .select('max_slots')
      .eq('user_id', userId)
      .maybeSingle()
    if (invError) console.error(`[slotAlert] 인벤토리 조회 실패 (userId: ${userId}):`, invError)
    const maxSlots = (inv as { max_slots?: number } | null)?.max_slots

    await createNotification({
      userId,
      type: 'inventory_slots_low',
      payload: { remaining_slots: stage, max_slots: typeof maxSlots === 'number' ? maxSlots : 0 },
    })
  } catch (e) {
    console.error(`[slotAlert] 남은 칸 알림 실패 (userId: ${userId}):`, e)
  }
}
