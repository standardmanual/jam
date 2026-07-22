import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { searchNaverPlaces } from '@/lib/poi/naver'

// GET /api/admin/poi/naver-search?query=  — 어드민 POI 등록 시 네이버 장소 검색

export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const query = new URL(req.url).searchParams.get('query')?.trim()
  if (!query) return NextResponse.json({ error: 'query 파라미터 필요' }, { status: 400 })

  try {
    const results = await searchNaverPlaces(query)
    return NextResponse.json({ results })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '검색 실패' },
      { status: 500 }
    )
  }
}
