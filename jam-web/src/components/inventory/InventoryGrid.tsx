'use client'

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
  /** 무한레벨형 배지는 등급이 없다(마이그레이션 130). null이면 등급 칩을 그리지 않는다 */
  badgeRarity: string | null
  expiresAt?: string | null
  /**
   * 그룹 내 개체 수 — 드랍 그리드가 같은 배지의 여러 개체를 카드 1장으로 묶을 때만 쓴다
   * (20260908_0040). 2 이상일 때만 `BadgeGridCard`가 모서리에 ×N을 그린다.
   */
  count?: number | null
  /**
   * `count`가 있을 때의 ×N 접근성 문구 — 호출부가 맥락에 맞는 문구를 만들어 넘긴다
   * (`InventoryGrid`는 두 화면이 공유하는 정규화 컴포넌트라 특정 화면의 i18n 그룹을
   * 이 파일이 직접 알지 않는다, 20260908_0040).
   */
  countAriaText?: string
}

interface InventoryGridProps {
  items: InventoryGridItem[]
  /** navigate: /inventory/[id]로 이동(기존 인벤토리 동작) · select: onSelect(item) 콜백(드랍 바텀시트) */
  mode: 'navigate' | 'select'
  onSelect?: (item: InventoryGridItem) => void
  /** 빈 슬롯 placeholder 개수(인벤토리 페이지에서만 사용) */
  emptySlots?: number
  /**
   * 그리드 첫 칸에 `mode`와 무관하게 select 동작(버튼)으로 끼워 넣는 항목 — 온보딩 퀘스트
   * `bag` 차례의 연출 도토리 전용(티켓 20260928_0137, `QuestBagGrid.tsx`). 나머지 `items`는
   * 기존 `mode` 그대로 렌더된다. 넘기지 않는 기존 호출부(드랍 바텀시트 등)는 변경이 없다.
   */
  leadingItem?: {
    item: InventoryGridItem
    onSelect: () => void
    disabled?: boolean
    /**
     * 「지금 눌러야 할 곳」 공용 펄스(`.jam-quest-pulse`, 티켓 20260928_1752)를 선두 셀에
     * 씌운다 — 20260928_1753. `BadgeGridCard`의 기존 `className` prop에 그대로 병합되므로
     * 셀 모서리(`--radius-2xl`)를 벗어나지 않는다.
     */
    pulse?: boolean
  }
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
  leadingItem,
}: InventoryGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {leadingItem && (
        <BadgeGridCard
          key={leadingItem.item.id}
          onClick={leadingItem.disabled ? undefined : leadingItem.onSelect}
          name={leadingItem.item.badgeName}
          imageUrl={leadingItem.item.badgeImageUrl}
          rarity={leadingItem.item.badgeRarity as import('@/types/database').BadgeRarity | null}
          className={leadingItem.pulse ? 'jam-quest-pulse' : ''}
        />
      )}
      {items.map((item) => {
        const expiring = isExpiringSoon(item.expiresAt)
        const expiryNode = expiring && item.expiresAt ? (
          <p className="text-xs font-bold leading-none px-1.5 py-1 rounded-full shadow-[inset_0_0_0_1px_var(--border)] text-foreground/70 text-center">
            <LocalDate iso={item.expiresAt} options={{ month: 'numeric', day: 'numeric' }} suffix={d.inventory.expiringSuffix} />
          </p>
        ) : null

        // 카드 자식은 만료 임박 칩뿐이다. 일련번호를 그리던 분기는 유일한 사용처였던 컬렉션
        // 장착 개체 선택 시트가 `ListRowCard` 목록으로 바뀌면서 제거했다(20260907_2221).
        const cardChildren = expiryNode

        if (mode === 'navigate') {
          return (
            <BadgeGridCard
              key={item.id}
              href={`/inventory/${item.id}`}
              name={item.badgeName}
              imageUrl={item.badgeImageUrl}
              rarity={item.badgeRarity as import('@/types/database').BadgeRarity | null}
            >
              {cardChildren}
            </BadgeGridCard>
          )
        }

        return (
          <BadgeGridCard
            key={item.id}
            onClick={() => onSelect?.(item)}
            name={item.badgeName}
            imageUrl={item.badgeImageUrl}
            rarity={item.badgeRarity as import('@/types/database').BadgeRarity | null}
            count={item.count}
            countAriaText={item.countAriaText}
          >
            {cardChildren}
          </BadgeGridCard>
        )
      })}
      {/* 빈 슬롯 placeholder — BadgeGridCard와 동일한 구조로 맞춰 행 높이를 일치시킨다 */}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="flex flex-col items-center bg-surface border border-border rounded-2xl p-3 overflow-hidden opacity-30"
        >
          <div className="w-[90px] h-[90px] rounded-2xl flex items-center justify-center bg-white/10">
            <span className="text-foreground text-xl">+</span>
          </div>
          <div className="flex flex-col items-center gap-1 pt-2 w-full">
            <p className="text-[11px] font-bold text-foreground text-center truncate w-full leading-tight">&nbsp;</p>
            <div className="h-6" />
          </div>
        </div>
      ))}
    </div>
  )
}
