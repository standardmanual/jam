/**
 * Strava OAuth 시작 엔드포인트
 * GET /api/strava/auth
 *
 * 현재 로그인된 Supabase 유저를 확인 후 Strava OAuth URL로 리다이렉트
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const clientId = process.env.STRAVA_CLIENT_ID
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

  if (!clientId || !baseUrl) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })
  }

  const redirectUri = `${baseUrl}/api/strava/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'read,activity:read_all',
    state: user.id, // CSRF 방지 — userId를 state로 전달
  })

  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?${params.toString()}`

  return NextResponse.redirect(stravaAuthUrl)
}
