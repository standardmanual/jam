/**
 * 컬렉션 4등급 켜기 전 점검 — 서비스 클라이언트로 읽는 함수 (티켓 20261022_1139 1회, 상위 20261022_1131 묶음 7)
 *
 * 판정은 `lib/itembook/tier-readiness.ts`(순수 함수)가 하고, 이 파일은 그 입력을 DB에서 읽는다.
 * 켜기·끄기 라우트(`api/admin/itembooks/[id]/tier`)가 쓰고, 7-6 적용 전 점검도 같은 함수를 쓴다.
 *
 * 읽는 것
 *   - 컬렉션의 아이템 배지: 소프트 삭제된 것을 뺀다(이름 점검용 — 점검 SQL 1번과 같다).
 *   - 장착(`user_item_book_slots`): 컬렉션 전체. 이 표에는 `deleted_at`이 없고, 꽂힌 배지가 소프트 삭제됐는지도
 *     걸지 않는다 — 삭제된 배지에 꽂힌 장착도 `tier_mismatch` 판정에 들어가기 때문이다(점검 SQL 2번, 222 장착 함수).
 *   - 장착한 배지의 등급: 장착이 가리키는 배지 id를 그대로 읽는다(배지의 소속 컬렉션이나 삭제 여부를 걸지 않는다).
 *   - 등급별 완성 기록(`user_item_book_tier_completions`): 행 수만 센다.
 *
 * 1000행 상한에 잘리지 않도록 `fetchAllRows`(안정 정렬 페이징)와 `fetchAllRowsIn`(`.in()` 청크)을 쓴다.
 * 조회가 하나라도 실패하면 던진다 — 부분 결과로 «켜도 된다»고 판정하지 않는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchAllRowsIn } from '@/lib/db/fetchAllRows'
import { evaluateTierReadiness, type TierReadiness } from '@/lib/itembook/tier-readiness'

type ServiceClient = ReturnType<typeof createServiceClient>

interface BadgeNameRow {
  id: string
  name: string
  rarity: string | null
}

interface SlotRow {
  id: string
  user_id: string
  badge_id: string
}

interface BadgeRarityRow {
  id: string
  rarity: string | null
}

/** 이 컬렉션의 등급별 완성 기록 행 수. 끄기 가능 여부 판정에 단독으로도 쓴다. */
export async function loadTierCompletionCount(supabase: ServiceClient, itemBookId: string): Promise<number> {
  const { count, error } = await supabase
    .from('user_item_book_tier_completions')
    .select('item_book_id', { count: 'exact', head: true })
    .eq('item_book_id', itemBookId)
  if (error) throw new Error(`[itembookTier] 등급별 완성 기록 조회 실패: ${error.message}`)
  return count ?? 0
}

/** 켜기 전 점검 세 가지를 읽어 판정까지 낸 결과를 돌려준다. */
export async function loadTierReadiness(supabase: ServiceClient, itemBookId: string): Promise<TierReadiness> {
  const [badges, slots, tierCompletionCount] = await Promise.all([
    fetchAllRows<BadgeNameRow>('itembookTier:badges', 'id', () =>
      supabase
        .from('badges')
        .select('id, name, rarity')
        .eq('item_book_id', itemBookId)
        .eq('type', 'item')
        .is('deleted_at', null)
    ),
    // user_item_book_slots에는 deleted_at이 없다. 꽂힌 배지가 소프트 삭제됐어도 장착 행은 남아 그대로 센다.
    fetchAllRows<SlotRow>('itembookTier:slots', 'id', () =>
      supabase.from('user_item_book_slots').select('id, user_id, badge_id').eq('item_book_id', itemBookId)
    ),
    loadTierCompletionCount(supabase, itemBookId),
  ])

  // 장착이 가리키는 배지의 등급 — 소프트 삭제된 배지도 읽어야 하므로 deleted_at을 걸지 않는다.
  const rarityRows = await fetchAllRowsIn<BadgeRarityRow, string>(
    'itembookTier:slot-badges',
    'id',
    slots.map((slot) => slot.badge_id),
    (chunk) => supabase.from('badges').select('id, rarity').in('id', chunk)
  )
  const rarityByBadgeId = new Map(rarityRows.map((row) => [row.id, row.rarity]))

  return evaluateTierReadiness({
    badges: badges.map((badge) => ({ name: badge.name, rarity: badge.rarity })),
    slots: slots.map((slot) => ({ userId: slot.user_id, rarity: rarityByBadgeId.get(slot.badge_id) ?? null })),
    tierCompletionCount,
  })
}
