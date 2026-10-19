/**
 * JAM! 행동 지표 계산 — 체크인 새 지표 2종 (서버 사이드 전용, 티켓 20261019_0542 2회, 마이그레이션 247)
 *
 *  - `new_checkin_badge_count`: 새로 받은 체크인 배지의 서로 다른 종류 수 (5-1 처음 가 본 동네, 5-4 가입 뒤 첫 체크인 배지는 값 1)
 *  - `checkin_season_year_count`: 달력 연도(KST) 안에 네 계절 모두에서 새 체크인 배지를 받은 해의 수 (5-5)
 *
 * `jamActionBadges.ts`의 `METRIC_COMPUTERS`가 부르는 «값 계산» 함수 모음이다. `jamActionActivityMetrics.ts`와 같은 규약이다:
 * `(supabase, userId)`를 받아 숫자를 돌려주고 **DB 오류를 던진다**(던진 오류는 `evaluateJamActionBadges`가 그 지표만 건너뛴다, fail-closed).
 *
 * ## 「새로 받은 체크인 배지」의 정의
 * 원천은 방문 기록 `user_checkin_badge_earns`(체크인 한 번 = 한 줄)다. 한 유저가 한 배지(`badge_id`)로 가진 줄 가운데 **처음 받은 줄**이
 * «새로 받은 체크인 배지»다(`record_checkin_earn`이 `is_first`로 돌려주는 줄과 같다, 마이그레이션 241). 같은 배지를 몇 번 다시 받아도
 * 새 배지는 1개다. 같은 배지가 다른 장소(`poi_id`)에서 나와도 배지가 같으면 1개다.
 *  - 「처음」은 줄의 날짜가 가장 이른 줄이다. 날짜는 체크인을 만든 활동의 시작 시각(`triggered_by_activity_date`)이고, 없으면 기록한 시각
 *    (`earned_at`)이다. 늦게 동기화된 옛 활동이 나중에 기록돼도 그 활동의 계절로 센다.
 *  - 날짜는 한국 시각(KST)으로 바꿔 읽는다. 계절은 봄 3~5월·여름 6~8월·가을 9~11월·겨울 12·1·2월이고 **한 해는 달력 연도(KST)**라
 *    2025년 12월과 2026년 1월은 서로 다른 해다(사용자 결정 4, `jamActionActivityMetrics.ts`와 같다).
 *  - `new_checkin_badge_count`는 날짜를 읽을 수 없는 줄도 배지 종류로 센다. 계절을 정하는 `checkin_season_year_count`는 날짜를 읽을 수 없는
 *    배지를 뺀다.
 *
 * ## 기간 한정 (선택 인자 `window`, 티켓 20261019_1445 2회 — 사용자 결정 3)
 * 미션은 «참가한 뒤, 미션 기간 안»의 값만 센다. 그런데 «처음 받은 배지»는 평생 기준의 개념이라 **행부터 기간으로 거르면 안 된다** —
 * 기간 전에 받은 배지를 기간 안에 다시 받은 줄이 «새 배지»로 잡혀 의미가 어긋난다. 그래서 순서를 지킨다.
 *  1. 방문 기록 **전체 이력**으로 배지별 처음 받은 시각을 정한다(위 «처음»의 정의 그대로: 활동 시각 우선, 없으면 기록 시각).
 *  2. 그 시각이 기간 안(하한·상한 포함)인 배지만 «기간 안에 새로 받은 배지»로 센다.
 * 처음 받은 시각을 읽을 수 없는 배지(활동 시각과 기록 시각이 모두 없거나 깨진 배지)는 기간 안이라 할 수 없어 뺀다.
 * `new_checkin_badge_count`(서로 다른 배지 종류 수)와 장소 종류(`checkin_category_count`)·지정 목록(`checkin_badge_count`)이
 * 같은 «기간 안에 새로 받은 배지» 집합을 쓴다. 인자를 주지 않으면 지금까지 받은 모든 배지로 센다(예전 동작).
 *
 * 장소 종류·지정 목록의 계산 자체는 배지 발급(`usageBadges.ts`)과 같은 순수 함수(`checkinHoldings.ts`)를 쓴다 —
 * 넣는 배지 id 집합만 다르다. 읽기 오류는 발급 쪽처럼 0으로 폴백하지 않고 **던진다**(위 규약).
 *
 * 행이 `MAX_PAGES` 페이지(30,000행)를 넘으면 조회가 오류를 던지고 그 지표만 건너뛴다(`jamActionPaging.ts`).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  countBadgesByCategory,
  countListedNamesOwned,
  ownedCheckinBadgeNames,
  type CheckinBadgeCategoryRow,
  type CheckinBadgeNameRow,
  type LinkedPoiCategoryRow,
} from './checkinHoldings'
import { seasonOfDayKey, SEASONS, type Season } from './jamActionActivityMetrics'
import { toKstDayKey } from './jamActionDayMetrics'
import { selectAllPages } from './jamActionPaging'
import type { MetricWindow } from './jamActionWindow'

const TAG = 'jamActionCheckinMetrics'

/** `.in()`에 한 번에 넘기는 id·이름 수 — URL이 길어지지 않게 나눠 읽는다(`jamActionItemMetrics.ts`와 같은 값) */
const IN_CHUNK_SIZE = 200

