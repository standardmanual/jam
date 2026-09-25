import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { sanitizeSearchTerm } from '@/lib/admin/search-term'

const MAX_RESULTS = 20

// 홈피드(투데이 카드) 검색 API (티켓 20260925_1411)
// 테이블 today_cards, 이름 컬럼은 title, 대표 이미지 컬럼은 cover_image_url이다(다른 콘텐츠와
// 달리 image_url이 아니다). 에셋 제너레이터 적용 탭에서 홈피드 카드를 검색해 고르는 데 쓴다
// (`itembooks/search/route.ts`와 같은 패턴). 기존 GET /api/admin/today는 목록 전용 쿼리라
// 검색 파라미터가 없다 - 그 라우트를 건드리지 않고 전용 검색 라우트를 신설한다.
export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: `Forbidden` }, { status: 403 })

  // PostgREST 필터 문법(쉼표/괄호)과 LIKE 와일드카드를 깨뜨리는 문자는 제거(20260924_0941,
  // `users/search`와 공유하는 공용 정제)
  const query = sanitizeSearchTerm(req.nextUrl.searchParams.get('q') ?? '')
  if (!query) return NextResponse.json({ cards: [] })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('today_cards')
    .select('id, title, cover_image_url')
    .ilike('title', `%${query}%`)
    .order('title', { ascending: true })
    .limit(MAX_RESULTS)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const cards = (data ?? []).map((c) => ({ id: c.id, title: c.title, imageUrl: c.cover_image_url }))
  return NextResponse.json({ cards })
}
