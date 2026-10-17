/**
 * 수동/로그인 시점 동기화 API
 * POST /api/strava/sync
 *
 * 현재 유저의 Strava 활동을 즉시 동기화하고 배지를 평가합니다.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncStravaActivities } from '@/lib/strava/sync'
import { StravaDisconnectedError } from '@/lib/strava/connection-state'
import { SyncPendingItemsError } from '@/lib/strava/pending-items'
import { SYNC_PENDING_ITEMS_CODE } from '@/lib/strava/pending-items-contract'
import { d } from '@/lib/i18n'

// 백필(최초 연동) 시 Strava Streams 조회 + 드랍/배지 평가로 수 초~수십 초가 걸릴 수 있어
// Vercel 기본 타임아웃(플랜별 10~15초)보다 넉넉한 실행 시간을 확보한다.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  try {
    const result = await syncStravaActivities(user.id)
    return NextResponse.json(result)
  } catch (err) {
    // 연결이 끊긴 상태는 서버 오류(500)가 아니라 구분되는 상태(409)로 알린다 — 화면(2회)이
    // `connectionState`로 다시 연결 안내를 고른다 (티켓 20261017_1422)
    if (err instanceof StravaDisconnectedError) {
      return NextResponse.json(
        { error: d.auth.stravaSyncError, code: 'strava_disconnected', connectionState: 'disconnected' },
        { status: 409 }
      )
    }
    // 고르지 않은 보류가 남아 있으면 가져오기·정산 없이 409로 알린다 — 화면(2회)이 고르기를 먼저 보여 준다 (티켓 20261017_1425)
    if (err instanceof SyncPendingItemsError) {
      return NextResponse.json(
        { error: d.syncPending.syncBlocked, code: SYNC_PENDING_ITEMS_CODE, pendingCount: err.pendingCount },
        { status: 409 }
      )
    }
    console.error('[/api/strava/sync] 동기화 오류:', err)
    return NextResponse.json(
      { error: d.auth.stravaSyncError },
      { status: 500 }
    )
  }
}