function throwQueryError(label: string, error: { message?: string }): never {
  throw new Error(`[${TAG}] ${label} 조회 오류: ${error.message ?? '알 수 없는 오류'}`)
}

function chunksOf<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size))
  return chunks
}

/** 방문 기록 한 줄 — 배지와 시각만 읽는다 */
export interface CheckinEarnRow {
  badge_id: string
  /** 체크인을 만든 활동의 시작 시각(ISO). 없으면 null */
  triggered_by_activity_date: string | null
  /** 기록한 시각(ISO) — 활동 시각이 없을 때의 대체 */
  earned_at: string | null
}

/** 줄의 시각(ms). 활동 시각을 우선하고 읽을 수 없으면 기록 시각을 쓴다. 둘 다 못 읽으면 null */
function earnInstantMs(row: CheckinEarnRow): number | null {
  for (const value of [row.triggered_by_activity_date, row.earned_at]) {
    if (typeof value === 'string' && value !== '') {
      const ms = Date.parse(value)
      if (!Number.isNaN(ms)) return ms
    }
  }
  return null
}

/** 새로 받은 체크인 배지의 서로 다른 종류 수. 같은 배지의 줄이 여럿이어도 1이다 */
export function countNewCheckinBadges(rows: readonly CheckinEarnRow[]): number {
  return new Set(rows.map((r) => r.badge_id)).size
}

/** 배지별로 처음 받은 시각(ms). 시각을 읽을 수 있는 줄이 하나도 없는 배지는 뺀다 */
export function firstEarnMsByBadge(rows: readonly CheckinEarnRow[]): Map<string, number> {
  const firstMs = new Map<string, number>()
  for (const row of rows) {
    const ms = earnInstantMs(row)
    if (ms === null) continue
    const prev = firstMs.get(row.badge_id)
    if (prev === undefined || ms < prev) firstMs.set(row.badge_id, ms)
  }
  return firstMs
}

/** 배지별로 처음 받은 날(KST 날짜 키). 날짜를 읽을 수 있는 줄이 하나도 없는 배지는 뺀다 */
export function firstEarnDayByBadge(rows: readonly CheckinEarnRow[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const [badgeId, ms] of firstEarnMsByBadge(rows)) {
    const dayKey = toKstDayKey(new Date(ms).toISOString())
    if (dayKey !== null) out.set(badgeId, dayKey)
  }
  return out
}

