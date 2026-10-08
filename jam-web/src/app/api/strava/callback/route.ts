/**
 * Strava OAuth 콜백 엔드포인트
 * GET /api/strava/callback?code=...&state={무작위 일회용 값}
 *
 * 0. state를 state 쿠키와 대조하고, 연결할 유저를 로그인 세션으로 정한다 (URL의 state는 유저 ID가 아니다)
 * 1. 토큰 교환
 * 2. 암호화 후 strava_connections upsert
 * 3. 즉시 동기화 트리거
 * 4. /profile 리다이렉트
 *
 * 모든 응답에서 state 쿠키를 지운다(일회용). 0단계에서 거부되면 1~3단계는 하나도 실행하지 않는다
 * (티켓 20261008_1349).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/utils'
import { syncStravaActivities } from '@/lib/strava/sync'
import {
  STRAVA_OAUTH_STATE_COOKIE,
  getStravaOAuthStateCookieOptions,
  isValidStravaOAuthState,
} from '@/lib/strava/oauthState'

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const errorParam = searchParams.get('error')

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? ''

  // 모든 응답은 이 함수로 만든다 — 성공·실패를 가리지 않고 state 쿠키를 지운다(일회용).
  // 지울 때도 심을 때와 같은 path를 써야 브라우저가 같은 쿠키로 인식한다.
  const redirectAndClearState = (pathAndQuery: string) => {
    const response = NextResponse.redirect(`${baseUrl}${pathAndQuery}`)
    response.cookies.set(STRAVA_OAUTH_STATE_COOKIE, '', {
      ...getStravaOAuthStateCookieOptions(),
      maxAge: 0,
    })
    return response
  }

  // Strava가 에러를 반환한 경우 (유저가 거부 등) — Strava가 돌려준 값이라 인코딩해서 붙인다
  if (errorParam) {
    return redirectAndClearState(`/profile?strava=error&reason=${encodeURIComponent(errorParam)}`)
  }

  if (!code || !stateParam) {
    return redirectAndClearState('/profile?strava=error&reason=missing_params')
  }

  // 쿠키가 없거나 state와 다르면 거부 — 토큰 교환·upsert·동기화 전에 끝낸다.
  // 로그에는 쿠키 값·state·code를 남기지 않는다.
  const stateCookie = request.cookies.get(STRAVA_OAUTH_STATE_COOKIE)?.value
  if (!isValidStravaOAuthState(stateCookie, stateParam)) {
    console.warn('[JAM! Strava] 콜백 거부: state_mismatch')
    return redirectAndClearState('/profile?strava=error&reason=state_mismatch')
  }

  try {
    // 연결할 유저는 URL이 아니라 로그인 세션으로 정한다 — 세션이 없으면 거부
    const sessionClient = await createClient()
    const { data: { user }, error: sessionError } = await sessionClient.auth.getUser()
    if (sessionError || !user) {
      console.warn('[JAM! Strava] 콜백 거부: auth_required')
      return redirectAndClearState('/profile?strava=error&reason=auth_required')
    }
    const userId = user.id

    // 1. 토큰 교환
    const tokenRes = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      console.error('[JAM! Strava] 토큰 교환 실패:', body)
      return redirectAndClearState('/profile?strava=error&reason=token_exchange')
    }

    const tokenData = await tokenRes.json() as {
      access_token: string
      refresh_token: string
      expires_at: number
      athlete: { id: number }
    }

    // 2. 토큰 암호화
    const [encryptedAccessToken, encryptedRefreshToken] = await Promise.all([
      encrypt(tokenData.access_token),
      encrypt(tokenData.refresh_token),
    ])

    // 3. DB upsert (service client — RLS 우회)
    const supabase = createServiceClient()
    const stravaConnectionPayload = {
      user_id: userId,
      strava_athlete_id: tokenData.athlete.id,
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      token_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
      backfill_completed: true, // 소급 없음 — 연동 즉시 완료로 표시
      last_synced_at: null,
    }
    const connectionsTable = supabase.from('strava_connections')
    const { error: upsertError } = await connectionsTable.upsert(stravaConnectionPayload, { onConflict: 'strava_athlete_id' })

    if (upsertError) {
      console.error('[JAM! Strava] strava_connections upsert 오류:', upsertError)
      return redirectAndClearState('/profile?strava=error&reason=db_error')
    }

    // 4. 연동 즉시 동기화 — 반드시 await한다. 서버리스 함수는 응답을 반환하면
    //    직후 인스턴스가 종료될 수 있어, await 없는 백그라운드 호출은 처리 도중
    //    끊길 위험이 있다(신규 유저 첫 배지 미발급 인시던트 원인 — 2026-08-10).
    //    동기화 자체가 실패해도 연동은 이미 완료된 상태이므로 리다이렉트는 그대로 진행한다.
    try {
      await syncStravaActivities(userId)
    } catch (err) {
      console.error('[JAM! Strava] 즉시 동기화 실패 (연동은 성공):', err)
    }

    // reveal=1 — 도착 화면에서 최근 획득 배지를 되읽어 획득 연출을 띄우는 플래그.
    // 여기서 배지 상세를 응답에 실을 수 없어(리다이렉트) 플래그만 넘긴다 (20260824_003).
    return redirectAndClearState('/profile?strava=connected&reveal=1')
  } catch (err) {
    console.error('[JAM! Strava] 콜백 처리 오류:', err)
    return redirectAndClearState('/profile?strava=error&reason=server_error')
  }
}
