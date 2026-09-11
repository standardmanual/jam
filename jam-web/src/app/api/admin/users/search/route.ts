import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

const MAX_RESULTS = 20

/**
 * 어드민 폼(랭킹모드의 "유저 직접 지정" 대상 선택, 티켓 20260911_1440)에서 유저를 찾기 위한
 * 검색 API. 전체 유저를 한 번에 select()하면 Supabase Max Rows 상한에 걸릴 수 있으므로
 * (`/api/admin/badges/search`와 동일한 이유), 이름/아이디 검색으로 좁혀 소량만 가져온다.
 */
export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const raw = (req.nextUrl.searchParams.get('query') ?? '').trim()
  if (!raw) return NextResponse.json({ users: [] })
  // PostgREST 필터 문법(쉼표/괄호)과 LIKE 와일드카드를 깨뜨리는 문자는 제거
  const query = raw.replace(/[,()%_*\\]/g, ' ').trim()
  if (!query) return NextResponse.json({ users: [] })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .order('username', { ascending: true })
    .limit(MAX_RESULTS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users: data ?? [] })
}
