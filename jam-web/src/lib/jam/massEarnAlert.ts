/**
 * 대량 수령 경보 (티켓 20261017_1423, 운영 로직 16.3절) — 서버 전용.
 *
 * 한 번의 동기화로 받은 잼이 그 유저의 지난 N주 주간 평균의 M배를 넘으면 운영툴의 중단 신호 글 형식으로
 * `#jam-alert`에 띄운다(기본 4주, 3배). 지난 기록이 없는 유저는 `mass_earn_alert_no_history_amount`(기본 1,200)를
 * 넘으면 띄운다. **자동 제재는 하지 않는다.** 경보 발송이 실패해도 던지지 않는다.
 *
 * 주간 평균은 잼 원장의 일별 합계(`jam_daily_earned`, 활동한 날 KST 기준)로 계산한다. 이번 동기화의 정산 행이
 * 평균에 섞이지 않도록 **기준선은 정산 전에 읽어야 한다** — 호출부(`sync.ts`)가 이 순서를 지킨다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatStopSignalAlertMessage, postOpsSlack } from '@/lib/admin/opsInbox/slack'
import { kstDateString } from '@/lib/notifications/kst'
import type { JamPolicy } from './policy'

const DAY_MS = 24 * 60 * 60 * 1000
const LOG = '[jam-mass-earn-alert]'
/** 중단 신호 글에 적는 신호 이름 */
export const MASS_EARN_ALERT_LABEL = '대량 잼 수령'

/** 정산 전에 읽은 유저의 지난 기록. `pastTotal`이 0이면 지난 기록이 없는 유저다 */
export interface MassEarnBaseline {
  /** 지난 N주 동안 모은 잼 합계(오늘 KST 포함) */
  pastTotal: number
  /** 비교에 쓴 기간(주) */
  weeks: number
}

/**
 * 지난 `mass_earn_alert_weeks`주(오늘 KST를 포함한 7×N일)의 모은 잼 합계를 읽는다.
 * 읽지 못하면 `null`이다 — 「기록 없음」으로 대체하면 평소 많이 받는 유저가 모두 경보에 걸리므로, 호출부는
 * 기준선이 없을 때 경보를 건너뛴다.
 */
export async function readMassEarnBaseline(
  supabase: SupabaseClient,
  userId: string,
  policy: JamPolicy,
  now: Date = new Date()
): Promise<MassEarnBaseline | null> {
  try {
    const weeks = policy.mass_earn_alert_weeks
    const fromDay = kstDateString(new Date(now.getTime() - (weeks * 7 - 1) * DAY_MS))
    const toDay = kstDateString(now)
    const { data, error } = await supabase
      .from('jam_daily_earned')
      .select('amount')
      .eq('user_id', userId)
      .gte('earned_on', fromDay)
      .lte('earned_on', toDay)
    if (error || !data) {
      console.error(`${LOG} 지난 기록 조회 실패 — userId: ${userId}:`, error)
      return null
    }
    const pastTotal = (data as { amount: number | string }[]).reduce((sum, row) => sum + Number(row.amount), 0)
    if (!Number.isFinite(pastTotal)) {
      console.error(`${LOG} 지난 기록 합계가 비정상 — userId: ${userId}`)
      return null
    }
    return { pastTotal, weeks }
  } catch (e) {
    console.error(`${LOG} 지난 기록 조회 예외 — userId: ${userId}:`, e)
    return null
  }
}

/**
 * 이번 동기화로 받은 잼이 경보 기준을 넘었는지. 넘어야 하고(같으면 아니다) 순수 함수다.
 * - 지난 기록이 있으면 `받은 잼 > 주간 평균 × 배수` (평균 = 합계 ÷ 주 수, 나눗셈 없이 곱셈으로 비교한다)
 * - 지난 기록이 없으면 `받은 잼 > mass_earn_alert_no_history_amount`
 */
export function isMassEarn(earned: number, baseline: MassEarnBaseline, policy: JamPolicy): boolean {
  if (!(earned > 0)) return false
  if (baseline.pastTotal <= 0) return earned > policy.mass_earn_alert_no_history_amount
  return earned * baseline.weeks > policy.mass_earn_alert_multiplier * baseline.pastTotal
}

function formatCount(n: number): string {
  return Math.round(n).toLocaleString('ko-KR')
}

/** 경보 글에 쓰는 한 줄 설명(운영자가 읽는 해요체) */
export function describeMassEarn(
  userId: string,
  earned: number,
  baseline: MassEarnBaseline,
  policy: JamPolicy
): string {
  const head = `유저(${userId})가 한 번의 동기화로 잼 ${formatCount(earned)}을 받았어요`
  if (baseline.pastTotal <= 0) {
    return `${head} (지난 ${baseline.weeks}주 기록 없음, 기준 ${formatCount(policy.mass_earn_alert_no_history_amount)} 초과)`
  }
  const weeklyAverage = baseline.pastTotal / baseline.weeks
  return `${head} (지난 ${baseline.weeks}주 주간 평균 ${formatCount(weeklyAverage)}, 기준 ${policy.mass_earn_alert_multiplier}배 초과)`
}

/**
 * 기준을 넘었으면 `#jam-alert`에 알린다. 알렸으면 true. 던지지 않는다 — 기준선이 없거나(`null`) 발송이 실패해도
 * 동기화 응답은 그대로여야 한다. 자동 제재는 하지 않는다.
 */
export async function alertMassEarnIfNeeded(input: {
  userId: string
  /** 이번 동기화로 받은 잼 합계 */
  earned: number
  /** 정산 전에 읽은 기준선. 읽지 못했으면 null */
  baseline: MassEarnBaseline | null
  policy: JamPolicy
}): Promise<boolean> {
  const { userId, earned, baseline, policy } = input
  try {
    if (!baseline) {
      if (earned > 0) console.error(`${LOG} 기준선을 읽지 못해 경보 판정 건너뜀 — userId: ${userId}`)
      return false
    }
    if (!isMassEarn(earned, baseline, policy)) return false

    const text = formatStopSignalAlertMessage({
      groups: [{ label: MASS_EARN_ALERT_LABEL, messages: [describeMassEarn(userId, earned, baseline, policy)] }],
    })
    const result = await postOpsSlack('alert', text)
    if (!result.ok) {
      console.error(`${LOG} 슬랙 발송 실패(${result.error}) — userId: ${userId}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`${LOG} 경보 처리 예외 — userId: ${userId}:`, e)
    return false
  }
}
