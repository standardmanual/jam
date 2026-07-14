// GET /api/username/check?username={value}
// 아이디 사용 가능 여부 확인 (인증 불필요)

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function validateUsernameFormat(username: string): string | null {
  if (username.length === 0) return 'EMPTY'
  if (username.length > 30) return 'TOO_LONG'
  if (!/^[a-z0-9._]+$/.test(username)) return 'INVALID_CHARS'
  if (username.startsWith('.') || username.endsWith('.')) return 'DOT_EDGE'
  if (username.includes('..')) return 'CONSECUTIVE_DOTS'
  return null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('username') ?? ''
  const username = raw.toLowerCase()

  const formatError = validateUsernameFormat(username)
  if (formatError) {
    return NextResponse.json({ available: false, reason: 'INVALID_FORMAT' })
  }

  const serviceClient = createServiceClient()

  const { data } = await serviceClient
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  return NextResponse.json({ available: !data })
}
