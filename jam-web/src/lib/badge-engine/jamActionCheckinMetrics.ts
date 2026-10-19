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
 * 행이 `MAX_PAGES` 페이지(30,000행)를 넘으면 조회가 오류를 던지고 그 지표만 건너뛴다(`jamActionPaging.ts`).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { seasonOfDayKey, SEASONS, type Season } from './jamActionActivityMetrics'
import { toKstDayKey } from './jamActionDayMetrics'
import { selectAllPages } from './jamActionPaging'

const TAG = 'jamActionCheckinMetrics'

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

/** 배지별로 처음 받은 날(KST 날짜 키). 날짜를 읽을 수 있는 줄이 하나도 없는 배지는 뺀다 */
export function firstEarnDayByBadge(rows: readonly CheckinEarnRow[]): Map<string, string> {
  const firstMs = new Map<string, number>()
  for (const row of rows) {
    const ms = earnInstantMs(row)
    if (ms === null) continue
    const prev = firstMs.get(row.badge_id)
    if (prev === undefined || ms < prev) firstMs.set(row.badge_id, ms)
  }
  const out = new Map<string, string>()
  for (const [badgeId, ms] of firstMs) {
    const dayKey = toKstDayKey(new Date(ms).toISOString())
    if (dayKey !== null) out.set(badgeId, dayKey)
  }
  return out
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

/** 새로 받은 체크인 배지 수 — `new_checkin_badge_count` */
export async function countNewCheckinBadgeCount(supabase: SupabaseClient, userId: string): Promise<number> {
  return countNewCheckinBadges(await fetchCheckinEarnRows(supabase, userId))
}

/** 네 계절 모두 새 체크인 배지를 받은 해의 수 — `checkin_season_year_count` */
export async function countCheckinSeasonYearCount(supabase: SupabaseClient, userId: string): Promise<number> {
  return countCheckinFullSeasonYears(await fetchCheckinEarnRows(supabase, userId))
}
