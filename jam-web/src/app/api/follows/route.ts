// POST /api/follows
// 팔로우 추가 (승인 없이 바로 팔로우 — Twitter/X 방식)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { target_user_id?: string }
  const targetUserId = body.target_user_id

  if (!targetUserId) {
    return NextResponse.json({ error: 'MISSING_TARGET' }, { status: 400 })
  }

  // 자기 자신 팔로우 방지 (DB CHECK와 이중 검증)
  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'SELF_FOLLOW' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_follows')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ follower_id: user.id, following_id: targetUserId } as any)

  if (error) {
    // 중복 팔로우 (unique 위반)
    if (error.code === '23505') {
      return NextResponse.json({ ok: true, already: true })
    }
    console.error('[follows] insert 오류:', error.message)
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
