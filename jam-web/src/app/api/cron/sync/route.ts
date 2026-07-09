/**
 * Vercel Cron 정기 동기화 엔드포인트
 * GET /api/cron/sync
 *
 * vercel.json에서 매일 12:00 UTC (21:00 KST) 자동 호출
 * Authorization: Bearer {CRON_SECRET} 헤더 필요
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { syncStravaActivities } from '@/lib/strava/sync'
import type { StravaConnectionRow } from '@/types/database'

export async function GET(request: NextRequest) {
  // CRON_SECRET 검증
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[cron/sync] CRON_SECRET 환경변수 미설정')
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: '인증 오류' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // 전체 Strava 연동 유저 조회
  const { data: connectionsRaw, error: connError } = await supabase
    .from('strava_connections')
    .select('user_id')

  const connections = connectionsRaw as Pick<StravaConnectionRow, 'user_id'>[] | null

  if (connError) {
    console.error('[cron/sync] 연동 유저 조회 오류:', connError)
    return NextResponse.json({ error: 'DB 조회 오류' }, { status: 500 })
  }

  if (!connections || connections.length === 0) {
    return NextResponse.json({ message: '동기화할 유저 없음', totalUsers: 0, totalSynced: 0, totalBadges: 0 })
  }

  // 각 유저 순차 동기화 (Rate limit 대응)
  let totalSynced = 0
  let totalBadges = 0
  const errors: string[] = []

  for (const conn of connections) {
    try {
      const result = await syncStravaActivities(conn.user_id)
      totalSynced += result.synced
      totalBadges += result.badges
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron/sync] userId ${conn.user_id} 동기화 실패:`, msg)
      errors.push(conn.user_id)
    }
  }

  console.info(`[cron/sync] 완료 — 유저: ${connections.length}, 활동: ${totalSynced}, 배지: ${totalBadges}, 오류: ${errors.length}`)

  return NextResponse.json({
    totalUsers: connections.length,
    totalSynced,
    totalBadges,
    errors: errors.length > 0 ? errors : undefined,
  })
}
