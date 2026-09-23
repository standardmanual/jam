/**
 * 특일정보 API(공공데이터포털)로 오늘의 공휴일·기념일·24절기를 가져온다 (티켓 20260923_2254)
 * 참조: https://www.data.go.kr (한국천문연구원_특일 정보, SpcdeInfoService)
 *
 * 인증키(DATA_GO_KR_API_KEY) 미설정이나 호출 실패 시 빈 배열을 반환한다(오류를 던지지 않는다) —
 * 호출부는 기념일 세그먼트 태그만 빠뜨리고 카드 생성은 그대로 진행한다(graceful degradation).
 */

export type SpecialDayType = 'holiday' | 'anniversary' | 'seasonal'

export interface SpecialDay {
  name: string
  type: SpecialDayType
}

interface SpcdeInfoItem {
  dateName?: string
  locdate?: number | string
}

const SPCDE_BASE_URL = 'http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService'
const FETCH_TIMEOUT_MS = 8_000

// 공휴일 / 기념일 / 24절기 — 세 오퍼레이션을 모두 호출해 합친다
const ENDPOINTS: { operation: string; type: SpecialDayType }[] = [
  { operation: 'getRestDeInfo', type: 'holiday' },
  { operation: 'getAnniversaryInfo', type: 'anniversary' },
  { operation: 'get24DivisionsInfo', type: 'seasonal' },
]

function todayKstYmd(now: Date): { year: string; month: string; ymd: string } {
  const kst = new Date(now.getTime() + 9 * 3600_000)
  const year = String(kst.getUTCFullYear())
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kst.getUTCDate()).padStart(2, '0')
  return { year, month, ymd: `${year}${month}${day}` }
}

/** 공공데이터포털 응답의 item은 1건이면 객체, 여러 건이면 배열로 온다 — 배열로 정규화 */
function toItemArray(items: SpcdeInfoItem | SpcdeInfoItem[] | undefined): SpcdeInfoItem[] {
  if (!items) return []
  return Array.isArray(items) ? items : [items]
}

/**
 * 오늘 날짜(YYYYMMDD)에 해당하는 항목만 정규화한다.
 * (순수 함수 — 테스트 대상)
 */
export function normalizeSpecialDayItems(
  items: SpcdeInfoItem | SpcdeInfoItem[] | undefined,
  type: SpecialDayType,
  todayYmd: string
): SpecialDay[] {
  return toItemArray(items)
    .filter((item) => String(item.locdate ?? '') === todayYmd && item.dateName)
    .map((item) => ({ name: item.dateName as string, type }))
}

let cache: { date: string; value: SpecialDay[] } | null = null

async function fetchSpcdeOperation(
  operation: string,
  year: string,
  month: string
): Promise<SpcdeInfoItem | SpcdeInfoItem[] | undefined> {
  const apiKey = process.env.DATA_GO_KR_API_KEY
  if (!apiKey) throw new Error('DATA_GO_KR_API_KEY 미설정')

  const url =
    `${SPCDE_BASE_URL}/${operation}?serviceKey=${apiKey}` +
    `&solYear=${year}&solMonth=${month}&numOfRows=100&_type=json`

  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`특일정보 API 오류(${operation}): ${res.status}`)

  const json = await res.json()
  return json?.response?.body?.items?.item as SpcdeInfoItem | SpcdeInfoItem[] | undefined
}

/**
 * 오늘의 공휴일·기념일·24절기를 정규화해 반환한다. 인증키 미설정이나 호출 실패 시 빈 배열
 * (오류를 던지지 않는다). 세 오퍼레이션 중 일부만 실패해도 나머지는 반영된다.
 * 하루 단위 모듈 캐시 — 같은 날 재호출은 외부 API를 다시 부르지 않는다.
 */
export async function getTodaySpecialDays(): Promise<SpecialDay[]> {
  const now = new Date()
  const { year, month, ymd } = todayKstYmd(now)

  if (cache && cache.date === ymd) return cache.value

  const settled = await Promise.allSettled(
    ENDPOINTS.map(({ operation, type }) =>
      fetchSpcdeOperation(operation, year, month).then((items) => normalizeSpecialDayItems(items, type, ymd))
    )
  )

  const value = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  cache = { date: ymd, value }
  return value
}
