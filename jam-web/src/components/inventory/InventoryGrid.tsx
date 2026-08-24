'use client'

import Link from 'next/link'
import LocalDate from '@/components/LocalDate'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
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
  /**
   * 알림함에서 `?highlight=`로 진입했을 때 짚어줄 아이템 id들 (20260824_021).
   * 소식 #3(아이템 배지 획득)의 묶음 착지점이 인벤토리 목록이라 "그 중 어느 것"이 필요하다.
   */
  highlightItemIds?: string[]
}

/**
 * 희귀도 상태 팔레트 — Phase 2에서 `state_color_palette` 테이블로 이관 예정.
 * [주의] 색상값/매핑을 재조정하지 마세요(유저가 학습한 색 언어 유지).
 * 타일 배경은 항상 아이스 고정 — 코발트 배경 위 반투명 워시는 텍스트와 섞여 대비가 깨진다.
 */
function isExpiringSoon(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const diff = new Date(expiresAt).getTime() - Date.now()
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

export default function InventoryGrid({
  items,
  mode,
  onSelect,
  emptySlots = 0,
  selectedItemId = null,
  highlightItemIds,
}: InventoryGridProps) {
  const highlightSet = new Set(highlightItemIds ?? [])
  return (
    <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
      {items.map((item) => {
        const expiring = isExpiringSoon(item.expiresAt)
        const expiryNode = expiring && item.expiresAt ? (
          <p className="text-[length:var(--text-caption)] font-bold leading-none px-1.5 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border)] text-text/70 text-center">
            <LocalDate iso={item.expiresAt} options={{ month: 'numeric', day: 'numeric' }} suffix={d.inventory.expiringSuffix} />
          </p>
        ) : null

        if (mode === 'navigate') {
          return (
            <BadgeGridCard
              key={item.id}
              href={`/inventory/${item.id}`}
              name={item.badgeName}
              imageUrl={item.badgeImageUrl}
              rarity={item.badgeRarity as import('@/types/database').BadgeRarity}
              highlighted={highlightSet.has(item.id)}
            >
              {expiryNode}
            </BadgeGridCard>
          )
        }

        const isSelected = selectedItemId === item.id
        return (
          <BadgeGridCard
            key={item.id}
            onClick={() => onSelect?.(item)}
            name={item.badgeName}
            imageUrl={item.badgeImageUrl}
            rarity={item.badgeRarity as import('@/types/database').BadgeRarity}
            selected={isSelected}
          >
            {expiryNode}
          </BadgeGridCard>
        )
      })}
      {/* 빈 슬롯 placeholder — BadgeGridCard와 동일한 구조로 맞춰 행 높이를 일치시킨다 */}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="flex flex-col items-center bg-surface rounded-[var(--radius-card)] p-[var(--spacing-12)] overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border)] opacity-30"
        >
          <div className="w-[90px] h-[90px] rounded-[var(--radius-card)] flex items-center justify-center bg-white/10">
            <span className="text-text text-xl">+</span>
          </div>
          <div className="flex flex-col items-center gap-[var(--spacing-4)] pt-[var(--spacing-8)] w-full">
            <p className="text-[11px] font-bold text-text text-center truncate w-full leading-tight">&nbsp;</p>
            <div className="h-6" />
          </div>
        </div>
      ))}
    </div>
  )
}
