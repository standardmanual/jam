/**
 * TEMP — 단발성 소급 백필. 특정 유저의 놓친 활동 1건을 배지/드랍 엔진에 재투입한다.
 * 이 세션의 조사·복구 작업 전용. 사용 후 즉시 제거할 것.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/utils'
import { getActivityById } from '@/lib/strava/api'
import { getProcessedStravaIds, processFetchedActivities } from '@/lib/strava/sync'
import type { StravaConnectionRow } from '@/types/database'
import type { StravaSummaryActivity } from '@/types/strava'

const TARGET_USER_ID = '3649ed39-2be2-402e-82ae-41e0cd328105'
const TARGET_ACTIVITY_ID = 19529880923

export async function GET() {
  const supabase = createServiceClient()

  const { data: connectionRaw, error: connError } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('user_id', TARGET_USER_ID)
    .single()

  const connection = connectionRaw as StravaConnectionRow | null
  if (connError || !connection) {
    return NextResponse.json({ error: '연동 정보 없음' }, { status: 404 })
  }

  const accessToken = await decrypt(connection.access_token)

  const alreadyProcessed = await getProcessedStravaIds(supabase, TARGET_USER_ID, [TARGET_ACTIVITY_ID])
  if (alreadyProcessed.has(TARGET_ACTIVITY_ID)) {
    return NextResponse.json({ message: '이미 처리됨 — 스킵' })
  }

  const activity = await getActivityById(TARGET_ACTIVITY_ID, accessToken)
  if ('error' in activity) {
    return NextResponse.json({ error: activity.error, status: activity.status }, { status: 502 })
  }

  const result = await processFetchedActivities(
    supabase,
    TARGET_USER_ID,
    accessToken,
    [activity as StravaSummaryActivity],
    false,
    'manual_backfill'
  )

  return NextResponse.json({ processed: true, activityId: TARGET_ACTIVITY_ID, result })
}
