/**
 * 홈피드 미리보기 화면의 순수 로직 (티켓 20261026_2025 2회차). 부품 `HomePreviewPanel`·`HomePreviewWeekStrip`·`HomePreviewConditions`가 함께 쓴다.
 *
 * 클라이언트에서 쓰므로 서버 전용 모듈을 읽지 않는다 — 서버 모듈(`load.ts` 등)은 `import type`으로 타입만 가져온다.
 * 저장소에 jsdom이 없어(`vitest.config.ts` `environment: 'node'`) 요청 주소 만들기·응답 읽기·표시 값 계산을 여기 순수 함수로 두고 시험한다.
 */
import type { DayPreview } from '@/lib/admin/homePreview/load'
import type { TimeOfDayTag } from '@/lib/today/exposure'
import type { WeatherKind } from '@/lib/inputs/weather'
import type { SpecialDayTag } from '@/lib/inputs/special-days-config'
import { FEED_TYPE_LABELS } from '@/lib/admin/feedTypeLabels'
import type { FeedType } from '@/lib/today/feedChipSlots'

export type { DayPreview, PreviewEntry } from '@/lib/admin/homePreview/load'

/** API가 7일을 넘기지 않는다(`GET /api/admin/home-preview`의 days 상한) */
export const PREVIEW_DAYS = 7

export const TIME_OPTIONS: readonly { value: TimeOfDayTag; label: string }[] = [
  { value: 'time_dawn', label: '새벽' },
  { value: 'time_morning', label: '아침' },
  { value: 'time_afternoon', label: '낮' },
  { value: 'time_evening', label: '저녁' },
  { value: 'time_night', label: '밤' },
]

export const WEATHER_OPTIONS: readonly { value: WeatherKind; label: string }[] = [
  { value: 'clear', label: '맑음' },
  { value: 'mild', label: '흐림' },
  { value: 'rain', label: '비' },
  { value: 'extreme', label: '극단' },
]

export const SPECIAL_OPTIONS: readonly { value: SpecialDayTag; label: string }[] = [
  { value: 'holiday_today', label: '공휴일' },
  { value: 'seasonal_today', label: '절기' },
  { value: 'anniversary_today', label: '기념일' },
]

/**
 * 카드 유형 이름과 막대의 회색 농도(유형마다 달라 범례 없이 `title` 툴팁으로 읽는다). 키는 새 8유형이고(티켓 20261122_1239) 이름은 어드민 카드 폼과 같은 `FEED_TYPE_LABELS`다.
 * 순서는 막대 조각의 순서다: 커버 이미지를 쓰는 유형이 앞(연한 쪽), 이미지 없는 유형이 뒤(진한 쪽).
 */
export const SHAPE_STYLES: Record<FeedType, { label: string; barClass: string }> = {
  hero_box: { label: FEED_TYPE_LABELS.hero_box, barClass: 'bg-neutral-200' },
  collection_intro: { label: FEED_TYPE_LABELS.collection_intro, barClass: 'bg-neutral-300' },
  full_image: { label: FEED_TYPE_LABELS.full_image, barClass: 'bg-neutral-400' },
  text_box: { label: FEED_TYPE_LABELS.text_box, barClass: 'bg-neutral-500' },
  badge_intro: { label: FEED_TYPE_LABELS.badge_intro, barClass: 'bg-neutral-600' },
  badge_only: { label: FEED_TYPE_LABELS.badge_only, barClass: 'bg-neutral-700' },
  drop_pickup: { label: FEED_TYPE_LABELS.drop_pickup, barClass: 'bg-neutral-800' },
  gallery_list: { label: FEED_TYPE_LABELS.gallery_list, barClass: 'bg-neutral-900' },
}

export const STORED_LABEL = '저장된 값'

export interface HomePreviewConditions {
  /** 비우면(null) 트라이브 없음 */
  tribeId: string | null
  timeOfDay: TimeOfDayTag
  /** 'stored'면 그날 저장된 날씨를 쓴다 */
  weather: 'stored' | WeatherKind
  /** 'stored'면 그날 저장된 특일을 쓴다. 빈 배열이면 특일 없음 */
  special: 'stored' | SpecialDayTag[]
  newUser: boolean
}

