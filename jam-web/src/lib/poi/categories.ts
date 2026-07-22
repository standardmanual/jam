// 드랍/픽업 지도에 노출할 POI 카테고리 — 전부 네이버 지역검색으로 자동 수집(어드민 수동 등록 없음)
// level 1: 항상 검색 / level 2: level 1 결과가 지역 내 부족할 때만 보조로 검색 (API 호출 한도 절약)
import type { PoiCategory } from '@/types/database'

export interface PoiCategoryConfig {
  category: PoiCategory
  keywords: string[]
  level: 1 | 2
}

export const POI_CATEGORIES: PoiCategoryConfig[] = [
  { category: 'government', keywords: ['주민센터', '구청', '시청'], level: 1 },
  { category: 'transit', keywords: ['지하철역', '버스정류장'], level: 1 },
  { category: 'hospital', keywords: ['병원'], level: 1 },
  { category: 'pharmacy', keywords: ['약국'], level: 1 },
  { category: 'tourist_attraction', keywords: ['관광명소'], level: 1 },
  { category: 'nature', keywords: ['국립공원', '계곡', '해수욕장', '폭포'], level: 1 },
  { category: 'convenience', keywords: ['편의점', '마트'], level: 2 },
  { category: 'food', keywords: ['카페', '음식점'], level: 2 },
]

export const LEVEL_1_CATEGORIES = POI_CATEGORIES.filter((c) => c.level === 1)
export const LEVEL_2_CATEGORIES = POI_CATEGORIES.filter((c) => c.level === 2)

// level 1 검색 결과가 이 개수 미만이면 level 2(보조 카테고리)까지 검색
export const LEVEL_2_FALLBACK_THRESHOLD = 3

// 같은 위치·카테고리 조합의 네이버 재검색을 건너뛰는 캐시 유효 시간
export const SEARCH_CACHE_TTL_SECONDS = 60 * 60 // 1시간
