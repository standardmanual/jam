// GET /api/username/check?username={value}
// 아이디 사용 가능 여부 확인 (인증 불필요)

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'

/**
 * ADR 0001 — 형식 오류 사유별 완성된 문구. `onboarding` 네임스페이스의 문구를 그대로 참조한다 —
 * 온보딩 화면의 클라이언트 사전 검증(`validateFormat`)과 이 서버 판정이 같은 규칙을 검사하므로
 * 같은 문구를 쓰는 것이 맞다(용어 일관성, UX_WRITING_GUIDELINE §1.3). 티켓 20260915_2248.
 */
function validateUsernameFormat(username: string): string | null {
  if (username.length === 0) return d.onboarding.errorEmpty
  if (username.length > 30) return d.onboarding.errorTooLong
  if (!/^[a-z0-9._]+$/.test(username)) return d.onboarding.errorFormat
  if (username.startsWith('.') || username.endsWith('.')) return d.onboarding.errorDot
  if (username.includes('..')) return d.onboarding.errorDoubleDot
  return null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('username') ?? ''
  const username = raw.toLowerCase()

  const formatError = validateUsernameFormat(username)
  if (formatError) {
    return NextResponse.json({ available: false, message: formatError })
  }

  const serviceClient = createServiceClient()

  const { data } = await serviceClient
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  const available = !data
  return NextResponse.json({ available, message: available ? d.onboarding.available : d.onboarding.taken })
}
