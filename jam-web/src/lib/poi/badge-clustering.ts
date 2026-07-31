/**
 * Phase 17 — 지도 POI 배지 마커 그리드 클러스터링 (순수 함수)
 *
 * 줌 13 이하로 축소하면 개별 배지 마커 대신 숫자 클러스터로 표시한다.
 * 좌표를 그리드 셀 단위로 묶어 `{lat, lng, count}`만 반환하므로
 * 개별 POI 좌표가 클라이언트로 노출되지 않고 payload도 최소화된다.
 *
 * 이 파일은 DB/네트워크 의존성이 전혀 없는 순수 함수만 export 한다 (테스트 용이성 목적).
 */

/** 클러스터 전환 기준 줌 레벨. 이 값 이하(<=)면 클러스터, 초과(>)면 개별 마커. */
export const CLUSTER_ZOOM_THRESHOLD = 13

/** 그리드 셀 크기 하한(도). 너무 잘게 쪼개져 클러스터 의미가 없어지는 것을 방지. */
const MIN_CELL_SIZE_DEG = 0.01
/** 그리드 셀 크기 상한(도). 전 세계가 한 셀로 뭉치는 것을 방지. */
const MAX_CELL_SIZE_DEG = 45

export interface ClusterablePoint {
  latitude: number
  longitude: number
}

export interface PoiBadgeCluster {
  lat: number
  lng: number
  count: number
}

/**
 * 줌 레벨에 대응하는 그리드 셀 크기(위경도 도 단위)를 계산한다.
 * 줌이 작을수록(넓게 보일수록) 셀이 커진다 — 지도 타일과 동일하게 2의 거듭제곱으로 스케일.
 *
 * 예) zoom 13 → 약 0.044°(≈4.9km), zoom 10 → 약 0.352°, zoom 6 → 5.625°
 */
export function gridCellSizeForZoom(zoom: number): number {
  const safeZoom = Number.isFinite(zoom) ? zoom : CLUSTER_ZOOM_THRESHOLD
  // 줌 범위를 벗어난 비정상 값이 들어와도 Math.pow가 폭주하지 않도록 클램프
  const clampedZoom = Math.min(22, Math.max(0, safeZoom))
  const raw = 360 / Math.pow(2, clampedZoom)
  return Math.min(MAX_CELL_SIZE_DEG, Math.max(MIN_CELL_SIZE_DEG, raw))
}

/**
 * POI 좌표 목록을 줌 레벨 기준 그리드 셀로 묶어 클러스터 배열을 반환한다.
 *
 * - 각 클러스터의 lat/lng는 셀에 속한 좌표들의 평균(무게중심)이다.
 * - 위경도가 유한한 숫자가 아닌 항목은 무시한다.
 * - 반환 순서는 count 내림차순 → lat 내림차순 → lng 오름차순으로 안정 정렬한다.
 */
export function clusterPoiBadges(
  pois: ClusterablePoint[],
  zoom: number
): PoiBadgeCluster[] {
  const cellSize = gridCellSizeForZoom(zoom)
  const buckets = new Map<string, { latSum: number; lngSum: number; count: number }>()

  for (const poi of pois ?? []) {
    const lat = poi?.latitude
    const lng = poi?.longitude
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

    const latIdx = Math.floor(lat / cellSize)
    const lngIdx = Math.floor(lng / cellSize)
    const key = `${latIdx}:${lngIdx}`

    const bucket = buckets.get(key)
    if (bucket) {
      bucket.latSum += lat
      bucket.lngSum += lng
      bucket.count += 1
    } else {
      buckets.set(key, { latSum: lat, lngSum: lng, count: 1 })
    }
  }

  const clusters: PoiBadgeCluster[] = []
  for (const bucket of buckets.values()) {
    clusters.push({
      lat: roundCoord(bucket.latSum / bucket.count),
      lng: roundCoord(bucket.lngSum / bucket.count),
      count: bucket.count,
    })
  }

  clusters.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    if (b.lat !== a.lat) return b.lat - a.lat
    return a.lng - b.lng
  })

  return clusters
}

/** 소수점 6자리(≈0.1m)까지만 유지 — payload 절감 + 부동소수 오차 정리 */
function roundCoord(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/** 해당 줌에서 클러스터 응답을 내려야 하는지 여부 */
export function shouldCluster(zoom: number): boolean {
  return zoom <= CLUSTER_ZOOM_THRESHOLD
}
