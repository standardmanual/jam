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

/**
 * 점(p)과 선분(a-b) 사이의 최단 거리(미터)
 * 위경도를 poi 위치 기준 등장방형(equirectangular) 평면에 투영해 계산 —
 * 반경 수십~수백 미터 스케일에서는 오차가 무시할 수준
 */
function pointToSegmentDistanceMeters(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const cosLat0 = Math.cos(toRad(pLat))
  const toXY = (lat: number, lng: number): [number, number] => [
    toRad(lng) * cosLat0 * EARTH_RADIUS_M,
    toRad(lat) * EARTH_RADIUS_M,
  ]

  const [px, py] = toXY(pLat, pLng)
  const [ax, ay] = toXY(aLat, aLng)
  const [bx, by] = toXY(bLat, bLng)

  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - ax, py - ay)
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

// =========================================
// 경로 ↔ POI 교차 검증
// =========================================

/**
 * 활동 경로가 POI 반경 내를 통과하는지 확인
 * route의 점 자체가 반경 내에 있거나, 인접한 두 점을 잇는 선분이 반경을
 * 스쳐 지나가면 true 반환 (다운샘플링 등으로 포인트 간격이 벌어져 실제
 * 이동 경로는 반경을 통과했는데 기록된 점만으로는 놓치는 경우 보완)
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

  for (let i = 0; i < route.length - 1; i++) {
    const [aLat, aLng] = route[i]
    const [bLat, bLng] = route[i + 1]
    if (pointToSegmentDistanceMeters(poiLat, poiLng, aLat, aLng, bLat, bLng) <= radiusMeters) {
      return true
    }
  }

  return false
}

// =========================================
// 활동 경로 ↔ POI 전체 매칭
// =========================================

/**
 * 활동 경로와 매칭되는 POI 목록 반환
 * 경로 바운딩 박스를 DB 쿼리 조건(.gte/.lte)으로 직접 필터링해 가져온 뒤 isRouteNearPoi로 정밀 검증
 *
 * poi 테이블은 2,000행을 넘고 계속 늘어나는데, 예전처럼 `.select('*')`로
 * 전체를 가져오면 Supabase/PostgREST 기본 max-rows(1,000행) 제한에 걸려
 * 뒤쪽에 삽입된 행(예: 대량 등록된 산 POI)이 응답에서 통째로 잘려나갈 수
 * 있었다 — 결과적으로 반경 계산까지 가보지도 못하고 후보에서 누락됨.
 * DB 쿼리에서 바로 bbox로 좁혀 가져오면 결과 행 수가 작아 이 문제가 재발하지 않는다.
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

  // 경로 전체 바운딩 박스 계산
  let routeLatMin = Infinity, routeLatMax = -Infinity
  let routeLngMin = Infinity, routeLngMax = -Infinity
  for (const [lat, lng] of route) {
    if (lat < routeLatMin) routeLatMin = lat
    if (lat > routeLatMax) routeLatMax = lat
    if (lng < routeLngMin) routeLngMin = lng
    if (lng > routeLngMax) routeLngMax = lng
  }
  const BB_MARGIN = 0.001 // ~111m 버퍼

  const { data: poisRaw, error } = await supabase
    .from('poi')
    .select('*')
    .gte('latitude', routeLatMin - BB_MARGIN)
    .lte('latitude', routeLatMax + BB_MARGIN)
    .gte('longitude', routeLngMin - BB_MARGIN)
    .lte('longitude', routeLngMax + BB_MARGIN)

  if (error) {
    console.error('[matchPoisForActivity] POI 목록 조회 오류:', error)
    return []
  }

  const candidatePois = (poisRaw ?? []) as PoiRow[]

  return candidatePois.filter((poi) =>
    isRouteNearPoi(route, poi.latitude, poi.longitude, poi.radius_meters)
  )
}
