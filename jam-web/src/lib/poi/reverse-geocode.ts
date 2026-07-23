// NCP Reverse Geocoding — 좌표 → 행정동 이름
// 목적: 네이버 지역검색(Local Search) API는 좌표/반경 파라미터를 지원하지 않고
// query 문자열만으로 매칭한다. "카페" 같은 순수 키워드만 넘기면 전국 아무 데서나
// 무작위 결과가 나와 유저 근처 필터링 시 거의 항상 0건이 된다.
// 좌표를 "구 동" 지역명으로 변환해 키워드 앞에 붙여 실제로 해당 지역 결과가 나오게 한다.
// 참조: https://api.ncloud-docs.com/docs/application-maps-reversegeocoding
// 자격증명은 지도 JS SDK와 동일한 NCP Maps 것을 재사용 (신규 발급 불필요)
//   NEXT_PUBLIC_NAVER_MAP_CLIENT_ID → x-ncp-apigw-api-key-id
//   NCP_MAP_CLIENT_SECRET           → x-ncp-apigw-api-key
// 주의: 구 도메인 naveropenapi.apigw.ntruss.com이 아니라 신규 통합 도메인 maps.apigw.ntruss.com

const REVERSE_GEOCODE_URL = 'https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc'
const FETCH_TIMEOUT_MS = 5_000

interface NcpRegionArea {
  name: string
}

interface NcpReverseGeocodeResult {
  region: {
    area1: NcpRegionArea // 시/도
    area2: NcpRegionArea // 시/군/구
    area3: NcpRegionArea // 읍/면/동
  }
}

interface NcpReverseGeocodeResponse {
  status: { code: number; name: string; message: string }
  results: NcpReverseGeocodeResult[]
}

/** 좌표 → "구 동" 형태 지역명. 자격증명 미설정·API 실패 시 null (호출부는 지역명 없이 폴백). */
export async function reverseGeocodeToRegionName(lat: number, lng: number): Promise<string | null> {
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
  const clientSecret = process.env.NCP_MAP_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  try {
    // legalcode(법정동)·admcode(행정동) 둘 다 요청 — 지역에 따라 한쪽이 비어있을 수 있어 area3가
    // 채워진 첫 결과를 사용
    const url = `${REVERSE_GEOCODE_URL}?coords=${lng},${lat}&output=json&orders=legalcode,admcode`
    const res = await fetch(url, {
      headers: {
        'x-ncp-apigw-api-key-id': clientId,
        'x-ncp-apigw-api-key': clientSecret,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null

    const json = (await res.json()) as NcpReverseGeocodeResponse
    const result = (json.results ?? []).find((r) => r.region.area3?.name) ?? json.results?.[0]
    if (!result) return null

    const { area2, area3 } = result.region
    const parts = [area2?.name, area3?.name].filter(Boolean)
    return parts.length > 0 ? parts.join(' ') : null
  } catch {
    return null
  }
}
