/**
 * 체크인 배지 «보유» 조건의 값 계산 — 순수 함수 (티켓 20261019_1445 2회, 원래 계산은 티켓 20260914_1725)
 *
 * 조건 두 가지의 현재값을 «유저가 받은 체크인 배지 id 집합»에서 계산한다.
 *  - `checkin_category_count`: 지정한 장소 종류(effective category)에 든 체크인 배지의 서로 다른 개수
 *  - `checkin_badge_count`: 어드민이 지정한 체크인 배지 이름 목록 가운데 받은 이름의 개수
 *
 * 이 계산은 두 곳이 함께 쓴다 — 같은 값을 두 번 구현하면 한쪽만 고쳐져 어긋난다.
 *  ① 배지 발급: `usageBadges.ts`의 `evaluateCheckinUsageBadges`가 «지금까지 받은 모든 체크인 배지»로 계산한다.
 *  ② 미션 판정: `jamActionCheckinMetrics.ts`가 «처음 받은 시각이 미션 기간 안인 체크인 배지»로 좁혀 계산한다.
 * 두 곳은 **어떤 배지 id 집합을 넣느냐**만 다르고 계산은 같다.
 *
 * DB를 읽지 않는다. 읽기(그리고 읽기 오류를 어떻게 다룰지)는 호출자 몫이다 — ①은 오류를 로그로 남기고 0으로 폴백해
 * 원본 액션을 지키고, ②는 오류를 던져 그 미션만 건너뛴다.
 *
 * `usageBadges.ts`의 인라인 계산을 그대로 옮겼다. 동작을 바꾸지 않았다는 증거는 `usage-badges.test.ts` 6번 블록의
 * 특성 시험이다(분리 전에 먼저 쓰고 분리 뒤에도 고치지 않았다).
 */

/** `checkin_category_count` 값 형태 가드 — jsonb라 형태 보장이 없다(카탈로그 오류 방어) */
export function isCheckinCategoryCountValue(v: unknown): v is { category: string; count: number } {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as { category?: unknown }).category === 'string' &&
    typeof (v as { count?: unknown }).count === 'number'
  )
}

/** `checkin_badge_count` 값 형태 가드 — jsonb라 형태 보장이 없다(카탈로그 오류 방어) */
export function isCheckinBadgeCountValue(v: unknown): v is { checkin_badge_names: string[]; count: number } {
  return (
    !!v &&
    typeof v === 'object' &&
    Array.isArray((v as { checkin_badge_names?: unknown }).checkin_badge_names) &&
    typeof (v as { count?: unknown }).count === 'number'
  )
}

/** 받은 체크인 배지의 `badges` 행 — 어드민이 직접 정한 카테고리만 읽는다 */
export interface CheckinBadgeCategoryRow {
  id: string
  category: string | null
}

/** 받은 체크인 배지에 연결된 지점(`poi`)의 카테고리 */
export interface LinkedPoiCategoryRow {
  linked_badge_id: string
  category: string
}

/** 이름으로 찾은 `type='checkin'` 배지 행 */
export interface CheckinBadgeNameRow {
  id: string
  name: string
}

/**
 * effective category별 체크인 배지 개수.
 *
 * effective category는 `badges.category`가 우선이고, 없으면 연결된 지점(`poi.category`)의 카테고리다
 * (`admin/badges/page.tsx`의 정의와 같다). 연결 지점이 여럿이면 **먼저 읽은 줄**의 카테고리를 쓴다.
 * 둘 다 없는 배지는 어느 카테고리에도 세지 않는다.
 *
 * `badgeRows`는 «받은 배지 id로 조회한 `badges` 행»이다 — 방문 기록에는 있어도 `badges`에 행이 없는 배지는 여기 없으므로
 * 세지 않는다. `badges.id`는 유일하므로 행 하나가 배지 하나이고, 같은 배지를 몇 번 받았는지는 이 계산에 영향이 없다.
 */
export function countBadgesByCategory(
  badgeRows: readonly CheckinBadgeCategoryRow[],
  poiRows: readonly LinkedPoiCategoryRow[]
): Map<string, number> {
  const poiCategoryByBadge = new Map<string, string>()
  for (const row of poiRows) {
    if (!poiCategoryByBadge.has(row.linked_badge_id)) poiCategoryByBadge.set(row.linked_badge_id, row.category)
  }

  const categoryCounts = new Map<string, number>()
  for (const row of badgeRows) {
    const effectiveCategory = row.category ?? poiCategoryByBadge.get(row.id) ?? null
    if (!effectiveCategory) continue
    categoryCounts.set(effectiveCategory, (categoryCounts.get(effectiveCategory) ?? 0) + 1)
  }
  return categoryCounts
}

/**
 * 지정한 이름들 가운데 유저가 받은 이름의 집합.
 *
 * 이름은 유일 식별자가 아니라서(§2.8) 호출자는 `type='checkin'` 배지로 한정해 찾은 행(`namedBadgeRows`)을 넘긴다.
 * 같은 이름의 배지가 둘 이상이면 그중 하나라도 받았으면 그 이름은 받은 것이다. 카탈로그에 없는 이름(오탈자)은
 * 행이 없으므로 조용히 빠진다 — 나머지 이름만으로 판정한다.
 */
export function ownedCheckinBadgeNames(
  allNames: readonly string[],
  namedBadgeRows: readonly CheckinBadgeNameRow[],
  earnedBadgeIds: ReadonlySet<string>
): Set<string> {
  const idsByName = new Map<string, string[]>()
  for (const row of namedBadgeRows) {
    if (!idsByName.has(row.name)) idsByName.set(row.name, [])
    idsByName.get(row.name)!.push(row.id)
  }

  const ownedNames = new Set<string>()
  for (const name of allNames) {
    const ids = idsByName.get(name) ?? [] // 카탈로그에 없는 이름 — 무시하고 나머지로 판정
    if (ids.some((id) => earnedBadgeIds.has(id))) ownedNames.add(name)
  }
  return ownedNames
}

/**
 * 조건 목록(`checkin_badge_names`) 가운데 받은 이름의 개수. 목록에 같은 이름이 두 번 있으면 두 번 센다
 * (원래 계산이 목록을 그대로 거르던 동작을 유지한다).
 */
export function countListedNamesOwned(names: readonly string[], ownedNames: ReadonlySet<string>): number {
  return names.filter((n) => ownedNames.has(n)).length
}
