/**
 * 운영 홈·일정표의 이동 링크와 시험 묶음 표시 값 (티켓 20261006_1339 ②-a, 상위 20260930_1502 「②가 먼저 만들어 둘 공용」 (1)·(3)).
 *
 * 신호·이력·날짜 칸의 이동 링크는 **이 파일에서만** 만든다(채원 판정: 링크는 한 함수로만 만든다). 순수 함수라 서버·클라이언트 모두 불러온다.
 *
 * - 시험 묶음 포함 여부는 URL `?sample=1` 하나다(꺼짐이면 키가 없다, localStorage를 쓰지 않는다). 켜져 있으면 만든 링크에도 이어 붙인다.
 * - 이동 대상: 항목이 있으면 받은 기획함 상세의 그 항목(`/admin/ops-inbox/{묶음}?item={항목}`), 묶음만 있으면 그 기획 상세,
 *   날짜만 있으면 그날(`dayHref`), 셋 다 없으면 링크 없음(null)이다. 항목은 묶음이 있어야 열 수 있어 묶음 없는 항목은 날짜로 넘어간다.
 * - 날짜 링크는 일정표(③, `/admin/ops-schedule`)가 생기기 전까지 `/admin/today?date=`다. 일정표가 생기면 `dayHref` 한 곳만 바꾼다.
 */

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

export interface OpsLinkOptions {
  /** 시험 묶음을 포함해서 보는 중이면 링크에 `sample=1`을 이어 붙인다. */
  includeSample?: boolean
}

function finish(href: string, options: OpsLinkOptions): string {
  return options.includeSample ? withSampleParam(href, true) : href
}

/** 그 날짜로 가는 링크(KST 달력 날짜 `YYYY-MM-DD`). 일정표가 생기면(③) 이 함수의 대상만 바꾼다. */
export function dayHref(date: string, options: OpsLinkOptions = {}): string {
  return finish(`/admin/today?date=${encodeURIComponent(date)}`, options)
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

/**
 * 이동 대상 링크. 항목(+묶음) → 그 항목의 기획 상세, 묶음만 → 기획 상세, 날짜만 → `dayHref`, 아무것도 없으면 null이다.
 * 묶음과 날짜가 함께 있고 항목이 없으면 묶음이 먼저다(기획 상세가 더 구체적이다).
 */
export function opsTargetHref(target: OpsTarget, options: OpsLinkOptions = {}): string | null {
  if (present(target.bundleId)) return inboxHref(target.bundleId, present(target.itemId) ? target.itemId : null, options)
  if (present(target.date)) return dayHref(target.date, options)
  return null
}

/** 신호 결과 한 건의 이동 링크(`OpsSignalResult`의 `bundleId`·`itemId`·`date`만 읽는다). 링크가 없으면 null이다. */
export function signalResultHref(
  result: { bundleId: string | null; itemId: string | null; date: string | null },
  options: OpsLinkOptions = {}
): string | null {
  return opsTargetHref({ bundleId: result.bundleId, itemId: result.itemId, date: result.date }, options)
}
