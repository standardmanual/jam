// 네이버 지역검색(Local Search) 오픈API로 T2 POI 조회 (관공서/교통/병원/약국/관광명소/자연/편의점/카페 등)
// 참조: https://developers.naver.com/docs/serviceapi/search/local/local.md
import { haversineDistance } from './matcher'
import type { PoiCategory } from '@/types/database'
import type { PoiCategoryConfig } from './categories'

export interface NaverPlace {
  naverId: string
  name: string
  latitude: number
  longitude: number
  category: PoiCategory
  address: string
}

// 어드민 자유 검색용 (카테고리는 네이버가 내려주는 원문 그대로)
export interface NaverSearchResult {
  naverId: string
  name: string
  latitude: number
  longitude: number
  category: string
  address: string
}

const LOCAL_SEARCH_URL = 'https://openapi.naver.com/v1/search/local.json'
const FETCH_TIMEOUT_MS = 8_000

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
}

// link 필드에서 네이버 플레이스 ID 추출 시도 (예: m.place.naver.com/place/12345678)
// 실제로는 체인점 결과 대부분이 브랜드 홈페이지 링크라 거의 매칭되지 않음(실API 확인) —
// 그 경우 이름+좌표 기반 합성 ID로 대체해 DB naver_id UNIQUE 제약을 통한 dedup이 항상 동작하도록 함
function resolveNaverId(link: string, name: string, latitude: number, longitude: number): string {
  const match = link.match(/place\/(\d+)/)
  if (match) return match[1]
  return `syn:${name}_${latitude.toFixed(5)}_${longitude.toFixed(5)}`
}

interface NaverLocalSearchItem {
  title: string
  link: string
  category: string
  address: string
  roadAddress: string
  mapx: string
  mapy: string
}

async function fetchNaverLocalSearch(query: string): Promise<NaverLocalSearchItem[]> {
  const clientId = process.env.NAVER_LOCAL_SEARCH_CLIENT_ID
  const clientSecret = process.env.NAVER_LOCAL_SEARCH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_LOCAL_SEARCH_CLIENT_ID/SECRET 미설정')
  }

  const url = `${LOCAL_SEARCH_URL}?query=${encodeURIComponent(query)}&display=5&sort=random`
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (!res.ok) throw new Error(`네이버 지역검색 API 오류: ${res.status}`)

  const json = await res.json()
  return (json.items ?? []) as NaverLocalSearchItem[]
}

// mapx/mapy는 좌표값에 10,000,000을 곱한 정수로 내려온다 — 나눠서 위경도로 변환
function parseNaverCoord(mapx: string, mapy: string): { latitude: number; longitude: number } {
  return {
    longitude: parseInt(mapx, 10) / 10_000_000,
    latitude: parseInt(mapy, 10) / 10_000_000,
  }
}

// 지정된 카테고리(들)의 키워드로 네이버 지역검색을 수행해 반경 내 결과만 반환
export async function fetchNearbyNaverPoisForCategories(
  lat: number,
  lng: number,
  radiusM: number,
  categories: PoiCategoryConfig[]
): Promise<NaverPlace[]> {
  const keywordQueries = categories.flatMap(({ category, keywords }) =>
    keywords.map((keyword) => ({ keyword, category }))
  )

  const results: NaverPlace[] = []
  const seen = new Set<string>()

  const searches = await Promise.allSettled(
    keywordQueries.map(({ keyword }) => fetchNaverLocalSearch(keyword))
  )

  searches.forEach((result, i) => {
    if (result.status !== 'fulfilled') return
    const { category } = keywordQueries[i]

    for (const item of result.value) {
      if (!item.mapx || !item.mapy) continue
      const { latitude, longitude } = parseNaverCoord(item.mapx, item.mapy)
      if (haversineDistance(lat, lng, latitude, longitude) > radiusM) continue

      const name = stripHtml(item.title)
      const naverId = resolveNaverId(item.link, name, latitude, longitude)
      if (seen.has(naverId)) continue
      seen.add(naverId)

      results.push({
        naverId,
        name,
        latitude,
        longitude,
        category,
        address: item.roadAddress || item.address,
      })
    }
  })

  return results
}

// 어드민 POI 등록 화면의 자유 검색 (특정 브랜드 리스트에 국한되지 않음)
export async function searchNaverPlaces(query: string): Promise<NaverSearchResult[]> {
  const items = await fetchNaverLocalSearch(query)

  return items
    .filter((item) => item.mapx && item.mapy)
    .map((item) => {
      const { latitude, longitude } = parseNaverCoord(item.mapx, item.mapy)
      const name = stripHtml(item.title)
      return {
        naverId: resolveNaverId(item.link, name, latitude, longitude),
        name,
        latitude,
        longitude,
        category: item.category,
        address: item.roadAddress || item.address,
      }
    })
}
