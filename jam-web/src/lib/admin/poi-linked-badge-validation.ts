import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 장소(poi)에 연결하는 배지는 체크인 배지(`badges.type = 'checkin'`)여야 한다
 * (티켓 20261018_1813). 장소 폼의 배지 검색이 체크인 배지만 보여 주지만, 화면 제한만으로는
 * 직접 보낸 요청을 막지 못하므로 저장 API(POST·PUT `/api/admin/poi`)가 같은 규칙을 서버에서 강제한다.
 *
 * - 연결 배지가 없으면(`null`·`undefined`·빈 문자열) 검사하지 않는다.
 * - `poiId`를 주면 수정 요청으로 보고, 이 장소가 지금 이미 그 배지에 연결돼 있을 때는 건너뛴다.
 *   예전 데이터에 체크인이 아닌 배지가 연결된 장소가 있어도 다른 항목을 고치는 저장이 막히지 않게 하려는 것이다.
 */
export async function validatePoiLinkedBadge(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 어드민 라우트 공용 검증: 생성 타입에 묶지 않는다(poi-category-validation.ts와 같은 사유)
  supabase: SupabaseClient<any, any, any>,
  linkedBadgeId: unknown,
  options: { poiId?: string } = {}
): Promise<{ valid: true } | { valid: false; status: number; error: string }> {
  if (linkedBadgeId === null || linkedBadgeId === undefined || linkedBadgeId === '') return { valid: true }
  if (typeof linkedBadgeId !== 'string') {
    return { valid: false, status: 400, error: '연결 배지 값이 올바르지 않아요. 배지를 다시 골라 주세요.' }
  }

  if (options.poiId) {
    const { data: current, error: currentError } = await supabase
      .from('poi')
      .select('linked_badge_id')
      .eq('id', options.poiId)
      .maybeSingle()
    if (currentError) return { valid: false, status: 500, error: currentError.message }
    if (current?.linked_badge_id === linkedBadgeId) return { valid: true }
  }

  const { data, error } = await supabase
    .from('badges')
    .select('id, type')
    .eq('id', linkedBadgeId)
    .is('deleted_at', null) // 삭제된 배지는 배지 검색에도 나오지 않는다 — 없는 배지로 본다
    .maybeSingle()
  if (error) return { valid: false, status: 500, error: error.message }
  if (!data) return { valid: false, status: 400, error: '연결할 배지를 찾을 수 없어요. 배지를 다시 골라 주세요.' }
  if (data.type !== 'checkin') {
    return { valid: false, status: 400, error: '장소에는 체크인 배지만 연결할 수 있어요. 체크인 배지를 골라 주세요.' }
  }
  return { valid: true }
}
