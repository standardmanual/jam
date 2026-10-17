/**
 * Strava OAuth 콜백 엔드포인트
 * GET /api/strava/callback?code=...&state={무작위 일회용 값}
 *
 * 0. state를 state 쿠키와 대조하고, 연결할 유저를 로그인 세션으로 정한다 (URL의 state는 유저 ID가 아니다)
 * 1. 토큰 교환
 * 2. 이미 다른 JAM 계정에 연결된 Strava 계정이면 저장하지 않고 /profile?strava=duplicate (티켓 20261017_1422)
 * 3. 암호화 후 strava_connections 저장: 같은 계정이면 토큰 갱신·끊김 해제, 다른 계정이면 이 유저의
 *    이전 연결을 교체하고 새 행을 first_sync_pending=true로 만든다
 * 4. 즉시 동기화 트리거
 * 5. /profile 리다이렉트
 *
 * 모든 응답에서 state 쿠키를 지운다(일회용). 0단계에서 거부되면 1~3단계는 하나도 실행하지 않는다
 * (티켓 20261008_1349).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/utils'
import { syncStravaActivities } from '@/lib/strava/sync'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { STRAVA_DISCONNECT_CLEARED } from '@/lib/strava/connection-state'
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

    // 2. 이 Strava 계정이 이미 다른 JAM 계정에 연결돼 있는지 확인 — 토큰을 저장하기 전에 한다.
    //    (끊김 상태의 연결 포함.) 있으면 방금 받은 토큰은 저장하지 않고 버린다: 같은 계정을 다시 인증하면
    //    기존 연결의 토큰이 무효가 될지 확인하지 못했으므로(티켓 20261017_1422 잔여 이슈) 아무것도 쓰지 않는다.
    //    기존 upsert(onConflict: strava_athlete_id)는 이 경우 다른 유저 행의 user_id를 덮어썼다.
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
      console.warn('[JAM! Strava] 콜백 거부: duplicate_connection')
      return redirectAndClearState('/profile?strava=duplicate')
    }

    // 3. 토큰 암호화
    const [encryptedAccessToken, encryptedRefreshToken] = await Promise.all([
      encrypt(tokenData.access_token),
      encrypt(tokenData.refresh_token),
    ])
    const tokenFields = {
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      token_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
    }

    // 4. DB 저장 (service client — RLS 우회). 한 JAM 계정에는 연결이 하나뿐이다(운영 로직 3.2절).
    let insertedNewRow = false
    if (existingByAthlete) {
      // 같은 유저가 같은 Strava 계정을 다시 연결 — 토큰을 갱신하고 끊김을 지운다.
      // first_sync_pending·last_synced_at은 그대로 둬 마지막 동기화 뒤부터 이어서 가져온다.
      const { error: updateError } = await supabase
        .from('strava_connections')
        .update({ ...tokenFields, ...STRAVA_DISCONNECT_CLEARED })
        .eq('user_id', userId)
        .eq('strava_athlete_id', athleteId)
      if (updateError) {
        console.error('[JAM! Strava] strava_connections 갱신 오류:', updateError)
        return redirectAndClearState('/profile?strava=error&reason=db_error')
      }
    } else {
      // 다른 Strava 계정 연결 — 새 행은 첫 동기화 대기다. upsert가 아니라 insert라서 동시에
      // 같은 계정을 연결한 다른 유저와 부딪히면 유니크 위반으로 실패하고 아무것도 덮어쓰지 않는다.
      const { error: insertError } = await supabase.from('strava_connections').insert({
        user_id: userId,
        strava_athlete_id: athleteId,
        ...tokenFields,
        backfill_completed: true, // 소급 없음 — 연동 즉시 완료로 표시
        last_synced_at: null,
        first_sync_pending: true,
        ...STRAVA_DISCONNECT_CLEARED,
      })
      if (insertError) {
        console.error('[JAM! Strava] strava_connections insert 오류:', insertError)
        return redirectAndClearState('/profile?strava=error&reason=db_error')
      }
      insertedNewRow = true
    }

    // 이 유저의 이전 연결(다른 Strava 계정) 행을 지운다 — 같은 user_id의 행이 둘이면 조회가 오류를 낸다.
    // 활동 기록·배지·잼·포인트는 다른 테이블이라 그대로 남는다.
    const { error: deleteError } = await supabase
      .from('strava_connections')
      .delete()
      .eq('user_id', userId)
      .neq('strava_athlete_id', athleteId)
    if (deleteError) {
      console.error('[JAM! Strava] 이전 연결 삭제 오류:', deleteError)
      // 방금 넣은 새 행을 되돌려 같은 user_id의 행이 둘 남지 않게 한다(티켓 20261017_1422 서버 보정 b).
      // 되돌림이 실패해도 원래 오류 응답은 그대로 보낸다 — 로그로만 남긴다.
      if (insertedNewRow) {
        const { error: rollbackError } = await supabase
          .from('strava_connections')
          .delete()
          .eq('user_id', userId)
          .eq('strava_athlete_id', athleteId)
        if (rollbackError) {
          console.error('[JAM! Strava] 새 연결 되돌림 실패:', rollbackError)
        }
      }
      return redirectAndClearState('/profile?strava=error&reason=db_error')
    }

    // 5. 연동 즉시 동기화 — 반드시 await한다. 서버리스 함수는 응답을 반환하면
    //    직후 인스턴스가 종료될 수 있어, await 없는 백그라운드 호출은 처리 도중
    //    끊길 위험이 있다(신규 유저 첫 배지 미발급 인시던트 원인 — 2026-08-10).
    //    동기화 자체가 실패해도 연동은 이미 완료된 상태이므로 리다이렉트는 그대로 진행한다.
    try {
      await syncStravaActivities(userId)
    } catch (err) {
      if (err instanceof UserSuspendedError) {
        // 이용 정지 중이면 동기화만 건너뛴다 — 연결 저장과 로그인 흐름은 그대로 진행한다 (티켓 20261017_1426)
        console.info('[JAM! Strava] 이용 정지 중이라 즉시 동기화를 건너뜀 (연동은 성공)')
      } else {
        console.error('[JAM! Strava] 즉시 동기화 실패 (연동은 성공):', err)
      }
    }

    // reveal=1 — 도착 화면에서 최근 획득 배지를 되읽어 획득 연출을 띄우는 플래그.
    // 여기서 배지 상세를 응답에 실을 수 없어(리다이렉트) 플래그만 넘긴다 (20260824_003).
    return redirectAndClearState('/profile?strava=connected&reveal=1')
  } catch (err) {
    console.error('[JAM! Strava] 콜백 처리 오류:', err)
    return redirectAndClearState('/profile?strava=error&reason=server_error')
  }
}
