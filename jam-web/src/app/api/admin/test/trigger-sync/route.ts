/**
 * 임시 테스트 엔드포인트 — 특정 유저 Strava 동기화 강제 실행
 * 사용 후 삭제 예정
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { syncStravaActivities } from '@/lib/strava/sync'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId 필수' }, { status: 400 })

  try {
    const result = await syncStravaActivities(userId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/trigger-sync] 오류:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
