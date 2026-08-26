import { createServiceClient } from '@/lib/supabase/server'
import type { UserRow, InventoryRow } from '@/types/database'
import { UsersTable, type UserListRow } from './UsersTable'

export default async function AdminUsersPage() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('id, email, username, created_at, region')
    .order('created_at', { ascending: false })
    .limit(100)

  const users = (data ?? []) as Pick<UserRow, 'id' | 'email' | 'username' | 'created_at' | 'region'>[]
  const userIds = users.map((u) => u.id)

  // 보유 배지 수 집계 쿼리와 인벤토리 조회는 서로 독립적이라 병렬화한다(20260826_011 A7).
  // 인벤토리 아이템 수 집계는 인벤토리 조회 결과(inventoryIds)에 의존하므로 그 뒤에 이어간다.
  const [{ data: badgeRows }, { data: inventoriesRaw }] = userIds.length > 0
    ? await Promise.all([
        supabase.from('user_activity_badges').select('user_id').in('user_id', userIds),
        supabase.from('inventory').select('id, user_id').in('user_id', userIds),
      ])
    : [{ data: [] as { user_id: string }[] }, { data: [] as Pick<InventoryRow, 'id' | 'user_id'>[] }]

  // 보유 배지 수 집계
  const badgeCountByUser = new Map<string, number>()
  for (const row of (badgeRows ?? []) as { user_id: string }[]) {
    badgeCountByUser.set(row.user_id, (badgeCountByUser.get(row.user_id) ?? 0) + 1)
  }

  // 보유 아이템 수 집계 (inventory_id → user_id 매핑 경유)
  const itemCountByUser = new Map<string, number>()
  const inventories = (inventoriesRaw ?? []) as Pick<InventoryRow, 'id' | 'user_id'>[]
  const inventoryIdToUserId = new Map(inventories.map((inv) => [inv.id, inv.user_id]))
  const inventoryIds = inventories.map((inv) => inv.id)

  if (inventoryIds.length > 0) {
    const { data: itemRows } = await supabase
      .from('inventory_items')
      .select('inventory_id')
      .in('inventory_id', inventoryIds)
    for (const row of (itemRows ?? []) as { inventory_id: string }[]) {
      const userId = inventoryIdToUserId.get(row.inventory_id)
      if (!userId) continue
      itemCountByUser.set(userId, (itemCountByUser.get(userId) ?? 0) + 1)
    }
  }

  const rows: UserListRow[] = users.map((user) => ({
    user,
    badgeCount: badgeCountByUser.get(user.id) ?? 0,
    itemCount: itemCountByUser.get(user.id) ?? 0,
  }))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">유저 조회</h1>
        <p className="text-[#6b7280] text-sm">최근 100명</p>
      </div>

      <UsersTable rows={rows} />
    </div>
  )
}
