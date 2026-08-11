/**
 * POI 카테고리별 배지 매칭 반경 정책
 *
 * 배경(2026-08-11, 20260811_006 티켓): 지하철역 POI 44개가 드랍/픽업 지도 표시용
 * 기본 반경(500m)을 배지 매칭용으로 좁히지 않고 그대로 써서, "그 출구를 지나감"이
 * 아니라 "그 좌표 반경 500m 안 어디서든 활동하면" 배지가 발급되던 버그가 있었음.
 * 2026-07-31에 당시 존재하던 행만 데이터로 되돌렸으나 코드는 고치지 않아, 이후에도
 * 자동수집 파이프라인이 계속 500m로 신규 POI를 만들며 재발 대기 상태였음.
 *
 * "실제로 그 지점을 지나감"을 판정해야 하는 카테고리(배지 발급 근거)는 여기서
 * 정확한 반경을 강제한다 — 호출부가 다른 값을 넘겨도 이 정책이 최종값을 덮어쓴다.
 * 지도 탐색·드랍 표시 전용 카테고리는 기존처럼 넓은 기본값(500m)을 유지한다.
 */
export const EXACT_MATCH_RADIUS_BY_CATEGORY: Record<string, number> = {
  transit: 50,
  mountain: 150,
}

export const DEFAULT_POI_RADIUS_METERS = 500

/** 카테고리에 정확 매칭 정책이 있으면 그 값을, 없으면 요청값(또는 기본값)을 그대로 반환 */
export function resolvePoiRadiusMeters(category: string, requestedRadiusMeters?: number): number {
  return EXACT_MATCH_RADIUS_BY_CATEGORY[category] ?? requestedRadiusMeters ?? DEFAULT_POI_RADIUS_METERS
}
