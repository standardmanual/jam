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
 * 드랍도 함께 무효화한다(20260827_004) — 크론 안전망(api/cron/poi-cleanup)이 정리하기 전
 * 최대 24시간의 지연 창을 없앤다. `.select('id')`로 받은 목록은 `deleted_at IS NULL`
 * 조건을 통과한(=이번에 처음 삭제된) 배지만 포함하므로, 이미 삭제돼 있던 배지의 드랍은
 * 다시 건드리지 않는다. 무효화 실패는 로그만 남기고 요청 자체는 실패시키지 않는다.
 *
 * PUT(전체 저장)과 PATCH(즉시 토글) 양쪽에서 공유한다(20260823_006) — 로직 중복 방지.
 *
 * `deactivated_by_item_book_id`에 이 컬렉션 id를 함께 기록한다(티켓 20260908_2129 2차) —
 * 재활성화 캐스케이드(`cascadeActivateItemBookBadges`)가 "이 컬렉션이 죽인 배지"와 "개별
 * 사유로 이미 죽어 있던 배지"를 구분하는 유일한 판별 기준이다.
 */
export async function cascadeDeactivateItemBookBadges(
  supabase: ReturnType<typeof createServiceClient>,
  itemBookId: string
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('badges')
    .update({ deleted_at: new Date().toISOString(), deactivated_by_item_book_id: itemBookId })
    .eq('item_book_id', itemBookId)
    .is('deleted_at', null)
    .select('id')

  if (error) return { error: error.message }

  const deactivatedBadgeIds = ((data ?? []) as { id: string }[]).map((badge) => badge.id)
  await invalidateUnclaimedDrops(supabase, deactivatedBadgeIds, 'itembook cascade deactivate')

  return { error: null }
}

/**
 * 컬렉션 재활성화 → `cascadeDeactivateItemBookBadges`가 이 컬렉션 때문에 죽인 배지만 되살린다
 * (티켓 20260908_2129 2차). `item_book_id = itemBookId` **AND**
 * `deactivated_by_item_book_id = itemBookId`인 배지만 골라 `deleted_at: null,
 * deactivated_by_item_book_id: null`로 되돌린다.
 *
 * 개별 사유로 비활성화된 배지(`deactivated_by_item_book_id`가 NULL이거나 다른 컬렉션 id)는
 * 절대 건드리지 않는다 — 이게 이 함수의 안전장치 핵심이다. 개별 배지 PATCH(`/api/admin/
 * badges/[id]`)는 조작이 있을 때마다 `deactivated_by_item_book_id`를 NULL로 리셋하므로,
 * "컬렉션이 죽인 배지를 관리자가 개별로 먼저 살렸다가 컬렉션 재활성화 때 또 건드려지는" 이중
 * 처리도 이 조건으로 자연히 막힌다.
 *
 * `item_book_id = itemBookId` 조건 덕에 이 함수도 멱등이다 — 되살릴 대상이 없으면 0건 갱신.
 */
export async function cascadeActivateItemBookBadges(
  supabase: ReturnType<typeof createServiceClient>,
  itemBookId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('badges')
    .update({ deleted_at: null, deactivated_by_item_book_id: null })
    .eq('item_book_id', itemBookId)
    .eq('deactivated_by_item_book_id', itemBookId)

  if (error) return { error: error.message }

  return { error: null }
}
