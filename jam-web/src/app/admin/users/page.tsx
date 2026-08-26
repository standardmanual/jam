import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { UserRow, InventoryRow } from '@/types/database'
import { ResetUserButton } from './ResetUserButton'

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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">유저 조회</h1>
        <p className="text-[#6b7280] text-sm">최근 100명</p>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5e7eb] text-[#6b7280] text-left">
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
                <td colSpan={7} className="px-5 py-10 text-center text-[#898989]">
                  유저가 없습니다.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa] transition-colors">
                <td className="px-5 py-3 font-medium">
                  <Link href={`/admin/users/${user.id}`} className="hover:underline">
                    {user.username ?? '—'}
                  </Link>
                </td>
                <td className="px-5 py-3 text-[#374151]">{user.email}</td>
                <td className="px-5 py-3 text-[#374151]">{user.region ?? '—'}</td>
                <td className="px-5 py-3 text-[#374151]">{badgeCountByUser.get(user.id) ?? 0}</td>
                <td className="px-5 py-3 text-[#374151]">{itemCountByUser.get(user.id) ?? 0}</td>
                <td className="px-5 py-3 text-[#6b7280] text-xs">
                  {new Date(user.created_at).toLocaleDateString('ko-KR')}
                </td>
                <td className="px-5 py-3">
                  <ResetUserButton userId={user.id} userName={user.username ?? user.email} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
