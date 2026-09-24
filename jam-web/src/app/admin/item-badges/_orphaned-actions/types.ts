/**
 * 고아(Orphaned) 아이템배지 관리 액션 공용 타입 — 티켓 20260829_2150
 *
 * 목록(orphaned/OrphanedItemsTable, [badgeId]/SerialListTable, 일괄)·상세([badgeId]/[itemId]/page.tsx,
 * 단건) 양쪽에서 같은 컴포넌트(DestroyOrphanedAction/ReassignOrphanedAction)를 재사용한다 — 단건은
 * 길이 1인 배열로 동일 API를 호출할 뿐 별도 경로를 두지 않는다.
 *
 * 20260924_0950: 두 액션이 서버 일괄 처리 라우트 하나(`ORPHANED_BULK_ENDPOINT`)를 부른다.
 * 실패 사유 문구와 일련번호 라벨은 서버가 만들어 돌려주므로(`lib/admin/orphaned-item-actions.ts`)
 * 화면은 오류 코드 표를 갖지 않는다.
 */

/** 액션 대상 개체 — 처리에는 id만 쓴다. 일련번호는 화면이 이미 갖고 있을 때만 넘긴다(표시용, 선택). */
export interface OrphanedActionItem {
  id: string
  serialLabel?: string
}

/** 폐기·재배정이 같이 쓰는 서버 일괄 처리 라우트 */
export const ORPHANED_BULK_ENDPOINT = '/api/admin/item-badges/orphaned/bulk'
