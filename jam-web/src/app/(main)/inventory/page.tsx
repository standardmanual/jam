import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { InventoryRow, InventoryItemRow, BadgeRow } from '@/types/database'
import InventoryGrid, { InventoryGridItem } from '@/components/inventory/InventoryGrid'

type InventoryItemWithBadge = InventoryItemRow & {
  badge: BadgeRow
}

type InventoryWithItems = InventoryRow & {
  inventory_items: InventoryItemWithBadge[]
}

export default async function InventoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: inventoryData } = await supabase
    .from('inventory')
    .select('*, inventory_items(*, badge:badges(*))')
    .eq('user_id', user.id)
    .single()

  const inventory = inventoryData as InventoryWithItems | null

  const usedSlots = inventory?.used_slots ?? 0
  const maxSlots = inventory?.max_slots ?? 50
  // 아이템북 슬롯에 장착된 아이템은 인벤토리에 동시에 표시하지 않는다 (한 아이템은 인벤토리·아이템북 중 한 곳에만 위치)
  // 소프트 삭제된 배지(badges.deleted_at)도 서비스 화면에서는 숨긴다.
  const items: InventoryItemWithBadge[] = (inventory?.inventory_items ?? []).filter(
    (item) => item.dropped_at === null && item.slotted_in === null && item.badge && !item.badge.deleted_at
  )
  const remainingSlots = maxSlots - usedSlots

  const gridItems: InventoryGridItem[] = items.map((item) => ({
    id: item.id,
    badgeName: item.badge.name,
    badgeImageUrl: item.badge.image_url,
    badgeRarity: item.badge.rarity,
    expiresAt: item.expires_at,
  }))

  return (
    <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-6 min-h-full bg-jam-teal">
      {/* 헤더 */}
      <div className="mb-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-jam-ink/60 text-sm font-bold">내 아이템</p>
            <h1 className="text-4xl font-black text-jam-ink leading-tight">인벤토리</h1>
          </div>
          <Link
            href="/combine"
            className="mt-1 flex items-center gap-1.5 bg-jam-lime text-jam-ink font-black text-sm px-3 py-2 rounded-xl active:scale-95 transition-all border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616]"
          >
            ⚗️ 조합
          </Link>
        </div>
        {/* 슬롯 프로그레스 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2.5 bg-white/40 rounded-full overflow-hidden border border-jam-ink/20">
            <div
              className="h-full bg-jam-lime rounded-full transition-all"
              style={{ width: `${Math.min(100, (usedSlots / maxSlots) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-jam-ink/60 font-bold shrink-0">{usedSlots}/{maxSlots}</span>
        </div>
        <p className="mt-1 text-xs text-jam-ink/50 font-semibold">{remainingSlots}개 슬롯 남음</p>
      </div>

      {/* 아이템 그리드 */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-4">📦</span>
          <p className="text-jam-ink/60 font-bold">아직 아이템이 없어요</p>
          <p className="text-jam-ink/40 text-xs mt-1 font-semibold">활동을 완료하면 아이템 배지가 드랍돼요</p>
        </div>
      ) : (
        <InventoryGrid
          items={gridItems}
          mode="navigate"
          emptySlots={Math.min(remainingSlots, Math.max(0, 6 - items.length))}
        />
      )}

      {/* 플리마켓 */}
      <div className="fixed bottom-24" style={{ right: 'max(calc((100vw - 430px) / 2 + 1rem), 1rem)' }}>
        <Link
          href="/inventory/flea-market"
          className="flex items-center gap-2 bg-jam-ink text-white font-black text-sm px-4 py-3 rounded-full active:scale-95 transition-transform border-[3px] border-jam-ink shadow-[3px_3px_0_0_rgba(0,0,0,0.3)]"
        >
          <span>🛒</span>
          <span>플리마켓</span>
        </Link>
      </div>
    </div>
  )
}
