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
 * 값 → 경로 키는 아는 값만 옮긴다. 모르는 값은 `system`(«시스템 지급»)이다. 미션 보상 지급은 발급 기록에도 `obtained_by`에도 구분되는 값을 남기지 않는다(`system_event`).
 * 대신 `mission_item_rewards.inventory_item_id`에 개체가 남으므로, 서버가 그 행이 있는지 읽어 `missionReward`로 넘기면 «미션 보상»으로 가른다.
 */
export type ObtainRouteKey = 'capsule' | 'activity' | 'mission' | 'checkinPickup' | 'event' | 'system'

/** 발급 기록(`item_issue_log.route`)의 캡슐 값 — `lib/capsule/open.ts`의 `CAPSULE_ISSUE_ROUTE`와 같다 */
const ISSUE_ROUTE_CAPSULE = 'capsule'
/** 발급 기록의 활동 동기화 값 — `lib/drop-engine/syncIssueRun.ts`의 `SYNC_ISSUE_ROUTE`와 같다 */
const ISSUE_ROUTE_SYNC = 'sync'

export function resolveObtainRoute(obtainedBy: string, issueRoute: string | null | undefined, missionReward = false): ObtainRouteKey {
  if (issueRoute === ISSUE_ROUTE_CAPSULE) return 'capsule'
  if (issueRoute === ISSUE_ROUTE_SYNC) return 'activity'
  if (missionReward) return 'mission'
  if (obtainedBy === 'drop') return 'activity'
  if (obtainedBy === 'pickup' || obtainedBy === 'ambient_drop') return 'checkinPickup'
  if (obtainedBy === 'drop_event') return 'event'
  return 'system'
}
