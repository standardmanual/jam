import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchNearbyOsmPois } from '@/lib/poi/overpass'

// GET /api/drops/debug?lat=&lng=
// 인증 없이 단계별 진단 결과 반환 (개발/운영 디버그용)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat, lng 파라미터 필요' }, { status: 400 })
  }

  const result: Record<string, unknown> = { lat, lng }

  // 1. DB poi 테이블 컬럼 확인 (osm_id 있는지)
  const service = createServiceClient()
  const { data: samplePoi, error: poiError } = await (service as any)
    .from('poi')
    .select('id, name, osm_id, poi_tier')
    .limit(3)

  result.db_poi_sample = samplePoi
  result.db_poi_error = poiError?.message ?? null
  result.db_has_osm_id_column = poiError === null

  // 2. Overpass 쿼리 직접 실행
  let osmPois: Awaited<ReturnType<typeof fetchNearbyOsmPois>> = []
  let osmError: string | null = null
  try {
    osmPois = await fetchNearbyOsmPois(lat, lng, 1000)
  } catch (e: any) {
    osmError = String(e?.message ?? e)
  }
  result.osm_count = osmPois.length
  result.osm_error = osmError
  result.osm_pois = osmPois.slice(0, 10)

  // 3. DB의 T2 POI 수
  const { count: t2Count } = await (service as any)
    .from('poi')
    .select('*', { count: 'exact', head: true })
    .eq('poi_tier', 2)
  result.db_t2_poi_count = t2Count

  return NextResponse.json(result, { status: 200 })
}
