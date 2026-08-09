import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchNearbyNaverPoisForCategories } from '@/lib/poi/naver'
import { loadPipelineCategories } from '@/lib/poi/categories'
import { requireAdmin } from '@/lib/admin/auth'

// GET /api/drops/debug?lat=&lng=
// 어드민 전용 단계별 진단 결과 반환 (개발/운영 디버그용).
// 과거 인증 없이 열려있어 DB 스키마·외부 API 호출 결과가 그대로 노출됐음 — 어드민 인증으로 차단.

export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat, lng 파라미터 필요' }, { status: 400 })
  }

  const result: Record<string, unknown> = { lat, lng }

  // 1. DB poi 테이블 컬럼 확인 (naver_id 있는지)
  const service = createServiceClient()
  const { data: samplePoi, error: poiError } = await (service as any)
    .from('poi')
    .select('id, name, naver_id, poi_tier')
    .limit(3)

  result.db_poi_sample = samplePoi
  result.db_poi_error = poiError?.message ?? null
  result.db_has_naver_id_column = poiError === null

  // 2. 네이버 지역검색 쿼리 직접 실행 (전체 카테고리)
  let naverPois: Awaited<ReturnType<typeof fetchNearbyNaverPoisForCategories>> = []
  let naverError: string | null = null
  try {
    const { all: pipelineCategories } = await loadPipelineCategories(service)
    naverPois = await fetchNearbyNaverPoisForCategories(lat, lng, 1000, pipelineCategories)
  } catch (e: any) {
    naverError = String(e?.message ?? e)
  }
  result.naver_count = naverPois.length
  result.naver_error = naverError
  result.naver_pois = naverPois.slice(0, 10)

  // 3. DB의 T2 POI 수
  const { count: t2Count } = await (service as any)
    .from('poi')
    .select('*', { count: 'exact', head: true })
    .eq('poi_tier', 2)
  result.db_t2_poi_count = t2Count

  return NextResponse.json(result, { status: 200 })
}
