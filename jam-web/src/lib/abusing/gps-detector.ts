/**
 * GPS 조작 감지
 * - 마지막 위치와 현재 위치의 이동 속도를 계산
 * - 정책의 gps_max_speed_kmh 초과 시 조작으로 판정
 *
 * 최소 이동거리 가드: 속도 = 거리/시간이라 두 요청이 짧은 시간 안에 연달아
 * 오면(연속 클릭, 실내 GPS 노이즈로 같은 자리에서도 좌표가 수십m씩 흔들림)
 * 이동거리가 몇 십m에 불과해도 시간이 1~2초면 계산상 속도가 수백km/h로
 * 튀어 오탐(false positive)이 난다. MIN_DISTANCE_KM 미만이면 애초에 "이동"으로
 * 보지 않고 검사를 건너뛴다 — 실제 텔레포트(수백m~수km 순간이동)만 잡아낸다.
 */
const MIN_DISTANCE_KM = 0.15 // 실내 GPS 오차 범위(수십~100m대) 감안한 최소 이동거리
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
  let result: GpsSpoofResult = { detected: false }

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

    if (distKm >= MIN_DISTANCE_KM && speedKmh > policy.gps_max_speed_kmh) {
      result = { detected: true, speedKmh: Math.round(speedKmh) }
    }
  }

  // 위치는 감지 여부와 무관하게 항상 갱신한다.
  // (예전엔 감지 시 업데이트를 건너뛰어서, 오탐으로 한 번 나쁜 좌표가 저장되면
  //  그 좌표가 영원히 기준점으로 남아 이후 모든 정상 시도까지 계속 오탐나는
  //  자가-고착 버그가 있었음 — 매번 최신 좌표로 갱신해 다음 판정은 항상
  //  "방금 요청"을 기준으로 하도록 함.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('users')
    .update({
      last_location_lat: lat,
      last_location_lng: lng,
      last_location_at: new Date(now).toISOString(),
    })
    .eq('id', userId)

  return result
}
