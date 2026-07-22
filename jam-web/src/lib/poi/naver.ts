// 네이버 지역검색(Local Search) 오픈API로 T2 POI (편의점·카페) 조회
// 참조: https://developers.naver.com/docs/serviceapi/search/local/local.md
import { haversineDistance } from './matcher'

export interface NaverPlace {
  naverId: string | null
  name: string
  latitude: number
  longitude: number
  category: 'convenience' | 'cafe'
  address: string
}

// 어드민 자유 검색용 (카테고리는 네이버가 내려주는 원문 그대로)
export interface NaverSearchResult {
  naverId: string | null
  name: string
  latitude: number
  longitude: number
  category: string
  address: string
}

const LOCAL_SEARCH_URL = 'https://openapi.naver.com/v1/search/local.json'
const FETCH_TIMEOUT_MS = 8_000

// T2 대상 브랜드 필터 (overpass.ts에서 이전)
const CONVENIENCE_BRANDS = ['CU', 'GS25', '세븐일레븐', '이마트24', '미니스톱']
const CAFE_BRANDS = ['스타벅스', '이디야', '투썸플레이스', '메가커피', '컴포즈커피', '빽다방', '할리스']

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
}

// link 필드에서 네이버 플레이스 ID 추출 시도 (예: m.place.naver.com/place/12345678)
// 없으면 null — 그 경우 이름+좌표 기반으로 별도 dedup 필요
function extractNaverId(link: string): string | null {
  const match = link.match(/place\/(\d+)/)
  return match ? match[1] : null
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

export async function fetchNearbyNaverPois(
  lat: number,
  lng: number,
  radiusM = 500
): Promise<NaverPlace[]> {
  const brandQueries: Array<{ brand: string; category: NaverPlace['category'] }> = [
    ...CONVENIENCE_BRANDS.map((brand) => ({ brand, category: 'convenience' as const })),
    ...CAFE_BRANDS.map((brand) => ({ brand, category: 'cafe' as const })),
  ]

  const results: NaverPlace[] = []
  const seen = new Set<string>()

  const searches = await Promise.allSettled(
    brandQueries.map(({ brand }) => fetchNaverLocalSearch(brand))
  )

  searches.forEach((result, i) => {
    if (result.status !== 'fulfilled') return
    const { category } = brandQueries[i]

    for (const item of result.value) {
      if (!item.mapx || !item.mapy) continue
      const { latitude, longitude } = parseNaverCoord(item.mapx, item.mapy)
      if (haversineDistance(lat, lng, latitude, longitude) > radiusM) continue

      const naverId = extractNaverId(item.link)
      const dedupKey = naverId ?? `${stripHtml(item.title)}_${latitude.toFixed(5)}_${longitude.toFixed(5)}`
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)

      results.push({
        naverId,
        name: stripHtml(item.title),
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
      return {
        naverId: extractNaverId(item.link),
        name: stripHtml(item.title),
        latitude,
        longitude,
        category: item.category,
        address: item.roadAddress || item.address,
      }
    })
}
