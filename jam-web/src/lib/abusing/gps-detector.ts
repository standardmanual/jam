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
 *
 * 최소 경과시간 가드: 앱 재실행 등으로 GPS를 다시 수신하는 순간, 실내·고층
 * 밀집 지역에서는 좌표 자체가 150m 이상 튀는 경우가 흔하다. 이때 직전 기록과
 * 현재 요청 사이 시간이 짧으면(수 초 이내) MIN_DISTANCE_KM 가드를 넘는 거리라도
 * "거리/시간"이 비현실적인 속도로 계산돼 오탐이 난다. MIN_ELAPSED_SECONDS 미만
 * 간격이면 GPS 재수신 노이즈로 보고 속도/누적거리 판정을 건너뛴다.
 */
const MIN_DISTANCE_KM = 0.15 // 실내 GPS 오차 범위(수십~100m대) 감안한 최소 이동거리
const MIN_ELAPSED_SECONDS = 5 // GPS 재수신 시 좌표 튐을 감안한 최소 경과시간
import { createServiceClient } from '@/lib/supabase/server'
import { haversineDistance } from '@/lib/poi/proximity'
import type { AbusingPolicy } from './policy'
import type { UserRow } from '@/types/database'
import type { Database } from '@/types/database.generated'

type UsersUpdate = Database['public']['Tables']['users']['Update']

type LocationFields = Pick<
  UserRow,
  'last_location_lat' | 'last_location_lng' | 'last_location_at' | 'gps_daily_distance_km' | 'gps_daily_distance_date'
>

export interface GpsSpoofResult {
  detected: boolean
  speedKmh?: number
  reason?: 'speed' | 'daily_distance'
  dailyDistanceKm?: number
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

  // 마지막 위치 + 오늘의 누적 이동거리 조회
  const { data: userRow } = await supabase
    .from('users')
    .select('last_location_lat, last_location_lng, last_location_at, gps_daily_distance_km, gps_daily_distance_date')
    .eq('id', userId)
    .single<LocationFields>()

  const now = Date.now()
  const todayStr = new Date(now).toISOString().slice(0, 10) // UTC 날짜 기준 (충분한 근사치)
  let result: GpsSpoofResult = { detected: false }

  // 날짜가 바뀌었으면 누적치를 리셋한다.
  let dailyDistanceKm =
    userRow?.gps_daily_distance_date === todayStr ? (userRow?.gps_daily_distance_km ?? 0) : 0

  if (
    userRow?.last_location_lat != null &&
    userRow?.last_location_lng != null &&
    userRow?.last_location_at != null
  ) {
    // haversineDistance()는 **미터** 단위를 반환한다 (matcher.ts EARTH_RADIUS_M 참고,
    // isUserNearPoi 등 다른 모든 호출부는 미터로 취급한다). 여기서만 반환값을 그대로
    // "distKm"에 담아 km로 취급해 왔다 — 실제로는 미터 값이 1000배 부풀려진 채로
    // 속도(km/h)·누적거리(km) 계산에 들어가, 임계값이 사실상 300km/h→0.3km/h,
    // 3000km/일→3km/일, 최소이동거리 150m→15cm 수준으로 작동하고 있었다. 정상적인
    // 하루 이동(도보로 여러 POI를 오가는 수 km 수준)만으로도 누적거리 캡을 상시
    // 초과해 오탐이 났다 (티켓 20260831_1504, 실측 daily_distance_km 7173/7219가
    // 정확히 그날 실제 누적 이동거리 7.173km/7.219km를 미터로 읽은 값과 일치).
    const distMeters = haversineDistance(
      userRow.last_location_lat,
      userRow.last_location_lng,
      lat,
      lng
    )
    const distKm = distMeters / 1000
    const elapsedMs = now - new Date(userRow.last_location_at).getTime()
    const elapsedHours = elapsedMs / 3_600_000
    const speedKmh = elapsedHours > 0 ? distKm / elapsedHours : 0

    if (distKm >= MIN_DISTANCE_KM && elapsedMs >= MIN_ELAPSED_SECONDS * 1000) {
      if (speedKmh > policy.gps_max_speed_kmh) {
        result = { detected: true, speedKmh: Math.round(speedKmh), reason: 'speed' }
      }

      // 하루 누적 이동거리 상한 — 매 구간 속도는 임계값을 넘지 않게 시간 간격을
      // 두고 좌표를 옮기는 "느린 텔레포트"는 순간 속도 체크를 통과하지만, 하루
      // 동안의 총 이동거리를 보면 비현실적인 값이 누적된다. 이 패턴을 잡아낸다.
      dailyDistanceKm += distKm
      if (!result.detected && dailyDistanceKm > policy.gps_daily_distance_cap_km) {
        result = {
          detected: true,
          speedKmh: Math.round(speedKmh),
          reason: 'daily_distance',
          dailyDistanceKm: Math.round(dailyDistanceKm),
        }
      }
    }
  }

  // 위치·누적 이동거리는 감지 여부와 무관하게 항상 갱신한다.
  // (예전엔 감지 시 업데이트를 건너뛰어서, 오탐으로 한 번 나쁜 좌표가 저장되면
  //  그 좌표가 영원히 기준점으로 남아 이후 모든 정상 시도까지 계속 오탐나는
  //  자가-고착 버그가 있었음 — 매번 최신 좌표로 갱신해 다음 판정은 항상
  //  "방금 요청"을 기준으로 하도록 함.)
  // 생성 타입(users.Update)을 쓴다. 수기 UserRow는 gps_daily_distance_km를 `number | null`로
  // 적고 있지만 DB 컬럼은 NOT NULL이라 Partial<LocationFields>로는 타입이 맞지 않는다
  // (티켓 20260831_1213에서 드러난 수기 타입 드리프트 — 수기 타입 교정은 별도 작업).
  const locationUpdate: Pick<
    UsersUpdate,
    'last_location_lat' | 'last_location_lng' | 'last_location_at' | 'gps_daily_distance_km' | 'gps_daily_distance_date'
  > = {
    last_location_lat: lat,
    last_location_lng: lng,
    last_location_at: new Date(now).toISOString(),
    gps_daily_distance_km: dailyDistanceKm,
    gps_daily_distance_date: todayStr,
  }
  const usersTable = supabase.from('users')
  await usersTable.update(locationUpdate).eq('id', userId)

  return result
}
