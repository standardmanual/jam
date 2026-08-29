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

  const body = await request.json() as { username?: string; display_name?: string }

  const serviceClient = createServiceClient()

  // display_name — 20260830_0113: username과 달리 필수값도 아니고 형식 제한도 없다
  // (인스타그램 "이름" 필드 정책과 동일 — 최대 30자, 그 외 허용 문자 제한 없음).
  // 중복 검사 없음. trim 후 빈 문자열이면 NULL로 저장해 표시 시 username으로 폴백한다.
  if (body.display_name !== undefined) {
    const trimmed = body.display_name.trim()
    if (trimmed.length > 30) {
      return NextResponse.json({ error: 'INVALID_FORMAT' }, { status: 400 })
    }

    const usersTable = serviceClient.from('users')
    // @ts-expect-error Supabase update() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 UserRow와 일치
    const { error } = await usersTable.update({ display_name: trimmed.length > 0 ? trimmed : null }).eq('id', user.id)

    if (error) {
      console.error('[profile] display_name 업데이트 오류:', error.message)
      return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
    }
  }

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
    const usersTable = serviceClient.from('users')
    // @ts-expect-error Supabase update() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 UserRow와 일치
    const { error } = await usersTable.update({ username: lowerUsername }).eq('id', user.id)

    if (error) {
      console.error('[profile] username 업데이트 오류:', error.message)
      return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
