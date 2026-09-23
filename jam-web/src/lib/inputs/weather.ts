/**
 * 기상청 API 허브 단기예보로 오늘 날씨 구분을 가져온다 (티켓 20260923_2254)
 * 참조: https://apihub.kma.go.kr (단기예보 조회서비스 getVilageFcst)
 *
 * 1단계는 서울(시청) 기준 고정 격자좌표만 조회한다 — 지역 확장은 후속.
 * 인증키(KMA_API_KEY) 미설정이나 호출 실패 시 null을 반환한다(오류를 던지지 않는다) —
 * 호출부는 날씨 세그먼트 태그만 빠뜨리고 카드 생성은 그대로 진행한다(graceful degradation).
 */

export type WeatherKind = 'clear' | 'mild' | 'rain' | 'extreme'

interface KmaForecastItem {
  category: string
  fcstDate: string
  fcstValue: string
}

const KMA_BASE_URL = 'https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst'
const FETCH_TIMEOUT_MS = 8_000

// 서울 시청 기준 기상청 격자좌표(1단계 — 지역 확장은 후속)
const SEOUL_NX = 60
const SEOUL_NY = 127

// 기상청 특보 발령 기준(폭염주의보: 일 최고기온 33도 이상 / 한파주의보 완화 기준: 일 최저기온
// -12도 이하)을 "극한" 판정 임계값으로 준용한다.
const EXTREME_HIGH_C = 33
const EXTREME_LOW_C = -12

// 단기예보 발표시각(매시 10분 이후 제공)
const BASE_TIMES = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300']

function todayKstParts(now: Date): { ymd: string; hour: number; minute: number } {
  const kst = new Date(now.getTime() + 9 * 3600_000)
  const ymd = `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}${String(kst.getUTCDate()).padStart(2, '0')}`
  return { ymd, hour: kst.getUTCHours(), minute: kst.getUTCMinutes() }
}

/**
 * 단기예보 발표주기(02·05·08·11·14·17·20·23시, 매시 10분 이후 제공)에 맞춰 가장 최근
 * base_date/base_time을 구한다. 자정~02:10 사이는 전날 23시 발표분을 쓴다.
 * (순수 함수 — 테스트 대상)
 */
export function latestKmaBaseTime(now: Date): { baseDate: string; baseTime: string } {
  const { ymd, hour, minute } = todayKstParts(now)
  const nowMinutes = hour * 60 + minute

  const candidate = [...BASE_TIMES].reverse().find((bt) => {
    const btMinutes = parseInt(bt.slice(0, 2), 10) * 60 + parseInt(bt.slice(2), 10) + 10
    return nowMinutes >= btMinutes
  })
  if (candidate) return { baseDate: ymd, baseTime: candidate }

  const yesterday = new Date(now.getTime() + 9 * 3600_000 - 24 * 3600_000)
  const yYmd = `${yesterday.getUTCFullYear()}${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}${String(yesterday.getUTCDate()).padStart(2, '0')}`
  return { baseDate: yYmd, baseTime: '2300' }
}

/**
 * 단기예보 항목들에서 오늘(todayYmd) 날씨 구분을 판정한다.
 * 강수형태(PTY)가 있으면 rain, 기온이 극값을 넘으면 extreme, 하늘상태(SKY)가 맑음이면 clear,
 * 그 외(구름많음·흐림 등)는 mild. (순수 함수 — 테스트 대상)
 */
export function normalizeWeatherItems(items: KmaForecastItem[], todayYmd: string): WeatherKind {
  const todays = items.filter((item) => item.fcstDate === todayYmd)

  const hasRain = todays.some((item) => item.category === 'PTY' && item.fcstValue !== '0')
  if (hasRain) return 'rain'

  const temps = todays
    .filter((item) => item.category === 'TMP' || item.category === 'TMX' || item.category === 'TMN')
    .map((item) => parseFloat(item.fcstValue))
    .filter((v) => !Number.isNaN(v))
  if (temps.length > 0) {
    const max = Math.max(...temps)
    const min = Math.min(...temps)
    if (max >= EXTREME_HIGH_C || min <= EXTREME_LOW_C) return 'extreme'
  }

  const sky = todays.find((item) => item.category === 'SKY')?.fcstValue
  if (sky === '1') return 'clear'

  return 'mild'
}

let cache: { date: string; value: WeatherKind | null } | null = null

async function fetchKmaForecast(): Promise<KmaForecastItem[]> {
  const authKey = process.env.KMA_API_KEY
  if (!authKey) throw new Error('KMA_API_KEY 미설정')

  const { baseDate, baseTime } = latestKmaBaseTime(new Date())
  const url =
    `${KMA_BASE_URL}?pageNo=1&numOfRows=1000&dataType=JSON` +
    `&base_date=${baseDate}&base_time=${baseTime}&nx=${SEOUL_NX}&ny=${SEOUL_NY}&authKey=${authKey}`

  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`기상청 단기예보 API 오류: ${res.status}`)

  const json = await res.json()
  const items = json?.response?.body?.items?.item
  if (!Array.isArray(items)) throw new Error('기상청 단기예보 응답 형식 오류')
  return items as KmaForecastItem[]
}

/**
 * 오늘 날씨 구분을 반환한다. 인증키 미설정이나 호출 실패 시 null(오류를 던지지 않는다).
 * 하루 단위 모듈 캐시 — 같은 날 재호출은 외부 API를 다시 부르지 않는다.
 */
export async function getTodayWeather(): Promise<WeatherKind | null> {
  const now = new Date()
  const { ymd } = todayKstParts(now)

  if (cache && cache.date === ymd) return cache.value

  let value: WeatherKind | null
  try {
    const items = await fetchKmaForecast()
    value = normalizeWeatherItems(items, ymd)
  } catch {
    value = null
  }

  cache = { date: ymd, value }
  return value
}
