import { createServiceClient } from '@/lib/supabase/server'
import type { UserRow, InventoryRow } from '@/types/database'
import { ResetUserButton } from './ResetUserButton'

export default async function AdminUsersPage() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('id, email, display_name, created_at, region')
    .order('created_at', { ascending: false })
    .limit(100)

  const users = (data ?? []) as Pick<UserRow, 'id' | 'email' | 'display_name' | 'created_at' | 'region'>[]
  const userIds = users.map((u) => u.id)

  // 보유 배지 수 집계
  const badgeCountByUser = new Map<string, number>()
  if (userIds.length > 0) {
    const { data: badgeRows } = await supabase
      .from('user_activity_badges')
      .select('user_id')
      .in('user_id', userIds)
    for (const row of (badgeRows ?? []) as { user_id: string }[]) {
      badgeCountByUser.set(row.user_id, (badgeCountByUser.get(row.user_id) ?? 0) + 1)
    }
  }

  // 보유 아이템 수 집계 (inventory_id → user_id 매핑 경유)
  const itemCountByUser = new Map<string, number>()
  if (userIds.length > 0) {
    const { data: inventoriesRaw } = await supabase
      .from('inventory')
      .select('id, user_id')
      .in('user_id', userIds)
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
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">유저 조회</h1>
        <p className="text-white/40 text-sm">최근 100명</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-left">
              <th className="px-5 py-3 font-medium">이름</th>
              <th className="px-5 py-3 font-medium">이메일</th>
              <th className="px-5 py-3 font-medium">지역</th>
              <th className="px-5 py-3 font-medium">보유 배지</th>
              <th className="px-5 py-3 font-medium">보유 아이템</th>
              <th className="px-5 py-3 font-medium">가입일</th>
              <th className="px-5 py-3 font-medium">액션</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-white/30">
                  유저가 없습니다.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-5 py-3 font-medium">{user.display_name}</td>
                <td className="px-5 py-3 text-white/60">{user.email}</td>
                <td className="px-5 py-3 text-white/60">{user.region ?? '—'}</td>
                <td className="px-5 py-3 text-white/60">{badgeCountByUser.get(user.id) ?? 0}</td>
                <td className="px-5 py-3 text-white/60">{itemCountByUser.get(user.id) ?? 0}</td>
                <td className="px-5 py-3 text-white/40 text-xs">
                  {new Date(user.created_at).toLocaleDateString('ko-KR')}
                </td>
                <td className="px-5 py-3">
                  <ResetUserButton userId={user.id} userName={user.display_name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
