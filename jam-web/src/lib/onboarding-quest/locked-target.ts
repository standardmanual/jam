/**
 * «JAM! 시작하기» 카드의 ② 버튼이 보낼 잠긴 개체 읽기 (티켓 20261021_1248 2회, 포인트 기준으로 바뀜 20261028_1738 1회)
 *
 * ② 버튼은 `/inventory` 목록이 아니라 개체 하나의 깊은 링크(`/inventory/{itemId}`)로 보낸다. 연출 7단계가 진행되는 동안 `/inventory` 목록은
 * 연출 인벤토리로 바뀌지만(`inventory/page.tsx`의 화면 문지기) 개체 상세에는 문지기가 없기 때문이다.
 *
 * 어떤 개체로 보내는가: **내가 지금 가진 잠긴 개체 가운데 열기까지 드는 포인트(`inventory_items.unlock_points_required`)가 가장 적은 것**이다.
 * 동점이면 먼저 얻은 개체(`obtained_at`), 그래도 같으면 id 순서다. 이 정렬을 DB가 하고 한 건만 읽는다(예전에는 정렬 없이 50건을 읽어 골랐다, 기존 티켓 20261021_1729).
 * 필요 포인트가 비어 있는 개체는 맨 뒤로 보낸다(`nullsFirst: false`). 가장 앞 개체의 값이 비어 있으면 모든 개체가 비어 있다는 뜻이라 «개체를 모른다»로 접는다.
 * 사용자 결정 2에 따라 아무 잠긴 개체를 열어도 ②가 체크되므로, 가장 적은 포인트로 마칠 수 있는 개체가 가장 도움이 된다.
 * 드랍해서 내 손을 떠났거나(`dropped_at`) 사라진(`destroyed_at`) 개체와 남의 개체는 인벤토리 행(`inventory_id`)으로 거른다.
 *
 * 읽기만 한다. 읽지 못하면 던진다 — 호출부(`status.ts`)가 «개체를 모른다»로 접고 ② 버튼을 일반 길로 둔다.
 * 서버 전용이다(service_role 클라이언트로 쓴다).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** 열러 갈 잠긴 개체 — 여는 포인트는 서버가 읽은 값이다(이름·그림 같은 열기 전 비공개 값은 읽지 않는다) */
export interface LockedOpenTarget {
  itemId: string
  /** 열기까지 드는 포인트. 0이면 포인트 없이 열 수 있다 */
  pointsRequired: number
}

export interface LockedItemRow {
  id: string
  unlock_points_required: number | null
}

/** 순수 변환 — DB가 정렬해 준 맨 앞 한 건을 열러 갈 개체로 바꾼다. 행이 없거나 필요 포인트가 비어 있으면 null */
export function toLockedOpenTarget(row: LockedItemRow | null | undefined): LockedOpenTarget | null {
  if (!row || typeof row.unlock_points_required !== 'number') return null
  return { itemId: row.id, pointsRequired: Math.max(0, row.unlock_points_required) }
}

/** 내가 가진 잠긴 개체 가운데 열러 갈 하나. 없으면 null, 읽지 못하면 던진다. */
export async function readLockedOpenTarget(supabase: SupabaseClient, userId: string): Promise<LockedOpenTarget | null> {
  const { data: inventory, error: inventoryError } = await supabase.from('inventory').select('id').eq('user_id', userId).maybeSingle()
  if (inventoryError) throw new Error(`잠긴 개체 읽기 실패 (inventory): ${inventoryError.message}`)
  const inventoryId = (inventory as { id?: string } | null)?.id
  if (!inventoryId) return null

  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, unlock_points_required')
    .eq('inventory_id', inventoryId)
    .eq('locked', true)
    .is('destroyed_at', null)
    .is('dropped_at', null)
    .order('unlock_points_required', { ascending: true, nullsFirst: false })
    .order('obtained_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
  if (error) throw new Error(`잠긴 개체 읽기 실패 (inventory_items): ${error.message}`)

  return toLockedOpenTarget(((data ?? []) as LockedItemRow[])[0])
}

/**
 * 가진 포인트(`point_wallets.balance`). 지갑 행이 없으면 0이다(아직 한 번도 받지 않은 유저). 읽지 못하면 던진다 —
 * 호출부(`status.ts`)가 «모름»으로 접어 모자람을 단정하지 않는다. 열러 갈 개체의 필요 포인트가 0보다 클 때만 부른다.
 */
export async function readPointBalance(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase.from('point_wallets').select('balance').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`가진 포인트 읽기 실패 (point_wallets): ${error.message}`)
  const balance = (data as { balance?: number | null } | null)?.balance
  return typeof balance === 'number' ? balance : 0
}
