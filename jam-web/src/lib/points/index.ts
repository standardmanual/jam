/**
 * 잼 포인트 모듈 (Phase 12, 1a단계) — 서버 사이드 전용
 *
 * 잔액 변경의 유일한 경로는 award_points() RPC다. 이 파일의 awardPoints()는
 * 그 RPC를 감싸는 얇은 헬퍼이며, point_wallets/point_transactions/point_treasury에
 * 직접 INSERT/UPDATE를 흩어놓지 않는다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import { logEngineDecision } from '@/lib/engine-log'
import { createNotification } from '@/lib/notifications'
import { recordActivityRecap } from '@/lib/notifications/recap'
import type { PointReason, PointTransactionRow } from '@/types/database'

export interface AwardPointsOptions {
  sourceBadgeId?: string | null
  sourceMissionId?: string | null
  adminReasonLabel?: string | null
  adminReasonNote?: string | null
}

/**
 * 포인트 지급/차감. 원장·잔액·treasury를 award_points RPC 하나의 트랜잭션으로 갱신.
 *
 * - amount === 0 이면 아무것도 하지 않고 null 반환(빈 원장 행 방지).
 *   배지/미션의 point_reward/reward_points가 0인 경우가 이에 해당.
 * - amount > 0 적립, amount < 0 차감.
 * - 실패 시 예외를 던지지 않고 null 반환 + 에러 로그 + engine_decision_log 기록
 *   (호출부가 배지 발급 등 본 흐름을 계속 이어갈 수 있도록 — 지급 실패는 수동
 *   재처리 대상). 호출부 6곳(배지·드랍·미션·조합·어드민)이 각자 실패를 감지해
 *   기록할 필요 없이 이 함수 한 곳에서 전부 커버한다.
 */
export async function awardPoints(
  userId: string,
  amount: number,
  reason: PointReason,
  options: AwardPointsOptions = {}
): Promise<PointTransactionRow | null> {
  if (!Number.isInteger(amount)) {
    console.error(`[points] awardPoints: amount는 정수여야 합니다 (받은 값: ${amount})`)
    return null
  }
  // 0원 지급은 원장 행을 만들지 않는다 (빈 내역 방지)
  if (amount === 0) return null

  const supabase = createServiceClient()
  // @ts-expect-error Supabase rpc() 인자 타입 매칭 제한(옵셔널 필드가 섞인 RPC에서 발생하는 라이브러리 특이 케이스) 우회 — 실제 인자는 award_points() RPC 시그니처와 일치
  const { data, error } = await supabase.rpc('award_points', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_source_badge_id: options.sourceBadgeId ?? null,
    p_source_mission_id: options.sourceMissionId ?? null,
    p_admin_reason_label: options.adminReasonLabel ?? null,
    p_admin_reason_note: options.adminReasonNote ?? null,
  })

  if (error) {
    console.error(
      `[points] awardPoints 실패 — userId: ${userId}, amount: ${amount}, reason: ${reason}:`,
      error
    )
    await logEngineDecision('points', 'point_award_failed', userId, {
      amount,
      reason,
      sourceBadgeId: options.sourceBadgeId ?? null,
      sourceMissionId: options.sourceMissionId ?? null,
      dbError: error.message ?? String(error),
    })
    return null
  }

  await notifyPointChange(userId, amount, reason, options)

  return data as PointTransactionRow
}

/**
 * 소식 #5(포인트 적립) / #44(운영진 지급·차감) — 티켓 20260824_019
 *
 * 포인트 지급 경로 6곳(배지·드랍·미션·조합·어드민)이 전부 awardPoints()를 지나므로
 * 여기 한 곳에 심으면 호출부를 손대지 않아도 된다.
 *
 * - #5는 `badge_point_reward` 적립 중 **미션 보상 경유가 아닌 것**만 대상이다(PRD §3 ①).
 *   `grantMissionRewards()`가 미션 보상 배지의 포인트도 **같은 reason**으로 지급하므로
 *   reason만 보면 미션 완료 1건이 #5와 #22 두 줄로 보인다. #22가 이미 "배지 1개와 500P"로
 *   보상을 전부 서술하므로 미션 경유분은 여기서 제외한다 — 판별은 `sourceMissionId`로 한다.
 *   (제외하지 않으면 #5의 하루 합계 금액 자체가 미션분만큼 부풀려진다)
 * - 미션·조합 포인트(`mission_point_reward`·`combine_pity_reward`)도 같은 이유로 #5를 만들지 않는다.
 * - #5는 하루 단위 묶음이라 `amount`를 합산해야 한다 — `sumKeys`로 DB에서 더한다.
 *   (KST 기준. UTC로 두면 KST 09:00에 날짜가 바뀌어 아침·저녁 포인트가 갈라진다)
 * - #44는 되돌릴 수 없는 사건이라 압축하지 않는다(L1). `group_key`는 NULL.
 */
async function notifyPointChange(
  userId: string,
  amount: number,
  reason: PointReason,
  options: AwardPointsOptions
): Promise<void> {
  // options.sourceMissionId가 있으면 grantMissionRewards() 경유 = 미션 보상 배지의 포인트다.
  // 이 지급은 #22(미션 완료 + 보상)가 이미 서술하므로 #5를 만들지 않는다.
  if (reason === 'badge_point_reward' && amount > 0 && !options.sourceMissionId) {
    // 20260827_014 — 독립 행(#5)을 없애고 ① 활동 결산의 **문장 꼬리**로 흡수한다.
    // "오늘 획득한 배지로 250 포인트를 획득했어요"가 배지 소식과 따로 뜨던 것을
    // "배지 5개와 250 포인트를 획득했어요" 한 줄로 합친다(A2·C3·D1).
    await recordActivityRecap(userId, { points: amount })
    return
  }

  if (reason === 'admin_grant' || reason === 'admin_deduct') {
    await createNotification({
      userId,
      type: 'admin_points_changed',
      payload: {
        amount: Math.abs(amount),
        direction: reason === 'admin_grant' ? 'grant' : 'deduct',
        reason: options.adminReasonLabel ?? null,
      },
    })
  }
}

/** 유저의 현재 잔액. 지갑이 아직 없으면(포인트를 한 번도 받은 적 없으면) 0. */
export async function getWallet(userId: string): Promise<number> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('point_wallets')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error(`[points] getWallet 실패 — userId: ${userId}:`, error)
    return 0
  }
  return (data as { balance: number } | null)?.balance ?? 0
}

export interface TransactionPage {
  items: PointTransactionRow[]
  /** 다음 페이지 커서(마지막 항목 created_at). null이면 더 없음. */
  nextCursor: string | null
}

/**
 * 유저의 포인트 내역 (최신순, 커서 기반 페이지네이션).
 * cursor는 이전 페이지 마지막 항목의 created_at (그보다 오래된 것부터).
 */
export async function listTransactions(
  userId: string,
  cursor?: string | null,
  limit = 20
): Promise<TransactionPage> {
  const supabase = createServiceClient()
  let query = supabase
    .from('point_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) query = query.lt('created_at', cursor)

  const { data, error } = await query
  if (error) {
    console.error(`[points] listTransactions 실패 — userId: ${userId}:`, error)
    return { items: [], nextCursor: null }
  }

  const rows = (data ?? []) as PointTransactionRow[]
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? items[items.length - 1].created_at : null
  return { items, nextCursor }
}
