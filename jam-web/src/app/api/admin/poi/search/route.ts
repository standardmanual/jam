import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

const MAX_RESULTS = 20

/**
 * 어드민 배지 폼에서 "배지에 연결할 POI"를 찾기 위한 검색 API.
 * 네이버 API로 새 장소를 찾는 `/api/admin/poi/naver-search`와 달리,
 * 이미 JAM! DB `poi` 테이블에 등록된 POI만 이름으로 검색한다.
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const raw = (req.nextUrl.searchParams.get('query') ?? '').trim()
  // PostgREST 필터 문법(쉼표/괄호)과 LIKE 와일드카드를 깨뜨리는 문자는 제거
  const query = raw.replace(/[,()%_*\\]/g, ' ').trim()
  if (!query) return NextResponse.json({ pois: [] })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('poi')
    .select('id, name, category, latitude, longitude, radius_meters, linked_badge_id')
    .ilike('name', `%${query}%`)
    .order('name', { ascending: true })
    .limit(MAX_RESULTS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pois: data ?? [] })
}