/**
 * 처음 받은 시각이 기간 안(하한·상한 포함)인 체크인 배지의 id 집합 — 기간 안에 «새로 받은» 배지.
 * 처음 받은 시각은 **전체 이력**(`rows`는 기간으로 거르지 않은 방문 기록 전부)으로 정한다. 기간 전에 받은 배지를 기간 안에
 * 다시 받아도 처음 받은 시각은 기간 전이라 여기에 들지 않는다. 처음 받은 시각을 읽을 수 없는 배지도 뺀다.
 * 하한이 시각으로 읽히지 않으면 던진다 — 조용히 아무것도 안 세거나 전부 세는 것보다 그 미션을 건너뛰는 편이 낫다.
 */
export function badgeIdsFirstEarnedWithin(rows: readonly CheckinEarnRow[], window: MetricWindow): Set<string> {
  const fromMs = Date.parse(window.fromIso)
  if (Number.isNaN(fromMs)) throw new Error(`[${TAG}] 기간의 하한 시각을 읽지 못했다 (fromIso: ${window.fromIso})`)
  const toMs = window.toIso ? Date.parse(window.toIso) : Number.POSITIVE_INFINITY
  if (Number.isNaN(toMs)) throw new Error(`[${TAG}] 기간의 상한 시각을 읽지 못했다 (toIso: ${window.toIso})`)

  const within = new Set<string>()
  for (const [badgeId, ms] of firstEarnMsByBadge(rows)) {
    if (ms >= fromMs && ms <= toMs) within.add(badgeId)
  }
  return within
}

/** 네 계절 모두에서 새 체크인 배지(배지별 처음 받은 줄)를 받은 달력 연도(KST)의 수 */
export function countCheckinFullSeasonYears(rows: readonly CheckinEarnRow[]): number {
  const seasonsPerYear = new Map<string, Set<Season>>()
  for (const dayKey of firstEarnDayByBadge(rows).values()) {
    const year = dayKey.slice(0, 4)
    const seasons = seasonsPerYear.get(year)
    if (seasons) seasons.add(seasonOfDayKey(dayKey))
    else seasonsPerYear.set(year, new Set([seasonOfDayKey(dayKey)]))
  }
  let n = 0
  for (const seasons of seasonsPerYear.values()) if (seasons.size === SEASONS.length) n++
  return n
}

// ── 조회 ──────────────────────────────────────────────────────────────────

/** 유저의 방문 기록 전부. 조회가 실패하면 던진다 */
export async function fetchCheckinEarnRows(supabase: SupabaseClient, userId: string): Promise<CheckinEarnRow[]> {
  return selectAllPages<CheckinEarnRow>(TAG, '체크인 배지 방문 기록', (from, to) =>
    supabase
      .from('user_checkin_badge_earns')
      .select('badge_id, triggered_by_activity_date, earned_at')
      .eq('user_id', userId)
      .order('id')
      .range(from, to)
  )
}

// ── 지표 계산 ─────────────────────────────────────────────────────────────

/** 기간을 주면 «기간 안에 새로 받은 배지»의 id, 주지 않으면 받은 모든 배지의 id */
function earnedBadgeIdsOf(rows: readonly CheckinEarnRow[], window?: MetricWindow): Set<string> {
  return window ? badgeIdsFirstEarnedWithin(rows, window) : new Set(rows.map((r) => r.badge_id))
}

/**
 * 새로 받은 체크인 배지 수 — `new_checkin_badge_count`.
 * `window`를 주면 처음 받은 시각이 기간 안인 배지만 센다(전체 이력으로 처음 받은 시각을 정한 뒤 좁힌다).
 */
export async function countNewCheckinBadgeCount(supabase: SupabaseClient, userId: string, window?: MetricWindow): Promise<number> {
  const rows = await fetchCheckinEarnRows(supabase, userId)
  return window ? badgeIdsFirstEarnedWithin(rows, window).size : countNewCheckinBadges(rows)
}

