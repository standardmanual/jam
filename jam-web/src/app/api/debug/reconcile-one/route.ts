/**
 * TEMP — 특정 유저 1명에 대해 정합성 점검(reconcile)을 즉시 실행한다.
 * 이 세션의 조사·복구 작업 전용. 사용 후 즉시 제거할 것.
 */
import { NextResponse } from 'next/server'
import { reconcileStravaActivities } from '@/lib/strava/reconcile'

const TARGET_USER_ID = '3649ed39-2be2-402e-82ae-41e0cd328105'

export async function GET() {
  try {
    const result = await reconcileStravaActivities(TARGET_USER_ID)
    return NextResponse.json({ userId: TARGET_USER_ID, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
