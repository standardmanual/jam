// PATCH /api/profile
// 프로필 정보 업데이트 (username 변경)

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'

/** ADR 0001 — username/check와 동일 규칙이라 같은 문구를 공유한다(티켓 20260915_2248) */
function validateUsernameFormat(username: string): string | null {
  if (username.length === 0) return d.onboarding.errorEmpty
  if (username.length > 30) return d.onboarding.errorTooLong
  if (!/^[a-z0-9._]+$/.test(username)) return d.onboarding.errorFormat
  if (username.startsWith('.') || username.endsWith('.')) return d.onboarding.errorDot
  if (username.includes('..')) return d.onboarding.errorDoubleDot
  return null
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  const body = await request.json() as { username?: string; display_name?: string }

  const serviceClient = createServiceClient()

  // display_name — 20260830_0113: username과 달리 필수값도 아니고 형식 제한도 없다
  // (인스타그램 "이름" 필드 정책과 동일 — 최대 30자, 그 외 허용 문자 제한 없음).
  // 중복 검사 없음. trim 후 빈 문자열이면 NULL로 저장해 표시 시 username으로 폴백한다.
  if (body.display_name !== undefined) {
    const trimmed = body.display_name.trim()
    if (trimmed.length > 30) {
      return NextResponse.json({ error: d.onboarding.errorTooLong }, { status: 400 })
    }

    const usersTable = serviceClient.from('users')
    const { error } = await usersTable.update({ display_name: trimmed.length > 0 ? trimmed : null }).eq('id', user.id)

    if (error) {
      console.error('[profile] display_name 업데이트 오류:', error.message)
      return NextResponse.json({ error: d.profileEdit.saveError }, { status: 500 })
    }
  }

  if (body.username !== undefined) {
    const lowerUsername = body.username.toLowerCase()

    const formatError = validateUsernameFormat(lowerUsername)
    if (formatError) {
      return NextResponse.json({ error: formatError }, { status: 400 })
    }

    // 자기 자신 제외한 중복 체크
    const { data: existing } = await serviceClient
      .from('users')
      .select('id')
      .eq('username', lowerUsername)
      .neq('id', user.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: d.onboarding.taken }, { status: 409 })
    }

    // username 업데이트
    const usersTable = serviceClient.from('users')
    const { error } = await usersTable.update({ username: lowerUsername }).eq('id', user.id)

    if (error) {
      console.error('[profile] username 업데이트 오류:', error.message)
      return NextResponse.json({ error: d.profileEdit.saveError }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
