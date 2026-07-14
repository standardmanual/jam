// POST /api/onboarding/complete
// 온보딩 완료 — username 저장 (인증 필요)

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

function validateUsernameFormat(username: string): string | null {
  if (username.length === 0) return 'EMPTY'
  if (username.length > 30) return 'TOO_LONG'
  if (!/^[a-z0-9._]+$/.test(username)) return 'INVALID_CHARS'
  if (username.startsWith('.') || username.endsWith('.')) return 'DOT_EDGE'
  if (username.includes('..')) return 'CONSECUTIVE_DOTS'
  return null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const body = await request.json() as { username?: string }
  const raw = body.username ?? ''
  const username = raw.toLowerCase()

  const formatError = validateUsernameFormat(username)
  if (formatError) {
    return NextResponse.json({ error: 'INVALID_FORMAT' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // 중복 체크
  const { data: existing } = await serviceClient
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'DUPLICATE' }, { status: 409 })
  }

  // username 저장 (Supabase 타입 추론 한계로 as any 사용)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (serviceClient.from('users') as any)
    .update({ username })
    .eq('id', user.id)

  if (error) {
    console.error('[onboarding/complete] update 오류:', error.message)
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
