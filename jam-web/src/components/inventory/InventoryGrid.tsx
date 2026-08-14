'use client'

import Link from 'next/link'
import Image from 'next/image'
import LocalDate from '@/components/LocalDate'
import { MedalIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'

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

/**
 * 희귀도 상태 팔레트 — Phase 2에서 `state_color_palette` 테이블로 이관 예정.
 * [주의] 색상값/매핑을 재조정하지 마세요(유저가 학습한 색 언어 유지).
 * 타일 배경은 항상 아이스 고정 — 코발트 배경 위 반투명 워시는 텍스트와 섞여 대비가 깨진다.
 */
// DS v2 희귀도 링 — --color-rarity-* 토큰 기반 ([의사결정 A])
const rarityAccent: Record<string, string> = {
  rare:   'shadow-[inset_0_0_0_1px_var(--color-rarity-rare)]',
  legend: 'shadow-[inset_0_0_0_1px_var(--color-rarity-legend)]',
  mythic: 'shadow-[inset_0_0_0_1px_var(--color-rarity-mythic)]',
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
      <div className="w-full aspect-square rounded-[var(--radius-cards)] overflow-hidden flex items-center justify-center">
        {item.badgeImageUrl ? (
          <Image src={item.badgeImageUrl} alt={item.badgeName} width={80} height={80} className="object-contain w-full h-full p-1" />
        ) : (
          <MedalIcon className="w-8 h-8 text-text-inverse/40" />
        )}
      </div>
      <p className="text-[length:var(--text-body-sm)] leading-tight text-center truncate w-full">{item.badgeName}</p>
      <div className="h-6 flex items-center justify-center">
        {expiring && item.expiresAt && (
          <p className="text-[11px] font-bold leading-none px-1.5 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] text-text-inverse/70">
            <LocalDate iso={item.expiresAt} options={{ month: 'numeric', day: 'numeric' }} suffix={d.inventory.expiringSuffix} />
          </p>
        )}
      </div>
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
    <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
      {items.map((item) => {
        const accent = rarityAccent[item.badgeRarity] ?? 'shadow-[inset_0_0_0_1px_var(--color-border-inverse)]'
        const base = `flex flex-col items-center bg-surface-inverse text-text-inverse ${accent} rounded-[var(--radius-cards)] p-[var(--spacing-8)] gap-2 active:scale-95 transition-transform duration-100`

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
            className={`${base} text-left ${selected ? 'shadow-[inset_0_0_0_2px_var(--color-border-inverse)]' : ''}`}
          >
            <CardInner item={item} />
          </button>
        )
      })}
      {/* 빈 슬롯 placeholder — 배지 탭 카드와 동일한 구조(이미지 박스 + 이름 줄 + 하단 줄)로
          맞춰서, 채워진 칸과 빈 칸의 세로 크기가 항상 똑같이 보이도록 한다 */}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="flex flex-col items-center rounded-[var(--radius-cards)] p-[var(--spacing-8)] gap-2 shadow-[inset_0_0_0_1px_var(--color-border)] opacity-30"
        >
          <div className="w-full aspect-square rounded-[var(--radius-cards)] flex items-center justify-center overflow-hidden">
            <span className="text-text text-xl">+</span>
          </div>
          <p className="text-[length:var(--text-body-sm)] leading-tight text-center truncate w-full">&nbsp;</p>
          <div className="h-6" />
        </div>
      ))}
    </div>
  )
}
