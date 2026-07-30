/**
 * strava_activities에 저장된 유저의 정규화 활동 이력 조회.
 * 배지/미션의 누적·기간 조건(주 N회, 연속 N일, 월 N km 등)을 "이번 동기화 배치"가
 * 아니라 실제 이력 전체 기준으로 평가하기 위한 소스.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedActivity } from '@/types/strava'
import type { StravaActivityRow } from '@/types/database'

export async function getActivityHistory(
  supabase: SupabaseClient,
  userId: string,
  sinceDate?: string
): Promise<NormalizedActivity[]> {
  let query = supabase
    .from('strava_activities')
    .select('normalized, start_date')
    .eq('user_id', userId)

  if (sinceDate) {
    query = query.gte('start_date', sinceDate)
  }

  const { data, error } = await query
  if (error) {
    console.error('[getActivityHistory] 조회 오류 — 빈 이력으로 폴백:', error)
    return []
  }

  return (data as Pick<StravaActivityRow, 'normalized' | 'start_date'>[])
    .map((row) => row.normalized as NormalizedActivity)
    .filter((a): a is NormalizedActivity => Boolean(a && a.stravaId))
}

/** 이력 + 이번 배치를 strava_id 기준으로 중복 없이 합친다 (배치가 아직 이력에 기록되기 전이므로 필요) */
export function mergeActivityHistory(
  history: NormalizedActivity[],
  batch: NormalizedActivity[]
): NormalizedActivity[] {
  const byId = new Map<number, NormalizedActivity>()
  for (const a of history) byId.set(a.stravaId, a)
  for (const a of batch) byId.set(a.stravaId, a) // 배치가 최신이므로 우선
  return Array.from(byId.values())
}
