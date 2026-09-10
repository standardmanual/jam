// POST /api/onboarding/complete
// 온보딩 완료 — username·display_name·faction_id 저장 (인증 필요)
//
// 티켓 20260909_2119: 2단계 카드형 온보딩(아이디·이름 → 트라이브·프로필이미지)에 맞춰
// 이 엔드포인트를 두 단계에서 각각 호출한다.
//   - 1단계 호출: { username, display_name } — faction_id 없이 호출. username·display_name만
//     저장하고 onboarding_completed_at은 건드리지 않는다.
//   - 2단계 호출: { username, display_name, faction_id } — faction_id까지 채워지면 그 시점에만
//     onboarding_completed_at을 기록한다. 이 값이 "온보딩 완료" 판정 기준이다
//     (`/auth/callback`의 needsOnboarding 참고).

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

  const body = await request.json() as { username?: string; display_name?: string; faction_id?: string }
  const raw = body.username ?? ''
  const username = raw.toLowerCase()
  const displayName = (body.display_name ?? '').trim()

  const formatError = validateUsernameFormat(username)
  if (formatError) {
    return NextResponse.json({ error: 'INVALID_FORMAT' }, { status: 400 })
  }

  if (displayName.length === 0 || displayName.length > 30) {
    return NextResponse.json({ error: 'INVALID_NAME' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  // 자기 자신 제외한 중복 체크 — 2단계 호출은 1단계에서 이미 저장한 자신의 username을
  // 그대로 다시 보내므로(멱등), neq로 자기 자신은 걸러야 오탐이 안 난다.
  const { data: existingUsername } = await serviceClient
    .from('users')
    .select('id')
    .eq('username', username)
    .neq('id', user.id)
    .maybeSingle()

  if (existingUsername) {
    return NextResponse.json({ error: 'DUPLICATE' }, { status: 409 })
  }

  const tribeId = body.faction_id

  // faction_id 없이 호출됐다면 1단계(아이디·이름)만 저장하고 끝난다.
  if (!tribeId) {
    const { error } = await serviceClient
      .from('users')
      .update({ username, display_name: displayName })
      .eq('id', user.id)

    if (error) {
      console.error('[onboarding/complete] 1단계 update 오류:', error.message)
      return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  // 2단계 — 트라이브(faction_id)까지 함께 저장한다.
  const { data: currentRow, error: currentRowError } = await serviceClient
    .from('users')
    .select('faction_id')
    .eq('id', user.id)
    .single()

  if (currentRowError || !currentRow) {
    console.error('[onboarding/complete] 유저 조회 오류:', currentRowError?.message)
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
  }

  // 트라이브 불변 강제 — 이미 설정된 유저가 재호출(devtools/curl 등)해도 덮어쓸 수 없다.
  if (currentRow.faction_id) {
    console.error('[onboarding/complete] 트라이브 재설정 시도 거부(이미 설정됨):', user.id)
    return NextResponse.json({ error: 'ALREADY_SET' }, { status: 409 })
  }

  // 유저가 화면을 띄운 사이 어드민이 비활성화했을 수 있으므로 서버에서 다시 검증한다.
  const { data: tribe } = await serviceClient
    .from('factions')
    .select('id')
    .eq('id', tribeId)
    .eq('is_active', true)
    .maybeSingle()

  if (!tribe) {
    console.error('[onboarding/complete] 비활성/존재하지 않는 트라이브 제출 거부:', tribeId)
    return NextResponse.json({ error: 'INVALID_TRIBE' }, { status: 400 })
  }

  const { error } = await serviceClient
    .from('users')
    .update({
      username,
      display_name: displayName,
      faction_id: tribeId,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    console.error('[onboarding/complete] 2단계 update 오류:', error.message)
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
