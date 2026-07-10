// OpenStreetMap Overpass API로 T2 POI (편의점·카페) 조회

export interface OsmPoi {
  osmId: string
  name: string
  latitude: number
  longitude: number
  category: 'convenience' | 'cafe'
}

// T2 대상 브랜드 필터
const CONVENIENCE_BRANDS = ['CU', 'GS25', '세븐일레븐', '이마트24', 'Ministop', '미니스톱']
const CAFE_BRANDS = ['스타벅스', 'Starbucks', '이디야', '투썸플레이스', '메가커피', '컴포즈커피', '빽다방', '할리스']

function buildOverpassQuery(lat: number, lng: number, radiusM: number): string {
  const brandRegex = (brands: string[]) =>
    `["name"~"${brands.join('|')}",i]`

  return `
[out:json][timeout:10];
(
  node["amenity"="convenience"]${brandRegex(CONVENIENCE_BRANDS)}(around:${radiusM},${lat},${lng});
  node["shop"="convenience"]${brandRegex(CONVENIENCE_BRANDS)}(around:${radiusM},${lat},${lng});
  node["amenity"="cafe"]${brandRegex(CAFE_BRANDS)}(around:${radiusM},${lat},${lng});
);
out body;
`.trim()
}

export async function fetchNearbyOsmPois(
  lat: number,
  lng: number,
  radiusM = 500
): Promise<OsmPoi[]> {
  const query = buildOverpassQuery(lat, lng, radiusM)
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`

  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'JAM-App/1.0' },
  })

  if (!res.ok) throw new Error(`Overpass API 오류: ${res.status}`)

  const json = await res.json()
  const elements: any[] = json.elements ?? []

  const results: OsmPoi[] = []
  const seen = new Set<string>()

  for (const el of elements) {
    if (!el.lat || !el.lon || !el.tags?.name) continue
    const osmId = `${el.type}/${el.id}`
    if (seen.has(osmId)) continue
    seen.add(osmId)

    const amenity = el.tags.amenity ?? el.tags.shop ?? ''
    const category: OsmPoi['category'] = amenity === 'cafe' ? 'cafe' : 'convenience'

    results.push({
      osmId,
      name: el.tags.name,
      latitude: el.lat,
      longitude: el.lon,
      category,
    })
  }

  return results
}
