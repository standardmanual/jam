/**
 * 유저 일괄 처리의 DB 읽기 부분(티켓 20260924_0951) — 대상 유저 조회와 미리보기(`dry_run`)
 * 영향 집계. 판정 자체(어드민·본인 제외)는 `user-bulk.ts`의 순수 함수가 한다.
 *
 * 건수는 전부 200개씩 나눠 읽는다(`.in()` URL 상한). 행째 세면 PostgREST 1,000행 상한에
 * 걸리므로 {@link countRowsByKey}·{@link fetchUserHoldingCounts}를 쓴다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { ValidAdminGrant } from '@/lib/points/admin-grant'
import { countRowsByKey, type CountRowsClient } from './list-counts'
import { fetchUserHoldingCounts } from './user-list'
import { sumCounts, type UserBulkAction, type UserBulkImpact, type UserTarget, type UserTargetPartition } from './user-bulk'

type ServiceClient = ReturnType<typeof createServiceClient>

const READ_CHUNK_SIZE = 200

/** 요청한 id 중 존재하는 유저의 `id·email·is_admin`(어드민 판정에 필요한 값만) */
export async function fetchUserTargets(supabase: ServiceClient, ids: string[]): Promise<UserTarget[]> {
  const targets: UserTarget[] = []
  for (let i = 0; i < ids.length; i += READ_CHUNK_SIZE) {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, is_admin')
      .in('id', ids.slice(i, i + READ_CHUNK_SIZE))
    if (error) throw new Error(`[user-bulk] 대상 유저 조회 실패: ${error.message}`)
    targets.push(...(data ?? []))
  }
  return targets
}

/** 유저별 포인트 잔액 — 지갑이 없는 유저(포인트를 한 번도 받지 않음)는 키가 없다(= 0) */
async function fetchWalletBalances(supabase: ServiceClient, userIds: string[]): Promise<Map<string, number>> {
  const balances = new Map<string, number>()
  for (let i = 0; i < userIds.length; i += READ_CHUNK_SIZE) {
    const { data, error } = await supabase
      .from('point_wallets')
      .select('user_id, balance')
      .in('user_id', userIds.slice(i, i + READ_CHUNK_SIZE))
    if (error) throw new Error(`[user-bulk] 포인트 잔액 조회 실패: ${error.message}`)
    for (const row of data ?? []) balances.set(row.user_id, row.balance)
  }
  return balances
}

/**
 * 미리보기 영향 수치. `partition.eligible`이 실제 처리 대상이고, 제외된 어드민·본인 수는 공통으로 돌려준다.
 * DB를 바꾸지 않는다.
 */
export async function computeUserBulkImpact(
  supabase: ServiceClient,
  action: UserBulkAction,
  partition: UserTargetPartition,
  grant?: ValidAdminGrant
): Promise<UserBulkImpact> {
  const { eligible } = partition
  const impact: UserBulkImpact = {
    targetCount: eligible.length,
    excludedAdminCount: partition.excludedAdminCount,
    excludedSelfCount: partition.excludedSelfCount,
  }
  const countClient = supabase as unknown as CountRowsClient

  if (action === 'grant_points') {
    const amount = grant?.amount ?? 0
    impact.totalAmount = amount * eligible.length
    // 지급·회수 모두 유저마다 운영진 알림(#44) 한 건이 나간다(`lib/points/index.ts`의 notifyPointChange)
    impact.notificationCount = eligible.length
    if (amount < 0 && eligible.length > 0) {
      const balances = await fetchWalletBalances(supabase, eligible)
      impact.negativeBalanceCount = eligible.filter((id) => (balances.get(id) ?? 0) < Math.abs(amount)).length
    } else {
      impact.negativeBalanceCount = 0
    }
    return impact
  }

  const { badgeCountByUser, itemCountByUser } = await fetchUserHoldingCounts(supabase, eligible)
  impact.badgeCount = sumCounts(badgeCountByUser)
  impact.itemCount = sumCounts(itemCountByUser)

  if (action === 'reset') {
    impact.missionCompletionCount = sumCounts(
      await countRowsByKey(countClient, 'user_mission_completions', 'user_id', eligible)
    )
    return impact
  }

  // delete — 아이템은 삭제되지 않고 소유자만 비워진다(`inventory_items.inventory_id` ON DELETE SET NULL)
  const balances = await fetchWalletBalances(supabase, eligible)
  let balanceTotal = 0
  for (const id of eligible) balanceTotal += balances.get(id) ?? 0
  impact.pointBalanceTotal = balanceTotal
  // 이미 끊긴 연결(disconnected_at)은 «끊기는 연결»에 세지 않는다(티켓 20261017_1422)
  impact.stravaConnectionCount = sumCounts(
    await countRowsByKey(countClient, 'strava_connections', 'user_id', eligible, (q) => q.is('disconnected_at', null))
  )
  return impact
}
