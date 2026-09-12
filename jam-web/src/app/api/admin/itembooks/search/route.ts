import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

const MAX_RESULTS = 20

// 컬렉션(아이템북) 검색 API (티켓 20260913_0414)
// 테이블 item_books, 대표 이미지 컬럼 image_url(배경용 background_image_url과 별개).
// 기존 GET /api/admin/itembooks는 전체 목록만 반환해 검색 파라미터가 없다 - 그 라우트를
// 건드리지 않고(다른 화면이 전체 목록에 의존) 전용 검색 라우트를 신설한다.
export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: `Forbidden` }, { status: 403 })

  const raw = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const query = raw.replace(/[,()%_*\\]/g, ' ').trim()
  if (!query) return NextResponse.json({ itemBooks: [] })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('item_books')
    .select('id, name, image_url')
    .ilike('name', `%${query}%`)
    .order('name', { ascending: true })
    .limit(MAX_RESULTS)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const itemBooks = (data ?? []).map((b) => ({ id: b.id, name: b.name, imageUrl: b.image_url }))
  return NextResponse.json({ itemBooks })
}
