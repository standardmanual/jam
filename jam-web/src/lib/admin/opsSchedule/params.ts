/**
 * 일정표(S4)의 주소 읽기와 기간 계산 (티켓 20261006_1536 ③-a, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4의 URL, 순수 함수 — DB 접근 없음).
 *
 * 쿼리: `view=week|month|timeline`(기본 week), `date=YYYY-MM-DD`(기본 오늘, 보기를 바꿔도 유지), 옛 `?week=`는 `date`가 없을 때만 읽는다(읽기 호환),
 * `kind`·`tribe`·`pattern`(여러 개), `sample=1`, `drawer=item|day`·`item`·`day`(기간 밖 날짜 서랍의 날짜). 서버 페이지의 `searchParams`와 클라이언트의 `URLSearchParams` 모두 읽는다.
 *
 * 잘못된 값은 기본값으로 떨어뜨린다(화면이 500이 되지 않게). `view`·`date`·`week`·`drawer`·`item`은 같은 키가 두 번 오면 「값 없음」으로 본다
 * (어느 쪽이 의도인지 알 수 없다 — `lib/searchParams.ts`와 같은 이유). 거르기 키는 여러 개가 정상이다.
 *
 * 기간(`periodOf`): 한 화면이 그리는 날짜 범위(KST, 양 끝 포함).
 * - 주간: 그 날짜가 속한 월~일.
 * - 월간: 그 달 1일이 속한 주의 월요일부터 그 달 말일이 속한 주의 일요일까지(월요일 시작 달력).
 * - 타임라인: 6주 창. 창의 시작은 월요일 기준 **4주 격자**에 고정한다(가정 9) — 같은 격자 칸 안의 날짜를 누르면 창이 흔들리지 않고, [‹ 4주]·[4주 ›]는 격자 한 칸씩 움직인다.
 */
import { mondayOfWeek } from '@/lib/admin/cronSchedule'
import { OPS_ITEM_KINDS } from '@/lib/admin/opsInbox/constants'
import { readIncludeSample, type SearchParamsSource } from '@/lib/admin/opsHome/links'
import { OPS_PATTERN_NO_PATTERN } from '@/lib/admin/opsPatterns/constants'
import { normalizeDateParam, shiftDateStr, todayKstDateString } from '@/lib/admin/today-calendar'

export const SCHEDULE_VIEWS = ['week', 'month', 'timeline'] as const
export type ScheduleView = (typeof SCHEDULE_VIEWS)[number]
export const SCHEDULE_DEFAULT_VIEW: ScheduleView = 'week'

/** 서랍 종류: 항목 서랍(`item`)·날짜 서랍(`day`). */
export const SCHEDULE_DRAWERS = ['item', 'day'] as const
export type ScheduleDrawerKind = (typeof SCHEDULE_DRAWERS)[number]

/** 타임라인 창의 길이(일, 6주)와 한 번에 움직이는 간격(일, 4주). */
export const TIMELINE_WINDOW_DAYS = 42
export const TIMELINE_STEP_DAYS = 28
/** 타임라인 4주 격자의 기준 월요일. 어느 월요일이어도 되지만 한 번 정하면 바꾸지 않는다(창 위치가 달라진다). */
const TIMELINE_GRID_ANCHOR = '2024-01-01'

export interface ScheduleParams {
  view: ScheduleView
  /** 기준일(KST `YYYY-MM-DD`). 날짜 서랍이 열리면 그 날짜이기도 하다. */
  date: string
  /** 종류 거르기. 허용된 종류만 남고 같은 값은 한 번만 둔다. */
  kinds: string[]
  /** 트라이브 거르기(소문자 ID). */
  tribes: string[]
  /** 패턴 거르기(`P01`~). */
  patterns: string[]
  drawer: ScheduleDrawerKind | null
  /** 항목 서랍이 가리키는 항목 키: 운영 항목 ID, 옛 카드 `card:<ID>`, 옛 미션 `mission:<ID>`. */
  item: string | null
  /**
   * 날짜 서랍이 가리키는 날짜(`day=YYYY-MM-DD`). 서랍을 연 날짜가 보이는 기간 밖(월간의 앞뒤 달 칸·타임라인 창 뒤쪽 칸)이라 `date`를 그 날짜로 바꾸면 새로고침 때 기간이 바뀔 때만 쓴다
   * (티켓 20261006_1539). 없으면 날짜 서랍은 `date`를 가리킨다. 날짜 서랍이 아니면 null이다.
   */
  drawerDate: string | null
  /** 시험 묶음을 포함해서 보는가(`?sample=1`). */
  includeSample: boolean
}

