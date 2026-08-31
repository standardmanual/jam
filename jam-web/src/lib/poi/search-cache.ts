// 네이버 지역검색 재호출 방지 캐시 — 같은 위치·카테고리는 TTL 내에 재검색하지 않음
// (실제 POI 데이터는 poi 테이블에 영구 저장되어 계속 재사용됨. 이 모듈은 "이 지역을
// 언제 마지막으로 검색했는지"만 추적해 네이버 API 하루 호출 한도를 아끼는 용도)
import { createServiceClient } from '@/lib/supabase/server'
import { SEARCH_CACHE_TTL_SECONDS, EMPTY_RESULT_CACHE_TTL_SECONDS } from './categories'

type ServiceClient = ReturnType<typeof createServiceClient>

// 약 100m 격자로 반올림 — 같은 동네 재검색을 하나의 캐시 키로 취급
export function computeGridKey(lat: number, lng: number): string {
  const round = (n: number) => (Math.round(n * 1000) / 1000).toFixed(3)
  return `${round(lat)}_${round(lng)}`
}

// 캐시에 없거나 TTL이 지났으면 true(=검색 필요)
// 직전 검색이 결과 0건이었으면(had_results=false) 훨씬 짧은 TTL로 재시도 —
// API 이슈·버그로 인한 0건이 길게 캐시되는 것을 방지
export async function shouldSearch(
  service: ServiceClient,
  gridKey: string,
  category: string
): Promise<boolean> {
  const { data } = await service
    .from('poi_search_cache')
    .select('searched_at, had_results')
    .eq('grid_key', gridKey)
    .eq('category', category)
    .maybeSingle()

  if (!data) return true
  // @ts-expect-error 명시적 Promise<boolean> 반환 타입 조합에서 supabase-js 추론이 무너지는 TS 특이 케이스 — data는 PoiSearchCacheRow의 컬럼을 가짐
  const searchedAt = new Date(data.searched_at).getTime()
  // @ts-expect-error 위와 동일
  const ttl = data.had_results ? SEARCH_CACHE_TTL_SECONDS : EMPTY_RESULT_CACHE_TTL_SECONDS
  return Date.now() - searchedAt > ttl * 1000
}

/**
 * 검색 시각 기록(캐시 갱신).
 *
 * 실패해도 예외를 던지지 않는다 — 호출부(`api/drops`)가 `Promise.all`로 await하므로
 * throw하면 드랍 지도 조회 전체가 깨진다. 캐시 실패의 실제 피해는 다음 요청에서
 * 네이버 API를 한 번 더 호출하는 것뿐이라 흡수가 맞다 (티켓 20260831_1149).
 */
export async function markSearched(
  service: ServiceClient,
  gridKey: string,
  category: string,
  hadResults: boolean
): Promise<void> {
  const table = service.from('poi_search_cache')
  const payload = { grid_key: gridKey, category, searched_at: new Date().toISOString(), had_results: hadResults }
  // @ts-expect-error Supabase upsert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 PoiSearchCacheRow와 일치
  const { error } = await table.upsert(payload)
  if (error) {
    console.error(`[poi-search-cache] 검색 캐시 기록 실패 — grid: ${gridKey}, category: ${category}:`, error)
  }
}