export const DEFAULT_CONDITIONS: HomePreviewConditions = {
  tribeId: null,
  timeOfDay: 'time_morning',
  weather: 'stored',
  special: 'stored',
  newUser: false,
}

export interface HomePreviewTribe {
  id: string
  name: string
}

export interface HomePreviewResponse {
  days: DayPreview[]
  tribes: HomePreviewTribe[]
}

/** `GET /api/admin/home-preview`의 쿼리 문자열(앞의 `?` 없이). 같은 입력은 늘 같은 문자열이다. */
export function buildHomePreviewQuery(params: {
  date: string
  days?: number
  conditions: HomePreviewConditions
  bundleId?: string | null
}): string {
  const { date, conditions, bundleId } = params
  const q = new URLSearchParams()
  q.set('date', date)
  q.set('days', String(params.days ?? PREVIEW_DAYS))
  if (conditions.tribeId) q.set('tribe', conditions.tribeId)
  q.set('time', conditions.timeOfDay)
  if (conditions.weather !== 'stored') q.set('weather', conditions.weather)
  if (conditions.special !== 'stored') q.set('special', conditions.special.length > 0 ? conditions.special.join(',') : 'none')
  if (conditions.newUser) q.set('newUser', '1')
  if (bundleId) q.set('bundle', bundleId)
  return q.toString()
}

/** 미리보기를 읽는다. 응답이 성공이 아니거나 모양이 틀리면 던진다 — 호출부가 한 줄 오류와 「다시 불러오기」로 바꾼다. */
export async function fetchHomePreview(
  query: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<HomePreviewResponse> {
  const doFetch = options.fetchImpl ?? fetch
  const res = await doFetch(`/api/admin/home-preview?${query}`, { signal: options.signal, cache: 'no-store' })
  if (!res.ok) throw new Error(`홈피드 미리보기 응답 ${res.status}`)
  const json = (await res.json()) as Partial<HomePreviewResponse> | null
  if (!json || !Array.isArray(json.days) || !Array.isArray(json.tribes)) throw new Error('홈피드 미리보기 응답 모양이 달라요')
  return { days: json.days, tribes: json.tribes }
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** 'YYYY-MM-DD' → 칸 머리에 쓰는 요일·날짜. 예: `{ weekday: '월', monthDay: '10/5' }` */
export function dayCellLabel(date: string): { weekday: string; monthDay: string } {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  return { weekday: WEEKDAYS[dt.getUTCDay()], monthDay: `${m}/${d}` }
}

/** 칸 막대의 조각: 유형 순서대로(`SHAPE_STYLES` 키 순서), 개수가 0보다 큰 유형만. 표에 없는 유형(옛 응답)은 키 이름 그대로 뒤에 묶는다 */
export function shapeSegments(shapeCounts: Record<string, number>): { shape: string; count: number; label: string; barClass: string }[] {
  const known = (Object.keys(SHAPE_STYLES) as FeedType[]).filter((shape) => (shapeCounts[shape] ?? 0) > 0)
  const unknown = Object.keys(shapeCounts).filter((shape) => !(shape in SHAPE_STYLES) && shapeCounts[shape] > 0)
  return [
    ...known.map((shape) => ({ shape, count: shapeCounts[shape], ...SHAPE_STYLES[shape] })),
    ...unknown.map((shape) => ({ shape, count: shapeCounts[shape], label: shape, barClass: 'bg-neutral-500' })),
  ]
}

/** 막대 조각의 툴팁: 「히어로 2장」 */
export function segmentTitle(segment: { label: string; count: number }): string {
  return `${segment.label} ${segment.count}장`
}

/** 저장된 값을 쓰기로 했는데 그날 저장된 값이 없는 항목 이름들(미래 날짜). 화면이 「저장된 값이 없어요」 한 줄로 알린다. */
export function missingStoredInputs(day: DayPreview | undefined, conditions: HomePreviewConditions): string[] {
  if (!day) return []
  const missing: string[] = []
  if (conditions.weather === 'stored' && day.inputs.weather === null) missing.push('날씨')
  if (conditions.special === 'stored' && day.inputs.specialDays === null) missing.push('특일')
  return missing
}

export function weatherLabel(weather: WeatherKind | null): string | null {
  return WEATHER_OPTIONS.find((option) => option.value === weather)?.label ?? null
}