/**
 * 장소 종류 `category`에 든 체크인 배지 수 — `checkin_category_count`의 현재값.
 * 받은 배지는 `window`가 있으면 «기간 안에 새로 받은 배지», 없으면 받은 모든 배지다. 장소 종류는 `badges.category`가 우선이고
 * 없으면 연결된 지점의 카테고리다(배지 발급과 같은 순수 함수 `countBadgesByCategory`). 읽기 오류는 던진다.
 */
export async function countCheckinCategoryBadges(
  supabase: SupabaseClient,
  userId: string,
  category: string,
  window?: MetricWindow
): Promise<number> {
  const earned = earnedBadgeIdsOf(await fetchCheckinEarnRows(supabase, userId), window)
  if (earned.size === 0) return 0

  // `badges.deleted_at` 필터를 걸지 않는다 — 노출·지급 판정이 아니라 «이미 받은 배지의 카테고리»를 읽는 이력성 조회이고,
  // 배지 발급(`evaluateCheckinUsageBadges`)의 같은 조회도 거르지 않는다. 소프트 삭제된 배지도 받은 사실은 그대로다.
  const badgeRows: CheckinBadgeCategoryRow[] = []
  const poiRows: LinkedPoiCategoryRow[] = []
  for (const chunk of chunksOf([...earned], IN_CHUNK_SIZE)) {
    const [badges, pois] = await Promise.all([
      supabase.from('badges').select('id, category').in('id', chunk),
      supabase.from('poi').select('linked_badge_id, category').in('linked_badge_id', chunk),
    ])
    if (badges.error) throwQueryError('받은 체크인 배지의 카테고리', badges.error)
    if (pois.error) throwQueryError('연결 지점의 카테고리', pois.error)
    badgeRows.push(...((badges.data ?? []) as CheckinBadgeCategoryRow[]))
    poiRows.push(...((pois.data ?? []) as LinkedPoiCategoryRow[]))
  }
  return countBadgesByCategory(badgeRows, poiRows).get(category) ?? 0
}

/**
 * 지정한 이름의 체크인 배지 가운데 받은 이름의 수 — `checkin_badge_count`의 현재값.
 * 받은 배지는 `window`가 있으면 «기간 안에 새로 받은 배지», 없으면 받은 모든 배지다. 이름은 `type='checkin'` 배지로만 풀고(§2.8),
 * 카탈로그에 없는 이름은 무시한다(배지 발급과 같은 순수 함수). 읽기 오류는 던진다.
 */
export async function countCheckinListedBadges(
  supabase: SupabaseClient,
  userId: string,
  names: readonly string[],
  window?: MetricWindow
): Promise<number> {
  const earned = earnedBadgeIdsOf(await fetchCheckinEarnRows(supabase, userId), window)
  const uniqueNames = [...new Set(names)]
  if (earned.size === 0 || uniqueNames.length === 0) return 0

  // `badges.deleted_at` 필터를 걸지 않는다 — 위 장소 종류 조회와 같은 이유(이미 받은 배지를 이름으로 푸는 이력성 조회).
  const namedRows: CheckinBadgeNameRow[] = []
  for (const chunk of chunksOf(uniqueNames, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase.from('badges').select('id, name').eq('type', 'checkin').in('name', chunk)
    if (error) throwQueryError('체크인 배지 이름', error)
    namedRows.push(...((data ?? []) as CheckinBadgeNameRow[]))
  }
  return countListedNamesOwned(names, ownedCheckinBadgeNames(uniqueNames, namedRows, earned))
}

/** 네 계절 모두 새 체크인 배지를 받은 해의 수 — `checkin_season_year_count` */
export async function countCheckinSeasonYearCount(supabase: SupabaseClient, userId: string): Promise<number> {
  return countCheckinFullSeasonYears(await fetchCheckinEarnRows(supabase, userId))
}
