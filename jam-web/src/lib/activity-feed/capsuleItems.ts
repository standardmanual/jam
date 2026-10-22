/**
 * 캡슐에서 나온 개체 가르기 (티켓 20261022_1021, 운영 로직 15.3절)
 *
 * 캡슐을 열어 나온 아이템 배지는 활동 피드에 올리지 않는다(2026-10-10 사용자 결정). 티켓 20261021_1249 5회가 캡슐 열기의
 * `item_dropped` 기록을 없앴지만, 프로필 서버 화면(`app/(main)/[username]/page.tsx`)은 `inventory_items.obtained_by = 'drop'`인
 * 개체를 피드 행이 없으면 «아이템 드랍» 카드로 합성한다(피드 윈도우 밖 보정). 캡슐 개체도 `obtained_by`가 `'drop'`이라 이 합성에 걸린다.
 * 그래서 합성 전에 캡슐로 발급한 개체를 발급 기록(`item_issue_log.route = 'capsule'`)으로 가려 뺀다.
 *
 * 조회가 실패하면 빈 집합을 돌려주고 서버 로그만 남긴다 — 합성은 이전처럼 계속 그려지고(캡슐 개체가 카드로 보일 수 있다), 프로필이 깨지지 않는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { CAPSULE_ISSUE_ROUTE } from '@/lib/capsule/open'

type ServiceClient = ReturnType<typeof createServiceClient>

/** 주어진 개체 가운데 캡슐로 발급한 개체의 id 집합. 개체가 없으면 조회하지 않는다. */
export async function fetchCapsuleIssuedItemIds(service: ServiceClient, itemIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(itemIds.filter((id) => id.length > 0))]
  if (ids.length === 0) return new Set()

  const { data, error } = await service
    .from('item_issue_log')
    .select('inventory_item_id')
    .in('inventory_item_id', ids)
    .eq('route', CAPSULE_ISSUE_ROUTE)
  if (error) {
    console.error('[activity-feed/capsuleItems] item_issue_log(캡슐 발급) 조회 실패', error)
    return new Set()
  }

  const capsuleIds = new Set<string>()
  for (const row of data ?? []) {
    if (row.inventory_item_id) capsuleIds.add(row.inventory_item_id)
  }
  return capsuleIds
}