/** 같은 키가 여러 번 올 수 있는 값(거르기)까지 읽을 수 있는 쿼리 원천. */
type ScheduleQuerySource = SearchParamsSource | { getAll(name: string): string[] }

/** 값 하나. 같은 키가 두 번 이상 오면(배열·`getAll`이 둘 이상) 「값 없음」이다. */
function readSingle(source: ScheduleQuerySource, name: string): string | undefined {
  if (!source) return undefined
  if (typeof (source as { getAll?: unknown }).getAll === 'function') {
    const values = (source as { getAll(name: string): string[] }).getAll(name)
    return values.length === 1 ? values[0] : undefined
  }
  if (typeof (source as { get?: unknown }).get === 'function') {
    return (source as { get(name: string): string | null }).get(name) ?? undefined
  }
  const value = (source as Readonly<Record<string, string | readonly string[] | undefined>>)[name]
  return typeof value === 'string' ? value : undefined
}

/** 값 여러 개. 배열·`getAll`·단일 값을 모두 받아 문자열 목록으로 돌려준다. */
function readMany(source: ScheduleQuerySource, name: string): string[] {
  if (!source) return []
  if (typeof (source as { getAll?: unknown }).getAll === 'function') return (source as { getAll(name: string): string[] }).getAll(name)
  if (typeof (source as { get?: unknown }).get === 'function') {
    const value = (source as { get(name: string): string | null }).get(name)
    return value === null ? [] : [value]
  }
  const value = (source as Readonly<Record<string, string | readonly string[] | undefined>>)[name]
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
  return typeof value === 'string' ? [value] : []
}

const KNOWN_KINDS: ReadonlySet<string> = new Set(OPS_ITEM_KINDS)
const TRIBE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/
/** 항목 서랍 키: 운영 항목 ID(UUID) 또는 옛 카드·미션 `card:`·`mission:` 접두. */
const ITEM_KEY_PATTERN = /^(?:(?:card|mission):)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uniqueValid(values: readonly string[], accept: (value: string) => boolean, normalize: (value: string) => string = (value) => value): string[] {
  const result: string[] = []
  for (const raw of values) {
    const value = normalize(raw.trim())
    if (value !== '' && accept(value) && !result.includes(value)) result.push(value)
  }
  return result
}

/** `date`가 올바른 달력 날짜일 때만 그 값을, 아니면 undefined를 돌려준다(`normalizeDateParam`은 틀리면 오늘로 바꾸므로 같은지 대조한다). */
function validDate(raw: string | undefined, now: Date): string | undefined {
  if (raw === undefined) return undefined
  return normalizeDateParam(raw, now) === raw ? raw : undefined
}

