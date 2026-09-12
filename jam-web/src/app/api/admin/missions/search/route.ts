import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'

const MAX_RESULTS = 20

// 게이트 미션 검색 API (티켓 20260913_0414)
// 실제 테이블명은 missions(UI 라벨만 게이트 미션), 이름 컬럼은 title이다(name이 아니다).
// 쉐이더 랩 3차 적용 흐름(검색 -> 선택 -> 미리보기 -> 적용)에서 텍스트로 대상을 찾는 데 쓴다.
// 기존 어드민 화면(GateMissionManager)은 전체 목록을 클라이언트에서 필터링하지만, 이 API는
// /api/admin/badges/search와 같은 이유로(Max Rows 상한 회피) 서버에서 이름 검색으로 좁힌다.
export async function GET(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const raw = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const query = raw.replace(/[,()%_*\\]/g, ' ').trim()
  if (!query) return NextResponse.json({ missions: [] })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('missions')
    .select('id, title, image_url')
    .ilike('title', `%${query}%`)
    .order('title', { ascending: true })
    .limit(MAX_RESULTS)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const missions = (data ?? []).map((m) => ({ id: m.id, name: m.title, imageUrl: m.image_url }))
  return NextResponse.json({ missions })
}
