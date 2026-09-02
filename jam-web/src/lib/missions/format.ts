import type { MissionType } from '@/types/database'

/**
 * 미션 진행도 수치 표시 공통 포맷터 (티켓 20260902_0933)
 *
 * `progress_value`는 부동소수점 연산 오염값(예: 245.99999999999997)을 담을 수 있다
 * (DB 백필 전 로우, 또는 향후 재발). 화면마다 제각각 `toFixed`/`Math.floor`를 쓰던 것을
 * 하나로 통일한다 — `MissionDetailClient.tsx`의 기존 관례(거리는 소수 1자리, 그 외는 정수)를
 * 기준으로 삼는다.
 *
 * - distance(거리): 소수 1자리 (`toFixed(1)`)
 * - 그 외(activity_count·streak_days·duration_minutes·elevation_gain_m 등 정수형): 정수 (`Math.floor`)
 */
export function formatMissionProgress(value: number, missionType: MissionType | string): string {
  if (missionType === 'distance') return value.toFixed(1)
  return String(Math.floor(value))
}
