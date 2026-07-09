/**
 * 수동/로그인 시점 동기화 API
 * POST /api/strava/sync
 *
 * 현재 유저의 Strava 활동을 즉시 동기화하고 배지를 평가합니다.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncStravaActivities } from '@/lib/strava/sync'

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  try {
    const result = await syncStravaActivities(user.id)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/strava/sync] 동기화 오류:', err)
    return NextResponse.json(
      { error: 'Strava 동기화 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
