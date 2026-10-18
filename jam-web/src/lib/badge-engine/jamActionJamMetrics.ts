/**
 * JAM! 행동 지표 계산 — 잼·챕터 3종: 지금까지 모은 잼·한 주에 모은 잼·도달한 챕터
 * (서버 사이드 전용, 티켓 20261018_1815 2회, 운영 로직 10.2절)
 *
 * `jamActionBadges.ts`의 `METRIC_COMPUTERS`가 부르는 «값 계산» 함수 모음이다. `jamActionMetrics.ts`와 같은 규약이다:
 * `(supabase, userId)`를 받아 숫자를 돌려주고 **DB 오류를 던진다**(0으로 바꿔 돌려주면 「센 값이 0」과 「세지 못함」이
 * 구분되지 않는다). 던진 오류는 `evaluateJamActionBadges`가 그 지표만 건너뛰는 것(fail-closed)으로 받는다.
 * 새 SQL 없이 supabase-js 읽기만 쓴다.
 *
 * ## 값의 정의 (티켓 20261018_1815 「사용자 결정」 6·10번, 운영 로직 4.2절 «원장과 기록»)
 *  - `jam_total_earned`: 지금까지 **모은** 잼. 원천은 `jam_wallets.total_earned`(마이그레이션 220)다. 가진 양(`balance`)이 아니다 —
 *    캡슐·잠긴 아이템 배지를 채워 줄어도 모은 양은 줄지 않는다. 지갑 행이 없으면(첫 지급 전) 0이다.
 *  - `jam_weekly_earned`: 월~일(KST) 한 주에 모은 잼의 **역대 최고 주** 값. 원천은 `jam_daily_earned`(날짜(KST)별 모은 양)를 한 주씩 합산한 값이다.
 *    날짜는 활동한 날(KST)이라 늦게 동기화한 활동의 잼이 동기화한 날의 주에 잡히지 않는다. 주 경계는 `weekly_active_days`와 같은
 *    `kstWeekStartKey`(서버 시간대와 무관)를 쓴다.
 *  - `chapter_reached`: 도달한 챕터 번호. 원천은 `user_chapters.chapter_no`(마이그레이션 221)다. 행이 없거나 `chapter_no`가 NULL이면(퀘스트 전) 0이다.
 *    판정 시점: 챕터를 올리는 호출부(`chapter_add_score`·`chapter_start`)는 아직 앱 코드에 없다(JAM 2.0 묶음 5). 그 전에는 동기화 끝
 *    판정(`JAM_SYNC_TRIGGERS`)에서 읽고, 챕터 오름 직후 판정은 묶음 5가 연결한다.
 *
 * ## SQL 등가식 (읽기 전용 기준값)
 * ```
 * jam_total_earned  = coalesce((SELECT total_earned FROM jam_wallets WHERE user_id = :u), 0)
 * jam_weekly_earned = coalesce(max(week_sum), 0) FROM (SELECT sum(amount) AS week_sum FROM jam_daily_earned
 *                                                       WHERE user_id = :u GROUP BY date_trunc('week', earned_on)) w   -- date_trunc('week')는 월요일 시작
 * chapter_reached   = coalesce((SELECT chapter_no FROM user_chapters WHERE user_id = :u), 0)
 * ```
 * `jam_daily_earned`는 유저당 하루 한 행이라 약 82년치(30,000행)가 쌓여야 `MAX_PAGES`를 넘는다 — 넘으면 오류를 던지고 그 지표만 건너뛴다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { kstWeekStartKey } from './jamActionDayMetrics'
import { selectAllPages } from './jamActionPaging'

/** 오류 메시지 접두어 — 로그에서 어느 계산인지 알아보도록 공용 페이징에 넘긴다 */
const TAG = 'jamActionJamMetrics'

function throwQueryError(label: string, error: { message?: string }): never {
  throw new Error(`[${TAG}] ${label} 조회 오류: ${error.message ?? '알 수 없는 오류'}`)
}

/** 날짜(KST)별 모은 잼 한 줄 */
export interface DailyEarnedRow {
  /** 활동한 날(KST), `YYYY-MM-DD` */
  earned_on: string
  amount: number
}

/** 월~일(KST) 한 주에 모은 잼의 최댓값. 같은 날 행이 여럿이어도 모두 더한다. 행이 없으면 0 */
export function bestWeekJamEarned(rows: readonly DailyEarnedRow[]): number {
  const perWeek = new Map<string, number>()
  for (const row of rows) {
    if (typeof row.earned_on !== 'string' || !Number.isFinite(row.amount)) continue
    const week = kstWeekStartKey(row.earned_on)
    perWeek.set(week, (perWeek.get(week) ?? 0) + row.amount)
  }
  let best = 0
  for (const sum of perWeek.values()) best = Math.max(best, sum)
  return best
}

/** 지금까지 모은 잼 — `jam_wallets.total_earned`. 지갑이 없으면 0 */
export async function readJamTotalEarned(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase.from('jam_wallets').select('total_earned').eq('user_id', userId).maybeSingle()
  if (error) throwQueryError('잼 지갑', error)
  const total = Number((data as { total_earned: number | string } | null)?.total_earned ?? 0)
  if (!Number.isFinite(total)) throw new Error(`[${TAG}] 잼 지갑의 모은 양을 숫자로 읽지 못했다 (userId: ${userId})`)
  return total
}

/** 한 주에 모은 잼 — 날짜별 모은 양을 월~일(KST) 주로 합산한 역대 최고 값 */
export async function readJamWeeklyEarned(supabase: SupabaseClient, userId: string): Promise<number> {
  const rows = await selectAllPages<DailyEarnedRow>(TAG, '날짜별 모은 잼', (from, to) =>
    supabase
      .from('jam_daily_earned')
      .select('earned_on, amount')
      .eq('user_id', userId)
      .order('earned_on')
      .range(from, to)
  )
  return bestWeekJamEarned(rows)
}

/** 도달한 챕터 — `user_chapters.chapter_no`. 행이 없거나 퀘스트 전(NULL)이면 0 */
export async function readChapterReached(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase.from('user_chapters').select('chapter_no').eq('user_id', userId).maybeSingle()
  if (error) throwQueryError('챕터', error)
  const chapterNo = (data as { chapter_no: number | null } | null)?.chapter_no
  return typeof chapterNo === 'number' ? chapterNo : 0
}
