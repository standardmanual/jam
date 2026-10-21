/**
 * Strava OAuth 콜백 엔드포인트
 * GET /api/strava/callback?code=...&state={무작위 일회용 값}
 *
 * 0. state를 state 쿠키와 대조하고, 연결할 유저를 로그인 세션으로 정한다 (URL의 state는 유저 ID가 아니다)
 *    트라이브를 고르지 않은 유저면 연결을 저장하지 않고 /onboarding(트라이브 고르기)으로 보낸다 (티켓 20261021_1247, 운영 로직 2장)
 * 1. 토큰 교환
 * 2. 이미 다른 JAM 계정에 연결된 Strava 계정이면 저장하지 않는다 (티켓 20261017_1422, 20261021_1249 4회)
 *    - 기존 계정이 일반·정상이면 방금 받은 토큰을 10분짜리 서명 쿠키(`strava_replace_offer`)에 담아 /profile?strava=duplicate
 *      («그래도 연결하기» 시트). 실제 연결은 시트에서 고르면 `POST /api/strava/replace`가 한다.
 *    - 기존 계정이 어드민이거나 이용 정지 중이면 쿠키를 굽지 않고 /profile?strava=duplicate_blocked
 * 3. 암호화 후 strava_connections 저장(`lib/strava/connection-save.ts`): 같은 계정이면 토큰 갱신·끊김 해제, 다른 계정이면 이 유저의
 *    이전 연결을 교체하고 새 행을 first_sync_pending=true로 만든다
 * 4. 즉시 동기화 트리거
 * 5. /profile 리다이렉트
 *
 * 모든 응답에서 state 쿠키를 지운다(일회용). 0단계에서 거부되면 1~3단계는 하나도 실행하지 않는다
 * (티켓 20261008_1349).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { assertHasTribe, TribeRequiredError } from '@/lib/tribe/gate'
import { TRIBE_SELECT_PATH } from '@/lib/tribe/gate-contract'
import { assessDuplicateOwner, saveStravaConnection, syncAfterConnect } from '@/lib/strava/connection-save'
import {
  STRAVA_REPLACE_OFFER_COOKIE,
  getStravaReplaceOfferCookieOptions,
  sealStravaReplaceOffer,
} from '@/lib/strava/replace-offer'
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

    // 트라이브를 고르지 않았으면 토큰 교환·저장·동기화를 하지 않고 고르기 화면으로 보낸다 (티켓 20261021_1247).
    // 읽지 못한 경우는 «있음»으로 보지 않고 아래 catch로 넘겨 server_error로 끝낸다.
    try {
      await assertHasTribe(createServiceClient(), userId)
    } catch (err) {
      if (err instanceof TribeRequiredError) {
        console.warn('[JAM! Strava] 콜백 거부: tribe_required')
        return redirectAndClearState(TRIBE_SELECT_PATH)
      }
      throw err
    }

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

    // 2. 이 Strava 계정이 이미 다른 JAM 계정에 연결돼 있는지 확인 — 토큰을 저장하기 전에 한다.
    //    (끊김 상태의 연결 포함.) 기존 upsert(onConflict: strava_athlete_id)는 이 경우 다른 유저 행의 user_id를 덮어썼다.
    //    그래서 이 단계에서는 아무것도 저장하지 않는다. «그래도 연결하기»를 고르면 그때 `replace` 라우트가 저장한다.
    const supabase = createServiceClient()
    const athleteId = tokenData.athlete.id
    const { data: existingByAthlete, error: lookupError } = await supabase
      .from('strava_connections')
      .select('user_id')
      .eq('strava_athlete_id', athleteId)
      .maybeSingle()

    if (lookupError) {
      console.error('[JAM! Strava] strava_connections 조회 오류:', lookupError)
      return redirectAndClearState('/profile?strava=error&reason=db_error')
    }
    if (existingByAthlete && existingByAthlete.user_id !== userId) {
      // 기존 계정이 어드민이거나 이용 정지 중이면 «그래도 연결하기»를 주지 않는다 — 쿠키를 굽지 않고 막힘 안내로 보낸다.
      // 읽지 못하면 «지워도 된다»로 보지 않고 DB 오류로 닫는다.
      const owner = await assessDuplicateOwner(supabase, existingByAthlete.user_id)
      if (owner === 'unknown') {
        return redirectAndClearState('/profile?strava=error&reason=db_error')
      }
      if (owner === 'blocked') {
        console.warn('[JAM! Strava] 콜백 거부: duplicate_connection_blocked')
        return redirectAndClearState('/profile?strava=duplicate_blocked')
      }

      // 방금 받은 토큰을 10분짜리 서명 쿠키에 담는다. 토큰·쿠키 값은 로그에 남기지 않는다.
      console.warn('[JAM! Strava] 콜백 거부: duplicate_connection')
      const sealed = await sealStravaReplaceOffer({
        userId,
        athleteId,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAtSec: tokenData.expires_at,
      })
      const response = redirectAndClearState('/profile?strava=duplicate')
      response.cookies.set(STRAVA_REPLACE_OFFER_COOKIE, sealed, getStravaReplaceOfferCookieOptions())
      return response
    }

    // 3~4. 암호화 후 저장 (service client — RLS 우회)
    const saved = await saveStravaConnection(supabase, {
      userId,
      athleteId,
      tokens: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAtSec: tokenData.expires_at,
      },
      hasSameAthleteRow: Boolean(existingByAthlete),
    })
    if (!saved) {
      return redirectAndClearState('/profile?strava=error&reason=db_error')
    }

    // 5. 연동 즉시 동기화 — 실패해도 연동은 이미 완료된 상태이므로 리다이렉트는 그대로 진행한다
    await syncAfterConnect(userId)

    // reveal=1 — 도착 화면에서 최근 획득 배지를 되읽어 획득 연출을 띄우는 플래그.
    // 여기서 배지 상세를 응답에 실을 수 없어(리다이렉트) 플래그만 넘긴다 (20260824_003).
    return redirectAndClearState('/profile?strava=connected&reveal=1')
  } catch (err) {
    console.error('[JAM! Strava] 콜백 처리 오류:', err)
    return redirectAndClearState('/profile?strava=error&reason=server_error')
  }
}
