'use client'

import Link from 'next/link'
import Image from 'next/image'
import LocalDate from '@/components/LocalDate'

// 인벤토리 그리드 카드에 필요한 정규화된 아이템 형태.
// - /inventory/page.tsx: `InventoryItemRow & { badge }`를 이 형태로 매핑
// - 드랍 바텀시트: `GET /api/inventory/items`의 플랫 응답을 이 형태로 매핑
// 두 소스의 shape가 달라 공용 컴포넌트는 정규화 타입으로 받는다(API 변경 없음).
export interface InventoryGridItem {
  id: string
  badgeName: string
  badgeImageUrl: string | null
  badgeRarity: string
  expiresAt?: string | null
}

interface InventoryGridProps {
  items: InventoryGridItem[]
  /** navigate: /inventory/[id]로 이동(기존 인벤토리 동작) · select: onSelect(item) 콜백(드랍 바텀시트) */
  mode: 'navigate' | 'select'
  onSelect?: (item: InventoryGridItem) => void
  /** 빈 슬롯 placeholder 개수(인벤토리 페이지에서만 사용) */
  emptySlots?: number
  /** 현재 선택된 아이템 id(select 모드 하이라이트용) */
  selectedItemId?: string | null
}

const rarityCardBg: Record<string, string> = {
  common: 'bg-white',
  rare: 'bg-jam-teal/30',
  legendary: 'bg-jam-purple/20',
  mythic: 'bg-jam-yellow/40',
}

function isExpiringSoon(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const diff = new Date(expiresAt).getTime() - Date.now()
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

function CardInner({ item }: { item: InventoryGridItem }) {
  const expiring = isExpiringSoon(item.expiresAt)
  return (
    <>
      <div className="w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center bg-jam-cream">
        {item.badgeImageUrl ? (
          <Image
            src={item.badgeImageUrl}
            alt={item.badgeName}
            width={80}
            height={80}
            className="object-contain w-full h-full p-1"
          />
        ) : (
          <span className="text-3xl">🏷️</span>
        )}
      </div>
      <p className="text-[11px] text-jam-ink text-center leading-tight line-clamp-2 font-bold w-full">
        {item.badgeName}
      </p>
      {expiring && item.expiresAt && (
        <p className="text-[10px] text-red-600 font-bold">
          <LocalDate iso={item.expiresAt} options={{ month: 'numeric', day: 'numeric' }} suffix=" 만료" />
        </p>
      )}
    </>
  )
}

export default function InventoryGrid({
  items,
  mode,
  onSelect,
  emptySlots = 0,
  selectedItemId = null,
}: InventoryGridProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item) => {
        const cardBg = rarityCardBg[item.badgeRarity] ?? 'bg-white'
        const base = `flex flex-col items-center ${cardBg} border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] rounded-2xl p-3 gap-2 active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all`

        if (mode === 'navigate') {
          return (
            <Link key={item.id} href={`/inventory/${item.id}`} className={base}>
              <CardInner item={item} />
            </Link>
          )
        }

        const selected = selectedItemId === item.id
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item)}
            className={`${base} text-left ${selected ? 'ring-4 ring-jam-lime' : ''}`}
          >
            <CardInner item={item} />
          </button>
        )
      })}
      {/* 빈 슬롯 placeholder */}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="flex items-center justify-center border-2 border-dashed border-jam-ink/25 rounded-2xl aspect-square bg-white/20"
        >
          <span className="text-jam-ink/25 text-xl font-black">+</span>
        </div>
      ))}
    </div>
  )
}
