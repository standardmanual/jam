/**
 * Strava 연결 끊기 API
 * POST /api/strava/disconnect
 *
 * 로그인한 유저의 연결을 끊는다 (티켓 20261017_1422, 운영 로직 3.2절).
 * 1. Strava 쪽 앱 연결을 해제한다(`deauthorize`). 이미 무효한 토큰이면 실패해도 계속한다.
 * 2. 저장된 토큰을 지우고 `markStravaDisconnected(userId, 'user_disconnected')`로 끊김을 저장한다.
 *
 * 지금까지의 활동 기록·배지·잼·포인트는 건드리지 않는다. 연결 행이 없으면 404다.
 * 토큰 값은 로그에 남기지 않는다.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/utils'
import { deauthorizeStrava, refreshStravaToken } from '@/lib/strava/api'
import { markStravaDisconnected } from '@/lib/strava/connection-state'
import { d } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export async function POST() {
  const sessionClient = await createClient()
  const { data: { user }, error } = await sessionClient.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  try {
    const supabase = createServiceClient()
    const { data: connection, error: connError } = await supabase
      .from('strava_connections')
      .select('access_token, refresh_token, token_expires_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (connError) {
      console.error('[/api/strava/disconnect] 연결 조회 오류:', connError)
      return NextResponse.json({ error: d.auth.errorGeneric }, { status: 500 })
    }
    if (!connection) {
      return NextResponse.json({ error: d.auth.stravaNotConnectedTitle }, { status: 404 })
    }

    // Strava 앱 연결 해제 — 실패해도 이쪽 연결은 끊는다(이미 철회됐거나 토큰이 무효인 경우).
    // 만료 직전이면 먼저 갱신해 해제가 통하게 한다. 갱신 실패도 같은 방식으로 흘려보낸다.
    let deauthorized = false
    try {
      let accessToken = await decrypt(connection.access_token)
      if (Date.now() >= new Date(connection.token_expires_at).getTime() - 60_000) {
        const refreshed = await refreshStravaToken(await decrypt(connection.refresh_token))
        accessToken = refreshed.access_token
      }
      await deauthorizeStrava(accessToken)
      deauthorized = true
    } catch (err) {
      // 토큰·응답 본문은 남기지 않고 오류 종류만 남긴다
      const status = (err as { status?: unknown } | null)?.status
      console.warn(
        `[/api/strava/disconnect] Strava 앱 해제 실패 — 연결 끊기는 계속 진행 (userId: ${user.id}, status: ${typeof status === 'number' ? status : 'n/a'})`
      )
    }

    const saved = await markStravaDisconnected(user.id, 'user_disconnected', {
      supabase,
      clearTokens: true,
    })
    if (!saved) {
      return NextResponse.json({ error: d.auth.errorGeneric }, { status: 500 })
    }

    return NextResponse.json({ connectionState: 'disconnected', deauthorized })
  } catch (err) {
    console.error('[/api/strava/disconnect] 연결 끊기 오류:', err)
    return NextResponse.json({ error: d.auth.errorGeneric }, { status: 500 })
  }
}
