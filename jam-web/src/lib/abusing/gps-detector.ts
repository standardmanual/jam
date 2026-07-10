/**
 * GPS 조작 감지
 * - 마지막 위치와 현재 위치의 이동 속도를 계산
 * - 정책의 gps_max_speed_kmh 초과 시 조작으로 판정
 */
import { createServiceClient } from '@/lib/supabase/server'
import { haversineDistance } from '@/lib/poi/proximity'
import type { AbusingPolicy } from './policy'

export interface GpsSpoofResult {
  detected: boolean
  speedKmh?: number
}

/**
 * 픽업/드랍 시 GPS 조작 여부 확인
 * 조작 미감지 시 마지막 위치를 업데이트한다.
 */
export async function checkAndUpdateLocation(
  userId: string,
  lat: number,
  lng: number,
  policy: AbusingPolicy
): Promise<GpsSpoofResult> {
  const supabase = createServiceClient()

  // 마지막 위치 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userRow } = await (supabase as any)
    .from('users')
    .select('last_location_lat, last_location_lng, last_location_at')
    .eq('id', userId)
    .single()

  const now = Date.now()

  if (
    userRow?.last_location_lat != null &&
    userRow?.last_location_lng != null &&
    userRow?.last_location_at != null
  ) {
    const distKm = haversineDistance(
      userRow.last_location_lat,
      userRow.last_location_lng,
      lat,
      lng
    )
    const elapsedHours = (now - new Date(userRow.last_location_at).getTime()) / 3_600_000
    const speedKmh = elapsedHours > 0 ? distKm / elapsedHours : 0

    if (speedKmh > policy.gps_max_speed_kmh) {
      return { detected: true, speedKmh: Math.round(speedKmh) }
    }
  }

  // 위치 업데이트
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('users')
    .update({
      last_location_lat: lat,
      last_location_lng: lng,
      last_location_at: new Date(now).toISOString(),
    })
    .eq('id', userId)

  return { detected: false }
}
