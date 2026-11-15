// 곧 열 화면(인벤토리 전체 + 배지함 액티비티 탭 앞 칸)의 배지 그림 원본 주소를 모은다 (티켓 20261115_1344).
// 서버 전용 — 사용자 클라이언트(RLS)로 화면과 같은 조회를 한다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { FIRST_SCREEN_GRID_COUNT } from '@/lib/imageSrc'
import { buildActivityBadgeList, queryEarnedActivityBadges } from '@/lib/badges/activityBadgeList'

/** 한 번에 돌려주는 주소 수의 상한 — 인벤토리 30칸 + 배지함 12칸 */
export const WARMUP_MAX_URLS = 42

type InventoryRow = {
  inventory_items: Array<{
    dropped_at: string | null
    slotted_in?: string | null
    locked?: boolean
    badge: { image_url: string | null; deleted_at: string | null } | null
  }> | null
}

export async function collectFirstScreenBadgeImageUrls(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const [inv, earned] = await Promise.all([
    supabase
      .from('inventory')
      .select('id, inventory_items(id, dropped_at, slotted_in, locked, badge:badges(image_url, deleted_at))')
      .eq('user_id', userId)
      .maybeSingle(),
    queryEarnedActivityBadges(supabase, userId),
  ])

  const urls: string[] = []
  const push = (u: string | null | undefined) => {
    const v = u?.trim()
    if (v) urls.push(v)
  }

  // 인벤토리 화면과 같은 필터. 잠긴 개체는 화면이 그림을 그리지 않으므로 뺀다
  const items = ((inv.data as unknown as InventoryRow | null)?.inventory_items ?? []).filter(
    (i) => i.dropped_at === null && (i.slotted_in ?? null) === null && i.locked !== true && i.badge && !i.badge.deleted_at,
  )
  for (const i of items) push(i.badge?.image_url)

  for (const r of buildActivityBadgeList(earned.data).slice(0, FIRST_SCREEN_GRID_COUNT)) {
    push(r.badge.image_url)
  }

  return [...new Set(urls)].slice(0, WARMUP_MAX_URLS)
}
