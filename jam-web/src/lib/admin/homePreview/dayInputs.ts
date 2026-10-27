/**
 * 홈피드 미리보기가 그날 저장된 외부 입력(날씨·특일)을 읽는다 (티켓 20261026_2025 1회차, 서버 전용).
 *
 * 값 해석은 홈 조회 경로(`getTodayWeather`·`getTodaySpecialDays`)와 같다. 다른 점은 «오늘»이 아니라 고른 날짜의 저장값을 읽는다는 것과,
 * 저장값이 없을 때 «없음(null)»으로 돌려준다는 것이다 — 특일은 홈 조회가 빈 배열로 돌려주지만, 미리보기는 «특일 없음으로 저장된 날»과
 * «아직 저장되지 않은 날»(미래 날짜)을 구분해야 화면이 고르게 할 수 있다. 읽기 실패는 던지지 않고 저장 안 됨으로 본다.
 */
import { readDailyInput } from '@/lib/inputs/daily-store'
import { WEATHER_KINDS, type WeatherKind } from '@/lib/inputs/weather'
import { isSpecialDay, type SpecialDay } from '@/lib/inputs/holidays'

export interface DayInputs {
  /** 저장된 날씨 구분. 저장값이 없으면 null */
  weather: WeatherKind | null
  /** 저장된 특일 목록. 저장값이 없으면 null, «특일 없음»으로 저장된 날은 빈 배열 */
  specialDays: SpecialDay[] | null
  /** 날씨나 특일 중 하나라도 저장된 값이 있는가 */
  stored: boolean
}

/** `dateKst`: 'YYYY-MM-DD'(KST 달력 날짜) */
export async function readDayInputs(dateKst: string): Promise<DayInputs> {
  const [storedWeather, storedSpecial] = await Promise.all([
    readDailyInput('weather', dateKst),
    readDailyInput('special_days', dateKst),
  ])

  const kind =
    storedWeather && typeof storedWeather === 'object' && !Array.isArray(storedWeather) ? storedWeather.kind : null
  const weather = typeof kind === 'string' && WEATHER_KINDS.includes(kind) ? (kind as WeatherKind) : null
  const specialDays = Array.isArray(storedSpecial) ? (storedSpecial as unknown[]).filter(isSpecialDay) : null

  return { weather, specialDays, stored: weather !== null || specialDays !== null }
}
