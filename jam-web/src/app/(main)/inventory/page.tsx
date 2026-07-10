import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { InventoryRow, InventoryItemRow, BadgeRow } from '@/types/database'

type InventoryItemWithBadge = InventoryItemRow & {
  badge: BadgeRow
}

type InventoryWithItems = InventoryRow & {
  inventory_items: InventoryItemWithBadge[]
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  const diff = new Date(expiresAt).getTime() - Date.now()
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return '기간 없음'
  const date = new Date(expiresAt)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} 만료`
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
  const items: InventoryItemWithBadge[] = (inventory?.inventory_items ?? []).filter(
    (item) => item.dropped_at === null
  )
  const emptyCount = Math.max(0, usedSlots - items.length)
  const remainingSlots = maxSlots - usedSlots

  return (
    <div className="px-4 pt-5 pb-6 min-h-full">
      {/* 슬롯 현황 */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-lg font-bold text-white">인벤토리</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/combine"
              className="text-xs font-bold text-[#AEEA00] bg-[#AEEA00]/10 border border-[#AEEA00]/30 px-3 py-1.5 rounded-full hover:bg-[#AEEA00]/20 transition-colors"
            >
              ⚗️ 아이템 조합
            </Link>
            <span className="text-sm text-white/50">
              {usedSlots} / {maxSlots} 슬롯
            </span>
          </div>
        </div>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#AEEA00] rounded-full transition-all"
            style={{ width: `${Math.min(100, (usedSlots / maxSlots) * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-white/40">{remainingSlots}개 슬롯 남음</p>
      </div>

      {/* 아이템 그리드 */}
      {items.length === 0 && usedSlots === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-4">📦</span>
          <p className="text-white/50 text-sm">아직 아이템이 없어요</p>
          <p className="text-white/30 text-xs mt-1">활동을 완료하면 아이템 배지가 드랍됩니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {/* 획득한 아이템 */}
          {items.map((item) => {
            const expiring = isExpiringSoon(item.expires_at)
            return (
              <Link
                key={item.id}
                href={`/inventory/${item.id}`}
                className="flex flex-col items-center bg-white/5 border border-white/10 rounded-xl p-3 gap-2 active:scale-95 transition-transform"
              >
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center">
                  {item.badge.image_url ? (
                    <Image
                      src={item.badge.image_url}
                      alt={item.badge.name}
                      width={64}
                      height={64}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <span className="text-3xl">🏷️</span>
                  )}
                </div>
                <p className="text-[11px] text-white/80 text-center leading-tight line-clamp-2 font-medium">
                  {item.badge.name}
                </p>
                {item.expires_at && (
                  <p className={`text-[10px] ${expiring ? 'text-red-400' : 'text-white/30'}`}>
                    {formatExpiry(item.expires_at)}
                  </p>
                )}
              </Link>
            )
          })}

          {/* 빈 슬롯 (점선 박스) */}
          {Array.from({ length: Math.min(emptyCount + remainingSlots, 6) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex flex-col items-center justify-center bg-transparent border border-dashed border-white/15 rounded-xl p-3 h-[118px]"
            >
              <span className="text-white/15 text-2xl">+</span>
            </div>
          ))}
        </div>
      )}

      {/* 플리마켓 진입 버튼 */}
      <div className="fixed bottom-20 right-4">
        <Link
          href="/inventory/flea-market"
          className="flex items-center gap-2 bg-[#AEEA00] text-black font-bold text-sm px-4 py-3 rounded-full shadow-lg shadow-[#AEEA00]/20 active:scale-95 transition-transform"
        >
          <span>🛒</span>
          <span>플리마켓</span>
        </Link>
      </div>
    </div>
  )
}
