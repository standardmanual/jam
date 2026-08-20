import type { PoiMarker } from '@/components/map/MapView'

/**
 * `/api/drops` 응답의 개별 POI 항목.
 * DropsClient(지도 화면)와 PoiCarouselModal(POI 캐러셀 모달)이 공유한다.
 */
export interface NearbyPoi extends PoiMarker {
  distance_meters: number
  available_drops_count: number
  in_drop_range: boolean
  poi_tier: number
}
