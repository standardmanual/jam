/**
 * 배지 유효기간(`badges.valid_from`/`valid_until`) 판정 — 배지 활성/비활성 조건 (스펙 §3.18).
 *
 * 배지 엔진(`index.ts`·`usageBadges.ts`)과 지도 마커(`api/checkin-badges/route.ts`)는 쿼리
 * `.or()` 필터로 같은 조건을 건다. POI 매칭 발급 경로(`sync.ts`)와 어드민 시뮬레이터는 배지를
 * 먼저 읽은 뒤 코드에서 거르므로, 같은 조건을 이 함수 한 곳에 둔다.
 *
 * - `NULL`(또는 값 없음)은 그 방향으로 제한이 없다.
 * - 경계 시각은 기간 안이다(`valid_from <= now`, `valid_until >= now`) — 배지 엔진과 같다.
 * - 문자열이 아니라 시각 값으로 비교한다. DB 값(`+00:00`)과 `toISOString()`(`Z`)은 표기가 다르다.
 */
export function isWithinValidPeriod(
  badge: { valid_from: string | null; valid_until: string | null },
  now: Date
): boolean {
  const nowMs = now.getTime()
  if (badge.valid_from && Date.parse(badge.valid_from) > nowMs) return false
  if (badge.valid_until && Date.parse(badge.valid_until) < nowMs) return false
  return true
}
