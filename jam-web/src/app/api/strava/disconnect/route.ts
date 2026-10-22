/**
 * Strava 연결 끊기 API
 * POST /api/strava/disconnect
 *
 * 로그인한 유저의 연결을 끊는다 (티켓 20261017_1422, 운영 로직 3.2절).
 * 1. Strava 쪽 앱 연결을 해제한다(`deauthorize`). 이미 무효한 토큰이면 실패해도 계속한다.
 * 2. 저장된 토큰을 지우고 `markStravaDisconnected(userId, 'user_disconnected')`로 끊김을 저장한다.
 * 3. 끊김이 저장되면 개인위치정보(좌표)를 지운다(`scrub_user_location`, 마이그레이션 265). 끊기를 위치정보 수집 동의 철회로 본다
 *    (운영 로직 3.2절, 티켓 20261021_1249 4회). 실패하면 한 번 더 부르고, 두 번 모두 실패해도 끊기는 성공이다(서버 로그에만 남긴다).
 *    끊김 저장이 실패했거나 이미 끊긴 연결에는 부르지 않는다. 끊긴 연결을 하루 한 번 쓸어 담는 파기는 후속 티켓 20261022_0500이다.
 *
 * 지금까지의 활동 기록·배지·잼·포인트는 건드리지 않는다. 지우는 좌표는 유저의 마지막 위치와 활동 기록 안의 시작·끝 좌표뿐이다. 연결 행이 없으면 404, 이미 끊긴 연결이면
 * 앱 해제를 부르지 않고 200으로 돌려준다(멱등).
 * 토큰 값은 로그에 남기지 않는다.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { deauthorizeStoredConnection } from '@/lib/strava/deauthorize-connection'
import { markStravaDisconnected } from '@/lib/strava/connection-write'
import { d } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * 마이그레이션 265의 `scrub_user_location`은 적용 뒤에 생성 타입(`database.generated.ts`)에 들어온다. 그 전에도 컴파일되도록
 * 이 호출 하나에 한해 좁은 구조 타입으로 부른다 — 생성 타입에 함수가 들어오면 이 캐스트를 지운다.
 */
type ScrubLocationClient = {
  rpc: (
    fn: 'scrub_user_location',
    args: { p_user_id: string }
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

const SCRUB_ATTEMPTS = 2

/**
 * 좌표 파기를 부른다. 실패하면 한 번 더 부르고, 두 번 모두 실패하면 false다. 던지지 않는다 — 호출한 쪽의 일(끊기)은 이미 끝났다.
 * 오류 원문은 서버 로그에만 남기고 응답에는 싣지 않는다.
 */
async function scrubLocationWithRetry(supabase: ServiceClient, userId: string): Promise<boolean> {
  const client = supabase as unknown as ScrubLocationClient
  for (let attempt = 1; attempt <= SCRUB_ATTEMPTS; attempt += 1) {
    try {
      const { error } = await client.rpc('scrub_user_location', { p_user_id: userId })
      if (!error) return true
      console.error(`[/api/strava/disconnect] 좌표 파기 실패 (${attempt}/${SCRUB_ATTEMPTS}):`, error.message)
    } catch (err) {
      console.error(
        `[/api/strava/disconnect] 좌표 파기 중 예외 (${attempt}/${SCRUB_ATTEMPTS}):`,
        err instanceof Error ? err.message : 'unknown'
      )
    }
  }
  return false
}

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

    // 동의 철회 — 좌표를 지운다. 두 번 실패해도 끊기는 성공이다(위에서 이미 저장됐다)
    await scrubLocationWithRetry(supabase, user.id)

    return NextResponse.json({ connectionState: 'disconnected', deauthorized })
  } catch (err) {
    console.error('[/api/strava/disconnect] 연결 끊기 오류:', err)
    return NextResponse.json({ error: d.auth.errorGeneric }, { status: 500 })
  }
}
