/**
 * 고아(Orphaned) 아이템배지 관리 액션 공용 타입 — 티켓 20260829_2150
 *
 * 목록([badgeId]/page.tsx, 일괄)·상세([badgeId]/[itemId]/page.tsx, 단건) 양쪽에서
 * 같은 컴포넌트(DestroyOrphanedAction/ReassignOrphanedAction)를 재사용한다 — 단건은
 * 길이 1인 배열로 동일 API를 호출할 뿐 별도 경로를 두지 않는다.
 */

/** 액션 대상 개체 — 결과 표시에 일련번호가 필요해 id만으로는 부족하다 */
export interface OrphanedActionItem {
  id: string
  serialLabel: string
}

export interface OrphanedActionResult {
  itemId: string
  ok: boolean
  error?: string
}

/** /api/admin/item-badges/orphaned/destroy가 돌려주는 error 코드 → 화면 문구 */
export const DESTROY_ERROR_LABEL: Record<string, string> = {
  item_not_found: '개체를 찾을 수 없습니다',
  already_destroyed: '이미 폐기된 개체입니다',
  not_orphaned: '소유자 없음 상태가 아닙니다 (다른 작업으로 상태가 이미 바뀌었을 수 있습니다)',
  destroy_failed: '폐기 처리에 실패했습니다',
}

/** /api/admin/item-badges/orphaned/reassign가 돌려주는 error 코드 → 화면 문구 */
export const REASSIGN_ERROR_LABEL: Record<string, string> = {
  item_not_found: '개체를 찾을 수 없습니다',
  not_orphaned: '소유자 없음 상태가 아닙니다 (다른 작업으로 상태가 이미 바뀌었을 수 있습니다)',
  inventory_not_found: '대상 유저의 인벤토리를 찾을 수 없습니다',
  inventory_full: '대상 유저의 인벤토리가 꽉 찼습니다',
  reassign_failed: '재배정 처리에 실패했습니다',
}
