import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { InventoryRow, InventoryItemRow, BadgeRow } from '@/types/database'
import InventoryGrid, { InventoryGridItem } from '@/components/inventory/InventoryGrid'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import TopNav from '@/components/ui/TopNav'
import { PackageIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'

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

  const { data: inventoryData, error: inventoryError } = await supabase
    .from('inventory')
    .select('*, inventory_items(*, badge:badges(*))')
    .eq('user_id', user.id)
    .single()
  // 20260901_1848: 조회 실패가 "빈 인벤토리"로 위장되던 지점(.single()이라 무인벤토리도
  // error로 잡히므로 실제 오류와 완전히 구분되진 않지만, 최소 가시성 확보는 된다)
  if (inventoryError) console.error('[inventory/page] inventory 조회 실패', inventoryError)

  const inventory = inventoryData as InventoryWithItems | null

  const usedSlots = inventory?.used_slots ?? 0
  const maxSlots = inventory?.max_slots ?? 50
  // 아이템북 슬롯에 장착된 아이템은 인벤토리에 동시에 표시하지 않는다 (한 아이템은 인벤토리·아이템북 중 한 곳에만 위치)
  // 소프트 삭제된 배지(badges.deleted_at)도 서비스 화면에서는 숨긴다.
  const items: InventoryItemWithBadge[] = (inventory?.inventory_items ?? []).filter(
    (item) => item.dropped_at === null && item.slotted_in === null && item.badge && !item.badge.deleted_at
  )
  const remainingSlots = Math.max(0, maxSlots - usedSlots)

  const gridItems: InventoryGridItem[] = items.map((item) => ({
    id: item.id,
    badgeName: item.badge.name,
    badgeImageUrl: item.badge.image_url,
    badgeRarity: item.badge.rarity,
    expiresAt: item.expires_at,
  }))

  return (
    <div className="min-h-full bg-surface text-text">
      {/* 20260824_010: 탭 최상위 공통 Topnavi(좌:로고/중:동기화/우:아바타) */}
      <TopNav logo headerStyle={{ background: 'var(--color-surface)' }} />

      <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)] pb-[var(--spacing-24)]">
      {/* 헤더 */}
      <div className="mb-[var(--spacing-24)]">
        <div className="flex items-start justify-between mb-[var(--spacing-16)]">
          <div>
            <h1 className="text-[length:var(--text-heading)] leading-[var(--leading-heading)]">{d.inventory.title}</h1>
          </div>
          <Link
            href="/combine"
            className="mt-1 inline-flex items-center justify-center min-h-11 rounded-[var(--radius-nav-buttons)] px-[var(--spacing-16)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] bg-surface-elevated active:scale-95 transition-transform duration-100"
          >
            {d.inventory.combineButton}
          </Link>
        </div>
        {/* 슬롯 프로그레스 */}
        <ProgressBar
          percent={Math.min(100, (usedSlots / maxSlots) * 100)}
          height={6}
          labelType="none"
        />
        <p className="mt-1 text-[length:var(--text-small)] text-[var(--color-text-secondary)]">
          {t(d.inventory.slotsDetail, { used: usedSlots, max: maxSlots, remaining: remainingSlots })}
        </p>
      </div>

      {/* 아이템 그리드 */}
      {items.length === 0 ? (
        <EmptyState
          icon={<PackageIcon className="w-8 h-8" />}
          title={d.inventory.emptyTitle}
          description={d.inventory.emptyBody}
        />
      ) : (
        <InventoryGrid
          items={gridItems}
          mode="navigate"
          emptySlots={Math.min(remainingSlots, Math.max(0, 6 - items.length))}
        />
      )}
      </div>
    </div>
  )
}
