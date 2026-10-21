/**
 * 유저 일괄 처리의 DB 읽기 부분(티켓 20260924_0951) — 대상 유저 조회와 미리보기(`dry_run`)
 * 영향 집계. 판정 자체(어드민·본인 제외)는 `user-bulk.ts`의 순수 함수가 한다.
 *
 * 건수는 전부 200개씩 나눠 읽는다(`.in()` URL 상한). 행째 세면 PostgREST 1,000행 상한에
 * 걸리므로 {@link countRowsByKey}·{@link fetchUserHoldingCounts}를 쓴다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { ValidAdminGrant } from '@/lib/points/admin-grant'
import { RETENTION_MONTHS, retentionSince, type RetainedKind } from '@/lib/account/retention'
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

/** 유저들의 인벤토리 id — 아이템이 «없어짐» 처리되는 수를 세는 데 쓴다 */
async function fetchInventoryIds(supabase: ServiceClient, userIds: string[]): Promise<string[]> {
  const inventoryIds: string[] = []
  for (let i = 0; i < userIds.length; i += READ_CHUNK_SIZE) {
    const { data, error } = await supabase
      .from('inventory')
      .select('id')
      .in('user_id', userIds.slice(i, i + READ_CHUNK_SIZE))
    if (error) throw new Error(`[user-bulk] 인벤토리 조회 실패: ${error.message}`)
    inventoryIds.push(...(data ?? []).map((row) => row.id))
  }
  return inventoryIds
}

/** 건수만 읽는 쿼리(`head: true`)의 최소 모양 — `.in()` 뒤 `.gte()`가 실행 가능한 쿼리다 */
interface HeadCountQuery {
  in(column: string, values: string[]): HeadCountQuery
  gte(column: string, value: string): PromiseLike<{ count: number | null; error: { message: string } | null }>
}
interface HeadCountClient {
  from(table: string): { select(columns: string, options: { count: 'exact'; head: true }): HeadCountQuery }
}

/**
 * 삭제 준비 함수(`prepare_account_deletion`, 마이그레이션 263)가 보관 표로 복사하는 기록의 원본 위치.
 * 종류별 기간 안(`timeColumn >= 지금 - 기간`)의 행만 복사되므로 미리보기도 같은 조건으로 센다. 같은 `poi_drops` 행이라도
 * 놓은 유저(`poi_drop`)와 주운 유저(`poi_pickup`)는 따로 복사된다.
 */
const RETAINED_SOURCES: ReadonlyArray<{ kind: RetainedKind; table: string; userColumn: string; timeColumn: string }> = [
  { kind: 'checkin_earn', table: 'user_checkin_badge_earns', userColumn: 'user_id', timeColumn: 'earned_at' },
  { kind: 'poi_view', table: 'poi_views', userColumn: 'user_id', timeColumn: 'viewed_at' },
  { kind: 'poi_drop', table: 'poi_drops', userColumn: 'dropper_user_id', timeColumn: 'dropped_at' },
  { kind: 'poi_pickup', table: 'poi_drops', userColumn: 'picked_up_by', timeColumn: 'picked_up_at' },
  { kind: 'abuse_log', table: 'abusing_logs', userColumn: 'user_id', timeColumn: 'created_at' },
]

/** 보관 표로 복사될 기록의 총 수 */
async function countRetainedRecords(supabase: ServiceClient, userIds: string[], now: Date): Promise<number> {
  const client = supabase as unknown as HeadCountClient
  let total = 0
  for (const source of RETAINED_SOURCES) {
    const since = retentionSince(now, RETENTION_MONTHS[source.kind])
    for (let i = 0; i < userIds.length; i += READ_CHUNK_SIZE) {
      const { count, error } = await client
        .from(source.table)
        .select('id', { count: 'exact', head: true })
        .in(source.userColumn, userIds.slice(i, i + READ_CHUNK_SIZE))
        .gte(source.timeColumn, since)
      if (error) throw new Error(`[user-bulk] 보관 대상 ${source.kind} 집계 실패: ${error.message}`)
      total += count ?? 0
    }
  }
  return total
}

/**
 * 미리보기 영향 수치. `partition.eligible`이 실제 처리 대상이고, 제외된 어드민·본인 수는 공통으로 돌려준다.
 * DB를 바꾸지 않는다.
 */
export async function computeUserBulkImpact(
  supabase: ServiceClient,
  action: UserBulkAction,
  partition: UserTargetPartition,
  grant?: ValidAdminGrant,
  now: Date = new Date()
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
      // 잔액보다 큰 회수는 거절되어 그 유저만 건너뛴다(`admin_deduct_points`, 티켓 20261019_1314)
      impact.revokeSkippedCount = eligible.filter((id) => (balances.get(id) ?? 0) < Math.abs(amount)).length
    } else {
      impact.revokeSkippedCount = 0
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

  // delete — 아이템은 지워지지 않고 «없어짐» 처리된다(삭제 준비 함수가 `destroyed_at`을 채우고 Orphan 이력을 남긴다, 티켓 20261021_1249)
  const balances = await fetchWalletBalances(supabase, eligible)
  let balanceTotal = 0
  for (const id of eligible) balanceTotal += balances.get(id) ?? 0
  impact.pointBalanceTotal = balanceTotal
  // 이미 끊긴 연결(disconnected_at)은 «끊기는 연결»에 세지 않는다(티켓 20261017_1422)
  impact.stravaConnectionCount = sumCounts(
    await countRowsByKey(countClient, 'strava_connections', 'user_id', eligible, (q) => q.is('disconnected_at', null))
  )
  impact.vanishingItemCount = sumCounts(
    await countRowsByKey(countClient, 'inventory_items', 'inventory_id', await fetchInventoryIds(supabase, eligible), (q) =>
      q.is('destroyed_at', null)
    )
  )
  impact.retainedRecordCount = await countRetainedRecords(supabase, eligible, now)
  return impact
}
