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
  if (!expiresAt) return ''
  const date = new Date(expiresAt)
  return `${date.getMonth() + 1}/${date.getDate()} 만료`
}

const rarityCardBg: Record<string, string> = {
  common: 'bg-[#F0F0E8]',
  rare: 'bg-[#D8F0F8]',
  legendary: 'bg-[#F0E4FC]',
  mythic: 'bg-[#FCF4D0]',
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
  const remainingSlots = maxSlots - usedSlots

  return (
    <div className="px-5 py-4 min-h-full">
      {/* 헤더 */}
      <div className="mb-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[#AAAAAA] text-sm font-medium">내 아이템</p>
            <h1 className="text-4xl font-black text-[#111111] leading-tight">인벤토리</h1>
          </div>
          <Link
            href="/combine"
            className="mt-1 flex items-center gap-1.5 bg-[#AEEA00] text-[#111111] font-black text-sm px-3 py-2 rounded-xl active:scale-95 transition-all"
          >
            ⚗️ 조합
          </Link>
        </div>
        {/* 슬롯 프로그레스 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-black/6 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#111111] rounded-full transition-all"
              style={{ width: `${Math.min(100, (usedSlots / maxSlots) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-[#AAAAAA] font-medium shrink-0">{usedSlots}/{maxSlots}</span>
        </div>
        <p className="mt-1 text-xs text-[#CCCCCC]">{remainingSlots}개 슬롯 남음</p>
      </div>

      {/* 아이템 그리드 */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-4">📦</span>
          <p className="text-[#AAAAAA] font-bold">아직 아이템이 없어요</p>
          <p className="text-[#CCCCCC] text-xs mt-1">활동을 완료하면 아이템 배지가 드랍돼요</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {items.map((item) => {
            const expiring = isExpiringSoon(item.expires_at)
            const cardBg = rarityCardBg[item.badge.rarity] ?? 'bg-[#F0F0E8]'
            return (
              <Link
                key={item.id}
                href={`/inventory/${item.id}`}
                className={`flex flex-col items-center ${cardBg} rounded-2xl p-3 gap-2 active:scale-95 transition-transform`}
              >
                <div className="w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center">
                  {item.badge.image_url ? (
                    <Image
                      src={item.badge.image_url}
                      alt={item.badge.name}
                      width={80}
                      height={80}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <span className="text-3xl">🏷️</span>
                  )}
                </div>
                <p className="text-[11px] text-[#111111] text-center leading-tight line-clamp-2 font-bold w-full">
                  {item.badge.name}
                </p>
                {expiring && item.expires_at && (
                  <p className="text-[10px] text-red-500 font-bold">{formatExpiry(item.expires_at)}</p>
                )}
              </Link>
            )
          })}
          {/* 빈 슬롯 */}
          {Array.from({ length: Math.min(remainingSlots, Math.max(0, 6 - items.length)) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center justify-center border-2 border-dashed border-black/8 rounded-2xl aspect-square"
            >
              <span className="text-black/15 text-xl font-black">+</span>
            </div>
          ))}
        </div>
      )}

      {/* 플리마켓 */}
      <div className="fixed bottom-24 right-4">
        <Link
          href="/inventory/flea-market"
          className="flex items-center gap-2 bg-[#111111] text-white font-bold text-sm px-4 py-3 rounded-full active:scale-95 transition-transform"
        >
          <span>🛒</span>
          <span>플리마켓</span>
        </Link>
      </div>
    </div>
  )
}