/** 주소의 쿼리를 일정표 값으로 읽는다. 틀린 값은 기본값(주간 보기·오늘)으로 떨어진다. */
export function parseScheduleParams(source: ScheduleQuerySource, now: Date = new Date()): ScheduleParams {
  const viewRaw = readSingle(source, 'view')
  const view = (SCHEDULE_VIEWS as readonly string[]).includes(viewRaw ?? '') ? (viewRaw as ScheduleView) : SCHEDULE_DEFAULT_VIEW

  // 옛 `?week=`는 `date`가 없을 때(또는 틀렸을 때)만 읽고, 그 주의 월요일로 맞춘다.
  const explicitDate = validDate(readSingle(source, 'date'), now)
  const legacyWeek = validDate(readSingle(source, 'week'), now)
  const date = explicitDate ?? (legacyWeek ? mondayOfWeek(legacyWeek) : todayKstDateString(now))

  // 항목 서랍은 항목 키가 올바를 때만 열린다(틀린 키는 닫힌 것으로 본다). 날짜 서랍은 `date`만 있으면 된다.
  const drawerRaw = readSingle(source, 'drawer')
  const itemRaw = readSingle(source, 'item')?.trim()
  const item = itemRaw && ITEM_KEY_PATTERN.test(itemRaw) ? itemRaw : null
  const requested = (SCHEDULE_DRAWERS as readonly string[]).includes(drawerRaw ?? '') ? (drawerRaw as ScheduleDrawerKind) : null
  const drawer = requested === 'item' && item === null ? null : requested

  return {
    view,
    date,
    kinds: uniqueValid(readMany(source, 'kind'), (value) => KNOWN_KINDS.has(value)),
    tribes: uniqueValid(readMany(source, 'tribe'), (value) => TRIBE_ID_PATTERN.test(value), (value) => value.toLowerCase()),
    patterns: uniqueValid(readMany(source, 'pattern'), (value) => OPS_PATTERN_NO_PATTERN.test(value), (value) => value.toUpperCase()),
    drawer,
    item: drawer === 'item' ? item : null,
    drawerDate: drawer === 'day' ? (validDate(readSingle(source, 'day'), now) ?? null) : null,
    includeSample: readIncludeSample(source as SearchParamsSource),
  }
}

// ── 기간 ─────────────────────────────────────────────────────────────────────────────────────────

export interface SchedulePeriod {
  /** 첫 날(KST `YYYY-MM-DD`, 포함). */
  start: string
  /** 마지막 날(포함). */
  end: string
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** 한 화면이 그리는 날짜 범위. 월간은 월요일 시작 달력 전체(앞뒤 달의 날짜 포함)이고, 타임라인은 4주 격자에 고정한 6주 창이다. */
export function periodOf(view: ScheduleView, date: string): SchedulePeriod {
  if (view === 'week') {
    const start = mondayOfWeek(date)
    return { start, end: shiftDateStr(start, 6) }
  }
  if (view === 'month') {
    const [year, month] = date.split('-').map(Number)
    const first = `${year}-${String(month).padStart(2, '0')}-01`
    const last = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth(year, month)).padStart(2, '0')}`
    return { start: mondayOfWeek(first), end: shiftDateStr(mondayOfWeek(last), 6) }
  }
  const gridIndex = Math.floor(daysBetween(TIMELINE_GRID_ANCHOR, mondayOfWeek(date)) / TIMELINE_STEP_DAYS)
  const start = shiftDateStr(TIMELINE_GRID_ANCHOR, gridIndex * TIMELINE_STEP_DAYS)
  return { start, end: shiftDateStr(start, TIMELINE_WINDOW_DAYS - 1) }
}

/**
 * [‹]·[›]로 한 칸 움직인 기준일. 주간은 7일, 월간은 한 달(말일이 없는 달이면 그 달의 말일), 타임라인은 4주다.
 * `direction`은 -1(이전)·1(다음)이다.
 */
export function shiftPeriod(view: ScheduleView, date: string, direction: -1 | 1): string {
  if (view === 'week') return shiftDateStr(date, 7 * direction)
  if (view === 'timeline') return shiftDateStr(date, TIMELINE_STEP_DAYS * direction)
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + direction, 1))
  const targetYear = target.getUTCFullYear()
  const targetMonth = target.getUTCMonth() + 1
  const targetDay = Math.min(day, lastDayOfMonth(targetYear, targetMonth))
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`
}

/** 화면 머리의 기간 글자. 월간은 「2026년 10월」, 나머지는 「2026년 10월 5일 ~ 10월 11일」(해가 다르면 끝에도 해를 쓴다). */
export function formatPeriodLabel(view: ScheduleView, date: string): string {
  if (view === 'month') {
    const [year, month] = date.split('-').map(Number)
    return `${year}년 ${month}월`
  }
  const { start, end } = periodOf(view, date)
  const [y1, m1, d1] = start.split('-').map(Number)
  const [y2, m2, d2] = end.split('-').map(Number)
  return y1 === y2 ? `${y1}년 ${m1}월 ${d1}일 ~ ${m2}월 ${d2}일` : `${y1}년 ${m1}월 ${d1}일 ~ ${y2}년 ${m2}월 ${d2}일`
}
