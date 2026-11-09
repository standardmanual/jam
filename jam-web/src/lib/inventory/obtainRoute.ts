/**
 * 아이템 배지 개체를 받은 경로 — 잠긴 아이템 배지 상세의 «획득 경로» 줄이 쓴다 (2026-11-09 사용자 지시)
 *
 * 개체가 어디서 왔는지는 두 곳에 남는다.
 *  - `inventory_items.obtained_by`: `drop`(활동 동기화로 받은 것·캡슐에서 나온 것 모두), `ambient_drop`(지점에 놓인 시스템 드랍),
 *    `pickup`, `drop_event`, `system_event`(기본값), 시험용 `seed*`.
 *  - `item_issue_log.route`: 발급 기록. `sync`(활동 동기화), `capsule`(캡슐 열기 보상).
 * 캡슐에서 나온 개체도 `obtained_by`는 `drop`이라(`activity-feed/capsuleItems.ts` 참고) `obtained_by`만으로는 활동 드랍과 가를 수 없다.
 * 그래서 발급 기록의 경로를 먼저 보고, 없으면 `obtained_by`로 판단한다.
 *
 * 값 → 경로 키는 아는 값만 옮긴다. 모르는 값은 `system`(«시스템 지급»)이다. **미션 보상으로 받은 개체는 지금 발급 기록에도 `obtained_by`에도
 * 따로 구분되는 값이 없어** «미션 보상»으로 가르지 못한다. 구분하는 값이 생기면 여기에 한 줄을 더한다.
 */
export type ObtainRouteKey = 'capsule' | 'activity' | 'checkinPickup' | 'event' | 'system'

/** 발급 기록(`item_issue_log.route`)의 캡슐 값 — `lib/capsule/open.ts`의 `CAPSULE_ISSUE_ROUTE`와 같다 */
const ISSUE_ROUTE_CAPSULE = 'capsule'
/** 발급 기록의 활동 동기화 값 — `lib/drop-engine/syncIssueRun.ts`의 `SYNC_ISSUE_ROUTE`와 같다 */
const ISSUE_ROUTE_SYNC = 'sync'

export function resolveObtainRoute(obtainedBy: string, issueRoute: string | null | undefined): ObtainRouteKey {
  if (issueRoute === ISSUE_ROUTE_CAPSULE) return 'capsule'
  if (issueRoute === ISSUE_ROUTE_SYNC) return 'activity'
  if (obtainedBy === 'drop') return 'activity'
  if (obtainedBy === 'pickup' || obtainedBy === 'ambient_drop') return 'checkinPickup'
  if (obtainedBy === 'drop_event') return 'event'
  return 'system'
}
