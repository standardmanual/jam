/**
 * 운영 홈·일정표의 이동 링크와 시험 묶음 표시 값 (티켓 20261006_1339 ②-a, 상위 20260930_1502 「②가 먼저 만들어 둘 공용」 (1)·(3)).
 *
 * 신호·이력·날짜 칸의 이동 링크는 **이 파일에서만** 만든다(채원 판정: 링크는 한 함수로만 만든다). 순수 함수라 서버·클라이언트 모두 불러온다.
 *
 * - 시험 묶음 포함 여부는 URL `?sample=1` 하나다(꺼짐이면 키가 없다, localStorage를 쓰지 않는다). 켜져 있으면 만든 링크에도 이어 붙인다.
 * - 이동 대상: 항목이 있으면 받은 기획함 상세의 그 항목(`/admin/ops-inbox/{묶음}?item={항목}`), 묶음만 있으면 그 기획 상세,
 *   날짜만 있으면 그날(`dayHref`), 셋 다 없으면 링크 없음(null)이다. 항목은 묶음이 있어야 열 수 있어 묶음 없는 항목은 날짜로 넘어간다.
 * - 날짜 링크(`dayHref`)는 일정표(`/admin/ops-schedule?view=week&date=…&drawer=day`)의 그날 날짜 서랍이다(티켓 20261006_1539 ③-d).
 * - 일정표(S4) 링크는 `scheduleHref`·`scheduleHomeHref`에서만 만든다(티켓 20261006_1536 ③-a).
 */
import type { OpsInboxTab } from '@/lib/admin/opsInbox/bundleStatus'
import type { ScheduleDrawerKind, ScheduleView } from '@/lib/admin/opsSchedule/params'

/** 시험 묶음 포함 여부를 담는 쿼리 키. */
export const SAMPLE_PARAM = 'sample'
/** 시험 묶음을 포함할 때의 쿼리 값. */
export const SAMPLE_PARAM_ON = '1'

/** 쿼리를 읽을 수 있는 원천: 서버 페이지의 `searchParams`(값이 배열일 수 있다)와 클라이언트의 `URLSearchParams`. */
export type SearchParamsSource =
  | { get(name: string): string | null }
  | Readonly<Record<string, string | readonly string[] | undefined>>
  | null
  | undefined

function readParam(source: SearchParamsSource, name: string): string | null {
  if (!source) return null
  if (typeof (source as { get?: unknown }).get === 'function') return (source as { get(name: string): string | null }).get(name)
  const value = (source as Readonly<Record<string, string | readonly string[] | undefined>>)[name]
  if (Array.isArray(value)) return value[0] ?? null
  return typeof value === 'string' ? value : null
}

/** 시험 묶음을 포함해서 보는가. `?sample=1`일 때만 참이다(다른 값·키 없음은 거짓). */
export function readIncludeSample(source: SearchParamsSource): boolean {
  return readParam(source, SAMPLE_PARAM) === SAMPLE_PARAM_ON
}

/**
 * 경로(쿼리·해시를 가질 수 있다)에 `?sample=1`을 이어 붙이거나 뺀다. 다른 쿼리 키와 해시는 그대로 두고, 이미 있으면 한 번만 둔다.
 * `includeSample`이 거짓이면 `sample` 키를 지운다(꺼짐이면 키 자체가 없다).
 */
export function withSampleParam(href: string, includeSample: boolean): string {
  const hashAt = href.indexOf('#')
  const hash = hashAt === -1 ? '' : href.slice(hashAt)
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt)
  const queryAt = beforeHash.indexOf('?')
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)
  const params = new URLSearchParams(queryAt === -1 ? '' : beforeHash.slice(queryAt + 1))
  if (includeSample) params.set(SAMPLE_PARAM, SAMPLE_PARAM_ON)
  else params.delete(SAMPLE_PARAM)
  const query = params.toString()
  return `${path}${query ? `?${query}` : ''}${hash}`
}

/**
 * 현재 경로와 쿼리에서 시험 묶음 포함만 바꾼 이동 주소(시험 스위치가 `router.replace`에 넘긴다). `search`는 `?` 없이도 `?`가 붙어도 된다.
 * 다른 쿼리 키와 순서는 그대로 두고 `sample=1`만 붙이거나 뺀다.
 */
export function sampleToggleHref(pathname: string, search: string, includeSample: boolean): string {
  const query = search.startsWith('?') ? search.slice(1) : search
  return withSampleParam(query ? `${pathname}?${query}` : pathname, includeSample)
}

export interface OpsLinkOptions {
  /** 시험 묶음을 포함해서 보는 중이면 링크에 `sample=1`을 이어 붙인다. */
  includeSample?: boolean
}

function finish(href: string, options: OpsLinkOptions): string {
  return options.includeSample ? withSampleParam(href, true) : href
}

/** 그 날짜로 가는 링크(KST 달력 날짜 `YYYY-MM-DD`): 일정표의 주간 보기에서 그날의 날짜 서랍을 연다(티켓 20261006_1539 ③-d). */
export function dayHref(date: string, options: OpsLinkOptions = {}): string {
  return scheduleHref({ view: 'week', date, drawer: 'day' }, options)
}

