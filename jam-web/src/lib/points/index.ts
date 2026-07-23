/**
 * 잼 포인트 모듈 (Phase 12, 1a단계) — 서버 사이드 전용
 *
 * 잔액 변경의 유일한 경로는 award_points() RPC다. 이 파일의 awardPoints()는
 * 그 RPC를 감싸는 얇은 헬퍼이며, point_wallets/point_transactions/point_treasury에
 * 직접 INSERT/UPDATE를 흩어놓지 않는다.
 */
import { createServiceClient } from '@/lib/supabase/server'
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
 * - 실패 시 예외를 던지지 않고 null 반환 + 에러 로그(호출부가 배지 발급 등
 *   본 흐름을 계속 이어갈 수 있도록 — 지급 실패는 수동 재처리 대상).
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('award_points', {
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
    return null
  }

  return data as PointTransactionRow
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
