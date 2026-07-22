// 네이버 지역검색 재호출 방지 캐시 — 같은 위치·카테고리는 TTL 내에 재검색하지 않음
// (실제 POI 데이터는 poi 테이블에 영구 저장되어 계속 재사용됨. 이 모듈은 "이 지역을
// 언제 마지막으로 검색했는지"만 추적해 네이버 API 하루 호출 한도를 아끼는 용도)
import { createServiceClient } from '@/lib/supabase/server'
import { SEARCH_CACHE_TTL_SECONDS } from './categories'

type ServiceClient = ReturnType<typeof createServiceClient>

// 약 100m 격자로 반올림 — 같은 동네 재검색을 하나의 캐시 키로 취급
export function computeGridKey(lat: number, lng: number): string {
  const round = (n: number) => (Math.round(n * 1000) / 1000).toFixed(3)
  return `${round(lat)}_${round(lng)}`
}

// 캐시에 없거나 TTL이 지났으면 true(=검색 필요)
export async function shouldSearch(
  service: ServiceClient,
  gridKey: string,
  category: string
): Promise<boolean> {
  const { data } = await (service as any)
    .from('poi_search_cache')
    .select('searched_at')
    .eq('grid_key', gridKey)
    .eq('category', category)
    .maybeSingle()

  if (!data) return true
  const searchedAt = new Date(data.searched_at).getTime()
  return Date.now() - searchedAt > SEARCH_CACHE_TTL_SECONDS * 1000
}

export async function markSearched(
  service: ServiceClient,
  gridKey: string,
  category: string
): Promise<void> {
  await (service as any)
    .from('poi_search_cache')
    .upsert({ grid_key: gridKey, category, searched_at: new Date().toISOString() })
}