/** 일정표(S4) 경로. 링크는 `scheduleHref`·`scheduleHomeHref`에서만 만든다(티켓 20261006_1536 ③-a). */
export const SCHEDULE_PATH = '/admin/ops-schedule'

/** 일정표 링크가 담는 값. 비어 있거나 없는 값은 쿼리에 넣지 않는다. */
export interface ScheduleHrefTarget {
  view?: ScheduleView
  /** 기준일(KST `YYYY-MM-DD`). 날짜 서랍(`drawer: 'day'`)이면 그 날짜다. */
  date?: string | null
  kinds?: readonly string[]
  tribes?: readonly string[]
  patterns?: readonly string[]
  drawer?: ScheduleDrawerKind | null
  /** 항목 서랍이 가리키는 항목 키(운영 항목 ID, `card:<ID>`, `mission:<ID>`). */
  item?: string | null
}

/**
 * 일정표 링크. 쿼리 순서는 `view`·`date`·`kind`·`tribe`·`pattern`·`drawer`·`item`·`sample`이다(같은 값은 늘 같은 글자라 새로고침·비교가 안정적이다).
 * `includeSample`이면 `sample=1`을 이어 붙인다 — 주 이동·보기 전환·서랍 열기 모두 시험 묶음 포함을 잃지 않는다.
 */
export function scheduleHref(target: ScheduleHrefTarget = {}, options: OpsLinkOptions = {}): string {
  const params = new URLSearchParams()
  if (target.view) params.set('view', target.view)
  if (target.date) params.set('date', target.date)
  for (const kind of target.kinds ?? []) params.append('kind', kind)
  for (const tribe of target.tribes ?? []) params.append('tribe', tribe)
  for (const pattern of target.patterns ?? []) params.append('pattern', pattern)
  if (target.drawer) params.set('drawer', target.drawer)
  if (target.item) params.set('item', target.item)
  const query = params.toString()
  return finish(query ? `${SCHEDULE_PATH}?${query}` : SCHEDULE_PATH, options)
}

/** 일정표 첫 화면 링크(운영 홈의 「일정표 보기」, 사이드바 「일정표」). 시험 묶음 포함만 이어 붙인다. */
export function scheduleHomeHref(options: OpsLinkOptions = {}): string {
  return scheduleHref({}, options)
}

/**
 * 받은 기획함 목록 링크. `tab`을 주면 그 상태 탭이 열린다(운영 홈의 「받은 기획함에서 결정하기」는 `decide`). 티켓 20261006_1340 ②-b가 더했다.
 * 운영 홈의 링크도 이 파일에서만 만든다.
 */
export function inboxListHref(options: OpsLinkOptions & { tab?: OpsInboxTab } = {}): string {
  const base = '/admin/ops-inbox'
  return finish(options.tab ? `${base}?tab=${encodeURIComponent(options.tab)}` : base, options)
}

/** 받은 기획함 상세 링크. 항목을 주면 그 항목이 선택된 채로 열린다. */
function inboxHref(bundleId: string, itemId: string | null, options: OpsLinkOptions): string {
  const base = `/admin/ops-inbox/${encodeURIComponent(bundleId)}`
  return finish(itemId ? `${base}?item=${encodeURIComponent(itemId)}` : base, options)
}

export interface OpsTarget {
  bundleId?: string | null
  itemId?: string | null
  date?: string | null
}

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** 이동 대상의 종류: 받은 기획함 상세(`inbox`), 그날(`day`). 갈 곳이 없으면 null이다. 링크 글자를 정할 때 쓴다(`opsTargetHref`와 같은 판정). */
export function opsTargetKind(target: OpsTarget): 'inbox' | 'day' | null {
  if (present(target.bundleId)) return 'inbox'
  if (present(target.date)) return 'day'
  return null
}

/**
 * 이동 대상 링크. 항목(+묶음) → 그 항목의 기획 상세, 묶음만 → 기획 상세, 날짜만 → `dayHref`, 아무것도 없으면 null이다.
 * 묶음과 날짜가 함께 있고 항목이 없으면 묶음이 먼저다(기획 상세가 더 구체적이다).
 */
export function opsTargetHref(target: OpsTarget, options: OpsLinkOptions = {}): string | null {
  const kind = opsTargetKind(target)
  if (kind === 'inbox') return inboxHref(target.bundleId as string, present(target.itemId) ? target.itemId : null, options)
  if (kind === 'day') return dayHref(target.date as string, options)
  return null
}

/** 신호 결과 한 건의 이동 링크(`OpsSignalResult`의 `bundleId`·`itemId`·`date`만 읽는다). 링크가 없으면 null이다. */
export function signalResultHref(
  result: { bundleId: string | null; itemId: string | null; date: string | null },
  options: OpsLinkOptions = {}
): string | null {
  return opsTargetHref({ bundleId: result.bundleId, itemId: result.itemId, date: result.date }, options)
}
