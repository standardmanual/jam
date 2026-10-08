/**
 * Strava OAuth 시작 엔드포인트
 * GET /api/strava/auth
 *
 * 현재 로그인된 Supabase 유저를 확인 후 Strava OAuth URL로 리다이렉트.
 * state는 무작위 일회용 값이고 같은 값을 httpOnly 쿠키로 심는다(콜백이 대조).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import {
  STRAVA_OAUTH_STATE_COOKIE,
  createStravaOAuthState,
  getStravaOAuthStateCookieOptions,
} from '@/lib/strava/oauthState'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  const clientId = process.env.STRAVA_CLIENT_ID
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

  if (!clientId || !baseUrl) {
    return NextResponse.json({ error: d.auth.errorGeneric }, { status: 500 })
  }

  const redirectUri = `${baseUrl}/api/strava/callback`

  // CSRF 방지 — 브라우저 쿠키에 묶인 무작위 일회용 값. 유저 ID는 state에도 인가 URL에도 넣지 않는다.
  // 콜백이 쿠키와 state를 대조하고, 연결할 유저는 콜백의 로그인 세션으로 정한다 (티켓 20261008_1349).
  const oauthState = createStravaOAuthState()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'read,activity:read_all',
    state: oauthState,
  })

  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?${params.toString()}`

  const response = NextResponse.redirect(stravaAuthUrl)
  response.cookies.set(STRAVA_OAUTH_STATE_COOKIE, oauthState, getStravaOAuthStateCookieOptions())
  return response
}
