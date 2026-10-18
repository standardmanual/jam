/**
 * 체크인 배지 공개 기간 판정 (티켓 20261018_1814, 운영 로직 11장)
 *
 * 공개 기간(`valid_from`~`valid_until`)은 «새로 받을 수 있는 기간»이다. 기준 시각은 활동이 시작된 시각이다
 * (동기화 시각이 아님) — 기간 안에 달린 활동은 기간이 끝난 뒤 동기화해도 인정된다. 경계 시각은 기간에 포함한다
 * (지도 표시·배지 엔진의 `valid_from.lte` / `valid_until.gte`와 같은 기준). 한쪽이 NULL이면 그쪽은 제한이 없다.
 * 시각을 해석하지 못하면(NaN) 기간 밖으로 본다 — 새로 주지 않는 쪽이 안전하다.
 */
export function isActivityWithinBadgeWindow(
  activityStartDate: string,
  validFrom: string | null,
  validUntil: string | null
): boolean {
  const startedAt = Date.parse(activityStartDate)
  if (Number.isNaN(startedAt)) return false
  if (validFrom !== null) {
    const from = Date.parse(validFrom)
    if (Number.isNaN(from) || startedAt < from) return false
  }
  if (validUntil !== null) {
    const until = Date.parse(validUntil)
    if (Number.isNaN(until) || startedAt > until) return false
  }
  return true
}
