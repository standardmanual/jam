// DELETE /api/follows/[userId]
// 언팔로우 (userId = following_id)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ADR 0001 — authRequired 값 자체는 티켓 20260916_0904에서 별도로 손보는 중(티켓 20260915_2249)
  if (!user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  const { userId } = await params

  const { error } = await supabase
    .from('user_follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', userId)

  if (error) {
    console.error('[follows] delete 오류:', error.message)
    return NextResponse.json({ error: d.social.unfollowError }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
