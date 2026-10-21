/**
 * Strava 연결 끊기 API
 * POST /api/strava/disconnect
 *
 * 로그인한 유저의 연결을 끊는다 (티켓 20261017_1422, 운영 로직 3.2절).
 * 1. Strava 쪽 앱 연결을 해제한다(`deauthorize`). 이미 무효한 토큰이면 실패해도 계속한다.
 * 2. 저장된 토큰을 지우고 `markStravaDisconnected(userId, 'user_disconnected')`로 끊김을 저장한다.
 *
 * 지금까지의 활동 기록·배지·잼·포인트는 건드리지 않는다. 연결 행이 없으면 404, 이미 끊긴 연결이면
 * 앱 해제를 부르지 않고 200으로 돌려준다(멱등).
 * 토큰 값은 로그에 남기지 않는다.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { deauthorizeStoredConnection } from '@/lib/strava/deauthorize-connection'
import { markStravaDisconnected } from '@/lib/strava/connection-write'
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
      .select('access_token, refresh_token, token_expires_at, disconnected_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (connError) {
      console.error('[/api/strava/disconnect] 연결 조회 오류:', connError)
      return NextResponse.json({ error: d.auth.errorGeneric }, { status: 500 })
    }
    if (!connection) {
      return NextResponse.json({ error: d.auth.stravaNotConnectedTitle }, { status: 404 })
    }

    // 이미 끊긴 연결 — 앱 해제를 다시 부르지 않고 성공으로 돌려준다(멱등). 끊김 시각·사유를
    // 덮어쓰지 않는다(티켓 20261017_1422 서버 보정 c). 화면이 이중 클릭이나 다른 기기의 끊기를 성공으로 처리한다.
    if (connection.disconnected_at) {
      return NextResponse.json({ connectionState: 'disconnected', deauthorized: false, alreadyDisconnected: true })
    }

    // Strava 앱 연결 해제 — 실패해도 이쪽 연결은 끊는다(이미 철회됐거나 토큰이 무효인 경우).
    // 갱신·해제·로그는 계정 삭제와 같이 쓰는 공용 함수가 맡는다(던지지 않는다).
    const deauthorized = await deauthorizeStoredConnection(connection, { userId: user.id })

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
