// PATCH /api/profile
// 프로필 정보 업데이트 (username 변경)

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

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const body = await request.json() as { username?: string }

  const serviceClient = createServiceClient()

  if (body.username !== undefined) {
    const lowerUsername = body.username.toLowerCase()

    const formatError = validateUsernameFormat(lowerUsername)
    if (formatError) {
      return NextResponse.json({ error: 'INVALID_FORMAT' }, { status: 400 })
    }

    // 자기 자신 제외한 중복 체크
    const { data: existing } = await serviceClient
      .from('users')
      .select('id')
      .eq('username', lowerUsername)
      .neq('id', user.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'DUPLICATE' }, { status: 409 })
    }

    // username 업데이트
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (serviceClient.from('users') as any)
      .update({ username: lowerUsername })
      .eq('id', user.id)

    if (error) {
      console.error('[profile] username 업데이트 오류:', error.message)
      return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
