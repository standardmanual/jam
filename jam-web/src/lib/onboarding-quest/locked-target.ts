/**
 * «JAM! 시작하기» 카드의 ③ 버튼이 보낼 잠긴 개체 읽기 (티켓 20261021_1248 2회)
 *
 * ③ 버튼은 `/inventory` 목록이 아니라 개체 하나의 깊은 링크(`/inventory/{itemId}`)로 보낸다. 연출 7단계가 진행되는 동안 `/inventory` 목록은
 * 연출 인벤토리로 바뀌지만(`inventory/page.tsx`의 화면 문지기) 개체 상세에는 문지기가 없기 때문이다.
 *
 * 어떤 개체로 보내는가: **내가 지금 가진 잠긴 개체 가운데 열기까지 남은 잼이 가장 적은 것**이다. 동점이면 먼저 얻은 개체다.
 * 사용자 결정 2에 따라 아무 잠긴 개체를 열어도 ③이 체크되므로, 가장 적은 잼으로 마칠 수 있는 개체가 가장 도움이 된다.
 * 첫 캡슐에서 나온 잠긴 개체(잼 5)가 보통 여기에 걸린다. 캡슐에서 나온 개체인지 동기화로 받은 개체인지는 DB에 구분하는 값이 없어서(둘 다 `obtained_by = 'drop'`) 가리지 않는다.
 * 드랍해서 내 손을 떠났거나(`dropped_at`) 사라진(`destroyed_at`) 개체와 남의 개체는 인벤토리 행(`inventory_id`)으로 거른다.
 *
 * 읽기만 한다. 읽지 못하면 던진다 — 호출부(`status.ts`)가 «개체를 모른다»로 접고 ③ 버튼을 일반 길로 둔다.
 * 서버 전용이다(service_role 클라이언트로 쓴다).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** 열러 갈 잠긴 개체 — 필요량과 채운 양은 서버가 읽은 값이다(이름·그림 같은 열기 전 비공개 값은 읽지 않는다) */
export interface LockedOpenTarget {
  itemId: string
  required: number
  filled: number
}

export interface LockedItemCandidate {
  id: string
  unlock_required: number | null
  unlock_filled: number | null
  obtained_at: string | null
}

/** 순수 선택 — 열기까지 남은 잼이 가장 적은 개체, 동점이면 먼저 얻은 개체, 그래도 같으면 id 순서 */
export function pickLockedOpenTarget(candidates: readonly LockedItemCandidate[]): LockedOpenTarget | null {
  let best: { target: LockedOpenTarget; remaining: number; obtainedAt: string } | null = null
  for (const item of candidates) {
    if (typeof item.unlock_required !== 'number') continue
    const filled = typeof item.unlock_filled === 'number' ? item.unlock_filled : 0
    const remaining = Math.max(0, item.unlock_required - filled)
    const obtainedAt = item.obtained_at ?? ''
    const better =
      best === null ||
      remaining < best.remaining ||
      (remaining === best.remaining && obtainedAt < best.obtainedAt) ||
      (remaining === best.remaining && obtainedAt === best.obtainedAt && item.id < best.target.itemId)
    if (better) best = { target: { itemId: item.id, required: item.unlock_required, filled }, remaining, obtainedAt }
  }
  return best?.target ?? null
}

/** 내가 가진 잠긴 개체 가운데 열러 갈 하나. 없으면 null, 읽지 못하면 던진다. */
export async function readLockedOpenTarget(supabase: SupabaseClient, userId: string): Promise<LockedOpenTarget | null> {
  const { data: inventory, error: inventoryError } = await supabase.from('inventory').select('id').eq('user_id', userId).maybeSingle()
  if (inventoryError) throw new Error(`잠긴 개체 읽기 실패 (inventory): ${inventoryError.message}`)
  const inventoryId = (inventory as { id?: string } | null)?.id
  if (!inventoryId) return null

  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, unlock_required, unlock_filled, obtained_at')
    .eq('inventory_id', inventoryId)
    .eq('locked', true)
    .is('destroyed_at', null)
    .is('dropped_at', null)
    .not('unlock_required', 'is', null)
    .limit(50)
  if (error) throw new Error(`잠긴 개체 읽기 실패 (inventory_items): ${error.message}`)

  return pickLockedOpenTarget((data ?? []) as LockedItemCandidate[])
}
