import type { createServiceClient } from '@/lib/supabase/server'
import { invalidateUnclaimedDrops } from '@/lib/admin/poi-drops'

/**
 * 컬렉션 비활성화 → 소속 아이템배지 연쇄 소프트삭제 (20260823_004).
 * 물리적 삭제가 아니라 badges.deleted_at만 세팅 — 이미 발급된 유저의 이력
 * (inventory_items/user_activity_badges/user_checkin_badge_earns)은 FK 그대로 보존되고,
 * 유저 노출 화면에서만 제외된다(badges/[id]/route.ts DELETE 핸들러와 동일한 소프트삭제 원칙).
 * `deleted_at IS NULL` 조건 덕에 이 함수는 멱등이다 — 이미 비활성 상태인 컬렉션에 다시
 * 호출해도 안전하게 재실행된다.
 *
 * 소프트 삭제 직후, 이번 호출에서 실제로 새로 삭제된 배지들을 가리키는 미픽업 월드
 * 드랍도 함께 무효화한다(20260827_003) — 크론 안전망(api/cron/poi-cleanup)이 정리하기 전
 * 최대 24시간의 지연 창을 없앤다. `.select('id')`로 받은 목록은 `deleted_at IS NULL`
 * 조건을 통과한(=이번에 처음 삭제된) 배지만 포함하므로, 이미 삭제돼 있던 배지의 드랍은
 * 다시 건드리지 않는다. 무효화 실패는 로그만 남기고 요청 자체는 실패시키지 않는다.
 *
 * PUT(전체 저장)과 PATCH(즉시 토글) 양쪽에서 공유한다(20260823_006) — 로직 중복 방지.
 */
export async function cascadeDeactivateItemBookBadges(
  supabase: ReturnType<typeof createServiceClient>,
  itemBookId: string
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('badges')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({ deleted_at: new Date().toISOString() })
    .eq('item_book_id', itemBookId)
    .is('deleted_at', null)
    .select('id')

  if (error) return { error: error.message }

  const deactivatedBadgeIds = ((data ?? []) as { id: string }[]).map((badge) => badge.id)
  await invalidateUnclaimedDrops(supabase, deactivatedBadgeIds, 'itembook cascade deactivate')

  return { error: null }
}
