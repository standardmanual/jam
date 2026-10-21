/**
 * 탈퇴 화면의 «지워지는 것» 요약 — 로그인한 유저 본인의 데이터 수치 (티켓 20261021_1249 3회, 운영 로직 17.1절)
 *
 * 한 번에 읽는 기존 함수가 없어 조각을 모은다. 어드민 삭제 미리보기(`user-bulk-impact.ts`)와 같은 기준으로 센다:
 * - 액티비티 배지: `user_activity_badges` 행 수. 소프트 삭제된 배지는 뺀다(프로필의 배지 수와 같다).
 * - 체크인 배지: `user_checkin_badge_earns`는 반복 획득 이력이라 배지 종류(`badge_id`)로 센다. 소프트 삭제된 배지는 뺀다.
 * - 아이템 배지: 인벤토리의 `destroyed_at IS NULL` 개체 수. 지울 때 «없어짐» 처리되는 수다(`prepare_account_deletion`).
 * - 잼·포인트: 각 지갑의 잔액. 지갑 행이 없으면(한 번도 받은 적 없음) 0.
 * - Strava: 연결 행이 있고 끊기지 않았을 때만 «연결 중»이다(`resolveStravaConnectionState`).
 *
 * `getWallet`(포인트)은 조회가 실패해도 0을 돌려줘 «0 포인트가 지워진다»로 잘못 보일 수 있어 쓰지 않는다.
 * 어느 조회라도 실패하면 던지고, 호출한 라우트가 500으로 돌려준다. 화면은 수치 없이 일반 문장을 보인다(탈퇴는 막지 않는다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { resolveStravaConnectionState } from '@/lib/strava/connection-state'
import type { AccountSummary } from './withdraw-contract'

type ServiceClient = ReturnType<typeof createServiceClient>

/** PostgREST 한 번에 읽는 행 수(기본 상한) */
const PAGE_SIZE = 1000

function fail(what: string, error: { message: string }): never {
  throw new Error(`[account/summary] ${what} 조회 실패: ${error.message}`)
}

async function countActivityBadges(supabase: ServiceClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('user_activity_badges')
    .select('id, badges!inner(deleted_at)', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('badges.deleted_at', null)
  if (error) fail('액티비티 배지', error)
  return count ?? 0
}

/** 체크인 배지 종류 수 — 반복 획득 행을 `badge_id`로 합쳐 센다. 1,000행 상한에 잘리지 않게 끝까지 읽는다 */
async function countCheckinBadgeKinds(supabase: ServiceClient, userId: string): Promise<number> {
  const kinds = new Set<string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('user_checkin_badge_earns')
      .select('id, badge_id, badges!inner(deleted_at)')
      .eq('user_id', userId)
      .is('badges.deleted_at', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) fail('체크인 배지', error)
    for (const row of data ?? []) kinds.add(row.badge_id)
    if ((data?.length ?? 0) < PAGE_SIZE) break
  }
  return kinds.size
}

async function countVanishingItems(supabase: ServiceClient, userId: string): Promise<number> {
  const { data: inventory, error: inventoryError } = await supabase
    .from('inventory')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (inventoryError) fail('인벤토리', inventoryError)
  if (!inventory) return 0

  const { count, error } = await supabase
    .from('inventory_items')
    .select('id', { count: 'exact', head: true })
    .eq('inventory_id', inventory.id)
    .is('destroyed_at', null)
  if (error) fail('아이템 배지', error)
  return count ?? 0
}

async function readBalance(supabase: ServiceClient, table: 'jam_wallets' | 'point_wallets', userId: string): Promise<number> {
  const { data, error } = await supabase.from(table).select('balance').eq('user_id', userId).maybeSingle()
  if (error) fail(table === 'jam_wallets' ? '잼' : '포인트', error)
  return data?.balance ?? 0
}

async function readStravaConnected(supabase: ServiceClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('strava_connections')
    .select('disconnected_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) fail('Strava 동기화', error)
  return resolveStravaConnectionState(data) === 'connected'
}

export async function getAccountSummary(supabase: ServiceClient, userId: string): Promise<AccountSummary> {
  const [activityBadgeCount, checkinBadgeCount, itemCount, jamBalance, pointBalance, stravaConnected] = await Promise.all([
    countActivityBadges(supabase, userId),
    countCheckinBadgeKinds(supabase, userId),
    countVanishingItems(supabase, userId),
    readBalance(supabase, 'jam_wallets', userId),
    readBalance(supabase, 'point_wallets', userId),
    readStravaConnected(supabase, userId),
  ])
  return { activityBadgeCount, checkinBadgeCount, itemCount, jamBalance, pointBalance, stravaConnected }
}
