import type { createServiceClient } from '@/lib/supabase/server'

/**
 * 컬렉션 비활성화 → 소속 아이템배지 연쇄 소프트삭제 (20260823_004).
 * 물리적 삭제가 아니라 badges.deleted_at만 세팅 — 이미 발급된 유저의 이력
 * (inventory_items/user_activity_badges/user_poi_badge_earns)은 FK 그대로 보존되고,
 * 유저 노출 화면에서만 제외된다(badges/[id]/route.ts DELETE 핸들러와 동일한 소프트삭제 원칙).
 * `deleted_at IS NULL` 조건 덕에 이 함수는 멱등이다 — 이미 비활성 상태인 컬렉션에 다시
 * 호출해도 안전하게 재실행된다.
 *
 * PUT(전체 저장)과 PATCH(즉시 토글) 양쪽에서 공유한다(20260823_006) — 로직 중복 방지.
 */
export async function cascadeDeactivateItemBookBadges(
  supabase: ReturnType<typeof createServiceClient>,
  itemBookId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('badges')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({ deleted_at: new Date().toISOString() })
    .eq('item_book_id', itemBookId)
    .is('deleted_at', null)

  if (error) return { error: error.message }
  return { error: null }
}
