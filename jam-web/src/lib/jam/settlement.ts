/**
 * 잼 정산 (티켓 20261017_1423, 운영 로직 4.2~4.5절) — 서버 전용(service_role 클라이언트).
 *
 * 인정 기준과 어뷰징 필터를 모두 통과한 활동마다 잼을 원장(`jam_apply`)에 한 줄씩 기록한다.
 *
 *   잼 = 강도 배율 × 실제로 움직인 시간(분, 내림)
 *
 * - 움직인 시간은 교통수단 구간을 뺀 값이다(`NormalizedActivity.movingTimeSec`는 구간 검사 뒤의 값).
 * - 강도: 걷기·전기자전거 가벼움, 등산·자전거 보통, 러닝·트레일러닝 격함. 종목과 움직임이 맞지 않아 걷기로 바뀐
 *   활동(`jamActivityType='walking'`)은 가벼움이다. 전기자전거는 `jamActivityType`이 자전거 값이라 원본 종목
 *   (`source_meta.sportType`)으로 가린다. 배율은 `jam_policy`가 정한다.
 * - 하루 상한은 없다.
 * - 한 활동에 한 번 — `jam_apply`가 `source_activity_id` 유일성으로 보장한다. 이미 정산된 활동은 기존 줄을 돌려준다.
 * - `p_earned_on`에는 **활동한 날의 KST 날짜**(활동 시작 시각을 KST로 바꾼 날짜)를 넘긴다. 늦게 동기화한 활동이
 *   동기화한 날로 잡히면 주간 양이 틀어진다(마이그레이션 220의 사용자 결정, 2026-10-17).
 * - 정산이 실패해도 던지지 않는다 — 로그만 남기고 동기화를 막지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { kstDateString } from '@/lib/notifications/kst'
import type { JamPolicy } from './policy'

export type JamIntensity = 'light' | 'normal' | 'hard'

/** 강도 판정에 쓰는 활동 필드 — 정산 대상 활동(`NormalizedActivity`)과 그 판정 메타(`SourceMeta`)에서 뽑는다 */
export interface JamIntensityInput {
  /** 종목 불일치로 걷기가 된 활동은 'walking'이다 */
  jamActivityType: string | null
  /** 원본 Strava `sport_type`(`source_meta.sportType`). 전기자전거를 가리는 데 쓴다 */
  sportType?: string | null
  /** 원본 Strava `type`(`source_meta.type`). `sportType`이 없을 때만 본다 */
  type?: string | null
}

/** 전기자전거 원본 종목 — 자전거 값으로 저장되지만 가벼움으로 계산한다 */
const E_BIKE_SOURCE_TYPES: ReadonlySet<string> = new Set(['EBikeRide', 'EMountainBikeRide'])

const INTENSITY_BY_ACTIVITY_TYPE: Readonly<Record<string, JamIntensity>> = {
  walking: 'light',
  hiking: 'normal',
  cycling: 'normal',
  running: 'hard',
  trail_running: 'hard',
}

/** 강도 구간. 정산 대상 종목이 아니면(가상 활동 등 인정되지 않는 종목) `null`이다 */
export function jamIntensityOf(input: JamIntensityInput): JamIntensity | null {
  const base = INTENSITY_BY_ACTIVITY_TYPE[input.jamActivityType ?? '']
  if (!base) return null
  if (input.jamActivityType === 'cycling') {
    const source = input.sportType ?? input.type ?? null
    if (source !== null && E_BIKE_SOURCE_TYPES.has(source)) return 'light'
  }
  return base
}

/** 강도 구간의 배율 */
export function intensityMultiplier(intensity: JamIntensity, policy: JamPolicy): number {
  switch (intensity) {
    case 'light':
      return policy.intensity_light
    case 'normal':
      return policy.intensity_normal
    case 'hard':
      return policy.intensity_hard
  }
}

export interface JamAmountInput extends JamIntensityInput {
  /** 교통수단 구간을 뺀 움직인 시간(초) */
  movingTimeSec: number
}

/**
 * 활동 1건의 잼. 배율 × 움직인 분(내림). 정산 대상 종목이 아니거나 시간 값이 비정상이면 0이다.
 * 예: 걷기 30분 30, 러닝 30분 90, 자전거 30분 60, 전기자전거 30분 30.
 */
export function computeJamAmount(input: JamAmountInput, policy: JamPolicy): number {
  const intensity = jamIntensityOf(input)
  if (intensity === null) return 0
  if (!Number.isFinite(input.movingTimeSec) || input.movingTimeSec <= 0) return 0
  const minutes = Math.floor(input.movingTimeSec / 60)
  return intensityMultiplier(intensity, policy) * minutes
}

/**
 * 활동한 날(KST, `YYYY-MM-DD`). 활동 시작 시각(`start_date`, UTC)을 KST로 바꾼 날짜다.
 * 읽을 수 없는 값은 `null`이다 — `kstDateString`은 깨진 입력을 현재 시각으로 대체하므로 먼저 거른다.
 * 미래 날짜(시계 어긋남)는 `jam_apply`가 거절하므로 오늘(KST)로 맞춘다.
 */
