import type { createServiceClient } from '@/lib/supabase/server'

/**
 * 배지가 소프트 삭제(비활성화)될 때, 그 배지를 가리키는 아직 안 주워진 월드 드랍을 함께
 * 무효화한다(20260826_016, 20260827_004). 이미 픽업된 드랍(picked_up_at IS NOT NULL)은
 * 이력 보존을 위해 건드리지 않는다. 실패해도 배지 소프트 삭제 자체는 이미 끝난 뒤이므로
 * 요청을 실패시키지 않고 로그만 남긴다 — 크론 안전망(api/cron/poi-cleanup)이 재시도 없이도
 * 다음 소각 주기에 정리한다.
 *
 * 단일 배지 삭제(api/admin/badges/[id]/route.ts)와 컬렉션 연쇄 삭제
 * (lib/admin/itembook-deactivation.ts)가 공유한다 — badgeIds가 빈 배열이면 쿼리를 실행하지
 * 않고 조기 리턴한다(빈 배열로 `.in()` 호출 시 전체 매치되는 사고 방지).
 */
export async function invalidateUnclaimedDrops(
  supabase: ReturnType<typeof createServiceClient>,
  badgeIds: string[],
  caller: string
) {
  if (badgeIds.length === 0) return

  const { error } = await supabase
    .from('poi_drops')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({ is_available: false })
    .in('badge_id', badgeIds)
    .is('picked_up_at', null)
    .eq('is_available', true)

  if (error) {
    console.error(`[${caller}] 미픽업 드랍 무효화 오류:`, error.message)
  }
}
