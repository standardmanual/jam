/**
 * POI 매칭 엔진
 * - Haversine 공식으로 GPS 경로 ↔ POI 반경 교차 검증
 * - 서버 사이드 전용 (Supabase service client 사용)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PoiRow } from '@/types/database'

const EARTH_RADIUS_M = 6_371_000 // 지구 반지름 (미터)

// =========================================
// Haversine 거리 계산
// =========================================

/**
 * 두 좌표 사이의 거리(미터)를 Haversine 공식으로 계산
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_M * c
}

// =========================================
// 경로 ↔ POI 교차 검증
// =========================================

/**
 * 활동 경로가 POI 반경 내를 통과하는지 확인
 * route의 어느 한 점이라도 POI 반경 내에 있으면 true 반환
 *
 * @param route GPS 경로 좌표 배열 [[lat, lng], ...]
 * @param poiLat POI 위도
 * @param poiLng POI 경도
 * @param radiusMeters POI 반경 (미터)
 */
export function isRouteNearPoi(
  route: Array<[number, number]>,
  poiLat: number,
  poiLng: number,
  radiusMeters: number
): boolean {
  // Haversine 전 바운딩 박스로 사전 필터 (삼각함수 생략 → ~100배 속도 향상)
  const latMargin = radiusMeters / 111111
  const lngMargin = radiusMeters / (111111 * Math.cos((poiLat * Math.PI) / 180))
  const latMin = poiLat - latMargin
  const latMax = poiLat + latMargin
  const lngMin = poiLng - lngMargin
  const lngMax = poiLng + lngMargin

  for (const [lat, lng] of route) {
    if (lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax) {
      if (haversineDistance(lat, lng, poiLat, poiLng) <= radiusMeters) {
        return true
      }
    }
  }
  return false
}

// =========================================
// 활동 경로 ↔ POI 전체 매칭
// =========================================

/**
 * 활동 경로와 매칭되는 POI 목록 반환
 * poi 테이블 전체를 로드한 뒤 isRouteNearPoi로 필터링
 *
 * @param route GPS 경로 좌표 배열 [[lat, lng], ...]
 * @param supabase Supabase service client (RLS 우회)
 * @returns 경로가 반경 내를 통과하는 POI 목록
 */
export async function matchPoisForActivity(
  route: Array<[number, number]>,
  supabase: SupabaseClient
): Promise<PoiRow[]> {
  if (route.length === 0) return []

  const { data: poisRaw, error } = await supabase
    .from('poi')
    .select('*')

  if (error) {
    console.error('[matchPoisForActivity] POI 목록 조회 오류:', error)
    return []
  }

  const pois = (poisRaw ?? []) as PoiRow[]

  // 경로 전체 바운딩 박스 계산 → 범위 밖 POI 즉시 제거
  let routeLatMin = Infinity, routeLatMax = -Infinity
  let routeLngMin = Infinity, routeLngMax = -Infinity
  for (const [lat, lng] of route) {
    if (lat < routeLatMin) routeLatMin = lat
    if (lat > routeLatMax) routeLatMax = lat
    if (lng < routeLngMin) routeLngMin = lng
    if (lng > routeLngMax) routeLngMax = lng
  }
  const BB_MARGIN = 0.001 // ~111m 버퍼
  const candidatePois = pois.filter(
    (poi) =>
      poi.latitude >= routeLatMin - BB_MARGIN &&
      poi.latitude <= routeLatMax + BB_MARGIN &&
      poi.longitude >= routeLngMin - BB_MARGIN &&
      poi.longitude <= routeLngMax + BB_MARGIN
  )

  return candidatePois.filter((poi) =>
    isRouteNearPoi(route, poi.latitude, poi.longitude, poi.radius_meters)
  )
}