export function jamEarnedOn(startDate: string, now: Date = new Date()): string | null {
  if (typeof startDate !== 'string' || startDate === '' || Number.isNaN(Date.parse(startDate))) return null
  const day = kstDateString(startDate)
  const today = kstDateString(now)
  return day > today ? today : day
}

/** 정산 대상 활동 1건 — 저장 전 활동(`stravaId`)과 판정 메타를 묶은 것 */
export interface JamSettleTarget extends JamAmountInput {
  stravaId: number
  /** 활동 시작 시각(UTC ISO) */
  startDate: string
}

/** 정산 결과 한 줄 — 아이템 배지 발급(2-4)이 개수 계산에 쓸 수 있게 활동별로 남긴다 */
export interface JamSettlementItem {
  stravaId: number
  /** `strava_activities.id` — 원장의 `source_activity_id` */
  activityId: string
  /** 원장에 기록된 잼 */
  amount: number
  /** 활동한 날(KST) */
  earnedOn: string
}

export interface JamSettlementResult {
  /** 이번 정산으로 원장에 기록된 잼의 합계 */
  total: number
  items: JamSettlementItem[]
}

function emptySettlement(): JamSettlementResult {
  return { total: 0, items: [] }
}

/**
 * 활동을 정산한다. 활동 id가 `strava_activities.id`라서 **활동을 저장한 뒤** 불러야 한다.
 * 던지지 않는다 — 활동 하나가 실패하면 로그를 남기고 나머지를 계속 정산한다.
 */
export async function settleActivities(
  supabase: SupabaseClient,
  userId: string,
  targets: readonly JamSettleTarget[],
  policy: JamPolicy,
  now: Date = new Date()
): Promise<JamSettlementResult> {
  try {
    // 잼이 0이거나 날짜를 못 읽는 활동은 정산하지 않는다(원장은 0을 받지 않는다)
    const candidates: { target: JamSettleTarget; amount: number; earnedOn: string }[] = []
    for (const target of targets) {
      const amount = computeJamAmount(target, policy)
      if (amount <= 0) continue
      const earnedOn = jamEarnedOn(target.startDate, now)
      if (earnedOn === null) {
        console.error(`[jam-settlement] 활동 시작 시각을 읽지 못해 정산 건너뜀 — userId: ${userId}, stravaId: ${target.stravaId}`)
        continue
      }
      candidates.push({ target, amount, earnedOn })
    }
    if (candidates.length === 0) return emptySettlement()

    const { data: rows, error: idError } = await supabase
      .from('strava_activities')
      .select('id, strava_id')
      .eq('user_id', userId)
      .in('strava_id', candidates.map((c) => c.target.stravaId))
    if (idError || !rows) {
      console.error(`[jam-settlement] 활동 id 조회 실패 — 정산 건너뜀 (userId: ${userId}):`, idError)
      return emptySettlement()
    }
    const activityIdByStravaId = new Map<number, string>(
      (rows as { id: string; strava_id: number }[]).map((r) => [r.strava_id, r.id])
    )

    // 오래된 활동부터 정산한다 — 지갑 행 잠금이 유저 단위라 어차피 순서대로 처리된다
    const ordered = [...candidates].sort(
      (a, b) => Date.parse(a.target.startDate) - Date.parse(b.target.startDate) || a.target.stravaId - b.target.stravaId
    )
    const items: JamSettlementItem[] = []
    for (const { target, amount, earnedOn } of ordered) {
      const activityId = activityIdByStravaId.get(target.stravaId)
      if (!activityId) {
        console.error(`[jam-settlement] 저장된 활동을 찾지 못해 정산 건너뜀 — userId: ${userId}, stravaId: ${target.stravaId}`)
        continue
      }
      try {
        const { data: tx, error } = await supabase.rpc('jam_apply', {
          p_user_id: userId,
          p_amount: amount,
          p_reason: 'activity_settlement',
          p_source_activity_id: activityId,
          p_earned_on: earnedOn,
        })
        if (error) {
          console.error(`[jam-settlement] jam_apply 실패 — userId: ${userId}, stravaId: ${target.stravaId}:`, error)
          continue
        }
        // 이미 정산된 활동이면 jam_apply가 기존 줄을 돌려준다 — 원장에 기록된 양을 그대로 쓴다
        const recorded = (tx as { amount?: unknown } | null)?.amount
        items.push({
          stravaId: target.stravaId,
          activityId,
          amount: typeof recorded === 'number' ? recorded : amount,
          earnedOn,
        })
      } catch (e) {
        console.error(`[jam-settlement] jam_apply 예외 — userId: ${userId}, stravaId: ${target.stravaId}:`, e)
      }
    }
    return { total: items.reduce((sum, item) => sum + item.amount, 0), items }
  } catch (e) {
    console.error(`[jam-settlement] 정산 예외 — 건너뜀 (userId: ${userId}):`, e)
    return emptySettlement()
  }
}
