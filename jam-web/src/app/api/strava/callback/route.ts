/**
 * Strava OAuth 콜백 엔드포인트
 * GET /api/strava/callback?code=...&state={userId}
 *
 * 1. 토큰 교환
 * 2. 암호화 후 strava_connections upsert
 * 3. 즉시 동기화 트리거
 * 4. /profile 리다이렉트
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/utils'
import { syncStravaActivities } from '@/lib/strava/sync'

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const userId = searchParams.get('state')
  const errorParam = searchParams.get('error')

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? ''

  // Strava가 에러를 반환한 경우 (유저가 거부 등)
  if (errorParam) {
    return NextResponse.redirect(`${baseUrl}/profile?strava=error&reason=${errorParam}`)
  }

  if (!code || !userId) {
    return NextResponse.redirect(`${baseUrl}/profile?strava=error&reason=missing_params`)
  }

  try {
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
      return NextResponse.redirect(`${baseUrl}/profile?strava=error&reason=token_exchange`)
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
    // @ts-expect-error Supabase upsert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 StravaConnectionRow와 일치
    const { error: upsertError } = await connectionsTable.upsert(stravaConnectionPayload, { onConflict: 'strava_athlete_id' })

    if (upsertError) {
      console.error('[JAM! Strava] strava_connections upsert 오류:', upsertError)
      return NextResponse.redirect(`${baseUrl}/profile?strava=error&reason=db_error`)
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

    return NextResponse.redirect(`${baseUrl}/profile?strava=connected`)
  } catch (err) {
    console.error('[JAM! Strava] 콜백 처리 오류:', err)
    return NextResponse.redirect(`${baseUrl}/profile?strava=error&reason=server_error`)
  }
}
