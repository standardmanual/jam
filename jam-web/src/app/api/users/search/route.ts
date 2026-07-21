import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserRow } from '@/types/database'

interface UserSearchResult {
  id: string
  username: string
  avatar_url: string | null
  region: string | null
  activity_types: string[] | null
}

export async function GET(req: NextRequest) {
  // 1. 세션 검증 — 로그인 유저만 검색 가능
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  // 2. 검색어 전처리: trim → 2자 미만 빈 결과 → ilike 와일드카드(%, _) 제거
  const raw = req.nextUrl.searchParams.get('q') ?? ''
  const q = raw.trim()

  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  // ilike 와일드카드(%, _) + PostgREST or-필터 DSL 구분자(,, (, ))를 함께 제거
  const sanitized = q.replace(/[%_,()]/g, '')

  // 와일드카드만으로 이루어진 검색어였다면(제거 후 공백) 빈 결과
  if (sanitized.length < 2) {
    return NextResponse.json({ results: [] })
  }

  // 3. service role 클라이언트로 조회 (email로도 검색해야 하므로 RLS 우회)
  const service = createServiceClient()
  const pattern = `%${sanitized}%`

  const { data, error } = await service
    .from('users')
    .select('id, username, avatar_url, region, activity_types')
    .not('username', 'is', null)
    .or(`username.ilike.${pattern},email.ilike.${pattern}`)
    .limit(30)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 4. 정렬: 정확 일치(lower(username) == lower(q)) 우선 → username 오름차순
  const lowerQ = sanitized.toLowerCase()
  const rows = (data ?? []) as Pick<
    UserRow,
    'id' | 'username' | 'avatar_url' | 'region' | 'activity_types'
  >[]
  const results: UserSearchResult[] = rows
    .map((row) => ({
      id: row.id,
      username: row.username as string,
      avatar_url: row.avatar_url ?? null,
      region: row.region ?? null,
      activity_types: row.activity_types ?? null,
    }))
    .sort((a, b) => {
      const aExact = a.username.toLowerCase() === lowerQ ? 0 : 1
      const bExact = b.username.toLowerCase() === lowerQ ? 0 : 1
      if (aExact !== bExact) return aExact - bExact
      return a.username.localeCompare(b.username)
    })

  // email은 응답에 절대 포함하지 않음 (검색 조건으로만 사용)
  return NextResponse.json({ results })
}
